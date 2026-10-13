"""Independent standard-library parity reference; does not import the JS implementation."""
import hashlib
import json
import math
from pathlib import Path

root = Path(__file__).resolve().parents[1]
policy_bytes = (root / 'docs/model_v2/environment-policy.json').read_bytes()
policy = json.loads(policy_bytes)
vectors = json.loads((root / 'docs/model_v2/test-vectors.json').read_text())
checks = 0
for population in ('adult', 'pediatric'):
    for score, expected in vectors[population]:
        actual = ('low', 'moderate', 'high', 'very_high')[sum(score >= cut for cut in policy[population])]
        assert actual == expected, (population, score)
        checks += 1
for vector in vectors['readings']:
    pm25, pm10, temperature, humidity = vector['input']
    contribution = .0104*pm25+.0026*pm10+.012*(temperature-25)-.004*(humidity-60)
    score = 100/(1+math.exp(-(math.log(.2/.8)+contribution)))
    assert abs(score-vector['adult_score']) < vectors['score_tolerance']
    checks += 1
print(json.dumps({'passed': checks, 'failed': 0, 'policy_sha256': hashlib.sha256(policy_bytes).hexdigest(), 'scope': 'independent local policy reference; frozen model adapter parity pending'}))
