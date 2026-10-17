"""Versioned joint-policy adapter. Frozen source-kit formula/config remains intact."""
import hashlib
import json
import math
import os
from pathlib import Path

_root=Path(__file__).resolve().parents[2]
_canonical=_root/'supabase/functions/server/indicator-policy.json'
POLICY_PATH=Path(os.environ.get('ALLERT_INDICATOR_POLICY_PATH',str(_canonical if _canonical.exists() else Path(__file__).resolve().parents[1]/'indicator-policy.json')))
POLICY_BYTES=POLICY_PATH.read_bytes()
POLICY=json.loads(POLICY_BYTES)
if json.dumps(POLICY,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()!=POLICY_BYTES:
    raise ValueError('Indicator policy must use canonical sorted JSON bytes')
INDICATOR_HASH=hashlib.sha256(POLICY_BYTES).hexdigest()
if INDICATOR_HASH!='03f97ad4b2737e85cfe01969fed8a059668dcf5e76c5508ee3279d1c5e6aa5c0':
    raise ValueError('Joint indicator policy identity mismatch')


def classify_fraction(value,population):
    if population not in ('adult','pediatric') or type(value) not in (int,float) or not math.isfinite(value) or not 0<=value<=1:
        raise ValueError('Invalid indicator fraction or population')
    count=sum(value>=cut/100 for cut in POLICY[population])
    return ('low','moderate','high','very_high')[count]


def indicator(pm2_5,pm10,temperature,humidity):
    if (not all(type(v) in (float,int) and math.isfinite(v) for v in (pm2_5,pm10,temperature,humidity)) or
        pm2_5<0 or pm10<0 or not -10<=temperature<=60 or not 0<=humidity<=100):
        raise ValueError('Invalid current indicator readings')
    from allert_runtime.engine import risk
    # Preserve the exact continuous calculation; only reclassify under the new policy.
    result=risk({'pm2_5':pm2_5,'pm10':pm10,'temperature_c':temperature,'humidity_percent':humidity})
    result.update(rule_id=POLICY['id'],rule_sha256=INDICATOR_HASH,policy_status=POLICY['status'])
    for population in ('adult','pediatric'):
        result[population]['tier']=classify_fraction(result[population]['indicator_0_1'],population)
    return result


def forecast_pm(result,enabled=False):
    base={'enabled':False,'policy_id':POLICY['forecast_pm']['id'],'policy_hash':INDICATOR_HASH,
          'basis':'forecast_pm_only','score_unit':'points','interpretations':[]}
    if not enabled:return base
    from .identity import CHECKPOINT
    if (result.get('status')!='ok' or result.get('model_id')!='median-residual-seed7-epoch15-20261013-v1' or
        result.get('checkpoint_sha256')!=CHECKPOINT or result.get('node_id')!='ALLERT-NODE-001' or result.get('mode') not in ('live','historical_fixture')):
        raise ValueError('PM interpretation requires a verified neural result')
    values=result.get('forecasts',[])
    if len(values)!=6:raise ValueError('Six matching forecast values required')
    from datetime import datetime,timedelta
    origin=datetime.fromisoformat(result['forecast_origin'].replace('Z','+00:00'))
    if origin.tzinfo is None or origin.timestamp()%900:raise ValueError('Invalid forecast origin')
    if result['mode']=='live':
        from datetime import timezone
        if not -60<=(datetime.now(timezone.utc)-origin).total_seconds()<=600:raise ValueError('Stale live PM interpretation')
    for horizon in (6,12,24):
        pair=[v for v in values if v.get('horizon_hours')==horizon]
        if len(pair)!=2 or {v.get('pollutant') for v in pair}!={'pm2_5','pm10'}:raise ValueError('Mismatched pollutant pair')
        for v in pair:
            if (v.get('units')!='ug/m3' or type(v.get('value')) not in (int,float) or not math.isfinite(v['value']) or v['value']<0 or
                datetime.fromisoformat(v['target_block_end'].replace('Z','+00:00'))!=origin+timedelta(hours=horizon) or
                datetime.fromisoformat(v['target_block_start'].replace('Z','+00:00'))!=origin+timedelta(hours=horizon,minutes=-5)):
                raise ValueError('Invalid target pair')
        fields={v['pollutant']:v['value'] for v in pair}
        contribution=POLICY['coefficients']['pm2_5']*fields['pm2_5']+POLICY['coefficients']['pm10']*fields['pm10']
        if not math.isfinite(contribution):raise ValueError('Nonfinite PM contribution')
        populations={}
        for population in ('adult','pediatric'):
            p0=POLICY['reference'][population+'_p0'];z=math.log(p0/(1-p0))+contribution
            value=1/(1+math.exp(-z)) if z>=0 else math.exp(z)/(1+math.exp(z))
            populations[population]={'indicator_0_1':value,'score_0_100':100*value,'tier':classify_fraction(value,population)}
        base['interpretations'].append({'horizon_hours':horizon,'target_block_start':pair[0]['target_block_start'],
          'target_block_end':pair[0]['target_block_end'],'node_id':result['node_id'],'forecast_origin':result['forecast_origin'],
          'model_id':result['model_id'],'status':'neural_forecast','populations':populations})
    return {**base,'enabled':True}
