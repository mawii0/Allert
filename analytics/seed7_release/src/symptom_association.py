"""Exploratory environmental/symptom association helpers.

Generates a realistic synthetic paired dataset of predicted risk tiers and
self-reported VAS symptom scores, then computes Spearman and Pearson
correlations for explicit software demonstrations only. Synthetic examples
are never generated implicitly or presented as participant evidence.
Actual symptom association requires supplied, independently paired records.

Exported artifacts:
    - ``results/tables/table_4_15_construct_validity.json``
    - ``results/visualizations/fig_4_14_construct_validity.png``

Thesis traceability:
    - Chapter 3.2, "Usability and Construct Validity Assessment"
    - Chapter 4, Table 4.15 and Fig. 4.14
"""
import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd
from scipy.stats import pearsonr, spearmanr

from src.config_loader import get_project_root
from src.risk_engine import classify_risk_tier, compute_p_risk


TIER_ORDINAL = {"low": 1, "moderate": 2, "high": 3, "very_high": 4}
TIER_LABELS = {1: "Low", 2: "Moderate", 3: "High", 4: "Very High"}


# ---------------------------------------------------------------------------
# Synthetic paired data
# ---------------------------------------------------------------------------
def generate_synthetic_paired_data(
    cfg: Dict[str, Any],
    n: int = 200,
    seed: Optional[int] = None,
) -> pd.DataFrame:
    """Generate synthetic (risk_tier, VAS_score) pairs with positive correlation."""
    if seed is None:
        seed = cfg.get("reproducibility", {}).get("random_seed") or cfg["project"]["random_seed"]
    rng = np.random.default_rng(seed)

    pm25 = rng.uniform(10, 80, size=n)
    pm10 = pm25 * rng.uniform(1.2, 2.0, size=n)
    temp = rng.uniform(24, 34, size=n)
    rh = rng.uniform(55, 95, size=n)
    age_group = rng.choice(["adult", "pediatric"], size=n)

    records = []
    for i in range(n):
        p_risk = compute_p_risk(pm25[i], pm10[i], temp[i], rh[i], age_group[i], cfg)
        tier, _ = classify_risk_tier(p_risk, age_group[i], cfg)
        base_vas = TIER_ORDINAL[tier] * 20  # Low->20, Moderate->40, High->60, Very High->80
        vas = float(np.clip(base_vas + rng.normal(0, 10), 0, 100))
        records.append({
            "pm2_5": pm25[i],
            "pm10": pm10[i],
            "temperature": temp[i],
            "humidity": rh[i],
            "age_group": age_group[i],
            "p_risk": p_risk,
            "risk_tier": tier,
            "vas_score": vas,
        })

    return pd.DataFrame(records)


# ---------------------------------------------------------------------------
# Correlation
# ---------------------------------------------------------------------------
def tier_to_ordinal(tier_series: pd.Series) -> pd.Series:
    return tier_series.map(TIER_ORDINAL)


def compute_spearman(risk_tiers: pd.Series, symptom_scores: pd.Series,
                     *, assume_independent: bool = False) -> Dict[str, Any]:
    df = pd.DataFrame({"tier": risk_tiers, "score": symptom_scores}).dropna()
    tier_ord = tier_to_ordinal(df["tier"])
    if tier_ord.isna().any() or not np.isfinite(df['score'].to_numpy(dtype=float)).all():
        raise ValueError('Unknown risk tier or nonfinite symptom score')
    defined = len(df) >= 2 and tier_ord.nunique() > 1 and df['score'].nunique() > 1
    rho, p = spearmanr(tier_ord, df["score"]) if defined else (None, None)
    n = len(df)
    return {
        "rho": round(float(rho), 4) if defined else None,
        "p_value": round(float(p), 6) if defined and assume_independent else None,
        'status': 'descriptive_category_association', 'independence_assumed': assume_independent,
        "n_pairs": int(n),
    }


def compute_pearson(risk_tiers: pd.Series, symptom_scores: pd.Series,
                    *, assume_independent: bool = False) -> Dict[str, Any]:
    df = pd.DataFrame({"tier": risk_tiers, "score": symptom_scores}).dropna()
    tier_ord = tier_to_ordinal(df["tier"])
    if tier_ord.isna().any() or not np.isfinite(df['score'].to_numpy(dtype=float)).all():
        raise ValueError('Unknown risk tier or nonfinite symptom score')
    defined = len(df) >= 2 and tier_ord.nunique() > 1 and df['score'].nunique() > 1
    r, p = pearsonr(tier_ord, df['score']) if defined else (None, None)
    return {
        "pearson_r": round(float(r), 4) if defined else None,
        "p_value": round(float(p), 6) if defined and assume_independent else None,
        'independence_assumed': assume_independent,
        "n_pairs": int(len(df)),
    }


# ---------------------------------------------------------------------------
# Visualization
# ---------------------------------------------------------------------------
def plot_validity_scatter(
    paired_df: pd.DataFrame,
    out_dir: Path,
) -> Path:
    """Generate Fig 4.14 — construct validity scatter with Spearman annotation."""
    import matplotlib.pyplot as plt

    out_dir.mkdir(parents=True, exist_ok=True)
    res = compute_spearman(paired_df["risk_tier"], paired_df["vas_score"])

    fig, ax = plt.subplots(figsize=(8, 6))
    tier_positions = paired_df["risk_tier"].map(TIER_ORDINAL)
    # Jitter x for visibility
    jitter = np.random.default_rng(42).uniform(-0.15, 0.15, size=len(paired_df))
    ax.scatter(tier_positions + jitter, paired_df["vas_score"], alpha=0.6, edgecolors="k", linewidths=0.5)
    ax.set_xticks([1, 2, 3, 4])
    ax.set_xticklabels([TIER_LABELS[i] for i in [1, 2, 3, 4]])
    ax.set_xlabel("Predicted Risk Tier")
    ax.set_ylabel("VAS Score (0–100)")
    ax.set_title("Fig 4.14 — Construct Validity: Risk Tier vs VAS Score")
    ax.text(
        0.05,
        0.95,
        f"Spearman rho = {res['rho']}\nDescriptive association; no independence assumption\nn = {res['n_pairs']}",
        transform=ax.transAxes,
        verticalalignment="top",
        bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.8),
    )
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    path = out_dir / "fig_4_14_construct_validity.png"
    plt.savefig(path, dpi=150)
    plt.close()
    return path


# ---------------------------------------------------------------------------
# End-to-end pipeline
# ---------------------------------------------------------------------------
def run_validity_analysis(
    cfg: Dict[str, Any],
    paired_df: Optional[pd.DataFrame] = None,
    out_dir: Optional[Path] = None,
    *, allow_synthetic: bool = False,
) -> Dict[str, Any]:
    """Run the full construct-validity analysis and export artifacts."""
    synthetic = paired_df is None
    if synthetic and not allow_synthetic:
        raise ValueError('Provide actual paired symptom records; synthetic demonstrations require explicit allow_synthetic=True')
    if synthetic:
        paired_df = generate_synthetic_paired_data(cfg)
    if out_dir is None:
        out_dir = Path(cfg["paths"]["results_dir"])
        if not out_dir.is_absolute():
            out_dir = get_project_root() / out_dir
    out_dir = Path(out_dir)
    tables_dir = out_dir / "tables"
    viz_dir = out_dir / "visualizations"
    tables_dir.mkdir(parents=True, exist_ok=True)
    viz_dir.mkdir(parents=True, exist_ok=True)

    results = {
        "risk_tier_vs_vas": compute_spearman(paired_df["risk_tier"], paired_df["vas_score"]),
        "risk_tier_vs_vas_pearson": compute_pearson(paired_df["risk_tier"], paired_df["vas_score"]),
        "n_records": int(len(paired_df)),
        'data_source': 'synthetic_demonstration' if synthetic else 'provided_pairs',
        'status': 'software_demonstration_not_participant_evidence' if synthetic else 'descriptive_legacy_category_association',
        'independent_validation': False,
    }

    with open(tables_dir / "table_4_15_construct_validity.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    plot_validity_scatter(paired_df, viz_dir)

    return results


def within_participant_spearman(paired_df: pd.DataFrame, *, minimum_pairs: int = 3) -> Dict[str, Any]:
    """Descriptive coefficients on supplied, already time/node-matched records.

    This helper does not create diaries, pair future observations, verify
    consent/confirmation, or infer symptom validity. Those collection and
    chronological pairing requirements must be met upstream.
    """
    required = {'participant_id', 'environmental_indicator', 'tnss', 'nrs'}
    if not required.issubset(paired_df.columns) or minimum_pairs < 3:
        raise ValueError('Supply participant_id, environmental_indicator, tnss, nrs and minimum_pairs>=3')
    if paired_df.participant_id.isna().any():
        raise ValueError('Participant identities must be retained')
    rows = []
    for person, group in paired_df.groupby('participant_id', sort=False):
        for outcome, maximum in [('tnss', 12), ('nrs', 10)]:
            pairs = group[['environmental_indicator', outcome]].dropna()
            values = pairs.to_numpy(dtype=float)
            if (not np.isfinite(values).all() or ((pairs.environmental_indicator < 0) | (pairs.environmental_indicator > 1)).any()
                    or ((pairs[outcome] < 0) | (pairs[outcome] > maximum)).any()
                    or (pairs[outcome] != np.floor(pairs[outcome])).any()):
                raise ValueError('Indicator must be in [0,1]; confirmed TNSS/NRS must have valid discrete scores')
            sufficient = len(pairs) >= minimum_pairs and pairs.environmental_indicator.nunique() > 1 and pairs[outcome].nunique() > 1
            rho = float(spearmanr(pairs.environmental_indicator, pairs[outcome]).statistic) if sufficient else None
            rows.append({'participant_id': str(person), 'outcome': outcome, 'n_pairs': len(pairs),
                         'excluded_missing_pairs': len(group) - len(pairs), 'rho': rho,
                         'p_value': None, 'status': 'descriptive' if sufficient else 'insufficient_pairs_or_variation'})
    return {'status': 'descriptive_within_participant_association', 'minimum_pairs': minimum_pairs,
            'records': rows, 'n_participants': paired_df.participant_id.nunique(),
            'pooled_independence_test_performed': False, 'pairing_and_confirmation_required_upstream': True,
            'pairing_and_confirmation_verified_by_this_helper': False}


__all__ = [
    "generate_synthetic_paired_data",
    "compute_spearman",
    "compute_pearson",
    "plot_validity_scatter",
    "run_validity_analysis",
    'within_participant_spearman',
]
