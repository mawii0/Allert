"""Fixed replay acceptance controls; model execution is mocked, no network/push."""
from datetime import datetime, timezone
import importlib.util
from pathlib import Path
from unittest.mock import Mock
import pytest
from fastapi.testclient import TestClient
from seed7_host import replay_acceptance as replay

spec = importlib.util.spec_from_file_location('replay_test_app', Path(__file__).with_name('app.py'))
app_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app_module)
TOKEN = 'staging-test-only-' + 'a' * 64


@pytest.fixture
def environment(monkeypatch):
    monkeypatch.setenv('ALLERT_WORKER_TOKEN', TOKEN)
    monkeypatch.setenv('ALLERT_ANALYTICS_ENABLED', 'true')
    monkeypatch.setenv('ALLERT_REPLAY_ACCEPTANCE_ENABLED', 'true')
    monkeypatch.setenv('ALLERT_REPLAY_STAGING_PROJECT_REF', 'a' * 20)
    monkeypatch.setenv('SUPABASE_URL', 'https://' + 'a' * 20 + '.supabase.co')


@pytest.fixture
def prepared(environment, monkeypatch):
    payload, expected, tolerance = replay.fixture()
    now = datetime.now(timezone.utc).isoformat()
    job = {'id': 900, 'lease_token': 'lease-test', 'kind': 'forecast', 'version': replay.MODEL_ID,
           'mode': 'replay', 'stream_id': replay.STREAM, 'device_id': 'ALLERT-NODE-001',
           'owner_id': 'owner-test', 'owner_epoch': now, 'origin': payload['forecast_origin'],
           'receipt_cutoff': now}
    rows = []
    for r in payload['history']:
        rows.append({'device_id': job['device_id'], 'stream_id': replay.STREAM, 'mode': 'replay',
                     'owner_id': job['owner_id'], 'owner_epoch': now, 'source_table': replay.SOURCE,
                     'block_start': r['block_start'], 'block_end': r['block_end'], 'received_at': now,
                     'pm2_5': r['pm2_5'], 'pm10': r['pm10'], 'temperature': r['temperature_c'],
                     'humidity': r['humidity_percent'],
                     'quality': {k: 'ok' for k in ('pm2_5','pm10','temperature','humidity')}})
    output = {'status': 'ready', 'input_hash': 'b' * 64, 'result': {
        'mode': 'historical_fixture', 'model_id': replay.MODEL_ID, 'checkpoint_sha256': replay.CHECKPOINT,
        'forecasts': [{'pollutant': p, 'horizon_hours': h, 'value': v} for (p,h),v in zip(
            [(p,h) for h in (6,12,24) for p in ('pm2_5','pm10')], expected, strict=True)]}}
    database = Mock()
    def rpc(name, args):
        if name == 'claim_allert_v2_job':
            assert args == {'p_kind': 'forecast', 'p_stream': replay.STREAM}
            return {'outcome': 'claimed', 'job': job}
        if name == 'read_allert_v2_job':
            return {'history': rows}
        if name == 'finish_allert_v2_job':
            return {'ok': True}
        if name == 'fail_allert_v2_job':
            return True
        raise AssertionError(name)
    database.rpc.side_effect = rpc
    monkeypatch.setattr(replay.worker, 'Database', Mock(return_value=database))
    runtime = Mock(return_value=object())
    monkeypatch.setattr(replay.worker, 'runtime', runtime)
    monkeypatch.setattr(replay.worker, 'forecast_output', Mock(return_value=output))
    return job, rows, output, database, runtime


def test_replay_is_disabled_by_default(environment, monkeypatch):
    monkeypatch.delenv('ALLERT_REPLAY_ACCEPTANCE_ENABLED')
    with TestClient(app_module.app) as client:
        r=client.post('/internal/replay-forecast', headers={'Authorization': 'Bearer '+TOKEN})
    assert r.status_code == 404


def test_master_worker_switch_also_disables_acceptance(environment, monkeypatch):
    monkeypatch.setenv('ALLERT_ANALYTICS_ENABLED', 'false')
    assert not replay.enabled()


@pytest.mark.parametrize('base,ref', [
    ('https://fugziwuyiecvdopdnkmn.supabase.co', 'fugziwuyiecvdopdnkmn'),
    ('http://'+'a'*20+'.supabase.co', 'a'*20),
    ('https://'+'b'*20+'.supabase.co', 'a'*20),
    ('https://'+'a'*20+'.supabase.co/other', 'a'*20),
    ('https://attacker.example', 'a'*20), ('https://[broken', 'a'*20),
])
def test_replay_refuses_live_project_or_wrong_origin(environment, monkeypatch, base, ref):
    monkeypatch.setenv('SUPABASE_URL', base)
    monkeypatch.setenv('ALLERT_REPLAY_STAGING_PROJECT_REF', ref)
    assert not replay.enabled()


def test_private_route_rejects_missing_auth_and_caller_selected_inputs(prepared):
    database=prepared[3]
    with TestClient(app_module.app) as client:
        assert client.post('/internal/replay-forecast').status_code == 401
        for path,body in [('/internal/replay-forecast?stream=live',''),
                          ('/internal/replay-forecast','{"readings":[]}'),
                          ('/internal/replay-forecast','x'*3000)]:
            assert client.post(path, headers={'Authorization': 'Bearer '+TOKEN}, content=body).status_code == 400
    database.rpc.assert_not_called()


def test_only_exact_fixture_is_compared_and_committed_without_live_heartbeat(prepared):
    with TestClient(app_module.app) as client:
        response=client.post('/internal/replay-forecast', headers={'Authorization': 'Bearer '+TOKEN})
    value=response.json()
    assert response.status_code == 200 and value['status'] == 'replay_forecast_verified'
    assert value['database_commit_verified'] and not value['live_forecast_readiness_verified']
    assert value['forecast_count'] == 6 and value['max_abs_difference_ugm3'] == 0
    database=prepared[3]
    assert [c.args[0] for c in database.rpc.call_args_list] == [
        'claim_allert_v2_job','read_allert_v2_job','finish_allert_v2_job']
    database.heartbeat.assert_not_called()
    database.close.assert_called_once()


@pytest.mark.parametrize('change', ['mode','time','value','quality','missing','node','owner'])
def test_changed_history_never_reaches_inference_or_commit(prepared, change):
    job,rows,_,database,runtime=prepared
    if change=='mode': job['mode']='live'
    if change=='time': rows[0]['block_end']=rows[1]['block_end']
    if change=='value': rows[0]['pm2_5']+=1
    if change=='quality': rows[0]['quality']['temperature']='missing'
    if change=='missing': rows.pop()
    if change=='node': rows[0]['device_id']='OTHER'
    if change=='owner': rows[0]['owner_id']='OTHER'
    with TestClient(app_module.app) as client:
        response=client.post('/internal/replay-forecast', headers={'Authorization': 'Bearer '+TOKEN})
    assert response.status_code == 503
    runtime.assert_not_called()
    assert not any(c.args[0]=='finish_allert_v2_job' for c in database.rpc.call_args_list)
    assert any(c.args[0]=='fail_allert_v2_job' for c in database.rpc.call_args_list)
    database.close.assert_called_once()


@pytest.mark.parametrize('change', ['drift','nan','channels','model','mode','unavailable'])
def test_bad_model_results_are_not_saved_as_verified(prepared, change):
    _,_,out,database,_=prepared
    if change=='drift': out['result']['forecasts'][0]['value']+=0.1
    if change=='nan': out['result']['forecasts'][0]['value']=float('nan')
    if change=='channels': out['result']['forecasts'].pop()
    if change=='model': out['result']['model_id']='wrong'
    if change=='mode': out['result']['mode']='live'
    if change=='unavailable': out['status']='insufficient_history'
    with TestClient(app_module.app) as client:
        response=client.post('/internal/replay-forecast', headers={'Authorization': 'Bearer '+TOKEN})
    assert response.status_code==503
    assert not any(c.args[0]=='finish_allert_v2_job' for c in database.rpc.call_args_list)


def test_rejected_commit_is_not_reported_as_success_and_private_errors_are_hidden(prepared):
    database=prepared[3]
    original=database.rpc.side_effect
    def rejected(name,args):
        if name=='finish_allert_v2_job': raise RuntimeError('private-supabase-secret')
        return original(name,args)
    database.rpc.side_effect=rejected
    with TestClient(app_module.app) as client:
        response=client.post('/internal/replay-forecast', headers={'Authorization':'Bearer '+TOKEN})
    assert response.status_code==503 and 'private-supabase-secret' not in response.text
    database.close.assert_called_once()


def test_no_remaining_job_does_not_claim_another_success(prepared):
    database=prepared[3]
    database.rpc.side_effect=lambda *_: {'outcome':'empty'}
    with TestClient(app_module.app) as client:
        response=client.post('/internal/replay-forecast', headers={'Authorization':'Bearer '+TOKEN})
    assert response.status_code==200 and response.json()['status']=='no_replay_job'
    assert response.json()['processed']==0


def test_busy_instance_does_not_start_replay(prepared):
    app_module._invocation.acquire()
    try:
        with TestClient(app_module.app) as client:
            response=client.post('/internal/replay-forecast', headers={'Authorization':'Bearer '+TOKEN})
        assert response.status_code==409
        prepared[3].rpc.assert_not_called()
    finally:
        app_module._invocation.release()
