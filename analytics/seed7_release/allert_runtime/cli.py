"""Local partner smoke checks; no database access or training."""
import argparse
import json
from pathlib import Path
import time
import numpy as np
from .engine import ModelRuntime,ROOT,risk,verify_package


def self_test(device):
    model=ModelRuntime(device)
    expected=json.loads((ROOT/'examples/golden_predictions.json').read_text())
    diffs=[];durations=[]
    for case in expected['cases']:
        payload=json.loads((ROOT/case['input']).read_text())
        started=time.perf_counter()
        result=model.predict(payload)
        durations.append(time.perf_counter()-started)
        actual=np.asarray([row['value'] for row in result['forecasts']])
        diff=float(np.max(np.abs(actual-np.asarray(case['expected']))))
        assert diff<expected['tolerance_ugm3'],f'Golden replay mismatch: {diff}'
        diffs.append(diff)
    value=risk({'pm2_5':20,'pm10':40,'temperature_c':30,'humidity_percent':70})
    assert abs(value['adult']['score_0_100']-25.8401)<.0001
    assert abs(value['pediatric']['score_0_100']-28.2181)<.0001
    result={'status':'passed_selected_model_golden_replay','device':str(model.device),
        'cases':len(diffs),'max_abs_difference_ugm3':max(diffs),
        'mean_one_origin_seconds_on_this_machine':float(np.mean(durations)),
        'model_id':model.info()['model_id'],'checkpoint_sha256':model.info()['checkpoint_sha256'],
        'weights_or_calibration_changed':False,'assessment_rescored':False,
        'timing_is_not_a_service_level_guarantee':True}
    print(json.dumps(result,indent=2));return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=('verify','self-test','forecast'))
    parser.add_argument('--device',choices=('auto','cpu','cuda'),default='auto')
    parser.add_argument('--input',type=Path)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    if args.command=='verify':
        manifest=verify_package();result={'status':'package_hashes_verified','files':len(manifest['files'])}
        print(json.dumps(result,indent=2))
    elif args.command=='self-test':result=self_test(args.device)
    else:
        if args.input is None:parser.error('forecast requires --input')
        result=ModelRuntime(args.device).predict(json.loads(args.input.read_text()))
        print(json.dumps(result,indent=2))
    if args.output:
        if args.output.exists():raise FileExistsError('Use a new output filename')
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(result,indent=2)+'\n')


if __name__=='__main__':main()
