"""Vercel wrapper checks use mocked jobs and never connect to a database."""
import importlib.util
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
import pytest

spec=importlib.util.spec_from_file_location('vercel_worker_app',Path(__file__).with_name('app.py'))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
TOKEN='fixture-only-'+'a'*64


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv('ALLERT_WORKER_TOKEN',TOKEN)
    with TestClient(module.app) as client:
        yield client


def test_public_liveness_does_not_load_weights_or_claim_database_readiness(client):
    with patch.object(module.worker,'runtime') as runtime,patch.object(module.worker,'run_batch') as batch:
        response=client.get('/health')
        assert response.status_code==200 and response.json()['database_readiness_verified'] is False
        assert response.headers['cache-control']=='no-store'
        runtime.assert_not_called();batch.assert_not_called()
    assert client.get('/docs').status_code==404
    assert client.get('/seed7_release/bundle/model/best_model.pt').status_code==404


def test_both_internal_routes_require_separate_worker_secret(client,monkeypatch):
    with patch.object(module.worker,'run_batch') as batch,patch.object(module.worker,'runtime') as runtime:
        assert client.post('/internal/tick').status_code==401
        assert client.get('/internal/readiness').status_code==401
        assert client.post('/internal/tick',headers={'Authorization':'Bearer wrong'}).status_code==401
        monkeypatch.delenv('ALLERT_WORKER_TOKEN')
        assert client.post('/internal/tick').status_code==503
        batch.assert_not_called();runtime.assert_not_called()


def test_tick_accepts_only_empty_body_and_fixed_live_budget(client):
    headers={'Authorization':'Bearer '+TOKEN}
    with patch.object(module.worker,'run_batch',return_value={'processed':1,'errors':0}) as batch:
        assert client.post('/internal/tick',headers=headers,json={}).status_code==200
        batch.assert_called_once_with(budget_seconds=45,stream='live')
        batch.reset_mock()
        for path,body in [('/internal/tick?stream=replay',''),('/internal/tick','{"mode":"replay"}'),('/internal/tick','x'*4096)]:
            assert client.post(path,headers=headers,content=body).status_code==400
        batch.assert_not_called()


def test_failed_processing_and_database_outage_are_not_reported_as_success(client):
    headers={'Authorization':'Bearer '+TOKEN}
    with patch.object(module.worker,'run_batch',return_value={'errors':1}):
        assert client.post('/internal/tick',headers=headers).status_code==503
    with patch.object(module.worker,'run_batch',side_effect=RuntimeError('private-db-secret')):
        response=client.post('/internal/tick',headers=headers)
        assert response.status_code==503 and 'private-db-secret' not in response.text


def test_overlapping_warm_instance_does_not_start_second_batch(client):
    module._invocation.acquire()
    try:
        with patch.object(module.worker,'run_batch') as batch:
            assert client.post('/internal/tick',headers={'Authorization':'Bearer '+TOKEN}).status_code==409
            batch.assert_not_called()
    finally:
        module._invocation.release()


def test_authenticated_readiness_checks_runtime_but_not_database(client):
    with patch.object(module.worker,'runtime') as runtime,patch.object(module.worker,'run_batch') as batch:
        response=client.get('/internal/readiness',headers={'Authorization':'Bearer '+TOKEN})
        assert response.status_code==200 and response.json()['status']=='runtime_loaded'
        assert response.json()['database_readiness_verified'] is False
        runtime.assert_called_once();batch.assert_not_called()
