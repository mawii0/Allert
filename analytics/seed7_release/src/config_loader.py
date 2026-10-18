"""Partner-package compatibility boundary, not the research ensemble loader."""
from pathlib import Path
import json
import yaml

ROOT=Path(__file__).resolve().parents[1]


def get_project_root():return ROOT


def load_risk_config():
    cfg=yaml.safe_load((ROOT/'config/environmental_risk.yaml').read_text())
    cfg['paths']={'results_dir':'outputs'}
    cfg['project']={'random_seed':42}
    return cfg


def load_config():
    cfg=json.loads((ROOT/'bundle/model/model_config.json').read_text())
    cfg['risk']=load_risk_config()['risk']
    return cfg
