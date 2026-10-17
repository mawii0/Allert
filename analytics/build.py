"""Vercel build gate: verify frozen release, runtime pins and policy mirror."""
import hashlib
import importlib.metadata
import os
import subprocess
import sys
from pathlib import Path
from seed7_host.identity import verify_bytes, load_runtime
from seed7_host.policy import INDICATOR_HASH

root = Path(__file__).resolve().parent
canonical = root.parent / 'supabase/functions/server/indicator-policy.json'
mirror = root / 'indicator-policy.json'
if hashlib.sha256(mirror.read_bytes()).hexdigest() != INDICATOR_HASH:
    raise SystemExit('Deployment policy mirror is invalid')
if canonical.exists() and canonical.read_bytes() != mirror.read_bytes():
    raise SystemExit('Regenerate analytics/indicator-policy.json from the canonical server policy')
pins = {'torch': '2.11.0+cpu', 'numpy': '2.5.2', 'pandas': '3.0.5',
        'scikit-learn': '1.9.0', 'scipy': '1.18.1', 'joblib': '1.6.0',
        'PyYAML': '6.0.3', 'fastapi': '0.143.0', 'uvicorn': '0.54.0', 'httpx': '0.28.1'}
for name, version in pins.items():
    if importlib.metadata.version(name) != version:
        raise SystemExit(f'Frozen runtime version required: {name}=={version}')
manifest = verify_bytes()
load_runtime()
subprocess.run([sys.executable,'-m','allert_runtime.cli','self-test','--device','cpu'],
               cwd=root/'seed7_release',check=True,
               env={**os.environ,'ALLERT_VALIDATED_NODE_ID':'node-1',
                    'ALLERT_ALLOW_EXPERIMENTAL_NODES':'false','PYTHONDONTWRITEBYTECODE':'1'})
print(f'PASS: {len(manifest["files"])} source hashes, CPU runtime, checkpoint and indicator policy')
