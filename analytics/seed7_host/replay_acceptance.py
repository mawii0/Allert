"""One fixed golden forecast in a separately configured staging replay stream."""
import json
import math
import os
import re
from urllib.parse import urlsplit
from . import worker
from .identity import RELEASE, MODEL_ID, CHECKPOINT, verify_bytes

STREAM = 'seed7-staging-acceptance-case01-v1'
SOURCE = 'seed7_fixture_case01_import'
PRODUCTION_REF = 'fugziwuyiecvdopdnkmn'


def enabled():
    ref = os.environ.get('ALLERT_REPLAY_STAGING_PROJECT_REF', '')
    try:
        base = urlsplit(os.environ.get('SUPABASE_URL', ''))
    except ValueError:
        return False
    return (os.environ.get('ALLERT_REPLAY_ACCEPTANCE_ENABLED') == 'true'
            and os.environ.get('ALLERT_ANALYTICS_ENABLED') == 'true'
            and re.fullmatch(r'[a-z0-9]{20}', ref) is not None
            and ref != PRODUCTION_REF and base.scheme == 'https'
            and base.netloc == ref + '.supabase.co'
            and base.path in ('', '/') and not base.query and not base.fragment)


def fixture():
    verify_bytes()
    golden = json.loads((RELEASE / 'examples/golden_predictions.json').read_text())
    case = golden['cases'][0]
    if case['input'] != 'examples/forecast_case_01.json':
        raise ValueError('Wrong golden fixture')
    return json.loads((RELEASE / case['input']).read_text()), case['expected'], golden['tolerance_ugm3']


def check_history(job, loaded, payload):
    if (job.get('mode') != 'replay' or job.get('stream_id') != STREAM
            or job.get('kind') != 'forecast' or job.get('device_id') != 'ALLERT-NODE-001'
            or job.get('version') != MODEL_ID
            or worker.stamp(job['origin']) != worker.stamp(payload['forecast_origin'])):
        raise ValueError('Wrong replay job identity')
    rows = loaded['history']
    if len(rows) != len(payload['history']) or len(rows) != 648:
        raise ValueError('Wrong replay history size')
    for actual, expected in zip(rows, payload['history'], strict=True):
        if (actual.get('mode') != 'replay' or actual.get('stream_id') != STREAM
                or actual.get('source_table') != SOURCE
                or actual.get('device_id') != 'ALLERT-NODE-001'
                or actual.get('owner_id') != job['owner_id']
                or worker.stamp(actual['owner_epoch']) != worker.stamp(job['owner_epoch'])):
            raise ValueError('Wrong replay observation identity')
        for key in ('block_start', 'block_end'):
            if worker.stamp(actual[key]) != worker.stamp(expected[key]):
                raise ValueError('Replay measurement times were changed')
        for actual_key, expected_key in (('pm2_5', 'pm2_5'), ('pm10', 'pm10'),
                                         ('temperature', 'temperature_c'), ('humidity', 'humidity_percent')):
            value = actual.get(actual_key)
            if (type(value) not in (int, float) or value != expected[expected_key]
                    or actual['quality'].get(actual_key) != 'ok'):
                raise ValueError('Replay measurements were changed')


def run_one():
    if not enabled():
        raise ValueError('Staging replay acceptance is disabled')
    payload, expected, tolerance = fixture()
    db = worker.Database()
    job = None
    try:
        reservation = db.rpc('claim_allert_v2_job', {'p_kind': 'forecast', 'p_stream': STREAM})
        if reservation.get('outcome') == 'empty':
            return {'status': 'no_replay_job', 'processed': 0, 'errors': 0, 'stream_id': STREAM}
        if reservation.get('outcome') != 'claimed':
            raise ValueError('Staging forecast processing must be enabled')
        job = reservation['job']
        loaded = db.rpc('read_allert_v2_job', {'p_id': job['id'], 'p_token': job['lease_token']})
        check_history(job, loaded, payload)
        output = worker.forecast_output(worker.runtime(), job, loaded)
        if output['status'] != 'ready':
            raise ValueError('Golden replay forecast was not ready')
        result = output['result']
        if (result.get('mode') != 'historical_fixture' or result.get('model_id') != MODEL_ID
                or result.get('checkpoint_sha256') != CHECKPOINT):
            raise ValueError('Wrong replay model result')
        forecasts = result['forecasts']
        channels = [(p, h) for h in (6, 12, 24) for p in ('pm2_5', 'pm10')]
        if len(forecasts) != 6 or [(f['pollutant'], f['horizon_hours']) for f in forecasts] != channels:
            raise ValueError('Wrong forecast channel order')
        differences = [abs(f['value'] - value) for f, value in zip(forecasts, expected, strict=True)]
        if not all(math.isfinite(d) and d < tolerance for d in differences):
            raise ValueError('Golden forecast comparison failed')
        committed = db.rpc('finish_allert_v2_job', {
            'p_id': job['id'], 'p_token': job['lease_token'], 'p_output': output})
        if committed.get('ok') is not True:
            raise ValueError('Replay commit was rejected')
        return {'status': 'replay_forecast_verified', 'processed': 1, 'errors': 0,
                'job_id': job['id'], 'stream_id': STREAM, 'mode': 'replay',
                'model_id': MODEL_ID, 'checkpoint_sha256': CHECKPOINT,
                'forecast_count': 6, 'max_abs_difference_ugm3': max(differences),
                'tolerance_ugm3': tolerance, 'input_hash': output['input_hash'],
                'database_commit_verified': True, 'live_forecast_readiness_verified': False}
    except Exception:
        if job:
            try:
                db.rpc('fail_allert_v2_job', {'p_id': job['id'], 'p_token': job['lease_token']})
            except Exception:
                pass
        raise
    finally:
        db.close()
