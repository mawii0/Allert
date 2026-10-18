"""Causal five-minute observed-PM alerts, independent of forecasts and risk.

Decisions are payloads, not delivered notifications. Configuration values are
project engineering settings, not clinical thresholds or smoke/fire labels.
Callers must persist the returned snapshot and notification outbox together.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
from pathlib import Path
import statistics

import pandas as pd
import yaml

POLLUTANTS = ('pm2_5', 'pm10')
CONFIG_PATH = Path(__file__).resolve().parents[1] / 'config/observed_pm_alerts.yaml'


def load_alert_config(path=CONFIG_PATH):
    cfg = yaml.safe_load(Path(path).read_text(encoding='utf-8'))
    validate_config(cfg)
    return cfg


def validate_config(cfg):
    if not isinstance(cfg, dict) or not cfg.get('version'):
        raise ValueError('Alert configuration requires a version')
    positive = ('reference_minutes', 'cadence_minutes', 'adjacency_min_minutes',
                'adjacency_max_minutes', 'freshness_minutes', 'cooldown_minutes')
    nonnegative = ('reference_jitter_minutes', 'future_tolerance_minutes')
    for key in positive + nonnegative:
        value = cfg[key]
        if isinstance(value, bool) or not math.isfinite(value) or value < 0 or (key in positive and value == 0):
            raise ValueError(f'Invalid alert setting: {key}')
    for key in ('confirmation_blocks', 'recovery_blocks'):
        if type(cfg[key]) is not int or cfg[key] < (2 if key == 'confirmation_blocks' else 1):
            raise ValueError(f'Invalid block count: {key}')
    if not 0 < cfg['exit_fraction'] < 1 or not 0 < cfg['worsening_fraction'] < 1:
        raise ValueError('Exit/worsening fractions must be between zero and one')
    n = cfg['reference_minutes'] / cfg['cadence_minutes']
    if n < 2 or n != int(n):
        raise ValueError('Reference must contain an integer number of at least two blocks')
    if not 0 < cfg['adjacency_min_minutes'] <= cfg['cadence_minutes'] <= cfg['adjacency_max_minutes'] < 2 * cfg['cadence_minutes']:
        raise ValueError('Adjacency must accept nominal cadence but reject a missing block')
    if cfg['policy'] not in ('level_only', 'simple_rise_plus_level', 'robust_rise_plus_level'):
        raise ValueError('Unknown alert policy')
    if cfg.get('reminders_enabled') is not False:
        raise ValueError('Periodic reminders are not implemented; leave disabled')
    if set(cfg['pollutants']) != set(POLLUTANTS):
        raise ValueError('Separate PM2.5 and PM10 settings are required')
    for p, settings in cfg['pollutants'].items():
        for key, value in settings.items():
            if isinstance(value, bool) or not math.isfinite(value) or value <= 0:
                raise ValueError(f'Invalid {p} setting: {key}')
        if not settings['high_off'] < settings['high_on'] < settings['higher_level'] <= settings['measurement_max']:
            raise ValueError('Require high_off < high_on < higher_level <= measurement_max')


def _time(value):
    stamp = pd.Timestamp(value)
    if pd.isna(stamp) or stamp.tzinfo is None:
        raise ValueError('A timezone-aware block_end/received_at timestamp is required')
    return stamp.tz_convert('UTC')


def _minutes(a, b):
    return (a - b).total_seconds() / 60


def score_reading(value, history, now, cfg, pollutant):
    """Pure numerical calculation; history contains only eligible prior blocks."""
    settings = cfg['pollutants'][pollutant]
    count = int(cfg['reference_minutes'] / cfg['cadence_minutes'])
    eligible = [(t, v) for t, v in history if 0 < _minutes(now, _time(t)) <=
                cfg['reference_minutes'] + cfg['reference_jitter_minutes']]
    previous = eligible[-count:]
    adjacent = bool(previous) and cfg['adjacency_min_minutes'] <= _minutes(now, _time(previous[-1][0])) <= cfg['adjacency_max_minutes']
    ready = len(previous) == count and adjacent
    rate = (value - previous[-1][1]) / _minutes(now, _time(previous[-1][0])) if adjacent else None
    baseline = statistics.median(v for _, v in previous) if ready else None
    mad = statistics.median(abs(v - baseline) for _, v in previous) if ready else None
    scale = 1.4826 * mad if ready else None
    threshold = (max(settings['minimum_excess'], settings['variability_multiplier'] * scale)
                 if ready and cfg['policy'] == 'robust_rise_plus_level'
                 else settings['minimum_excess'] if ready else None)
    excess = value - baseline if ready else None
    rapid = bool(cfg['policy'] != 'level_only' and ready and excess >= threshold and rate >= settings['minimum_rate'])
    return {'value': value, 'reference_ready': ready, 'baseline': baseline, 'mad': mad,
            'robust_scale': scale, 'required_excess': threshold, 'excess': excess,
            'rate_ugm3_per_minute': rate, 'rapid_rise': rapid,
            'high': value >= settings['high_on'], 'higher_level': value >= settings['higher_level']}


class ObservedPMAlerts:
    """Separate per-node histories and durable episodes; no networking side effects."""

    def __init__(self, config=None, snapshot=None):
        self.config = copy.deepcopy(config if config is not None else load_alert_config())
        validate_config(self.config)
        self.config_hash = hashlib.sha256(json.dumps(self.config, sort_keys=True).encode()).hexdigest()
        self.nodes = {}
        if snapshot is not None:
            if snapshot.get('schema') != 1 or snapshot.get('config_hash') != self.config_hash:
                raise ValueError('Snapshot schema/configuration mismatch')
            self.nodes = copy.deepcopy(snapshot['nodes'])

    def snapshot(self):
        return {'schema': 1, 'config_hash': self.config_hash, 'nodes': copy.deepcopy(self.nodes)}

    def _notify(self, event, kind, now, scores, reasons):
        event['notification_sequence'] += 1
        key = f"{event['id']}:{event['notification_sequence']}:{kind}"
        event['last_notified_at'] = now.isoformat()
        for p in event['channels']:
            if p in scores:
                event['last_notified_values'][p] = scores[p]['value']
        return {'idempotency_key': key, 'event_id': event['id'], 'kind': kind,
                'block_end': now.isoformat(), 'reasons': reasons,
                'observations': copy.deepcopy(scores), 'delivery_performed': False,
                'interpretation': 'observed PM change/level; source and health outcome not identified'}

    def process(self, record, *, mode='live'):
        if mode not in ('live', 'replay'):
            raise ValueError('Mode must be live or replay')
        node_id = record.get('node_id')
        if not isinstance(node_id, str) or not node_id.strip():
            raise ValueError('Nonempty node_id is required')
        if record.get('units', 'ug/m3') not in ('ug/m3', 'µg/m³'):
            raise ValueError('Observed PM units must be ug/m3; no implicit conversion')
        now = _time(record['block_end'])
        receipt = _time(record['received_at'])
        cfg = self.config
        state = self.nodes.setdefault(node_id, {'last_time': None, 'last_fingerprint': None,
                    'history': {p: [] for p in POLLUTANTS}, 'event': None, 'episode_count': 0})
        # Delivery retries may have a different receipt time; identity is the
        # measurement payload, not the transport attempt.
        identity = {k: v for k, v in record.items() if k != 'received_at'}
        identity['block_end'] = now.isoformat()
        fingerprint = hashlib.sha256(json.dumps(identity, sort_keys=True, default=str).encode()).hexdigest()
        result = {'node_id': node_id, 'block_end': now.isoformat(), 'mode': mode,
                  'status': 'accepted', 'quality': {}, 'scores': {}, 'notifications': [],
                  'closed_event': None, 'state': 'QUIET', 'delivery_performed': False}
        if state['last_time'] is not None:
            last = _time(state['last_time'])
            if now <= last:
                result['status'] = ('duplicate' if now == last and fingerprint == state['last_fingerprint']
                                    else 'conflicting_duplicate' if now == last else 'out_of_order')
                result['state'] = state['event']['phase'] if state['event'] else 'QUIET'
                return result
        age = _minutes(receipt, now)
        if age < -cfg['future_tolerance_minutes'] or age > cfg['freshness_minutes']:
            result['status'] = 'future_clock' if age < 0 else 'stale'
            # An unavailable current observation must not carry a recovery streak.
            if state['event']:
                state['event']['clear_streak'] = state['event']['confirmation_streak'] = 0
                result['state'] = 'UNKNOWN'
            return result
        gap = state['last_time'] is not None and not cfg['adjacency_min_minutes'] <= _minutes(now, _time(state['last_time'])) <= cfg['adjacency_max_minutes']
        if gap:
            for p in POLLUTANTS:
                state['history'][p] = []
            if state['event']:
                state['event']['clear_streak'] = state['event']['confirmation_streak'] = 0
        for p in POLLUTANTS:
            value = record.get(p)
            quality = record.get('pollutant_status', {}).get(p, record.get('sensor_status', 'ok'))
            try:
                valid = not isinstance(value, bool) and value is not None and math.isfinite(float(value)) and float(value) >= 0
            except (ValueError, TypeError):
                valid = False
            reason = 'ok' if valid else 'missing_or_invalid'
            if valid and float(value) > cfg['pollutants'][p]['measurement_max']:
                valid, reason = False, 'measurement_limit'
            if quality not in ('ok', 'OK', 'ORIGINAL'):
                valid, reason = False, f'sensor_status:{quality}'
            result['quality'][p] = reason
            if valid:
                result['scores'][p] = score_reading(float(value), state['history'][p], now, cfg, p)
            else:
                state['history'][p] = []
        scores = result['scores']
        triggered = {p: [reason for reason in ('rapid_rise', 'high') if s[reason]]
                     for p, s in scores.items() if s['rapid_rise'] or s['high']}
        event = state['event']
        new = event is None and bool(triggered)
        if new:
            state['episode_count'] += 1
            event = {'id': f"{node_id}:{now.isoformat()}:{state['episode_count']}", 'node_id': node_id,
                     'onset': now.isoformat(), 'phase': 'INITIAL', 'confirmed': False,
                     'confirmation_streak': 1, 'clear_streak': 0, 'channels': {},
                     'announced_levels': [], 'notification_sequence': 0,
                     'last_notified_at': None, 'last_notified_values': {}, 'peaks': {}}
            state['event'] = event
        if event is not None:
            new_levels = []
            new_channels = []
            for p, reasons in triggered.items():
                s = scores[p]
                if p not in event['channels']:
                    event['channels'][p] = {'rise': False, 'baseline': None, 'threshold': None, 'high': False}
                    new_channels.append(p)
                channel = event['channels'][p]
                if s['rapid_rise'] and not channel['rise']:
                    channel.update(rise=True, baseline=s['baseline'], threshold=s['required_excess'])
                channel['high'] |= s['high']
                for level, active in (('high', s['high']), ('higher', s['higher_level'])):
                    tag = f'{p}:{level}'
                    if active and tag not in event['announced_levels']:
                        event['announced_levels'].append(tag)
                        new_levels.append(tag)
            known = all(p in scores for p in event['channels'])
            held, full = [], []
            for p, channel in event['channels'].items():
                if p not in scores:
                    continue
                s, limits = scores[p], cfg['pollutants'][p]
                event['peaks'][p] = max(event['peaks'].get(p, s['value']), s['value'])
                # Always consider high levels; rise persistence uses the frozen reference.
                held.append(s['value'] >= limits['high_off'] or
                            (channel['rise'] and s['value'] - channel['baseline'] >= cfg['exit_fraction'] * channel['threshold']))
                full.append(s['high'] or (channel['rise'] and s['value'] - channel['baseline'] >= channel['threshold']))
            worsening = [p for p in event['channels'] if p in scores and p in event['last_notified_values']
                         and scores[p]['value'] - event['last_notified_values'][p] >= cfg['pollutants'][p]['minimum_excess']
                         and scores[p]['value'] >= event['last_notified_values'][p] * (1 + cfg['worsening_fraction'])]
            if new:
                result['notifications'].append(self._notify(event, 'initial', now, scores, triggered))
            else:
                result['same_condition_cooldown_active'] = _minutes(now, _time(event['last_notified_at'])) < cfg['cooldown_minutes']
                if known and any(full):
                    event['confirmation_streak'] += 1
                else:
                    event['confirmation_streak'] = 0
                just_confirmed = not event['confirmed'] and event['confirmation_streak'] >= cfg['confirmation_blocks']
                if just_confirmed:
                    event['confirmed'] = True
                    event['confirmed_at'] = now.isoformat()
                if new_levels or worsening or new_channels:
                    event['phase'] = 'ESCALATED'
                    result['notifications'].append(self._notify(event, 'escalation', now, scores,
                        {'new_levels': new_levels, 'material_worsening': worsening, 'new_pollutants': new_channels}))
                elif just_confirmed:
                    event['phase'] = 'CONFIRMED'
                    # Confirmation is logged but does not duplicate the initial notice.
                    result['confirmation_transition'] = True
                if not known:
                    event['clear_streak'] = event['confirmation_streak'] = 0
                    result['state'] = 'UNKNOWN'
                elif not any(held):
                    event['clear_streak'] += 1
                    event['phase'] = 'RECOVERING'
                    if event['clear_streak'] >= cfg['recovery_blocks']:
                        event['phase'] = 'RECOVERED'
                        event['recovered_at'] = now.isoformat()
                        result['notifications'].append(self._notify(event, 'recovery', now, scores, {'clear_blocks': event['clear_streak']}))
                        result['closed_event'] = copy.deepcopy(event)
                        state['event'] = None
                        # Re-warm the rise reference; the high rule stays available.
                        state['history'] = {p: [] for p in POLLUTANTS}
                else:
                    event['clear_streak'] = 0
                    if event['phase'] == 'RECOVERING':
                        event['phase'] = 'CONFIRMED' if event['confirmed'] else 'INITIAL'
            if result['state'] != 'UNKNOWN':
                result['state'] = event['phase']
            result['event'] = copy.deepcopy(event)
        elif not all(s.get('reference_ready') for s in scores.values()) or len(scores) != 2:
            result['state'] = 'REFERENCE_WARMUP'
        # Never include the scored block in its own reference.
        count = int(cfg['reference_minutes'] / cfg['cadence_minutes'])
        for p, score in scores.items():
            state['history'][p].append([now.isoformat(), score['value']])
            state['history'][p] = state['history'][p][-count:]
        state['last_time'], state['last_fingerprint'] = now.isoformat(), fingerprint
        return result
