"""Offline model/adapter verification; never connects to Supabase or delivers push."""
from datetime import datetime,timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/'analytics/seed7_release'
PINNED={'torch':'2.11.0+cpu','numpy':'2.5.2','pandas':'3.0.5','scikit-learn':'1.9.0','scipy':'1.18.1','joblib':'1.6.0','PyYAML':'6.0.3','fastapi':'0.143.0','uvicorn':'0.54.0','pytest':'9.1.1','httpx':'0.28.1'}
manifest=json.loads((RELEASE/'PACKAGE_MANIFEST.json').read_text())
for name,expected in manifest['files'].items():
    path=(RELEASE/name).resolve()
    if not path.is_relative_to(RELEASE.resolve()) or hashlib.sha256(path.read_bytes()).hexdigest()!=expected:
        raise SystemExit(f'Release integrity failure: {name}')
versions={name:importlib.metadata.version(name) for name in PINNED}
for name,expected in PINNED.items():
    if versions[name]!=expected:raise SystemExit(f'Use the pinned environment: {name} requires {expected}; found {versions[name]}')
out=ROOT/'analytics/outputs'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
out.mkdir(parents=True,exist_ok=False)
base={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','ALLERT_DEVICE':'cpu','ALLERT_ALLOW_EXPERIMENTAL_NODES':'false'}
receipt={'python':platform.python_version(),'platform':platform.platform(),'versions':versions,'source_files_verified':len(manifest['files']),'network_or_production_actions':False,'checks':[]}
steps=[('integrity',[sys.executable,'-m','allert_runtime.cli','verify'],RELEASE,'node-1'),
       ('golden',[sys.executable,'-m','allert_runtime.cli','self-test','--device','cpu','--output',str(out/'golden.json')],RELEASE,'node-1'),
       ('source-tests',[sys.executable,'-m','pytest','tests','-q','-p','no:cacheprovider','--basetemp',str(out/'source-temp'),'--junitxml',str(out/'source-tests.xml')],RELEASE,'node-1'),
       ('adapter-tests',[sys.executable,'-m','pytest','analytics/tests_worker.py','analytics/tests_policy.py','analytics/tests_vercel.py','-q','-p','no:cacheprovider','--basetemp',str(out/'adapter-temp'),'--junitxml',str(out/'adapter-tests.xml')],ROOT,'ALLERT-NODE-001')]
for name,command,cwd,node in steps:
    env={**base,'ALLERT_VALIDATED_NODE_ID':node,'PYTHONPATH':str(ROOT/'analytics')}
    result=subprocess.run(command,cwd=cwd,env=env,text=True,capture_output=True)
    (out/(name+'.log')).write_text(result.stdout+result.stderr)
    receipt['checks'].append({'check':name,'exit_code':result.returncode})
    (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(f'{name}: {"PASS" if result.returncode==0 else "FAIL"}',flush=True)
    if result.returncode:raise SystemExit(f'Stopped. See {out}')
print(f'Verification receipts: {out}')
