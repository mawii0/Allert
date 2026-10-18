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


@pytest.mark.parametrize('body', [b'', b'{}', b'{ }', b' \r\n{\n}\t', b'\xef\xbb\xbf{}\r\n', b' ' * 64])
def test_empty_json_formatting_preserves_fixed_server_selected_jobs(client, body):
    with patch.object(module.worker, 'run_batch', return_value={'processed': 0, 'errors': 0}) as batch:
        response = client.post('/internal/tick', headers={'Authorization': 'Bearer ' + TOKEN}, content=body)
        assert response.status_code == 200
        batch.assert_called_once_with(budget_seconds=45, stream='live')


@pytest.mark.parametrize('body,kind', [
    (b'{"stream":"replay"}', 'nonempty_object'),
    (b'[]', 'json_array'), (b'"{}"', 'json_string'),
    (b'null', 'json_null'), (b'false', 'json_boolean'), (b'0', 'json_number'),
    (b'{}{}', 'invalid_json'), (b'\x01{}', 'invalid_json'),
    (b'{}\x00', 'invalid_json'), (b'\xff', 'invalid_json'),
    (b' ' * 65, 'body_limit'), (b'x' * 4096, 'body_limit'),
])
def test_body_diagnostics_never_accept_parameters_or_unbounded_bodies(client, body, kind):
    import hashlib
    with patch.object(module.worker, 'run_batch') as batch:
        response = client.post('/internal/tick', headers={'Authorization': 'Bearer ' + TOKEN}, content=body)
        assert response.status_code == 400
        shape = response.json()['request_shape']
        assert shape['kind'] == kind
        assert shape['bytes_seen'] == len(body)
        assert shape['prefix_sha256'] == hashlib.sha256(body[:64]).hexdigest()
        assert response.headers['cache-control'] == 'no-store'
        batch.assert_not_called()


def test_request_diagnostics_do_not_return_private_values_or_field_names(client):
    body = b'{"private_field":"fixture-sensitive-value"}'
    with patch.object(module.worker, 'run_batch') as batch:
        response = client.post('/internal/tick', headers={'Authorization': 'Bearer ' + TOKEN}, content=body)
        assert response.status_code == 400
        for private in ('fixture-sensitive-value', 'private_field', TOKEN, 'authorization'):
            assert private not in response.text
        assert set(response.json()['request_shape']) == {
            'bytes_seen', 'kind', 'prefix_sha256', 'content_length',
            'syntax_mask', 'content_encoding', 'gzip_signature'}
        batch.assert_not_called()


def test_wire_shape_masks_values_and_reports_only_known_encoding_names(client):
    import json
    body = b'{"private_field":"Secret123"}\x00'
    headers = {'Authorization': 'Bearer ' + TOKEN, 'Content-Encoding': 'private-encoding-value'}
    with patch.object(module.worker, 'run_batch') as batch:
        response = client.post('/internal/tick', headers=headers, content=body)
        assert response.status_code == 400
        shape = response.json()['request_shape']
        assert shape['syntax_mask'] == '{"aaaaaaa_aaaaa":"aaaaaa###"}?'
        assert shape['content_encoding'] == 'other'
        assert shape['gzip_signature'] is False
        for secret in ('Secret123', 'private_field', 'private-encoding-value', TOKEN):
            assert secret not in response.text
        assert len(json.loads(response.text)['request_shape']['syntax_mask']) == len(body)
        batch.assert_not_called()


def test_gzip_wire_signature_is_diagnostic_and_never_processed(client):
    import gzip
    with patch.object(module.worker, 'run_batch') as batch:
        response = client.post('/internal/tick', headers={
            'Authorization': 'Bearer ' + TOKEN, 'Content-Encoding': 'gzip'},
            content=gzip.compress(b'{}', mtime=0))
        assert response.status_code == 400
        assert response.json()['request_shape']['gzip_signature'] is True
        assert response.json()['request_shape']['content_encoding'] == 'gzip'
        batch.assert_not_called()


@pytest.mark.parametrize('chunks,expected', [([b'{', b' ', b'}', b'\r\n'], 200), ([b' ' * 32, b' ' * 33], 400)])
def test_streamed_request_limit_counts_all_chunks(chunks, expected, monkeypatch):
    import anyio
    from starlette.requests import Request
    from fastapi.responses import JSONResponse
    monkeypatch.setenv('ALLERT_WORKER_TOKEN', TOKEN)
    async def exercise():
        messages = iter([{'type': 'http.request', 'body': chunk, 'more_body': True} for chunk in chunks]
                        + [{'type': 'http.request', 'body': b'', 'more_body': False}])
        async def receive():
            return next(messages)
        request = Request({'type': 'http', 'method': 'POST', 'path': '/internal/tick', 'query_string': b'',
                           'headers': [(b'authorization', ('Bearer ' + TOKEN).encode())],
                           'scheme': 'https', 'server': ('testserver', 443)}, receive)
        calls = []
        async def next_handler(_request):
            calls.append(True)
            return JSONResponse({'ok': True})
        response = await module.protect_internal(request, next_handler)
        assert response.status_code == expected
        assert bool(calls) == (expected == 200)
    anyio.run(exercise)
