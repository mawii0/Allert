"""Private cloud entrypoint for the unchanged partner inference API."""
from contextlib import asynccontextmanager
import os
from pathlib import Path
import sys

RUNTIME = Path(os.environ.get('ALLERT_RUNTIME_PATH',
    str(Path(__file__).resolve().parents[2] / 'model/runtime/allert_model_partner_v1')))
sys.path.insert(0, str(RUNTIME))
from fastapi import Depends
from allert_runtime.api import app, authorize, model
from allert_runtime.cli import self_test

@asynccontextmanager
async def lifespan(application):
    if len(os.getenv('ALLERT_API_TOKEN', '')) < 32:
        raise RuntimeError('A private ALLERT_API_TOKEN of at least 32 characters is required')
    result = self_test(os.getenv('ALLERT_DEVICE', 'cpu'))
    application.state.replay_result = result
    model()  # Cache the verified inference model before accepting requests.
    yield

app.router.lifespan_context = lifespan

@app.get('/ready', dependencies=[Depends(authorize)])
def ready():
    return {'status': 'model_ready', 'model': model().info(),
            'golden_replay_cases': app.state.replay_result['cases'],
            'max_abs_difference_ugm3': app.state.replay_result['max_abs_difference_ugm3'],
            'supabase_worker_implemented': False}
