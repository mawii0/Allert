"""Portable forecast, independent analytics and private-API contract tests."""
from copy import deepcopy
from pathlib import Path
import json
import os
import sys
import numpy as np
import pandas as pd
import pytest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from allert_runtime.engine import ModelRuntime,risk,observed,verify_package
from src.risk_engine import classify_risk_tier
from src.config_loader import load_risk_config


@pytest.fixture(scope='module')
def runtime():return ModelRuntime('cpu')


@pytest.fixture
def payload():return json.loads((ROOT/'examples/forecast_case_01.json').read_text())


def test_original_weights_and_package():
    manifest=verify_package()
    assert manifest['checkpoint_sha256']=='4253e73515d8d2a3d4a4463065f8bfb2192c9454e161da560fd928a4051672c4'


def test_forecast_replays_revised_selected_checkpoint(runtime,payload):
    expected=json.loads((ROOT/'examples/golden_predictions.json').read_text())['cases'][0]['expected']
    result=runtime.predict(payload)
    assert result['model_id']=='median-residual-seed7-epoch15-20261013-v1'
    assert len(result['forecasts'])==6
    assert [r['horizon_hours'] for r in result['forecasts']]==[6,6,12,12,24,24]
    np.testing.assert_allclose([r['value'] for r in result['forecasts']],expected,rtol=0,atol=.02)
    assert result['trained_or_recalibrated'] is False


def test_missing_issue_row_does_not_require_fabrication(runtime,payload):
    assert payload['history'][-1]['block_end']==payload['forecast_origin']
    X,anchor,*_=runtime.prepare(payload)
    assert X.shape==(1,576,8) and anchor.shape==(1,6)


def test_warmup_feature_is_full_six_hour_history(runtime,payload):
    _,_,origin,*_=runtime.prepare(payload)
    history=payload['history']
    expected=np.mean([r['temperature_c'] for r in history[1:73]])
    X,*_=runtime.prepare(payload)
    restored=runtime.scaler.inverse_transform(X.reshape(-1,8))
    assert restored[0,6]==pytest.approx(expected,abs=.0001)


@pytest.mark.parametrize('change',['short','duplicate','order','future','invalid_quality','bool','foreign_node'])
def test_invalid_history_is_rejected(runtime,payload,change):
    if change=='short':payload['history']=payload['history'][-576:]
    elif change=='duplicate':payload['history'][1]=deepcopy(payload['history'][0])
    elif change=='order':payload['history'][0],payload['history'][1]=payload['history'][1],payload['history'][0]
    elif change=='future':
        row=deepcopy(payload['history'][-1]);row['block_start']=payload['forecast_origin']
        row['block_end']=(pd.Timestamp(row['block_start'])+pd.Timedelta(minutes=5)).isoformat();payload['history'].append(row)
    elif change=='invalid_quality':payload['history'][0]['quality']='IMPUTED'
    elif change=='bool':payload['history'][0]['pm2_5']=True
    else:payload['history'][0]['node_id']='node-2'
    with pytest.raises(ValueError):runtime.predict(payload)


def test_no_live_forecast_from_old_fixture(runtime,payload):
    payload['mode']='live'
    with pytest.raises(ValueError,match='stale/future'):runtime.predict(payload)


def test_target_interval_matches_saved_methodology(runtime,payload):
    result=runtime.predict(payload);origin=pd.Timestamp(payload['forecast_origin'])
    for row in result['forecasts']:
        end=origin+pd.Timedelta(hours=row['horizon_hours'])
        assert pd.Timestamp(row['target_block_end'])==end
        assert pd.Timestamp(row['target_block_start'])==end-pd.Timedelta(minutes=5)


def test_risk_example_and_independence():
    result=risk({'pm2_5':20,'pm10':40,'temperature_c':30,'humidity_percent':70})
    assert result['adult']['score_0_100']==pytest.approx(25.8401,abs=.0001)
    assert result['pediatric']['score_0_100']==pytest.approx(28.2181,abs=.0001)
    assert result['adult']['tier']==result['pediatric']['tier']=='high'


@pytest.mark.parametrize('age,cuts',[('adult',[.15,.25,.4]),('pediatric',[.13,.23,.38])])
def test_tier_boundaries(age,cuts):
    for name,cut in zip(('moderate','high','very_high'),cuts):
        assert classify_risk_tier(cut,age,load_risk_config())[0]==name


@pytest.mark.parametrize('value',[True,-1,float('nan')])
def test_invalid_risk(value):
    with pytest.raises(ValueError):risk({'pm2_5':value,'pm10':40,'temperature_c':30,'humidity_percent':70})


def record(i,value=10,node='node-1'):
    t=pd.Timestamp('2026-10-10T00:00:00Z')+pd.Timedelta(minutes=5*i)
    return {'node_id':node,'block_end':t.isoformat(),'received_at':t.isoformat(),
            'units':'ug/m3','pm2_5':value,'pm10':20,'sensor_status':'ok'}


def test_observed_snapshot_restart_and_idempotency():
    snapshot=None
    for i in range(12):snapshot=observed(record(i),snapshot,'replay')['snapshot']
    result=observed(record(12,70),snapshot,'replay')
    assert result['decision']['notifications'] and not result['delivery_performed']
    snapshot=result['snapshot']
    duplicate=observed(record(12,70),snapshot,'replay')
    assert duplicate['decision']['status']=='duplicate' and not duplicate['decision']['notifications']
    plateau=observed(record(13,70),snapshot,'replay')
    assert plateau['decision']['event']['confirmed'] is True


def test_current_processing_age_rejects_old_live_record():
    with pytest.raises(ValueError,match='stale/future'):observed(record(0),mode='live')


def test_each_node_has_isolated_state():
    first=observed(record(0,70),mode='replay')
    second=observed(record(0,10,'node-2'),first['snapshot'],'replay')
    assert second['snapshot']['nodes']['node-1']['event'] is not None
    assert second['snapshot']['nodes']['node-2']['event'] is None


@pytest.fixture
def client(monkeypatch):
    from fastapi.testclient import TestClient
    from allert_runtime.api import app
    monkeypatch.setenv('ALLERT_API_TOKEN','software-test-token-not-a-real-secret-0001')
    monkeypatch.setenv('ALLERT_DEVICE','cpu')
    return TestClient(app)


def headers():return {'Authorization':'Bearer software-test-token-not-a-real-secret-0001'}


def test_api_auth_and_health(client):
    assert client.get('/health').status_code==200
    assert client.get('/v1/model').status_code==401
    assert client.get('/v1/model',headers=headers()).status_code==200


def test_missing_configured_secret_fails_closed(client,monkeypatch):
    monkeypatch.delenv('ALLERT_API_TOKEN')
    assert client.get('/v1/model',headers=headers()).status_code==503


def test_api_known_forecast(client,payload):
    response=client.post('/v1/forecast',headers=headers(),json=payload)
    assert response.status_code==200 and len(response.json()['forecasts'])==6


def test_api_validation_and_independent_risk(client):
    assert client.post('/v1/risk',headers=headers(),json={'pm2_5':True}).status_code==422
    response=client.post('/v1/risk',headers=headers(),json={'pm2_5':20,'pm10':40,'temperature_c':30,'humidity_percent':70})
    assert response.status_code==200 and response.json()['adult']['tier']=='high'


def test_body_size_guard(client):
    response=client.post('/v1/risk',headers={**headers(),'Content-Length':'3000000'},content='{}')
    assert response.status_code==413
