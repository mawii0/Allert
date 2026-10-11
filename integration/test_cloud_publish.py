import copy
import pytest
from integration import publish_from_cloud as adapter

def test_verified_cloud_result_keeps_replay_identity(monkeypatch):
    monkeypatch.setenv('ALLERT_MODEL_BASE_URL', 'https://example.invalid')
    monkeypatch.setenv('ALLERT_API_TOKEN', 'private-test-token')
    payload = {'node_id': 'node-1', 'mode': 'historical_fixture', 'history': [
        {'block_end': '2026-09-12T20:45:00+00:00', 'pm2_5': 20}]}
    ready = {'status': 'model_ready', 'golden_replay_cases': 12, 'max_abs_difference_ugm3': 0.0001,
             'model': {'model_id': adapter.MODEL_ID, 'checkpoint_sha256': adapter.CHECKPOINT}}
    forecast = {'model_id': adapter.MODEL_ID, 'checkpoint_sha256': adapter.CHECKPOINT,
                'node_id': 'node-1', 'mode': 'historical_fixture'}
    calls = []
    def request(url, headers, body=None):
        calls.append((url, body))
        return copy.deepcopy(ready if url.endswith('/ready') else forecast if url.endswith('/forecast') else {'status': 'calculation_only'})
    monkeypatch.setattr(adapter, 'call', request)
    result = adapter.compute(payload)
    assert result['mode'] == 'historical_fixture'
    assert result['current'] == payload['history'][0]
    assert [url.split('/')[-1] for url, _ in calls] == ['ready', 'forecast', 'risk']

def test_wrong_cloud_model_stops_before_inference(monkeypatch):
    monkeypatch.setenv('ALLERT_MODEL_BASE_URL', 'https://example.invalid')
    monkeypatch.setenv('ALLERT_API_TOKEN', 'private-test-token')
    monkeypatch.setattr(adapter, 'call', lambda *args: {'status': 'process_running'})
    with pytest.raises(ValueError, match='verification'):
        adapter.compute({})

def test_plain_http_is_rejected(monkeypatch):
    monkeypatch.setenv('ALLERT_MODEL_BASE_URL', 'http://example.invalid')
    with pytest.raises(ValueError, match='HTTPS'):
        adapter.compute({})
