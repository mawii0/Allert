"""Publish one verified model result to the staging cache; no training or jobs."""
import argparse
try:
    from .replay_history import measured_history
except ImportError:
    from replay_history import measured_history
from datetime import datetime
import json
import os
from pathlib import Path
import sys
from urllib.request import Request, urlopen

RUNTIME = Path(__file__).resolve().parents[2] / "model/runtime/allert_model_partner_v1"
sys.path.insert(0, str(RUNTIME))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--publish", action="store_true", help="Otherwise write JSON to stdout only")
    args = parser.parse_args()
    from allert_runtime.engine import ModelRuntime, risk, verify_package
    verify_package()
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    forecast = ModelRuntime("cpu").predict(payload)
    current = max(payload["history"], key=lambda row: datetime.fromisoformat(row["block_end"]))
    result = {"node_id": payload["node_id"], "mode": payload["mode"],
              "current": current, "risk": risk(current), "forecast": forecast, **measured_history(payload, current)}
    if not args.publish:
        print(json.dumps(result, indent=2))
        return
    base = os.environ["ALLERT_EDGE_BASE_URL"].rstrip("/")
    if not base.startswith("https://"):
        raise ValueError("Publishing requires HTTPS")
    request = Request(base + "/environment/publish", data=json.dumps(result).encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": "Bearer " + os.environ["ALLERT_GATEWAY_KEY"],
                 "X-Allert-Worker-Token": os.environ["ALLERT_WORKER_TOKEN"]}, method="POST")
    with urlopen(request, timeout=30) as response:
        print(response.read().decode())

if __name__ == "__main__":
    main()
