"""Compute on the private cloud model, then publish a labeled Supabase snapshot.

This is a one-shot verification adapter, not a continuous telemetry worker.
Secrets are process environment variables and are never printed.
"""
import argparse
try:
    from .replay_history import measured_history
except ImportError:
    from replay_history import measured_history
from datetime import datetime
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

MODEL_ID = 'median-residual-single-v1'
CHECKPOINT = '3cda9c28d98847f9be888ffa356a917c21d40c041b3ea75829919144de43b7f4'

def https_base(name):
    value = os.environ[name].rstrip('/')
    if not value.startswith('https://'):
        raise ValueError(f'{name} must use HTTPS')
    return value

def call(url, headers, body=None):
    headers = dict(headers)
    headers['Content-Type'] = 'application/json'
    request = Request(url, headers=headers,
        data=None if body is None else json.dumps(body).encode(),
        method='GET' if body is None else 'POST')
    with urlopen(request, timeout=120) as response:
        return json.load(response)

def compute(payload):
    base = https_base('ALLERT_MODEL_BASE_URL')
    headers = {'Authorization': 'Bearer ' + os.environ['ALLERT_API_TOKEN']}
    ready = call(base + '/ready', headers)
    if (ready.get('status') != 'model_ready' or ready.get('golden_replay_cases') != 12
        or ready.get('model', {}).get('model_id') != MODEL_ID
        or ready.get('model', {}).get('checkpoint_sha256') != CHECKPOINT
        or not 0 <= ready.get('max_abs_difference_ugm3', float('inf')) < 0.02):
        raise ValueError('Cloud model did not pass identity and replay verification')
    forecast = call(base + '/v1/forecast', headers, payload)
    if (forecast.get('model_id') != MODEL_ID or forecast.get('checkpoint_sha256') != CHECKPOINT
        or forecast.get('node_id') != payload['node_id'] or forecast.get('mode') != payload['mode']):
        raise ValueError('Cloud forecast identity mismatch')
    current = max(payload['history'], key=lambda row: datetime.fromisoformat(row['block_end']))
    risk = call(base + '/v1/risk', headers, current)
    return {'node_id': payload['node_id'], 'mode': payload['mode'],
            'current': current, 'forecast': forecast, 'risk': risk, **measured_history(payload, current)}

def main():
    raise SystemExit("Retired publisher. Use analytics/app.py (Vercel); historical helpers remain for regression evidence only.")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    snapshot = compute(json.loads(args.input.read_text(encoding='utf-8-sig')))
    if not args.publish:
        print(json.dumps(snapshot, indent=2))
        return
    result = call(https_base('ALLERT_EDGE_BASE_URL') + '/environment/publish',
        {'Authorization': 'Bearer ' + os.environ['ALLERT_GATEWAY_KEY'],
         'X-Allert-Worker-Token': os.environ['ALLERT_WORKER_TOKEN']}, snapshot)
    if result.get('status') != 'stored' or result.get('mode') != snapshot['mode']:
        raise ValueError('The backend did not confirm snapshot persistence')
    print(json.dumps({'status': 'cloud_result_published', 'mode': snapshot['mode'], 'model_id': MODEL_ID}))

if __name__ == '__main__':
    main()
