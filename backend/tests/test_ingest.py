"""Real FastAPI requests against a controlled PostgREST transport. No production credentials."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import httpx

from backend.main import create_app, normalize_packet

TOKEN = "ab" * 32
SECRET = "sb_secret_test_server_only_credential"
ENV = {"SUPABASE_URL": "https://example.supabase.co", "SUPABASE_SECRET_KEY": SECRET}


def packet(**changes):
    body = dict(device_id="ALLERT-NODE-001", timestamp=(datetime.now(timezone.utc)-timedelta(minutes=5)).isoformat(),
                pm2_5=7.5, pm10=8, temperature=29.5, humidity=60, sample_count=30, expected_samples=30,
                pm25_stddev=0.3, data_quality_status="VALID")
    body.update(changes)
    return body


@contextmanager
def service(handler=None, *, env=None):
    calls = []
    def upstream(request):
        calls.append(request)
        return handler(request) if handler else httpx.Response(200, json={"ok": True, "duplicate": False})
    with patch.dict(os.environ, {**ENV, **(env or {})}, clear=True), patch("backend.main.load_dotenv"):
        with TestClient(create_app(transport=httpx.MockTransport(upstream))) as client:
            yield client, calls


def send(client, body=None, token=TOKEN, **kwargs):
    return client.post("/api/sensor-data", json=body if body is not None else packet(),
                       headers={"X-Allert-Device-Token": token}, **kwargs)


class HostedIngestion(unittest.TestCase):
    def test_health_and_root_are_public_liveness_and_never_query_database(self):
        with service() as (client, calls):
            for route in ("/", "/health"):
                result = client.get(route)
                self.assertEqual(result.status_code, 200)
                self.assertEqual(result.json()["service"], "hosted-fastapi")
                self.assertEqual(result.headers["Cache-Control"], "no-store")
            self.assertEqual(calls, [])

    def test_missing_malformed_or_privileged_key_as_device_token_never_calls_database(self):
        with service() as (client, calls):
            for token in ("", "a"*63, "g"*64, "a"*65, SECRET, "Bearer "+TOKEN):
                with self.subTest(token_length=len(token)):
                    self.assertEqual(send(client, token=token).status_code, 401)
            self.assertEqual(client.post("/api/sensor-data", json=packet()).status_code, 401)
            self.assertEqual(calls, [])

    def test_authenticated_packet_hashes_token_and_strips_forged_receipt_owner_and_table(self):
        body = packet(created_at="2000-01-01", user_id="another-account", readings_table="private_table")
        with service() as (client, calls):
            result = send(client, body)
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.json()["ok"], True)
            self.assertEqual(result.json()["duplicate"], False)
            self.assertEqual(len(calls), 1)
            request = calls[0]
            self.assertEqual(str(request.url), "https://example.supabase.co/rest/v1/rpc/ingest_allert_reading")
            self.assertEqual(request.headers["apikey"], SECRET)
            self.assertNotIn("Authorization", request.headers)  # sb_secret is not a JWT.
            self.assertNotIn("X-Allert-Device-Token", request.headers)
            args = json.loads(request.content)
            self.assertEqual(args["p_token_hash"], hashlib.sha256(TOKEN.encode()).hexdigest())
            self.assertEqual(args["p_device_id"], body["device_id"])
            self.assertEqual(set(args["p_reading"]), {"timestamp", "pm2_5", "pm10", "temperature", "humidity", "sample_count", "expected_samples", "pm25_stddev", "data_quality_status"})
            self.assertNotIn(TOKEN, request.content.decode())

    def test_legacy_service_key_uses_both_apikey_and_bearer_headers(self):
        key = "eyJ.fake.service_role_jwt"
        with service(env={"SUPABASE_SECRET_KEY": key}) as (client, calls):
            self.assertEqual(send(client).status_code, 200)
            self.assertEqual(calls[0].headers["Authorization"], "Bearer "+key)
            self.assertEqual(calls[0].headers["apikey"], key)

    def test_retry_returns_canonical_duplicate_without_a_second_insertion(self):
        stored = {}
        def database(request):
            args = json.loads(request.content)
            key = args["p_device_id"], args["p_reading"]["timestamp"]
            if key in stored:
                if stored[key] != args["p_reading"]:
                    return httpx.Response(200, json={"ok": False, "status": 409})
                return httpx.Response(200, json={"ok": True, "duplicate": True})
            stored[key] = args["p_reading"]
            return httpx.Response(200, json={"ok": True, "duplicate": False})
        with service(database) as (client, calls):
            body = packet()
            self.assertEqual(send(client, body).json()["duplicate"], False)
            self.assertEqual(send(client, body).json()["duplicate"], True)
            self.assertEqual(send(client, {**body, "pm2_5": 99}).status_code, 409)
            self.assertEqual(len(stored), 1)
            self.assertEqual(len(calls), 3)

    def test_expired_disabled_wrong_device_and_conflict_results_are_not_acknowledged(self):
        for status in (400, 401, 403, 409, 429, 503):
            with self.subTest(status=status), service(lambda request: httpx.Response(200, json={
                "ok": False, "status": status, "error": "private database details"})) as (client, calls):
                response = send(client)
                self.assertEqual(response.status_code, status)
                self.assertNotIn("ok", response.json())
                self.assertNotIn("private database details", response.text)

    def test_second_device_routes_through_rpc_without_hardcoded_identity(self):
        with service() as (client, calls):
            self.assertEqual(send(client, packet(device_id="ALLERT-NODE-002")).status_code, 200)
            self.assertEqual(json.loads(calls[0].content)["p_device_id"], "ALLERT-NODE-002")

    def test_invalid_values_incomplete_valid_blocks_and_missing_fields_do_not_reach_database(self):
        changes = [dict(pm2_5=-1), dict(pm10=1001), dict(temperature=126), dict(humidity=True),
                   dict(pm25_stddev=float("inf")), dict(sample_count=0), dict(sample_count=31),
                   dict(sample_count=30.0), dict(sample_count=True), dict(expected_samples=True),
                   dict(expected_samples=29), dict(data_quality_status="UNKNOWN"),
                   dict(sample_count=29), dict(device_id="ALLERT-NODE-1"),
                   dict(timestamp="2026-01-01T00:00:00"), dict(timestamp="nonsense"), dict(timestamp="2026-10-16+08:00"),
                   dict(timestamp=(datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat()),
                   dict(timestamp=(datetime.now(timezone.utc)-timedelta(days=8)).isoformat())]
        with service() as (client, calls):
            for change in changes:
                with self.subTest(change=change):
                    # Send raw JSON for nonfinite inputs; HTTPX intentionally refuses to serialize them.
                    response = client.post("/api/sensor-data", content=json.dumps(packet(**change)),
                        headers={"X-Allert-Device-Token": TOKEN, "Content-Type": "application/json"})
                    self.assertEqual(response.status_code, 400)
            body = packet(); del body["humidity"]
            self.assertEqual(send(client, body).status_code, 400)
            self.assertEqual(calls, [])

    def test_flagged_partial_block_is_retained_as_flagged(self):
        with service() as (client, calls):
            self.assertEqual(send(client, packet(sample_count=19, data_quality_status="GAP_FLAGGED")).status_code, 200)
            reading = json.loads(calls[0].content)["p_reading"]
            self.assertEqual(reading["data_quality_status"], "GAP_FLAGGED")
            self.assertEqual(reading["sample_count"], 19)

    def test_timezone_is_normalized_without_inventing_receipt_time(self):
        stamp = (datetime.now(timezone.utc)-timedelta(minutes=5)).replace(microsecond=0)
        manila = stamp.astimezone(timezone(timedelta(hours=8))).isoformat()
        device, reading = normalize_packet(packet(timestamp=manila))
        self.assertEqual(reading["timestamp"], stamp.isoformat(timespec="milliseconds").replace("+00:00", "Z"))
        self.assertNotIn("created_at", reading)

    def test_oversized_malformed_nonobject_and_wrong_content_type_are_rejected(self):
        headers = {"X-Allert-Device-Token": TOKEN, "Content-Type": "application/json"}
        with service() as (client, calls):
            for body in ("{", "[]", "null", "true", '"text"', "["*1100+"]"*1100):
                with self.subTest(body=body[:20]):
                    self.assertEqual(client.post("/api/sensor-data", content=body, headers=headers).status_code, 400)
            self.assertEqual(client.post("/api/sensor-data", content="x"*4097, headers=headers).status_code, 413)
            self.assertEqual(client.post("/api/sensor-data", content="{}", headers={**headers, "Content-Type": "text/plain"}).status_code, 415)
            self.assertEqual(calls, [])

    def test_actual_chunked_body_limit_is_enforced_without_content_length(self):
        def chunks():
            yield b" "*3000
            yield b" "*2000
        with service() as (client, calls):
            response = client.post("/api/sensor-data", content=chunks(), headers={
                "X-Allert-Device-Token": TOKEN, "Content-Type": "application/json"})
            self.assertEqual(response.status_code, 413)
            self.assertEqual(calls, [])

    def test_database_timeout_or_network_error_retains_packet_without_retrying_upstream(self):
        for kind in (httpx.ReadTimeout, httpx.ConnectError):
            def fail(request):
                raise kind("private secret-bearing transport text", request=request)
            with self.subTest(kind=kind), service(fail) as (client, calls):
                response = send(client)
                self.assertEqual(response.status_code, 503)
                self.assertNotIn("private", response.text)
                self.assertEqual(len(calls), 1)

    def test_redirects_upstream_errors_plaintext_and_malformed_acknowledgments_fail_closed(self):
        replies = [httpx.Response(302, headers={"Location": "https://elsewhere.invalid"}),
                   httpx.Response(401, json={"message": SECRET}), httpx.Response(500, text=SECRET),
                   httpx.Response(200, text="not JSON"), httpx.Response(200, json=[]),
                   httpx.Response(200, json={"ok": 1, "duplicate": False}),
                   httpx.Response(200, json={"ok": True}),
                   httpx.Response(200, json={"ok": True, "duplicate": "true"}),
                   httpx.Response(200, json={"ok": False, "status": True})]
        for reply in replies:
            with self.subTest(reply=reply), service(lambda request: reply) as (client, calls):
                response = send(client)
                self.assertEqual(response.status_code, 503)
                self.assertNotIn(SECRET, response.text)
                self.assertEqual(len(calls), 1)

    def test_health_alone_does_not_claim_database_readiness(self):
        with service(lambda request: httpx.Response(503)) as (client, calls):
            self.assertEqual(client.get("/health").status_code, 200)
            self.assertEqual(send(client).status_code, 503)

    def test_config_missing_secret_or_insecure_database_origin_fails_startup(self):
        cases = [dict(SUPABASE_URL="http://example.supabase.co"), dict(SUPABASE_URL="https://u:p@example.supabase.co"),
                 dict(SUPABASE_URL="https://example.supabase.co/path"), dict(SUPABASE_SECRET_KEY=""),
                 dict(SUPABASE_SECRET_KEY="REPLACE_WITH_SECRET"), dict(SUPABASE_SECRET_KEY="sb_publishable_test")]
        for change in cases:
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                with service(env=change):
                    pass


if __name__ == "__main__":
    unittest.main()
