"""ALLERT configured environmental-indicator calculation.

Maps current observations to a bounded project-defined indicator using:
    - Baseline PM risk: Risk_PM = PM2.5*β25 + PM10*β10
    - Temperature and humidity modifiers
    - Bounded indicator conversion with population-specific nominal baselines
    - Four-tier risk stratification

All coefficients and thresholds are read from ``config.yaml``.
The probability-shaped output is not an individually calibrated symptom
probability. Legacy function/column names are retained for compatibility.
The retained distributed-lag helper is inactive in the selected system
(researcher decision DEC-008); the current-observation pipeline does not use it.

Exported artifacts:
    - ``results/tables/table_4_11_risk_distribution.json``
    - ``results/tables/table_4_12_modifier_analysis.json``
    - ``results/visualizations/fig_4_7_risk_vs_pm25.png``
    - ``results/visualizations/fig_4_11_risk_distribution.png``

Thesis traceability:
    - Chapter 3.2, "Environmental Risk Estimation Engine"
    - Chapter 4, Table 4.11, Table 4.12, Fig. 4.7, Fig. 4.11
"""
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy.special import expit

from src.config_loader import get_project_root


def _validate_lag_weights(cfg: Dict[str, Any]) -> None:
    weights = np.asarray(cfg["risk"]["distributed_lag_weights"], dtype=float)
    hours = np.asarray(cfg["risk"]["distributed_lag_hours"], dtype=float)
    if (weights.ndim != 1 or not len(weights) or weights.shape != hours.shape
            or not np.isfinite(weights).all() or (weights < 0).any()
            or not np.isfinite(hours).all() or hours[0] != 0
            or (np.diff(hours) <= 0).any() or (hours != hours.astype(int)).any()):
        raise ValueError('Lag weights and increasing integer hours must match, start at hour zero, and be finite/nonnegative')
    if abs(sum(weights) - 1.0) > 1e-12:
        raise ValueError(f"Distributed lag weights must sum to 1.0, got {sum(weights)}")


def _baseline(age_group, cfg):
    if age_group not in ('adult', 'pediatric'):
        raise ValueError('Unsupported age group')
    value = float(cfg['risk'][f'baseline_prevalence_{age_group}'])
    if not np.isfinite(value) or not 0 < value < 1:
        raise ValueError('Configured baseline must be strictly between zero and one')
    return value


def _records_per_hour(series: pd.Series) -> int:
    median_delta = series.index.to_series().diff().median()
    if pd.isna(median_delta) or median_delta == pd.Timedelta(0):
        return 12
    return max(1, int(round(pd.Timedelta(hours=1) / median_delta)))


# ---------------------------------------------------------------------------
# Core risk calculations
# ---------------------------------------------------------------------------
def compute_pm_risk(pm25: float, pm10: float, cfg: Dict[str, Any]) -> float:
    """Compute log-odds PM risk contribution."""
    return pm25 * cfg["risk"]["pm2_5_beta"] + pm10 * cfg["risk"]["pm10_beta"]


def temperature_modifier(temp_c: float, cfg: Dict[str, Any]) -> float:
    """Linear temperature modifier."""
    return (temp_c - cfg["risk"]["temp_baseline_c"]) * cfg["risk"]["temp_beta"]


def humidity_modifier(rh: float, cfg: Dict[str, Any]) -> float:
    """Linear humidity modifier."""
    return (rh - cfg["risk"]["humidity_baseline_pct"]) * cfg["risk"]["humidity_beta"]


def combined_odds_ratio(risk_pm: float, m_temp: float, m_rh: float) -> float:
    """OR_total = exp(Risk_PM + M_temp + M_humidity)."""
    exponent = float(risk_pm + m_temp + m_rh)
    if not np.isfinite(exponent):
        raise ValueError('Combined indicator contribution must be finite')
    return float(np.exp(exponent)) if exponent <= np.log(np.finfo(float).max) else float('inf')


def p_risk_from_or(or_total: float, age_group: str, cfg: Dict[str, Any]) -> float:
    """Convert a nonnegative odds multiplier to the bounded configured indicator."""
    p_baseline = _baseline(age_group, cfg)
    if np.isnan(or_total) or or_total < 0:
        raise ValueError('Odds multiplier must be nonnegative and not NaN')
    if np.isposinf(or_total):
        return 1.0
    numerator = p_baseline * or_total
    denominator = 1.0 + p_baseline * (or_total - 1.0)
    return float(numerator / denominator)


def compute_p_risk(
    pm25: float, pm10: float, temp_c: float, rh: float, age_group: str, cfg: Dict[str, Any]
) -> float:
    """Current-observation indicator, evaluated stably in log-odds space."""
    values = np.asarray([pm25, pm10, temp_c, rh], dtype=float)
    if not np.isfinite(values).all() or pm25 < 0 or pm10 < 0 or not 0 <= rh <= 100:
        raise ValueError('PM/weather inputs must be finite, PM nonnegative and humidity in [0,100]')
    p_baseline = _baseline(age_group, cfg)
    rp = compute_pm_risk(pm25, pm10, cfg)
    mt = temperature_modifier(temp_c, cfg)
    mr = humidity_modifier(rh, cfg)
    contribution = float(rp + mt + mr)
    if not np.isfinite(contribution):
        raise ValueError('Indicator coefficients and combined contribution must be finite')
    return float(expit(np.log(p_baseline) - np.log1p(-p_baseline) + contribution))


# ---------------------------------------------------------------------------
# Distributed lag
# ---------------------------------------------------------------------------
def rolling_72h_continuous_risk(p_risk_series: pd.Series, cfg: Dict[str, Any]) -> pd.Series:
    """Compute a causal lag-band weighted average of the indicator.

    The weight vector is built from ``distributed_lag_weights`` and
    ``distributed_lag_hours`` in config. The final weight sum is asserted
    to be 1.0. Lag zero is the current value. During initial warm-up,
    weights are normalized over available history (not padded low exposure).
    """
    _validate_lag_weights(cfg)
    if (p_risk_series.empty or not isinstance(p_risk_series.index, pd.DatetimeIndex)
            or p_risk_series.index.has_duplicates or not p_risk_series.index.is_monotonic_increasing):
        raise ValueError('Risk history must have a nonempty unique chronological datetime index')
    deltas = p_risk_series.index.to_series().diff().dropna()
    if not deltas.empty and (deltas.iloc[0] <= pd.Timedelta(0) or not (deltas == deltas.iloc[0]).all()):
        raise ValueError('Risk history must have constant positive cadence')
    arr = p_risk_series.to_numpy(dtype=float)
    if not np.isfinite(arr).all() or (arr < 0).any() or (arr > 1).any():
        raise ValueError('Risk history must contain finite indicators in [0,1]')

    weights = cfg["risk"]["distributed_lag_weights"]
    hours = cfg["risk"]["distributed_lag_hours"]
    rph = _records_per_hour(p_risk_series)

    # Build a weight vector covering 0..72h inclusive
    total_steps = hours[-1] * rph + 1
    w = np.zeros(total_steps, dtype=float)

    for weight, h in zip(weights, hours):
        if h == 0:
            start = 0
            end = 1
        else:
            start = (hours[hours.index(h) - 1] * rph + 1) if hours.index(h) > 0 else 0
            end = h * rph + 1
        block_size = end - start
        if block_size > 0:
            w[start:end] = weight / block_size

    if abs(w.sum() - 1.0) > 1e-12:
        w = w / w.sum()

    # np.convolve(x, w)[t] = sum_lag x[t-lag] * w[lag].
    numerator = np.convolve(arr, w, mode='full')[:len(arr)]
    available_weight = np.convolve(np.ones(len(arr)), w, mode='full')[:len(arr)]
    result = np.divide(numerator, available_weight, out=np.full(len(arr), np.nan), where=available_weight > 0)
    return pd.Series(result, index=p_risk_series.index)


# ---------------------------------------------------------------------------
# Tier classification
# ---------------------------------------------------------------------------
def classify_risk_tier(p_risk: float, age_group: str, cfg: Dict[str, Any]) -> Tuple[str, float]:
    """Return (tier_name, lower_threshold) for a P_risk value in [0, 1]."""
    p = float(p_risk)
    _baseline(age_group, cfg)
    if not np.isfinite(p) or not 0 <= p <= 1:
        raise ValueError('Indicator for tier classification must be finite and in [0,1]')
    tiers = cfg["risk"][f"{age_group}_tiers"]
    # Internal fractions: 0.15 corresponds to 15 indicator points, not 15% health risk.
    sorted_tiers = sorted(tiers.items(), key=lambda kv: kv[1])
    cutpoints = np.asarray([v for _, v in sorted_tiers], dtype=float)
    if (not len(cutpoints) or cutpoints[0] != 0 or not np.isfinite(cutpoints).all()
            or (cutpoints < 0).any() or (cutpoints > 1).any() or (np.diff(cutpoints) <= 0).any()):
        raise ValueError('Tier cutpoints must start at zero and be finite, unique and increasing in [0,1]')
    for i, (name, lo) in enumerate(sorted_tiers):
        hi = sorted_tiers[i + 1][1] if i + 1 < len(sorted_tiers) else 10.0
        if lo <= p < hi:
            return name, float(lo)
    return sorted_tiers[-1][0], float(sorted_tiers[-1][1])


# ---------------------------------------------------------------------------
# DataFrame-level helpers
# ---------------------------------------------------------------------------
def add_p_risk_columns(df: pd.DataFrame, cfg: Dict[str, Any]) -> pd.DataFrame:
    """Add adult and pediatric P_risk columns to a DataFrame."""
    df = df.copy()
    for age in ["adult", "pediatric"]:
        df[f"p_risk_{age}"] = df.apply(
            lambda r: compute_p_risk(
                r["pm2_5"], r["pm10"], r["temperature"], r["humidity"], age, cfg
            ),
            axis=1,
        )
    return df


def add_risk_tier_columns(df: pd.DataFrame, cfg: Dict[str, Any]) -> pd.DataFrame:
    """Add adult and pediatric risk-tier columns."""
    df = df.copy()
    for age in ["adult", "pediatric"]:
        df[f"risk_tier_{age}"] = df[f"p_risk_{age}"].apply(
            lambda v: classify_risk_tier(v, age, cfg)[0]
        )
    return df


# ---------------------------------------------------------------------------
# Tables and figures
# ---------------------------------------------------------------------------
def _tier_counts(series: pd.Series, tiers: Dict[str, float]) -> Dict[str, Dict[str, Any]]:
    sorted_tiers = sorted(tiers.items(), key=lambda kv: kv[1])
    counts = {}
    total = len(series)
    for i, (name, lo) in enumerate(sorted_tiers):
        hi = sorted_tiers[i + 1][1] if i + 1 < len(sorted_tiers) else 10.0
        mask = (series >= lo) & (series < hi)
        count = int(mask.sum())
        counts[name] = {"count": count, "pct": round(100.0 * count / total, 2) if total else 0}
    return counts


def export_risk_distribution(
    df: pd.DataFrame, cfg: Dict[str, Any], out_dir: Path
) -> Dict[str, Any]:
    """Export Table 4.11 — configured environmental-indicator distribution."""
    out_dir.mkdir(parents=True, exist_ok=True)
    result = {
        "total_calculations": int(len(df)),
        "adult": _tier_counts(df["p_risk_adult"], cfg["risk"]["adult_tiers"]),
        "pediatric": _tier_counts(df["p_risk_pediatric"], cfg["risk"]["pediatric_tiers"]),
    }
    with open(out_dir / "table_4_11_risk_distribution.json", "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    return result


def export_modifier_analysis(
    df: pd.DataFrame, cfg: Dict[str, Any], out_dir: Path
) -> Dict[str, Any]:
    """Export Table 4.12 — meteorological modifier contribution."""
    out_dir.mkdir(parents=True, exist_ok=True)

    m_temp = df["temperature"].apply(lambda t: temperature_modifier(t, cfg))
    m_rh = df["humidity"].apply(lambda rh: humidity_modifier(rh, cfg))

    pr_full = df.apply(
        lambda r: compute_p_risk(r["pm2_5"], r["pm10"], r["temperature"], r["humidity"], "adult", cfg),
        axis=1,
    )
    pr_pm_only = df.apply(
        lambda r: compute_p_risk(
            r["pm2_5"], r["pm10"], cfg["risk"]["temp_baseline_c"], cfg["risk"]["humidity_baseline_pct"], "adult", cfg
        ),
        axis=1,
    )
    delta = (pr_full - pr_pm_only) * 100.0
    temp_only = df.apply(lambda r: compute_p_risk(r['pm2_5'], r['pm10'], r['temperature'],
                         cfg['risk']['humidity_baseline_pct'], 'adult', cfg), axis=1)
    humidity_only = df.apply(lambda r: compute_p_risk(r['pm2_5'], r['pm10'],
                             cfg['risk']['temp_baseline_c'], r['humidity'], 'adult', cfg), axis=1)
    temp_delta = (temp_only - pr_pm_only) * 100.0
    humidity_delta = (humidity_only - pr_pm_only) * 100.0

    result = {
        "temperature": {
            "observed_range_C": {
                "min": float(df["temperature"].min()),
                "max": float(df["temperature"].max()),
                "mean": float(df["temperature"].mean()),
            },
            "M_temp_range": {
                "min": float(m_temp.min()),
                "max": float(m_temp.max()),
                "mean": float(m_temp.mean()),
            },
            "delta_P_risk_from_temp_alone_pct": {
                "min": float(temp_delta.min()),
                "max": float(temp_delta.max()),
                "mean": float(temp_delta.mean()),
            },
        },
        "humidity": {
            "observed_range_RH": {
                "min": float(df["humidity"].min()),
                "max": float(df["humidity"].max()),
                "mean": float(df["humidity"].mean()),
            },
            "M_humidity_range": {
                "min": float(m_rh.min()),
                "max": float(m_rh.max()),
                "mean": float(m_rh.mean()),
            },
            "delta_P_risk_from_humidity_alone_pct": {
                "min": float(humidity_delta.min()),
                "max": float(humidity_delta.max()),
                "mean": float(humidity_delta.mean()),
            },
        },
        "combined_modifier_impact": {
            "cases_where_temp_increases_risk": int((m_temp > 0).sum()),
            "cases_where_humidity_decreases_risk": int((m_rh < 0).sum()),
            "mean_combined_modifier_delta_pct": round(float(delta.mean()), 4),
            "delta_range_pct": {
                "min": round(float(delta.min()), 4),
                "max": round(float(delta.max()), 4),
            },
        },
    }
    with open(out_dir / "table_4_12_modifier_analysis.json", "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    return result


def plot_risk_vs_pm25(df: pd.DataFrame, out_dir: Path) -> Path:
    """Generate Fig 4.7 — configured environmental indicator vs PM2.5."""
    import matplotlib.pyplot as plt

    out_dir.mkdir(parents=True, exist_ok=True)
    plt.figure(figsize=(8, 5))
    plt.scatter(df["pm2_5"], df["p_risk_adult"] * 100.0, s=8, alpha=0.5, label="Adult")
    plt.scatter(df["pm2_5"], df["p_risk_pediatric"] * 100.0, s=8, alpha=0.5, label="Pediatric")
    plt.xlabel("PM2.5 (µg/m³)")
    plt.ylabel("Configured environmental indicator (0–100 scale)")
    plt.title("Fig 4.7 — Environmental Indicator vs PM2.5")
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    path = out_dir / "fig_4_7_risk_vs_pm25.png"
    plt.savefig(path, dpi=150)
    plt.close()
    return path


def plot_risk_heatmap(df: pd.DataFrame, out_dir: Path) -> Path:
    """Generate Fig 4.7b — mean adult risk by PM2.5 and temperature bins."""
    import matplotlib.pyplot as plt

    out_dir.mkdir(parents=True, exist_ok=True)
    # Create a grid of PM2.5 vs temperature
    df = df.copy()
    def bins(values):
        lo, hi = float(values.min()), float(values.max())
        if lo == hi:
            lo, hi = lo - .5, hi + .5
        return np.linspace(lo, hi, 15)
    pm_bins = bins(df['pm2_5'])
    temp_bins = bins(df['temperature'])
    pm_labels = (pm_bins[:-1] + pm_bins[1:]) / 2
    temp_labels = (temp_bins[:-1] + temp_bins[1:]) / 2

    df["pm_bin"] = pd.cut(df["pm2_5"], bins=pm_bins, labels=pm_labels, include_lowest=True)
    df["temp_bin"] = pd.cut(df["temperature"], bins=temp_bins, labels=temp_labels, include_lowest=True)
    heat = df.groupby(["pm_bin", "temp_bin"], observed=False)["p_risk_adult"].mean().unstack() * 100.0

    fig, ax = plt.subplots(figsize=(10, 7))
    cax = ax.imshow(heat.values, aspect="auto", cmap="YlOrRd", origin="lower")
    ax.set_xticks(range(len(temp_labels)))
    ax.set_xticklabels([f"{x:.1f}" for x in temp_labels], rotation=45)
    ax.set_yticks(range(len(pm_labels)))
    ax.set_yticklabels([f"{x:.1f}" for x in pm_labels])
    ax.set_xlabel("Temperature (°C)")
    ax.set_ylabel("PM2.5 (µg/m³)")
    ax.set_title("Fig 4.7b — Adult Environmental Indicator (PM2.5 vs Temperature)")
    fig.colorbar(cax, ax=ax, label="Configured environmental indicator (0–100 scale)")
    plt.tight_layout()
    path = out_dir / "fig_4_7b_risk_heatmap.png"
    plt.savefig(path, dpi=150)
    plt.close()
    return path


def plot_risk_distribution(df: pd.DataFrame, out_dir: Path) -> Path:
    """Generate Fig 4.11 — risk distribution histograms by age group."""
    import matplotlib.pyplot as plt

    out_dir.mkdir(parents=True, exist_ok=True)
    fig, axes = plt.subplots(1, 2, figsize=(12, 5), sharey=True)

    for ax, age, color in zip(axes, ["adult", "pediatric"], ["steelblue", "darkorange"]):
        data = df[f"p_risk_{age}"] * 100.0
        ax.hist(data, bins=30, color=color, edgecolor="white", alpha=0.8)
        ax.axvline(data.median(), color="red", linestyle="--", label=f"median={data.median():.1f} points")
        ax.set_xlabel("Configured environmental indicator (0–100 scale)")
        ax.set_ylabel("Frequency")
        ax.set_title(f"{age.capitalize()} Environmental Indicator")
        ax.legend()
        ax.grid(True, alpha=0.3)

    fig.suptitle("Fig 4.11 — Configured Environmental Indicator by Age Group")
    plt.tight_layout()
    path = out_dir / "fig_4_11_risk_distribution.png"
    plt.savefig(path, dpi=150)
    plt.close()
    return path


# ---------------------------------------------------------------------------
# End-to-end pipeline
# ---------------------------------------------------------------------------
def run_risk_pipeline(cfg: Dict[str, Any], out_dir: Optional[Path] = None,
                      df: Optional[pd.DataFrame] = None) -> Dict[str, Any]:
    """Compute risk tables and figures from the preprocessed raw data."""
    if out_dir is None:
        out_dir = Path(cfg["paths"]["results_dir"])
        if not out_dir.is_absolute():
            out_dir = get_project_root() / out_dir
    out_dir = Path(out_dir)
    tables_dir = out_dir / "tables"
    viz_dir = out_dir / "visualizations"
    tables_dir.mkdir(parents=True, exist_ok=True)
    viz_dir.mkdir(parents=True, exist_ok=True)

    if df is None:
        preprocessed_path = get_project_root() / 'artifacts/processed/model_input.csv'
        df = pd.read_csv(preprocessed_path, parse_dates=['timestamp'], index_col='timestamp')

    df = add_p_risk_columns(df, cfg)
    df = add_risk_tier_columns(df, cfg)

    distribution = export_risk_distribution(df, cfg, tables_dir)
    modifiers = export_modifier_analysis(df, cfg, tables_dir)
    plot_risk_vs_pm25(df, viz_dir)
    plot_risk_heatmap(df, viz_dir)
    plot_risk_distribution(df, viz_dir)

    return {
        'status': 'configured_current_observation_indicator_not_individual_symptom_probability',
        'distributed_lag_active': False,
        "risk_distribution": distribution,
        "modifier_analysis": modifiers,
        "n_records": int(len(df)),
    }


__all__ = [
    "compute_pm_risk",
    "temperature_modifier",
    "humidity_modifier",
    "combined_odds_ratio",
    "p_risk_from_or",
    "compute_p_risk",
    "rolling_72h_continuous_risk",
    "classify_risk_tier",
    "add_p_risk_columns",
    "add_risk_tier_columns",
    "run_risk_pipeline",
]
