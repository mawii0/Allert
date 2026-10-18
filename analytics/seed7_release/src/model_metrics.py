"""Additional thesis metrics derived from saved prediction pairs, without tuning."""
from copy import deepcopy
import numpy as np


def supplementary_metrics(actual, predicted):
    actual, predicted = np.asarray(actual, dtype=float), np.asarray(predicted, dtype=float)
    if (actual.shape != predicted.shape or actual.ndim != 2 or actual.shape[1] != 6
            or not len(actual) or not np.isfinite(actual).all() or not np.isfinite(predicted).all()
            or (actual < 0).any()):
        raise ValueError('Expected matched finite nonnegative observations and N-by-6 predictions')
    outputs = []
    for j in range(6):
        observed, forecast = actual[:, j], predicted[:, j]
        positive = observed > 0
        error = forecast - observed
        denominator = float(np.sum((observed - observed.mean()) ** 2))
        outputs.append({
            'MAPE_pct': float(100 * np.mean(np.abs(error[positive]) / observed[positive])) if positive.any() else None,
            'MAPE_n': int(positive.sum()), 'MAPE_excluded_zero_n': int((~positive).sum()),
            'R2': float(1 - np.sum(error ** 2) / denominator) if len(observed) >= 2 and denominator > 0 else None,
        })
    result = {'targets': outputs}
    for source, aggregate in [('MAPE_pct', 'mean_MAPE_pct'), ('R2', 'mean_R2')]:
        defined = [row[source] for row in outputs if row[source] is not None]
        result[aggregate] = float(np.mean(defined)) if defined else None
        result[aggregate + '_defined_outputs'] = len(defined)
    return result


def with_supplementary_metrics(recorded, actual, predicted):
    """Preserve the original metrics and add derived values to a copy."""
    result = deepcopy(recorded)
    extra = supplementary_metrics(actual, predicted)
    if len(result['targets']) != 6:
        raise ValueError('Expected exactly six recorded output metrics')
    for recorded_row, extra_row in zip(result['targets'], extra.pop('targets')):
        recorded_row.update(extra_row)
    result.update(extra)
    return result
