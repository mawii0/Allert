"""Retain measured chart history without changing model inputs or outputs."""
from datetime import datetime, timedelta

def measured_history(payload, current):
    end = datetime.fromisoformat(current['block_end'])
    rows = sorted((r for r in payload['history'] if end-timedelta(hours=24) < datetime.fromisoformat(r['block_end']) <= end), key=lambda r: datetime.fromisoformat(r['block_end']))[-288:]
    return {'history':rows} if len(rows) >= 2 else {}
