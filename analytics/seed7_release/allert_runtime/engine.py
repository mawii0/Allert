"""Frozen-model adapter; no training, Supabase writes or notification delivery."""
from pathlib import Path
from datetime import datetime, timezone
import copy
import hashlib
import json
import math
import os
import threading
import joblib
import numpy as np
import pandas as pd
import torch
import yaml
from src.model_architecture import ALLERTBiLSTM
from src.risk_engine import compute_p_risk, classify_risk_tier
from src.observed_pm_alerts import ObservedPMAlerts, load_alert_config
from src.target_scaling import load_target_scaler

ROOT=Path(__file__).resolve().parents[1]
FEATURES=('pm2_5','pm10','temperature','humidity','temperature_roll_1h',
          'humidity_roll_1h','temperature_roll_6h','humidity_roll_6h')
MODEL_ID='median-residual-seed7-epoch15-20261013-v1'


def digest(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
    return h.hexdigest()


def verify_package(root=ROOT):
    root=Path(root).resolve()
    manifest=json.loads((root/'PACKAGE_MANIFEST.json').read_text(encoding='utf-8'))
    for name,expected in manifest['files'].items():
        path=(root/name).resolve()
        if not path.is_relative_to(root) or digest(path)!=expected:
            raise ValueError(f'Package integrity failure: {name}')
    return manifest


def timestamp(value):
    t=pd.Timestamp(value)
    if pd.isna(t) or t.tzinfo is None:
        raise ValueError('Timestamp must include a timezone')
    return t.tz_convert('UTC')


def number(value,name):
    if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value):
        raise ValueError(f'{name} must be a finite number, not a Boolean/string')
    return float(value)


def risk(readings):
    cfg=yaml.safe_load((ROOT/'config/environmental_risk.yaml').read_text())
    values=[number(readings.get(name),name) for name in
            ('pm2_5','pm10','temperature_c','humidity_percent')]
    result={'status':'calculation_only','rule_id':'environmental-indicator-v1',
            'rule_sha256':digest(ROOT/'config/environmental_risk.yaml'),
            'not_a_symptom_probability':True}
    for age in ('adult','pediatric'):
        value=compute_p_risk(*values,age,cfg)
        result[age]={'indicator_0_1':value,'score_0_100':100*value,
                     'tier':classify_risk_tier(value,age,cfg)[0]}
    return result


def observed(record,snapshot=None,mode='live'):
    if mode not in ('live','replay'):raise ValueError('Mode must be live or replay')
    cfg=load_alert_config()
    if mode=='live':
        age=(pd.Timestamp.now(tz='UTC')-timestamp(record['block_end'])).total_seconds()/60
        if age>cfg['freshness_minutes'] or age < -cfg['future_tolerance_minutes']:
            raise ValueError('Record is stale/future at processing time; do not send a live alert')
    detector=ObservedPMAlerts(config=cfg,snapshot=snapshot)
    decision=detector.process(record,mode=mode)
    return {'decision':decision,'snapshot':detector.snapshot(),
            'persistence_performed':False,'delivery_performed':False,
            'atomic_persistence_required':True}


class ModelRuntime:
    def __init__(self,device='auto',root=ROOT):
        self.root=Path(root).resolve()
        self.package=verify_package(self.root)
        self.protocol=json.loads((self.root/'bundle/protocol.json').read_text())
        model_dir=self.root/'bundle/model'
        cfg=json.loads((model_dir/'model_config.json').read_text())
        if cfg['model']['use_spike_head'] or cfg['model']['sequence_length']!=576:
            raise ValueError('Incorrect selected architecture')
        if tuple(json.loads((model_dir/'feature_cols.json').read_text()))!=FEATURES:
            raise ValueError('Incorrect feature order')
        selected='cuda' if device=='auto' and torch.cuda.is_available() else 'cpu' if device=='auto' else device
        if selected not in ('cpu','cuda'):raise ValueError('Device must be auto, cpu or cuda')
        if selected=='cuda' and not torch.cuda.is_available():raise RuntimeError('CUDA unavailable')
        self.device=torch.device(selected)
        if selected=='cpu':torch.set_num_threads(max(1,int(os.getenv('ALLERT_CPU_THREADS','2'))))
        self.model=ALLERTBiLSTM(8,cfg).to(self.device)
        self.model.load_state_dict(torch.load(model_dir/'best_model.pt',map_location=self.device,weights_only=True))
        self.model.eval()
        self.scaler=joblib.load(self.root/'bundle/feature_scaler.joblib')
        self.target_scaler=load_target_scaler(model_dir)
        if self.target_scaler.scaled:raise ValueError('Selected model requires original-unit residuals')
        self.gamma=np.asarray(self.protocol['shrinkage'],dtype=float)
        if self.gamma.shape!=(6,):raise ValueError('Expected six original calibration multipliers')
        self.lock=threading.Lock()

    def info(self):
        return {'model_id':MODEL_ID,'seed':int(self.protocol['seed']),'best_epoch':int(self.protocol['best_epoch']),'recorded_epochs':int(self.protocol['epochs_run']),
                'input_shape':[576,8],'lookback_hours':48,'history_fetch_hours':54,
                'feature_order':list(FEATURES),'horizons_hours':[6,12,24],
                'checkpoint_sha256':digest(self.root/'bundle/model/best_model.pt'),
                'spike_head':False,'device':str(self.device),'calibration':self.gamma.tolist(),
                'model_source_dataset':'Node 1 June–September 2026',
                'uncertainty_intervals_available':False}

    def prepare(self,payload):
        node=payload.get('node_id')
        validated_node=os.getenv('ALLERT_VALIDATED_NODE_ID','node-1')
        if not isinstance(node,str) or not node.strip():raise ValueError('node_id required')
        if node!=validated_node and os.getenv('ALLERT_ALLOW_EXPERIMENTAL_NODES','false').lower()!='true':
            raise ValueError('Forecast not enabled for this node; Node 2/3 transfer is not validated')
        mode=payload.get('mode','live')
        if mode not in ('live','historical_fixture'):raise ValueError('Invalid forecast mode')
        origin=timestamp(payload['forecast_origin'])
        if origin.second or origin.microsecond or origin.minute%15:
            raise ValueError('Forecast origin must lie on the original 15-minute grid')
        now=pd.Timestamp.now(tz='UTC')
        if mode=='live' and not -1 <= (now-origin).total_seconds()/60 <= 10:
            raise ValueError('Live forecast origin is stale/future')
        history=payload.get('history')
        if not isinstance(history,list) or not 648<=len(history)<=4096:
            raise ValueError('Need 648–4096 five-minute history blocks; do not pad missing data')
        expected=pd.date_range(origin-pd.Timedelta(hours=54),periods=648,freq='5min')
        rows=[];times=[]
        for row in history:
            if not isinstance(row,dict) or row.get('node_id')!=node:
                raise ValueError('History must contain only the selected node')
            start,end=timestamp(row['block_start']),timestamp(row['block_end'])
            if end-start!=pd.Timedelta(minutes=5):raise ValueError('Block must cover exactly five minutes')
            if row.get('quality') not in ('ok','OK','ORIGINAL'):
                raise ValueError('Forecast history must be valid, not missing/imputed')
            if mode=='live':
                received=timestamp(row['received_at'])
                if received>now or received<end-pd.Timedelta(minutes=1):
                    raise ValueError('Invalid measurement availability timestamp')
            values=[number(row.get(k),k) for k in ('pm2_5','pm10','temperature_c','humidity_percent')]
            if min(values[:2])<0 or not 0<=values[3]<=100 or not -10<=values[2]<=60:
                raise ValueError('PM/weather input outside configured physical range')
            times.append(start);rows.append(values)
        idx=pd.DatetimeIndex(times)
        if idx.has_duplicates or not idx.is_monotonic_increasing or not (idx.to_series().diff().dropna()==pd.Timedelta(minutes=5)).all():
            raise ValueError('History must already be unique, ordered and contiguous')
        # Future observations are rejected, not silently sliced off or sorted.
        if not idx[-648:].equals(expected):raise ValueError('History must end at origin−5min with exactly matching cadence')
        frame=pd.DataFrame(rows,index=idx,columns=['pm2_5','pm10','temperature','humidity'])
        features=frame.copy()
        for steps,label in ((12,'1h'),(72,'6h')):
            features['temperature_roll_'+label]=frame.temperature.rolling(steps,min_periods=1).mean()
            features['humidity_roll_'+label]=frame.humidity.rolling(steps,min_periods=1).mean()
        values=features.loc[:,list(FEATURES)].to_numpy(dtype=np.float32)[-576:]
        X=self.scaler.transform(values).astype(np.float32)[None,:,:]
        anchor=np.tile(frame[['pm2_5','pm10']].iloc[-12:].median().to_numpy(dtype=float),(1,3))
        return X,anchor,origin,node,mode

    def predict(self,payload):
        X,anchor,origin,node,mode=self.prepare(payload)
        with self.lock,torch.inference_mode():
            raw=self.model(torch.from_numpy(X).to(self.device)).cpu().numpy()
        correction=self.target_scaler.inverse_transform(raw)
        predicted=anchor+self.gamma*correction
        if not np.isfinite(predicted).all() or (predicted<0).any():
            raise ValueError('Invalid model output; no silent clipping or fake forecast')
        values=[]
        for j,(hours,pollutant) in enumerate((h,p) for h in (6,12,24) for p in ('pm2_5','pm10')):
            end=origin+pd.Timedelta(hours=hours)
            values.append({'pollutant':pollutant,'horizon_hours':hours,'value':float(predicted[0,j]),
                           'units':'ug/m3','target_block_start':(end-pd.Timedelta(minutes=5)).isoformat(),
                           'target_block_end':end.isoformat()})
        return {'status':'ok','model_id':MODEL_ID,'node_id':node,'mode':mode,
                'forecast_origin':origin.isoformat(),'generated_at':datetime.now(timezone.utc).isoformat(),
                'input_last_block_end':origin.isoformat(),'device':str(self.device),
                'checkpoint_sha256':self.info()['checkpoint_sha256'],'forecasts':values,
                'is_future_allergy_probability':False,'trained_or_recalibrated':False}
