"""Private reference API. Supabase/user authorization and durable jobs are separate."""
from functools import lru_cache
import hmac
import os
from fastapi import Depends,FastAPI,Header,HTTPException,Request
from fastapi.responses import JSONResponse
from .engine import ModelRuntime,MODEL_ID,observed,risk,verify_package

MAX_BODY=2*1024*1024


def authorize(authorization:str|None=Header(default=None)):
    token=os.getenv('ALLERT_API_TOKEN','')
    if len(token)<32:raise HTTPException(503,'Configure a server-only ALLERT_API_TOKEN of at least 32 characters')
    if not authorization or not hmac.compare_digest(authorization,'Bearer '+token):
        raise HTTPException(401,'Invalid or missing internal service credential',headers={'WWW-Authenticate':'Bearer'})


@lru_cache(maxsize=1)
def model():
    return ModelRuntime(os.getenv('ALLERT_DEVICE','auto'))


app=FastAPI(title='ALLERT thesis single-run reference service',version='1.0',
    description='Private backend computation only. No Supabase writes, user authorization or push delivery.')


@app.middleware('http')
async def body_limit(request:Request,call_next):
    if request.method=='POST':
        length=request.headers.get('content-length')
        if length is None:return JSONResponse({'error':'content_length_required'},status_code=411)
        try:valid=0<=int(length)<=MAX_BODY
        except ValueError:valid=False
        if not valid:return JSONResponse({'error':'request_too_large_or_invalid_length'},status_code=413)
        # Validate actual size too; network-facing deployments need proxy limits.
        if len(await request.body())>MAX_BODY:return JSONResponse({'error':'request_too_large'},status_code=413)
    return await call_next(request)


@app.exception_handler(ValueError)
async def invalid_input(request,error):
    return JSONResponse({'error':'invalid_input','detail':str(error)},status_code=422)


@app.exception_handler(KeyError)
async def missing_input(request,error):
    return JSONResponse({'error':'missing_input_field','detail':str(error)},status_code=422)


@app.get('/health')
def health():return {'status':'process_running','model_id':MODEL_ID,'live_supabase_integration':False}


@app.get('/v1/model',dependencies=[Depends(authorize)])
def model_info():return model().info()


@app.post('/v1/forecast',dependencies=[Depends(authorize)])
def forecast(body:dict):return model().predict(body)


@app.post('/v1/risk',dependencies=[Depends(authorize)])
def current_risk(body:dict):
    verify_package()
    return risk(body)


@app.post('/v1/observed/evaluate',dependencies=[Depends(authorize)])
def evaluate_observed(body:dict):
    verify_package()
    return observed(body['record'],body.get('snapshot'),body.get('mode','live'))
