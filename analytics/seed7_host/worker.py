"""Outbound durable-job worker. No HTTP listener, laptop dependency or direct push."""
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import json
import os
import sys
import time
from urllib.parse import urlsplit
import httpx
from .identity import load_runtime,verify_bytes,RELEASE,MODEL_ID,CHECKPOINT,OBSERVED_HASH
from .policy import indicator,forecast_pm


def stamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc)


def now():
    return datetime.now(timezone.utc)


@lru_cache(maxsize=1)
def analytics_ready():
    verify_bytes()
    sys.path.insert(0,str(RELEASE))
    return True


@lru_cache(maxsize=1)
def runtime():
    return load_runtime()


class Database:
    def __init__(self):
        base = os.environ.get('SUPABASE_URL', '').rstrip('/')
        key = os.environ.get('SUPABASE_SECRET_KEY', '')
        url = urlsplit(base)
        if (url.scheme != 'https' or not url.hostname or url.path or url.query or url.fragment or
                url.username or url.password or not key or key.startswith('sb_publishable_')):
            raise ValueError('Configure private Supabase worker settings')
        headers = {'apikey': key}
        if not key.startswith('sb_secret_'): headers['Authorization'] = 'Bearer ' + key
        self.client = httpx.Client(base_url=base+'/rest/v1/', headers=headers, timeout=15,
                                   follow_redirects=False, trust_env=False)

    def rpc(self, name, args):
        response = self.client.post('rpc/'+name, json=args)
        response.raise_for_status()
        result = response.json()
        if isinstance(result, dict) and result.get('ok') is False:
            raise RuntimeError('Analytics transaction rejected')
        return result

    def heartbeat(self, summary):
        response = self.client.patch('allert_v2_worker?id=eq.1', json={
            'last_finished_at': now().isoformat(), 'summary': summary})
        response.raise_for_status()

    def close(self): self.client.close()


def current_output(job, loaded, clock=None):
    from allert_runtime.engine import observed
    clock = clock or now()
    row = loaded['observation']
    if not row: raise ValueError('Missing frozen observation')
    output = {'status': 'unavailable', 'revision': loaded['revision'], 'snapshot': loaded['snapshot'],
              'decision': None, 'indicator': None}
    age = (clock - stamp(row['block_end'])).total_seconds()
    if job['mode'] == 'live' and not -60 <= age <= 600:
        output['status'] = 'stale'
        return output
    quality = row['quality']
    indicator_fields = ('pm2_5', 'pm10', 'temperature', 'humidity')
    if all(quality.get(k) == 'ok' and type(row.get(k)) in (float,int) for k in indicator_fields):
        try:
            output['indicator'] = indicator(row['pm2_5'],row['pm10'],row['temperature'],row['humidity'])
        except ValueError:
            pass
    record = {'node_id': job['device_id'], 'block_end': row['block_end'],
              'received_at': row['received_at'], 'units': 'ug/m3',
              'pm2_5': row['pm2_5'], 'pm10': row['pm10'],
              'pollutant_status': {k: quality.get(k, 'invalid') for k in ('pm2_5','pm10')}}
    result = observed(record, loaded['snapshot'], job['mode'])
    output.update(snapshot=result['snapshot'], decision=result['decision'])
    status = result['decision']['status']
    output['status'] = status if status in ('out_of_order','duplicate','stale') else 'ready' if status == 'accepted' else 'invalid_input'
    return output


def forecast_output(model, job, loaded):
    rows = loaded['history']
    eligible = [r for r in rows if all(r['quality'].get(k)=='ok' for k in
                ('pm2_5','pm10','temperature','humidity'))]
    summary = {'eligible_blocks': len(eligible), 'required_blocks': 648,
               'missing_receipts': sum(not r.get('received_at') for r in rows),
               'duplicate_blocks': len(rows)-len({r['block_end'] for r in rows})}
    result = {'status': 'insufficient_history', 'reason': '648 contiguous valid five-minute blocks are required',
              'summary': summary, 'input_hash': '', 'result': None}
    # Do not silently discard invalid/missing channel rows, round timestamps or gap-fill.
    if len(eligible) != 648 or len(rows) != 648:
        return result
    origin, cutoff = stamp(job['origin']), stamp(job['receipt_cutoff'])
    if job['mode']=='live' and not -60 <= (now()-origin).total_seconds() <= 600:
        return {**result,'status':'stale','reason':'Job missed its live forecast interval'}
    history = []
    for row in rows:
        if stamp(row['received_at']) > cutoff:
            raise ValueError('History changed beyond frozen availability cutoff')
        history.append({'node_id':job['device_id'], 'block_start':row['block_start'],
            'block_end':row['block_end'], 'received_at':row['received_at'], 'quality':'OK',
            'pm2_5':row['pm2_5'], 'pm10':row['pm10'], 'temperature_c':row['temperature'],
            'humidity_percent':row['humidity']})
    payload = {'node_id':job['device_id'], 'mode':'live' if job['mode']=='live' else 'historical_fixture',
               'forecast_origin':job['origin'], 'history':history}
    result['input_hash'] = hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
    try:
        value = model.predict(payload)
    except (ValueError, KeyError) as exc:
        return {**result,'status':'invalid_input','reason':str(exc)}
    if value['model_id'] != MODEL_ID or value['checkpoint_sha256'] != CHECKPOINT:
        raise ValueError('Runtime returned another model')
    return {**result, 'status':'ready', 'reason':None, 'result':value,
            'forecast_pm_indicator':forecast_pm(value,os.getenv('ALLERT_FORECAST_PM_INDICATOR_ENABLED')=='true')}


def run_batch(db=None, budget_seconds=45, stream='live'):
    # Replay is an explicit isolated invocation; scheduled production calls always use live.
    if os.getenv('ALLERT_ANALYTICS_ENABLED') != 'true': return {'outcome':'disabled'}
    analytics_ready()  # Current PM/indicator processing does not wait for neural model loading.
    owned_db = db is None
    db = db or Database()
    summary = {'processed':0,'errors':0,'current_errors':0,'forecast_errors':0,'enabled':True,'current':0,'forecast':0,'model_id':MODEL_ID,'stream':stream}
    deadline = time.monotonic()+budget_seconds
    try:
        # Current observations cannot be blocked by the 54-hour neural history requirement.
        for kind, maximum in (('current',32),('forecast',2)):
            for _ in range(maximum):
                if time.monotonic()>deadline: break
                reservation = db.rpc('claim_allert_v2_job', {'p_kind':kind,'p_stream':stream})
                if reservation.get('outcome') == 'disabled': summary['enabled']=False
                if reservation.get('outcome') != 'claimed': break
                job = reservation['job']
                try:
                    if job['stream_id'] != stream or (stream=='live') != (job['mode']=='live'):
                        raise ValueError('Stream/mode mismatch')
                    loaded = db.rpc('read_allert_v2_job', {'p_id':job['id'],'p_token':job['lease_token']})
                    output = current_output(job,loaded) if kind=='current' else forecast_output(runtime(),job,loaded)
                    db.rpc('finish_allert_v2_job',{'p_id':job['id'],'p_token':job['lease_token'],'p_output':output})
                    summary['processed']+=1; summary[kind]+=1
                except Exception:
                    summary['errors']+=1; summary[kind+'_errors']+=1
                    # No local snapshot advances: next attempt reloads only COMMITTED DB state.
                    db.rpc('fail_allert_v2_job',{'p_id':job['id'],'p_token':job['lease_token']})
        if stream=='live': db.heartbeat(summary)
        return summary
    finally:
        if owned_db: db.close()


if __name__=='__main__':
    print(json.dumps(run_batch()))
