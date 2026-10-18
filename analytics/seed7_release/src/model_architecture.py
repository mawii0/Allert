"""ALLERT PyTorch Bi-LSTM model.

GPU-enabled deep Bi-LSTM for PM2.5/PM10 multi-horizon forecasting with an
optional auxiliary high-PM spike detection head.

Architecture:
    - Input: (batch, seq_len, n_features)
    - n Bidirectional LSTM layers with configurable units and dropout
    - Optional learned temporal attention (vector attention) over the time dimension
    - Global pooling via attention-weighted average
    - Three parallel regression heads for 6h, 12h, and 24h forecasts
    - Optional binary spike-detection head for PM2.5 exceedance at each horizon

Outputs:
    - regression: (batch, 6) -> [pm2_5_6h, pm10_6h, pm2_5_12h, pm10_12h, pm2_5_24h, pm10_24h]
    - spike:      (batch, 3) -> [pm2_5_spike_6h, pm2_5_spike_12h, pm2_5_spike_24h]
"""
import json
import os
import random
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def set_random_seeds(cfg: Dict[str, Any], seed: Optional[int] = None, deterministic: bool = False) -> int:
    """Fix Python/NumPy/PyTorch random seeds for reproducibility."""
    if seed is None:
        seed = int(
            cfg.get("reproducibility", {}).get("random_seed")
            or cfg.get("project", {}).get("random_seed", 42)
        )
    seed = int(seed)

    os.environ["PYTHONHASHSEED"] = str(seed)
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

    if deterministic:
        torch.use_deterministic_algorithms(True, warn_only=True)
        # CUDA convolution determinism
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False

    return seed


class TemporalPatternAttention(nn.Module):
    """Learned vector attention over the time dimension.

    Computes a scalar attention score per timestep, applies softmax, and returns
    a weighted sum (context vector) of the input time steps.
    """

    def __init__(self, hidden_dim: int, attention_units: int = 64):
        super().__init__()
        self.attention_units = attention_units
        self.score_dense = nn.Linear(hidden_dim, attention_units)
        self.weight_dense = nn.Linear(attention_units, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, seq_len, hidden_dim)
        scores = torch.tanh(self.score_dense(x))            # (batch, seq_len, units)
        scores = self.weight_dense(scores).squeeze(-1)      # (batch, seq_len)
        weights = F.softmax(scores, dim=1).unsqueeze(-1)    # (batch, seq_len, 1)
        # Context vector: weighted sum over time
        context = (x * weights).sum(dim=1)                  # (batch, hidden_dim)
        return context


class ALLERTBiLSTM(nn.Module):
    """Deep PyTorch Bi-LSTM for PM2.5/PM10 multi-horizon forecasting."""

    def __init__(self, input_size: int, cfg: Dict[str, Any]):
        super().__init__()
        mcfg = cfg["model"]
        self.use_attention = mcfg.get("use_attention", True)
        self.attention_type = mcfg.get("attention_type", "vector")
        self.attention_units = mcfg.get("attention_units", 64)
        self.l2_lambda = mcfg.get("l2_lambda", 1e-4)
        self.use_spike_head = mcfg.get("use_spike_head", False)
        self.spike_threshold = mcfg.get("spike_threshold", 35.0)

        n_layers = int(mcfg.get("n_lstm_layers", 2))
        if n_layers < 2 or n_layers > 4:
            raise ValueError("n_lstm_layers must be 2, 3, or 4")

        units = []
        for i in range(1, n_layers + 1):
            key = f"lstm_units_layer{i}"
            if key in mcfg:
                units.append(int(mcfg[key]))
            else:
                units.append(int(mcfg.get("lstm_units_layer1", 64)))

        dropout = mcfg.get("dropout_rate", 0.25)
        recurrent_dropout = mcfg.get("recurrent_dropout", 0.25)
        use_layer_norm = mcfg.get("use_layer_norm", True)

        # Build stacked bidirectional LSTM layers with explicit dropout between layers.
        self.lstm_layers = nn.ModuleList()
        self.dropout_layers = nn.ModuleList()
        self.layer_norm_layers = nn.ModuleList() if use_layer_norm else None
        for i in range(n_layers):
            in_dim = input_size if i == 0 else units[i - 1] * 2
            self.lstm_layers.append(
                nn.LSTM(
                    in_dim,
                    units[i],
                    num_layers=1,
                    batch_first=True,
                    bidirectional=True,
                    dropout=0.0,  # explicit dropout modules are used instead
                )
            )
            if use_layer_norm:
                self.layer_norm_layers.append(nn.LayerNorm(units[i] * 2))
            self.dropout_layers.append(nn.Dropout(dropout))

        last_hidden_dim = units[-1] * 2

        if self.use_attention and self.attention_type == "vector":
            self.attention = TemporalPatternAttention(last_hidden_dim, self.attention_units)
            pooled_dim = last_hidden_dim
        else:
            self.attention = None
            pooled_dim = last_hidden_dim

        self.head_6h = nn.Linear(pooled_dim, 2)
        self.head_12h = nn.Linear(pooled_dim, 2)
        self.head_24h = nn.Linear(pooled_dim, 2)

        if self.use_spike_head:
            # Binary spike detection for PM2.5 at each horizon
            self.spike_head = nn.Linear(pooled_dim, 3)

    def _lstm_stack(self, x: torch.Tensor) -> torch.Tensor:
        for i, (lstm, drop) in enumerate(zip(self.lstm_layers, self.dropout_layers)):
            x, _ = lstm(x)
            if self.layer_norm_layers is not None:
                x = self.layer_norm_layers[i](x)
            x = drop(x)
        return x

    def _pool(self, x: torch.Tensor) -> torch.Tensor:
        if self.attention is not None:
            return self.attention(x)
        # Fallback: simple mean pooling over time
        return x.mean(dim=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, seq_len, input_size)
        x = self._lstm_stack(x)
        pooled = self._pool(x)  # (batch, pooled_dim)
        out6 = self.head_6h(pooled)
        out12 = self.head_12h(pooled)
        out24 = self.head_24h(pooled)
        regression = torch.cat([out6, out12, out24], dim=1)
        if self.use_spike_head:
            spike_logits = self.spike_head(pooled)
            return regression, spike_logits
        return regression

    def l2_regularization(self) -> torch.Tensor:
        """Compute L2 penalty on all Linear and LSTM weights for manual loss addition."""
        l2 = 0.0
        for module in self.modules():
            if isinstance(module, (nn.Linear, nn.LSTM)):
                for name, param in module.named_parameters():
                    if "weight" in name and param.requires_grad:
                        l2 = l2 + param.pow(2).sum()
        return self.l2_lambda * l2


def composite_loss(
    y_pred: torch.Tensor,
    y_true: torch.Tensor,
    weights: Tuple[float, ...] = (0.5, 0.3, 0.2),
    spike_pred: Optional[torch.Tensor] = None,
    spike_true: Optional[torch.Tensor] = None,
    spike_weight: float = 0.3,
    loss_type: str = "mae",
    spike_threshold: float = 35.0,
    loss_alpha: float = 0.0,
    smooth_spike_weighting: bool = False,
    smooth_spike_power: float = 1.0,
) -> torch.Tensor:
    """Weighted MAE regression loss plus optional spike-detection BCE loss.

    Supports plain MAE (``loss_type='mae'``), Huber, or spike-weighted MAE
    (``loss_type='weighted_mae'``), where errors above ``spike_threshold`` are
    multiplied by ``1 + loss_alpha``. This keeps the overall loss interpretable
    as MAE while forcing the model to pay more attention to high-PM events.

    Target layout: [pm2_5_6h, pm10_6h, pm2_5_12h, pm10_12h, pm2_5_24h, pm10_24h].
    Spike target layout (if provided): [pm2_5_spike_6h, pm2_5_spike_12h, pm2_5_spike_24h].
    """
    weights_t = torch.tensor(weights, dtype=y_pred.dtype, device=y_pred.device)
    y_true_h = y_true.reshape(-1, 3, 2)
    y_pred_h = y_pred.reshape(-1, 3, 2)
    error = y_true_h - y_pred_h
    if loss_type in {"huber", "asymmetric_huber"}:
        # Smooth L1 retains the horizon/target weighting used by MAE while
        # reducing the influence of isolated extreme residuals.
        mae = F.smooth_l1_loss(y_pred_h, y_true_h, reduction="none")
    else:
        mae = torch.abs(error)  # (batch, 3, 2)

    if loss_type == "asymmetric_huber" and loss_alpha > 0:
        # error = actual - prediction; positive values are underpredictions.
        underprediction_weight = 1.0 + loss_alpha * (error > 0).to(mae.dtype)
        mae = mae * underprediction_weight

    if loss_type == "weighted_mae" and loss_alpha > 0:
        # PM2.5 indices are 0, 2, 4; PM10 indices are 1, 3, 5
        if smooth_spike_weighting:
            excess = torch.relu(y_true_h - spike_threshold) / max(spike_threshold, 1e-6)
            sample_weights = 1.0 + loss_alpha * torch.pow(excess, smooth_spike_power)
        else:
            spike_mask = (y_true_h > spike_threshold).float()
            sample_weights = 1.0 + loss_alpha * spike_mask
        mae = mae * sample_weights

    mae_per_horizon = torch.mean(mae, dim=-1)  # (batch, 3)
    weighted = mae_per_horizon * weights_t
    reg_loss = weighted.sum(dim=-1).mean()

    if spike_pred is not None and spike_true is not None:
        # BCEWithLogitsLoss handles logits directly; target shape (batch, 3)
        bce = F.binary_cross_entropy_with_logits(
            spike_pred, spike_true.float(), reduction="mean"
        )
        return reg_loss + spike_weight * bce
    return reg_loss


def build_bilstm(input_shape: Tuple[int, int], cfg: Dict[str, Any]) -> ALLERTBiLSTM:
    """Factory matching the legacy Keras ``build_bilstm`` signature."""
    seq_len, n_features = input_shape
    model = ALLERTBiLSTM(n_features, cfg)
    return model


def load_model_with_config(
    model_dir: Path,
    input_shape: Tuple[int, int],
    fallback_cfg: Optional[Dict[str, Any]] = None,
    device: torch.device = DEVICE,
) -> Tuple[ALLERTBiLSTM, Dict[str, Any]]:
    """Load the best PyTorch model using the exact config it was trained with.

    If ``model_dir/model_config.json`` exists, it is used instead of
    ``fallback_cfg`` so that architecture overrides (e.g. quick mode) are honored.
    """
    from src.config_loader import load_config

    model_dir = Path(model_dir)
    config_path = model_dir / "model_config.json"
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        if fallback_cfg is not None:
            m_saved = cfg.get("model", {})
            m_fallback = fallback_cfg.get("model", {})
            keys_to_check = ["n_lstm_layers", "lstm_units_layer1", "lstm_units_layer2",
                             "lstm_units_layer3", "lstm_units_layer4", "dropout_rate",
                             "recurrent_dropout", "batch_size"]
            mismatches = []
            for key in keys_to_check:
                if key in m_saved and key in m_fallback and m_saved[key] != m_fallback[key]:
                    mismatches.append(f"{key}: saved={m_saved[key]} vs config={m_fallback[key]}")
            if mismatches:
                print(
                    "[WARNING] Saved model config differs from the current fallback config:\n  "
                    + "\n  ".join(mismatches)
                    + "\nThe saved model config is being used to load weights."
                )
    elif fallback_cfg is not None:
        cfg = fallback_cfg
    else:
        cfg = load_config()

    model = build_bilstm(input_shape, cfg)
    model_path = model_dir / "best_model.pt"
    model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))
    model.to(device)
    model.eval()
    return model, cfg


__all__ = [
    "DEVICE",
    "set_random_seeds",
    "ALLERTBiLSTM",
    "TemporalPatternAttention",
    "composite_loss",
    "build_bilstm",
    "load_model_with_config",
]
