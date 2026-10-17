"""Deployment identity. No alternate model or experimental-node fallback."""
import hashlib
import json
import os
import sys
from pathlib import Path

RELEASE = Path(__file__).resolve().parents[1] / 'seed7_release'
MODEL_ID = 'median-residual-seed7-epoch15-20261013-v1'
CHECKPOINT = '4253e73515d8d2a3d4a4463065f8bfb2192c9454e161da560fd928a4051672c4'
CALIBRATION = [.025, .025, .025, .025, .225, .15000000000000002]
SOURCE_INDICATOR_HASH = '8840056cf287749544df0b1a3ed373370863258ab1d29bbb6b430f8740f5ad99'
OBSERVED_HASH = '76486e7733f32d8e4d1ac61a03b35ef3108280f0140533d3a43312a863199b77'


def verify_bytes():
    manifest = json.loads((RELEASE / 'PACKAGE_MANIFEST.json').read_text())
    for name, expected in manifest['files'].items():
        path = (RELEASE / name).resolve()
        if not path.is_relative_to(RELEASE.resolve()) or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f'Release integrity failure: {name}')
    if hashlib.sha256((RELEASE/'bundle/model/best_model.pt').read_bytes()).hexdigest() != CHECKPOINT:
        raise ValueError('Wrong checkpoint')
    return manifest


def load_runtime():
    # Verify trusted source bytes before importing/deserializing joblib or torch data.
    verify_bytes()
    if os.getenv('ALLERT_ALLOW_EXPERIMENTAL_NODES', 'false').lower() != 'false':
        raise ValueError('Experimental node transfer is not approved')
    if os.getenv('ALLERT_DEVICE', 'cpu') != 'cpu':
        raise ValueError('This deployment is CPU-verified only')
    if os.getenv('ALLERT_VALIDATED_NODE_ID', 'ALLERT-NODE-001') != 'ALLERT-NODE-001':
        raise ValueError('Only the registered source node is approved for neural forecasts')
    os.environ['ALLERT_VALIDATED_NODE_ID'] = 'ALLERT-NODE-001'
    sys.path.insert(0, str(RELEASE))
    from allert_runtime.engine import ModelRuntime
    runtime = ModelRuntime('cpu')
    info = runtime.info()
    if (info['model_id'] != MODEL_ID or info['checkpoint_sha256'] != CHECKPOINT or
            (info['seed'], info['best_epoch'], info['recorded_epochs']) != (7, 15, 35) or
            info['calibration'] != CALIBRATION or info['spike_head']):
        raise ValueError('Selected-model identity mismatch')
    return runtime
