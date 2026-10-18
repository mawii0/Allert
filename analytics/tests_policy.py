from copy import deepcopy
import hashlib,json,math
import pytest
from seed7_host.identity import load_runtime,RELEASE
from seed7_host.policy import POLICY,POLICY_BYTES,INDICATOR_HASH,indicator,classify_fraction,forecast_pm

@pytest.fixture(scope='module',autouse=True)
def load():return load_runtime()

@pytest.mark.parametrize('population',['adult','pediatric'])
def test_exact_boundaries_and_neighbours(population):
    cuts=POLICY[population];tiers=['low','moderate','high','very_high']
    for i,cut in enumerate(cuts):
        assert classify_fraction(math.nextafter(cut/100,0),population)==tiers[i]
        assert classify_fraction(cut/100,population)==tiers[i+1]
        assert classify_fraction(math.nextafter(cut/100,1),population)==tiers[i+1]
    assert classify_fraction(0,population)=='low'
    assert classify_fraction(1,population)=='very_high'


def test_neutral_and_supplied_worked_examples():
    r=indicator(0,0,25,60)
    assert r['adult']['score_0_100']==pytest.approx(20,abs=1e-12)
    assert r['pediatric']['score_0_100']==pytest.approx(22,abs=1e-12)
    assert (r['adult']['tier'],r['pediatric']['tier'])==('low','moderate')
    r=indicator(11,13,35.6,92.8)
    assert r['adult']['score_0_100']==pytest.approx(22.407164,abs=1e-6)
    assert r['pediatric']['score_0_100']==pytest.approx(24.573939,abs=1e-6)
    assert (r['adult']['tier'],r['pediatric']['tier'])==('low','moderate')


def test_scores_unchanged_and_old_frozen_policy_not_relabelled():
    from allert_runtime.engine import risk
    old=risk({'pm2_5':20,'pm10':40,'temperature_c':30,'humidity_percent':70})
    new=indicator(20,40,30,70)
    for p in ('adult','pediatric'):
        assert old[p]['score_0_100']==new[p]['score_0_100']
        assert old[p]['indicator_0_1']==new[p]['indicator_0_1']
    assert old['rule_sha256']!=new['rule_sha256']
    assert old['rule_id']=='environmental-indicator-v1'


def test_raw_values_not_display_rounding_drive_categories():
    assert round(22.49,1)==22.5
    assert classify_fraction(22.49/100,'adult')=='low'
    assert classify_fraction(29.99/100,'adult')=='moderate'
    assert classify_fraction(37.49/100,'adult')=='high'
    for value,tier in [(24.9,'moderate'),(34.9,'high'),(49.9,'very_high')]:
        assert classify_fraction(value/100,'adult')==tier


@pytest.mark.parametrize('bad',[None,True,'2',float('nan'),float('inf'),-1])
def test_invalid_pm_not_zero_or_low(bad):
    with pytest.raises((ValueError,TypeError)):indicator(bad,1,25,60)


def test_monotonic_changes_and_saturation():
    base=indicator(10,10,25,60)
    for args in [(11,10,25,60),(10,11,25,60),(10,10,26,60),(10,10,25,59)]:
        changed=indicator(*args)
        for p in ('adult','pediatric'):assert changed[p]['score_0_100']>base[p]['score_0_100']
    high=indicator(1000,1000,60,0)
    for p in ('adult','pediatric'):
        assert high[p]['score_0_100']<=100 and high[p]['tier']=='very_high'


def result_fixture():
    m=load_runtime();data=json.loads((RELEASE/'examples/forecast_case_01.json').read_text())
    data['node_id']='ALLERT-NODE-001'
    for r in data['history']:r['node_id']=data['node_id']
    return m.predict(data)


def test_optional_forecast_disabled_without_altering_pm():
    value=result_fixture();copy=deepcopy(value);out=forecast_pm(value)
    assert out['enabled'] is False and not out['interpretations']
    assert value==copy


def test_combined_pm_indicator_population_mapping_and_zero_reference():
    value=result_fixture()
    for f in value['forecasts']:f['value']=0
    out=forecast_pm(value,True)
    assert len(out['interpretations'])==3
    for row in out['interpretations']:
        assert row['populations']['adult']['tier']=='low'
        assert row['populations']['pediatric']['tier']=='moderate'
        assert row['populations']['pediatric']['score_0_100']==pytest.approx(22)
        assert row['target_block_end']==next(v['target_block_end'] for v in value['forecasts'] if v['horizon_hours']==row['horizon_hours'])
    assert 'temperature' not in json.dumps(out)


@pytest.mark.parametrize('change',[lambda v:v['forecasts'].pop(),lambda v:v['forecasts'][0].update(value=-1),lambda v:v['forecasts'][0].update(horizon_hours=24),lambda v:v['forecasts'][0].update(target_block_end='2020-01-01T00:00:00Z')])
def test_bad_pairs_never_become_low(change):
    value=result_fixture();change(value)
    with pytest.raises(ValueError):forecast_pm(value,True)
