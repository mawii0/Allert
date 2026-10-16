# Hosted ALLERT FastAPI

This is the repository copy of the supplied local `main.py`, prepared for a public hosted service. It retains FastAPI, `/`, and `/api/sensor-data`. The original separate Windows backend folder is not overwritten by the patch.

The production flow is **ESP8266 → HTTPS FastAPI → Supabase PostgreSQL → existing ALLERT app**. The frontend and model server are separate services. No model weights are deployed here.

## What changed

- Require the private per-device `X-Allert-Device-Token` on every ingestion POST. Browser login tokens and node-claim setup codes cannot authenticate device uploads.
- Require the packet's `device_id`; remove the old hard-coded device identity.
- Validate the actual body size, timestamps, ranges, sample counts and quality before making one bounded database call.
- Hash the device token and call the existing privileged `ingest_allert_reading` RPC. This reuses the current device/table mapping, disabled-device check, exact-retry detection, conflict protection and genuine `created_at` receipt timestamps. Owner/family access remains enforced by the existing app backend.
- Return `ok: true` only after confirmed storage or a matching duplicate. Database errors/timeouts/malformed replies return 503, so the physical node retains its packet. Conflict 409 is retained by firmware in `/rejected` for review. There is no background in-memory server queue.
- Keep privileged Supabase credentials only in the host's environment. Real credentials never belong in Git or firmware. Errors exclude database details, request bodies, and credentials.
- `/health` and `/` are public process-liveness checks. A successful health response does not prove the database key, RPC or physical upload works.

The uploaded file's unreachable print/return block is removed. HTTPX makes the same Supabase database request over the REST RPC endpoint, so a separate Supabase Python SDK dependency is unnecessary. This does not remove FastAPI from the architecture.

## Files and dependencies

Run commands from the **Allert repository root** unless noted:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
```

Tested using Python 3.12. The code requires Python 3.11 or newer. Render uses `backend/.python-version` to select the latest Python 3.12 patch. All requirements are pinned to the versions used for validation.

For optional local operation, copy `backend/.env.example` to `backend/.env`, set the two values privately, then run:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

The `.env` file is ignored by Git. The service also accepts environment values without this file; hosted deployment uses its Environment settings instead. Existing local **mode 0** firmware sends no device token and will receive 401 from this authenticated backend. Deploy the hosted service first, then switch and reflash the node once using **mode 2**.

## Render website deployment

Use a **Web Service**, not a Static Site. This is separate from the existing frontend deployment on Vercel.

1. Commit/push the reviewed patch to `feature/standalone-node` in the existing Allert repository. The local separate `D:\...\backend` directory is not what Render builds; it builds the new `backend/` folder inside the Git repository.
2. Open https://dashboard.render.com/ → New → Web Service. Connect the GitHub repository `mawii0/Allert`. Repository-owner authorization may be required for a team repository.
3. Choose the branch containing this patch (`feature/standalone-node` initially; switch to main after merge).
4. Enter these settings:

| Setting | Value |
|---|---|
| Name | An available name, for example `allert-sensor-api` |
| Language/runtime | Python 3 |
| Root directory | `backend` |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn main:app --host 0.0.0.0 --port $PORT --no-access-log` |
| Health-check path | `/health` |
| Compute | Free for testing; choose a paid instance for continuous monitoring |

5. Under Environment, add `SUPABASE_URL` = your project's HTTPS origin and `SUPABASE_SECRET_KEY` = a server-only Supabase secret (`sb_secret_...`) or legacy service_role key. Do not use a publishable/anon key. Never paste the private value into chat. New opaque secret keys are sent in `apikey`; legacy JWT service-role keys use both `apikey` and `Authorization`.
6. Create/deploy the service through the website. Check startup logs. Open its actual HTTPS `/health` URL. Expected:

```json
{"system":"ALLERT","status":"running","service":"hosted-fastapi"}
```

7. An unauthenticated POST must return 401. In PowerShell, using your actual hostname:

```powershell
try {
  Invoke-WebRequest -Method Post -Uri 'https://YOUR-SERVICE.onrender.com/api/sensor-data' -ContentType 'application/json' -Body '{}'
} catch {
  $_.Exception.Response.StatusCode
}
```

8. Keep the service URL without a trailing slash after `sensor-data`; the firmware does not follow redirects with device credentials. Do not add private tokens to the URL.

No new Supabase migration or Edge Function deployment is required. The already-installed cloud-ingestion migration and a configured ingestion credential for the device must exist. The existing `sensor-ingest` Edge Function can remain deployed.

### Free vs continuous operation

Render Free sleeps after **15 minutes without inbound traffic**, and waking typically takes **about a minute**. The firmware's shorter request timeout can cause initial uploads to remain queued during wake-up; later retries may succeed. A five-minute active node generally supplies regular traffic, but that does not eliminate restarts, quota limits or sleep after the node is off. Free hours are shared per workspace and limited to **750/month**. Render explicitly describes Free as non-production.

Use a paid compute instance for continuous monitoring; check https://render.com/pricing before selecting it. No paid resource is created by this patch or this guide. Supabase remains the durable database; do not create another Render database or store readings on the service filesystem. No external keep-alive/pinging service is required or configured.

Sources checked 2026-10-16: https://render.com/docs/deploy-fastapi , https://render.com/docs/free , https://render.com/docs/python-version , https://render.com/docs/monorepo-support , https://supabase.com/docs/guides/getting-started/api-keys .

## Private node credential

Reuse your existing `ALLERT_UPLOAD_TOKEN` if it already matches the active hash in `node_ingestion_credentials`. The setup/linking code is a different credential.

If no upload credential has been issued or it is lost, run `docs/sql/issue-node-upload-token.sql` privately in Supabase SQL Editor once. It returns a new per-device upload token for the device named in the SQL. Copy it into private `node_secrets.h`. Running it again rotates the credential and invalidates the previously flashed token. Do not rerun it as a health check. Never share its result or add it to Git.

If a SQL readiness check is needed, use the non-secret status query in `docs/sql/check-hosted-fastapi.sql`. It reports configuration state without printing tokens, hashes or user IDs.

## Configure verified HTTPS firmware

After the hosted health check succeeds, edit only the following values in your existing ignored `firmware/Allert_node_code/node_secrets.h`:

```cpp
#define ALLERT_UPLOAD_MODE 2
#define ALLERT_HOSTED_API_URL "https://YOUR-SERVICE.onrender.com/api/sensor-data"
```

Keep your existing `ALLERT_DEVICE_ID`, private hotspot password and matching private `ALLERT_UPLOAD_TOKEN`. Do not copy the example file over a configured secrets file. Modes remain: 0 = old local HTTP FastAPI, 1 = direct HTTPS Supabase, 2 = hosted HTTPS FastAPI.

Generate the trusted certificate header for **the hosted FastAPI hostname**, not the old Supabase hostname. From the Allert repository root:

```powershell
py firmware/Allert_node_code/prepare_tls.py --url 'https://YOUR-SERVICE.onrender.com/api/sensor-data'
```

This verifies the server's certificate using the PC trust store, exports its verified root CA and saves ignored `tls_roots.h` beside the sketch. It uses no secret. Certificate failures must be fixed, not bypassed. Re-run and reflash when the host's CA changes or when changing to a different upload host. The same root cannot be assumed for Supabase and Render.

Open `firmware/Allert_node_code/Allert_node_code.ino` in Arduino IDE with the same ESP8266 board/flash layout used successfully before. **Verify/compile first**, then flash over USB once. Preserve flash/filesystem settings and saved queue data; do not format LittleFS or choose Erase All Flash merely to change upload mode. Choose the IDE's sketch-only update/erase setting where supported. A partial in-progress five-minute block is discarded on reboot; completed queue files should survive a normal sketch update, subject to actual board/flash settings.

Check startup output for `[Upload] Mode: hosted FastAPI HTTPS`, a Wi-Fi connection, and clock synchronization. HTTP 401 means check the node's token/device mapping; HTTP 503 means check the host environment/RPC; HTTP -1 can indicate network/TLS/clock failures. A cold free service may require later retries. Rejected 400/409/413 packets remain in `/rejected`, not successful uploads.

## Wi-Fi setup without a PC for the household user

Users do **not** need Arduino IDE for normal power-on or Wi-Fi entry. The developer prepares the firmware/private credentials once. The node reconnects to saved Wi-Fi automatically.

For reopening setup on demand, the firmware already supports an optional **normally-open pushbutton between D5/GPIO14 and GND**. Current sensor I2C uses D2/GPIO4 and D1/GPIO5. Verify D5 is otherwise unused in the actual enclosure/wiring. Wire with the node powered off, then set this once in private `node_secrets.h` before flashing:

```cpp
#define ALLERT_SETUP_BUTTON_PIN 14
```

After startup, hold the separate setup button for **three seconds**. Join `ALLERT-Setup-...` on a phone using the node's private hotspot password, open `http://192.168.4.1`, and choose Configure WiFi. In hosted mode there is no FastAPI URL field for users to enter; the endpoint is prepared in firmware. Wi-Fi setup pauses sampling, discards the unfinished block and retains completed queued blocks. The portal closes after its configured timeout, then reconnection is attempted.

RST remains a restart button. A normal reset reconnects to working saved Wi-Fi; it does not force the setup portal. Without the optional button, initial connection failure can open the portal, and Serial command `s` remains a developer fallback. Keep the private hotspot password with the intended household (for example on the device's setup label), not in a public repository.

## Acceptance: prove PC-independent operation

1. Keep the hosted service running. Confirm its health and device-credential readiness. Flash and first verify the node's authenticated completed-block acknowledgments while connected over USB.
2. Close local FastAPI/Uvicorn and Arduino IDE. Power the node from the known wall adapter. The PC must be off or disconnected during the evidence period.
3. Allow initial Wi-Fi/NTP and a true UTC five-minute boundary. From power-on, the first complete five-minute block can take **about 5–10 minutes**, plus upload/network/cold-start delays. Observe at least two new five-minute readings (often **10–15 minutes total**, longer if recovering).
4. Check the app or `docs/sql/check-hosted-fastapi.sql` from a phone/another device. Recent observation and genuine `created_at` receipt times must advance while the PC is off. Old queued packets are history, not fresh model input.
5. Confirm family members still see the same environmental readings. The uploaded data does not belong to an impersonated account; household access is derived by the existing ownership backend.
6. Verify the setup button/phone flow on a planned Wi-Fi change, if fitted. No account unlinking or storage formatting is needed.
7. During a planned short outage, let completed blocks queue, power-cycle the node, restore Wi-Fi, then verify the queue drains without duplicate rows or fabricated full samples. Never interrupt a write deliberately by repeatedly switching power. Physical power-loss validation remains pending until observed on this device.

## Validation boundaries

Local checks: **20 Python tests passed**, **549 existing app/database tests passed**, production frontend build passed, real Uvicorn process health/401 smoke checks passed, and C++ timing/credential/HTTPS helper checks passed. Python dependencies passed `pip check`.

Full ESP8266 compilation could not run in the preparation environment because Arduino CLI's board-package downloads could not reach the network. Arduino IDE Verify on the user's installed ESP8266 toolchain is required before flashing. No physical node or hosted Render service was accessed during patch preparation.

Python HTTP tests use the actual FastAPI app with a controlled PostgREST transport; they do not contact the production database. Existing Node/PGlite tests validate the real ingestion RPC's authentication, table routing, exact duplicate handling, conflicts and receipt times. Firmware helper tests run a host C++ compiler; they do not prove ESP8266 compilation, TLS heap availability or physical power-loss behavior. Record the separate Arduino compilation result and real wall-adapter upload test before claiming full deployment success.
