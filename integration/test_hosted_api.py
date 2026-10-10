"""Readiness checks must validate inference and enforce private authentication."""
from fastapi.testclient import TestClient

def test_hosted_startup_and_readiness(monkeypatch):
    monkeypatch.setenv('ALLERT_API_TOKEN', 'local-test-token-' + 'x' * 48)
    monkeypatch.setenv('ALLERT_DEVICE', 'cpu')
    from integration.hosted_api import app
    with TestClient(app) as client:
        assert client.get('/ready').status_code == 401
        response = client.get('/ready', headers={'Authorization': 'Bearer local-test-token-' + 'x' * 48})
        assert response.status_code == 200
        result = response.json()
        assert result['status'] == 'model_ready'
        assert result['golden_replay_cases'] == 12
        assert result['max_abs_difference_ugm3'] < 0.02
        assert result['model']['model_id'] == 'median-residual-single-v1'
        assert result['supabase_worker_implemented'] is False

def test_hosted_startup_rejects_missing_secret(monkeypatch):
    monkeypatch.delenv('ALLERT_API_TOKEN', raising=False)
    from integration.hosted_api import app
    import pytest
    with pytest.raises(RuntimeError, match='ALLERT_API_TOKEN'):
        with TestClient(app):
            pass
