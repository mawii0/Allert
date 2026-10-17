"""Vercel ASGI entrypoint. Only authenticated, bounded durable-job processing."""
import hmac
import os
import threading
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from seed7_host import worker
from seed7_host.identity import MODEL_ID, CHECKPOINT, OBSERVED_HASH
from seed7_host.policy import INDICATOR_HASH

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
_invocation = threading.Lock()


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
            body += chunk
            if len(body) > 2:
                return JSONResponse({'error': 'Only an empty request is accepted'}, status_code=400)
        if body not in (b'', b'{}'):
            return JSONResponse({'error': 'Only an empty request is accepted'}, status_code=400)
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
