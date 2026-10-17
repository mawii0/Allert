"""Additional acceptance checks specific to the researcher-chosen seed-7 kit."""
from pathlib import Path
import json
import sys
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from allert_runtime.engine import ModelRuntime, risk, observed


def test_exact_researcher_selected_run_metadata():
    info = ModelRuntime('cpu').info()
    assert info['model_id'] == 'median-residual-seed7-epoch15-20261013-v1'
    assert (info['seed'], info['best_epoch'], info['recorded_epochs']) == (7, 15, 35)
    assert info['checkpoint_sha256'] == '4253e73515d8d2a3d4a4463065f8bfb2192c9454e161da560fd928a4051672c4'
    np.testing.assert_array_equal(info['calibration'], [.025, .025, .025, .025, .225, .15000000000000002])
    assert info['input_shape'] == [576, 8] and info['history_fetch_hours'] == 54
    assert info['spike_head'] is False
    protocol = json.loads((ROOT / 'bundle/protocol.json').read_text())
    assert protocol['researcher_selected'] is True
    assert protocol['choice_made_after_assessment_review'] is True
    assert protocol['predeclared_validation_winner'] is False


def test_unvalidated_node_transfer_is_not_silently_enabled(monkeypatch):
    monkeypatch.delenv('ALLERT_ALLOW_EXPERIMENTAL_NODES', raising=False)
    monkeypatch.delenv('ALLERT_VALIDATED_NODE_ID', raising=False)
    payload = json.loads((ROOT / 'examples/forecast_case_01.json').read_text())
    payload['node_id'] = 'node-2'
    for row in payload['history']: row['node_id'] = 'node-2'
    with pytest.raises(ValueError, match='transfer is not validated'):
        ModelRuntime('cpu').predict(payload)


def test_missing_weather_does_not_suppress_valid_pm_alert():
    with pytest.raises(ValueError):
        risk({'pm2_5': 70, 'pm10': 100, 'temperature_c': None, 'humidity_percent': None})
    result = observed({'node_id': 'node-1', 'block_end': '2026-10-10T00:05:00Z',
                       'received_at': '2026-10-10T00:05:00Z', 'units': 'ug/m3',
                       'pm2_5': 70, 'pm10': 100, 'sensor_status': 'ok'}, mode='replay')
    assert result['decision']['notifications']
    assert result['snapshot']['nodes']['node-1']['event'] is not None
    assert result['delivery_performed'] is False
