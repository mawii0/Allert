# Set up the partner runtime

## Requirements and platform boundary

Use Python 3.12 (current partner release tests used 3.12.14; earlier research
environment records name 3.12.10). Start in the extracted package
folder containing `allert_runtime`, `bundle`, `requirements.txt` and examples.
The model can use CPU or CUDA; the CPU path and CUDA path are checked against
saved forecasts in the release evidence. Different machines/wheels must run the
self-test before acceptance. A timings receipt is not a latency guarantee.

The original research notebook still has its recorded CUDA requirements. This
new adapter's verified CPU path does not rewrite its research methodology.

## Windows / PowerShell

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

Choose ONE PyTorch build:

```powershell
# CPU-only installation; appropriate for initial integration if self-test passes.
python -m pip install torch==2.11.0 --index-url https://download.pytorch.org/whl/cpu

# OR the original CUDA 12.8 build on a compatible NVIDIA machine/driver.
python -m pip install torch==2.11.0+cu128 --index-url https://download.pytorch.org/whl/cu128
```

Then install the other dependencies from PyPI:

```powershell
python -m pip install -r requirements.txt
python -m allert_runtime.cli verify
python -m allert_runtime.cli self-test --device cpu
# On a CUDA host, also check this path:
python -m allert_runtime.cli self-test --device cuda
python -m allert_runtime.cli forecast --input examples/forecast_case_01.json --device cpu
```

Run tests with optional test dependencies:

```powershell
python -m pip install -r requirements-test.txt
python -m pytest tests -q -p no:cacheprovider --basetemp=outputs/pytest
```

If `Activate.ps1` is restricted, call `.venv\Scripts\python.exe` directly instead
of changing machine-wide security settings. If a requested wheel is unavailable,
stop and send the exact error to the model partner; do not silently change a
scaler/library version and claim identical reproduction.

## Linux/macOS shell equivalent

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install torch==2.11.0 --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r requirements.txt
python -m allert_runtime.cli verify
python -m allert_runtime.cli self-test --device cpu
```

These platforms are setup instructions, not claims of release testing on every
OS. Consult the official [PyTorch installation selector](https://pytorch.org/get-started/locally/)
for platform/build support, and retain the verified version or explicitly test
and document a new dependency combination.

## Start the private reference API

PowerShell:

```powershell
$env:ALLERT_API_TOKEN = python -c "import secrets; print(secrets.token_urlsafe(32))"
$env:ALLERT_DEVICE = "cpu"
python -m uvicorn allert_runtime.api:app --host 127.0.0.1 --port 8000 --workers 1
```

Linux shell:

```bash
export ALLERT_API_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
export ALLERT_DEVICE=cpu
python -m uvicorn allert_runtime.api:app --host 127.0.0.1 --port 8000 --workers 1
```

Use a separate terminal for requests; it needs the same test token through a
secure local mechanism. `.env.example` is a template only; the supplied code does
not automatically load `.env`. Set environment variables explicitly. Never put
the token or Supabase service-role key in React/Vite files or send it in chat.

`http://127.0.0.1:8000/docs` shows the API contract. Calls to protected routes
must include `Authorization: Bearer <internal-token>`. The private API is NOT
Supabase Auth, device authentication or a public Internet service.

For real integration, the recommended GPU/CPU worker polls durable Supabase jobs
and uses these Python classes directly. It needs no inbound laptop port. A hosted
Supabase Edge Function cannot reach your laptop by calling its own `localhost`.
If the group chooses a remotely called service instead, provide a reachable
HTTPS backend, proper proxy body/time limits and authenticated server-to-server
access. Do not publicly expose this demo listener as a finished emergency service.
