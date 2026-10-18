"""Vercel ASGI entrypoint. Only authenticated, bounded durable-job processing."""
import hmac
import hashlib
import json
import os
import threading
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from seed7_host import worker
from seed7_host import replay_acceptance
from seed7_host.identity import MODEL_ID, CHECKPOINT, OBSERVED_HASH
from seed7_host.policy import INDICATOR_HASH

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
_invocation = threading.Lock()
_MAX_INTERNAL_BODY_BYTES = 64


def _masked_wire_shape(prefix):
    # Preserve syntax only. No original letters, numbers, or non-ASCII bytes.
    punctuation = b'{}[],:"\' <>/\\=;+-_()\r\n\t'
    return ''.join(chr(byte) if byte in punctuation else
                   'a' if 65 <= byte <= 90 or 97 <= byte <= 122 else
                   '#' if 48 <= byte <= 57 else '?' for byte in prefix)


def _empty_request_error(request, prefix, bytes_seen, kind):
    # Diagnostic metadata only: never return body contents, field names or headers.
    length = request.headers.get('content-length', '')
    encoding = request.headers.get('content-encoding', '').lower().strip()
    shape = {'bytes_seen': bytes_seen, 'kind': kind,
             'syntax_mask': _masked_wire_shape(prefix),
             'content_encoding': encoding if encoding in ('', 'identity', 'gzip', 'deflate', 'br') else 'other',
             'gzip_signature': prefix.startswith(b'\x1f\x8b'),
             'prefix_sha256': hashlib.sha256(prefix).hexdigest(),
             'content_length': int(length) if length.isascii() and length.isdigit() and len(length) < 12 else None}
    return JSONResponse({'error': 'Only an empty request is accepted', 'request_shape': shape},
                        status_code=400, headers={'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})


@app.middleware('http')
async def protect_internal(request: Request, call_next):
    if request.url.path.startswith('/internal/'):
        secret = os.environ.get('ALLERT_WORKER_TOKEN', '')
        if len(secret) < 64:
            return JSONResponse({'error': 'Worker authentication is not configured'}, status_code=503)
        authorization = request.headers.get('authorization', '')
        if not hmac.compare_digest(authorization.encode(), ('Bearer ' + secret).encode()):
            return JSONResponse({'error': 'Unauthorized'}, status_code=401)
        # This endpoint reads committed jobs. It never accepts caller-supplied readings,
        # stream IDs, database credentials, model files or processing parameters.
        if request.url.query:
            return JSONResponse({'error': 'Query parameters are not accepted'}, status_code=400)
        body = b''
        async for chunk in request.stream():
            if len(body) + len(chunk) > _MAX_INTERNAL_BODY_BYTES:
                prefix = body + chunk[:_MAX_INTERNAL_BODY_BYTES - len(body)]
                return _empty_request_error(request, prefix, len(body) + len(chunk), 'body_limit')
            body += chunk
        if body.strip():
            try:
                value = json.loads(body.decode('utf-8-sig'))
            except (ValueError, UnicodeError):
                return _empty_request_error(request, body, len(body), 'invalid_json')
            if type(value) is not dict or value:
                kind = {dict: 'nonempty_object', list: 'json_array', str: 'json_string',
                        type(None): 'json_null', bool: 'json_boolean', int: 'json_number', float: 'json_number'}[type(value)]
                return _empty_request_error(request, body, len(body), kind)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


@app.get('/health')
def health():
    return {'status': 'process_running', 'service': 'allert-seed7-vercel',
            'model_id': MODEL_ID, 'database_readiness_verified': False}


@app.get('/internal/readiness')
def readiness():
    if not _invocation.acquire(blocking=False):
        return JSONResponse({'outcome': 'busy'}, status_code=409)
    try:
        worker.runtime()
        return {'status': 'runtime_loaded', 'model_id': MODEL_ID,
                'checkpoint_sha256': CHECKPOINT, 'indicator_policy_hash': INDICATOR_HASH,
                'observed_policy_hash': OBSERVED_HASH, 'device': 'cpu',
                'database_readiness_verified': False}
    except Exception:
        return JSONResponse({'error': 'Model verification failed; inspect deployment checks'}, status_code=503)
    finally:
        _invocation.release()


@app.post('/internal/tick')
def tick():
    if not _invocation.acquire(blocking=False):
        return JSONResponse({'outcome': 'busy'}, status_code=409)
    try:
        result = worker.run_batch(budget_seconds=45, stream='live')
        # Transport success must not hide failed database processing from the scheduler.
        return JSONResponse(result, status_code=503 if result.get('errors', 0) else 200)
    except Exception:
        return JSONResponse({'error': 'Analytics batch failed; jobs remain retryable'}, status_code=503)
    finally:
        _invocation.release()


@app.post('/internal/replay-forecast')
def replay_forecast():
    # Temporary staging acceptance only: no caller-selected stream or readings.
    if not replay_acceptance.enabled():
        return JSONResponse({'error': 'Staging replay acceptance is disabled'}, status_code=404)
    if not _invocation.acquire(blocking=False):
        return JSONResponse({'outcome': 'busy'}, status_code=409)
    try:
        result = replay_acceptance.run_one()
        return JSONResponse(result, status_code=503 if result.get('errors', 0) else 200)
    except Exception:
        return JSONResponse({'error': 'Staging forecast acceptance failed', 'errors': 1}, status_code=503)
    finally:
        _invocation.release()
