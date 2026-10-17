"""Orchestration tests; fixtures remain replay-only and no network/push is used."""
from copy import deepcopy
from datetime import datetime,timedelta,timezone
import json
import os
from unittest.mock import patch
import pytest
from seed7_host.identity import RELEASE,load_runtime,MODEL_ID,CHECKPOINT,OBSERVED_HASH,SOURCE_INDICATOR_HASH
from seed7_host.worker import current_output,forecast_output,run_batch

@pytest.fixture(scope='module')
def model():return load_runtime()


def test_hashes_and_frozen_metadata(model):
    import hashlib
    assert hashlib.sha256((RELEASE/'config/observed_pm_alerts.yaml').read_bytes()).hexdigest()==OBSERVED_HASH
    assert hashlib.sha256((RELEASE/'config/environmental_risk.yaml').read_bytes()).hexdigest()==SOURCE_INDICATOR_HASH
    assert model.info()['model_id']==MODEL_ID
    assert model.info()['checkpoint_sha256']==CHECKPOINT


def replay_job():
    payload=json.loads((RELEASE/'examples/forecast_case_01.json').read_text())
    history=[]
    for r in payload['history']:
        history.append({'block_start':r['block_start'],'block_end':r['block_end'],
        'received_at':r['block_end'],'pm2_5':r['pm2_5'],'pm10':r['pm10'],
        'temperature':r['temperature_c'],'humidity':r['humidity_percent'],
        'quality':{k:'ok' for k in ('pm2_5','pm10','temperature','humidity')}})
    return {'device_id':'ALLERT-NODE-001','mode':'replay','origin':payload['forecast_origin'],
            'receipt_cutoff':datetime.now(timezone.utc).isoformat()}, {'history':history}


def test_forecast_uses_exact_model_with_cutoff_hash_and_six_target_intervals(model):
    j,data=replay_job();out=forecast_output(model,j,data)
    assert out['status']=='ready' and len(out['result']['forecasts'])==6
    assert len(out['input_hash'])==64
    assert out['result']['mode']=='historical_fixture'
    assert 'risk' not in out['result']
    assert forecast_output(model,j,data)['input_hash']==out['input_hash']


def test_receipts_after_frozen_cutoff_cannot_change_a_retry(model):
    j,data=replay_job();data['history'][-1]['received_at']=(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat()
    with pytest.raises(ValueError,match='cutoff'):forecast_output(model,j,data)


@pytest.mark.parametrize('change',[lambda x:x.pop(),lambda x:x.reverse(),lambda x:x.__setitem__(-1,deepcopy(x[-2])),lambda x:x[-1]['quality'].update(temperature='missing')])
def test_bad_forecast_history_has_no_fallback(model,change):
    j,data=replay_job();change(data['history']);out=forecast_output(model,j,data)
    assert out['status']!='ready' and out['result'] is None


def test_missing_weather_does_not_block_persistent_observed_episode_or_fake_indicator(model):
    row={'block_end':'2026-10-10T00:05:00Z','received_at':'2026-10-10T00:05:00Z',
         'pm2_5':70,'pm10':100,'temperature':None,'humidity':None,
         'quality':{'pm2_5':'ok','pm10':'ok','temperature':'missing','humidity':'missing'}}
    loaded={'observation':row,'snapshot':None,'revision':0}
    out=current_output({'mode':'replay','device_id':'ALLERT-NODE-001'},loaded)
    assert out['status']=='ready' and out['indicator'] is None
    assert out['decision']['notifications'][0]['kind']=='initial'
    assert out['snapshot']['nodes']['ALLERT-NODE-001']['event']
    assert out['decision']['delivery_performed'] is False


def test_worker_downtime_never_confirms_recovery(model):
    row={'block_end':'2026-10-10T00:05:00Z','received_at':'2026-10-10T00:05:00Z',
         'pm2_5':70,'pm10':100,'temperature':None,'humidity':None,
         'quality':{'pm2_5':'ok','pm10':'ok','temperature':'missing','humidity':'missing'}}
    out=current_output({'mode':'replay','device_id':'ALLERT-NODE-001'},{'observation':row,'snapshot':None,'revision':0})
    old=deepcopy(out['snapshot'])
    late=current_output({'mode':'live','device_id':'ALLERT-NODE-001'},{'observation':row,'snapshot':old,'revision':1})
    assert late['status']=='stale' and late['snapshot']==old and late['decision'] is None


def test_unvalidated_node_and_experimental_switch_fail_closed(monkeypatch):
    monkeypatch.setenv('ALLERT_VALIDATED_NODE_ID','ALLERT-NODE-002')
    with pytest.raises(ValueError,match='source node'):load_runtime()
    monkeypatch.setenv('ALLERT_VALIDATED_NODE_ID','ALLERT-NODE-001')
    monkeypatch.setenv('ALLERT_ALLOW_EXPERIMENTAL_NODES','true')
    with pytest.raises(ValueError,match='Experimental'):load_runtime()


def test_failed_commit_reloads_committed_snapshot_instead_of_advancing_memory(model,monkeypatch):
    j,data=replay_job();j.update(id=1,lease_token='lease',stream_id='fixture-a')
    calls=[]
    class DB:
        def rpc(self,name,args):
            calls.append((name,deepcopy(args)))
            if name=='claim_allert_v2_job':
                if args['p_kind']=='current':return {'outcome':'empty'}
                return {'outcome':'claimed','job':j} if sum(n==name and a['p_kind']=='forecast' for n,a in calls)==1 else {'outcome':'empty'}
            if name=='read_allert_v2_job':return data
            if name=='finish_allert_v2_job':raise RuntimeError('Lost lease')
            if name=='fail_allert_v2_job':return False
            raise AssertionError(name)
        def heartbeat(self,_):raise AssertionError('Replay cannot replace live heartbeat')
    monkeypatch.setenv('ALLERT_ANALYTICS_ENABLED','true')
    with patch('seed7_host.worker.runtime',return_value=model):result=run_batch(DB(),stream='fixture-a')
    assert result['errors']==1 and result['processed']==0
    assert any(n=='fail_allert_v2_job' for n,_ in calls)
