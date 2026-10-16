"""ALLERT's hosted FastAPI ingestion service.

Run from backend/: uvicorn main:app --host 0.0.0.0 --port 8000
The physical node uses a per-device token; Supabase privileged credentials stay here.
"""
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import asyncio
import hashlib
import json
import os
import re
from urllib.parse import urlsplit

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import httpx

MAX_PACKET_BYTES = 4096
TOKEN_PATTERN = re.compile(r"[a-fA-F0-9]{64}\Z")
DEVICE_PATTERN = re.compile(r"ALLERT-NODE-[0-9]{3}\Z")
RETRY_ERROR = "Unable to store packet. Retry later."
ERRORS = {
    400: "Invalid sensor packet",
    401: "Invalid device credential",
    403: "Device disabled",
    409: "Conflicting packet for this timestamp",
    429: "Too many requests. Retry later.",
    503: RETRY_ERROR,
}


def json_response(body, status=200):
    return JSONResponse(body, status_code=status, headers={"Cache-Control": "no-store"})


def normalize_packet(body, now=None):
    """Keep the same packet contract as sensor-ingest; never accept caller receipt times."""
    if not isinstance(body, dict):
        return None
    device_id = body.get("device_id")
    stamp = body.get("timestamp")
    if not isinstance(device_id, str) or not DEVICE_PATTERN.fullmatch(device_id):
        return None
    if not isinstance(stamp, str) or not re.search(r"(?:Z|[+-][0-9]{2}:[0-9]{2})\Z", stamp):
        return None
    try:
        observed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        if observed.tzinfo is None or observed.utcoffset() is None:
            return None
        observed = observed.astimezone(timezone.utc)
    except (ValueError, OverflowError):
        return None
    now = now or datetime.now(timezone.utc)
    if observed > now + timedelta(minutes=1) or observed < now - timedelta(days=7):
        return None
    numeric_ranges = {"pm2_5": (0, 1000), "pm10": (0, 1000),
                      "temperature": (-40, 125), "humidity": (0, 100),
                      "pm25_stddev": (0, 1000)}
    for field, (low, high) in numeric_ranges.items():
        value = body.get(field)
        if type(value) not in (float, int) or not low <= value <= high:
            return None
    count = body.get("sample_count")
    if type(count) is not int or not 1 <= count <= 30:
        return None
    if type(body.get("expected_samples")) is not int or body["expected_samples"] != 30:
        return None
    quality = body.get("data_quality_status")
    if quality not in ("VALID", "GAP_FLAGGED") or (quality == "VALID" and count != 30):
        return None
    reading = {field: body[field] for field in numeric_ranges}
    reading.update(timestamp=observed.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                   sample_count=count, expected_samples=30, data_quality_status=quality)
    return device_id, reading


def load_settings():
    # Explicit backend-local .env for local tests only. The host supplies environment values.
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"), override=False)
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_SECRET_KEY", "").strip()
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or parsed.path):
        raise RuntimeError("Configure SUPABASE_URL as the project's HTTPS origin.")
    if not key or key.startswith(("sb_publishable_", "REPLACE")) or any(c.isspace() for c in key):
        raise RuntimeError("Configure the private server SUPABASE_SECRET_KEY.")
    return url, key


def create_app(*, transport=None):
    @asynccontextmanager
    async def lifespan(app):
        url, key = load_settings()
        # A bounded call, no redirects or automatic POST retries. A retry is acknowledged by the DB RPC.
        headers = {"apikey": key}
        if not key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {key}"
        async with httpx.AsyncClient(
            base_url=url, headers=headers,
            timeout=httpx.Timeout(4.0, connect=2.0),
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
            follow_redirects=False, transport=transport, trust_env=False,
        ) as client:
            app.state.database = client
            yield

    application = FastAPI(title="ALLERT Sensor API", version="2.0.0", lifespan=lifespan,
                          docs_url=None, redoc_url=None, openapi_url=None)

    @application.get("/")
    @application.get("/health")
    async def health():
        # Liveness only: device authentication and database writes are checked by real ingestion.
        return json_response({"system": "ALLERT", "status": "running", "service": "hosted-fastapi"})

    @application.post("/api/sensor-data")
    async def receive_sensor_data(request: Request):
        token = request.headers.get("X-Allert-Device-Token", "")
        if not TOKEN_PATTERN.fullmatch(token):
            return json_response({"error": ERRORS[401]}, 401)
        length = request.headers.get("Content-Length")
        if length is not None:
            try:
                if int(length) < 0:
                    return json_response({"error": "Invalid packet length"}, 400)
                if int(length) > MAX_PACKET_BYTES:
                    return json_response({"error": "Packet too large"}, 413)
            except ValueError:
                return json_response({"error": "Invalid packet length"}, 400)
        if request.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json":
            return json_response({"error": "Use application/json"}, 415)
        content = bytearray()
        try:
            async with asyncio.timeout(5):
                async for chunk in request.stream():
                    if len(content) + len(chunk) > MAX_PACKET_BYTES:
                        return json_response({"error": "Packet too large"}, 413)
                    content.extend(chunk)
            body = json.loads(content)
        except (ValueError, UnicodeError, RecursionError, TimeoutError):
            return json_response({"error": "Invalid JSON"}, 400)
        packet = normalize_packet(body)
        if packet is None:
            return json_response({"error": ERRORS[400]}, 400)
        device_id, reading = packet
        hashed_token = hashlib.sha256(token.encode("ascii")).hexdigest()
        try:
            async with asyncio.timeout(5):
                response = await request.app.state.database.post("/rest/v1/rpc/ingest_allert_reading", json={
                    "p_device_id": device_id, "p_token_hash": hashed_token, "p_reading": reading,
                })
            if response.status_code != 200:
                return json_response({"error": RETRY_ERROR}, 503)
            result = response.json()
        except (httpx.HTTPError, ValueError, TimeoutError):
            return json_response({"error": RETRY_ERROR}, 503)
        if not isinstance(result, dict):
            return json_response({"error": RETRY_ERROR}, 503)
        if result.get("ok") is not True:
            status = result.get("status")
            if type(status) is not int or status not in ERRORS:
                status = 503
            return json_response({"error": ERRORS[status]}, status)
        if type(result.get("duplicate")) is not bool:
            return json_response({"error": RETRY_ERROR}, 503)
        duplicate = result["duplicate"]
        return json_response({
            "ok": True, "status": "success", "duplicate": duplicate,
            "message": "Sensor data already stored" if duplicate else "Sensor data stored",
            "timestamp": reading["timestamp"],
        })

    return application


app = create_app()
