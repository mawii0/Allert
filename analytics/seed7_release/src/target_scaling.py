"""ALLERT target scaling helpers.

The pipeline scales input features but should report evaluation metrics in the
original units (µg/m³). This module tracks how target columns are scaled so that
predictions can be inverted back to original units before metric computation.

When ``features.scale_targets`` is false (the default), targets remain in
original units and the scaler acts as an identity transform.
"""
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
from sklearn.preprocessing import MinMaxScaler, StandardScaler, RobustScaler


TARGET_COLUMNS = ["pm2_5_target", "pm10_target"]


def _safe_remove(path: Path) -> None:
    """Remove a file if it exists, ignoring errors (e.g. Windows lock races)."""
    try:
        if path.exists():
            os.remove(path)
    except Exception:
        pass


class TargetScaler:
    """Scaler wrapper for the model target columns.

    Mirrors the API of ``scaling.FeatureScaler`` but is restricted to the
    PM2.5/PM10 target columns used by ``sequence_builder.TARGET_ORDER``.
    """

    def __init__(self, scaler_type: str = "minmax"):
        if scaler_type not in {"minmax", "standard", "robust"}:
            raise ValueError("scaler_type must be 'minmax', 'standard', or 'robust'")
        self.scaler_type = scaler_type
        if scaler_type == "minmax":
            self.scaler = MinMaxScaler()
        elif scaler_type == "standard":
            self.scaler = StandardScaler()
        else:
            self.scaler = RobustScaler()
        self.target_cols: List[str] = []
        self.scaled: bool = False

    def fit(self, df, target_cols: List[str] = None) -> "TargetScaler":
        """Fit the scaler on the training targets.

        Parameters
        ----------
        df:
            DataFrame containing target columns.
        target_cols:
            List of target column names. Defaults to ``TARGET_COLUMNS``.
        """
        self.target_cols = list(target_cols or TARGET_COLUMNS)
        values = df[self.target_cols].to_numpy(dtype="float64")
        self.scaler.fit(values)
        return self

    def transform(self, values: np.ndarray) -> np.ndarray:
        """Scale targets if ``scaled`` is True, otherwise return a copy."""
        arr = np.asarray(values, dtype="float64")
        if not self.scaled:
            return arr.copy()
        if not self.target_cols:
            raise RuntimeError("TargetScaler is not fitted")
        return self.scaler.transform(arr)

    def inverse_transform(self, values: np.ndarray) -> np.ndarray:
        """Invert scaled targets back to original units.

        If targets were not scaled, this returns a copy of the input.
        """
        arr = np.asarray(values, dtype="float64")
        if not self.scaled:
            return arr.copy()
        if not self.target_cols:
            raise RuntimeError("TargetScaler is not fitted")
        return self.scaler.inverse_transform(arr)

    def save(self, path: Path) -> None:
        """Persist the target scaler."""
        if not self.target_cols:
            raise RuntimeError("Nothing to save; call fit() first")
        path.parent.mkdir(parents=True, exist_ok=True)
        _safe_remove(path)
        joblib.dump(
            {
                "scaler": self.scaler,
                "target_cols": self.target_cols,
                "type": self.scaler_type,
                "scaled": self.scaled,
            },
            path,
        )

    def load(self, path: Path) -> "TargetScaler":
        """Load a previously saved target scaler."""
        payload = joblib.load(path)
        self.scaler = payload["scaler"]
        self.target_cols = payload["target_cols"]
        self.scaler_type = payload.get("type", "minmax")
        self.scaled = payload.get("scaled", False)
        return self


def inverse_transform_targets_and_predictions(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    target_scaler: Optional[TargetScaler] = None,
) -> Dict[str, np.ndarray]:
    """Invert scaled targets and predictions to original units.

    Parameters
    ----------
    y_true:
        Ground-truth targets, shape ``(N, 6)``.
    y_pred:
        Model predictions, shape ``(N, 6)``.
    target_scaler:
        Fitted ``TargetScaler``. If None or identity, inputs are returned as-is.

    Returns
    -------
    dict
        ``{"y_true": ..., "y_pred": ...}`` in original units.
    """
    if target_scaler is None or not getattr(target_scaler, "scaled", False):
        return {"y_true": y_true.copy(), "y_pred": y_pred.copy()}
    return {
        "y_true": target_scaler.inverse_transform(y_true),
        "y_pred": target_scaler.inverse_transform(y_pred),
    }


def load_target_scaler(model_dir: Path) -> TargetScaler:
    """Load the saved target scaler, returning an identity scaler if absent."""
    path = Path(model_dir) / "target_scaler.joblib"
    if path.exists():
        scaler = TargetScaler()
        scaler.load(path)
        return scaler
    return TargetScaler()


__all__ = [
    "TARGET_COLUMNS",
    "TargetScaler",
    "inverse_transform_targets_and_predictions",
    "load_target_scaler",
]
