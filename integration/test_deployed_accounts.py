"""Deployed acceptance tests. Uses only temporary synthetic accounts; cleans up its own rows."""
import argparse, concurrent.futures, json, secrets, uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument('--credentials', required=True, help='Private JSON; never commit this file')
parser.add_argument('--report', required=True)
args = parser.parse_args()
creds = json.loads(Path(args.credentials).read_text(encoding='utf-8-sig'))
base = f"https://{creds['project_ref']}.supabase.co"
edge = base + '/functions/v1/make-server-a473accf'
anon = {'Authorization': 'Bearer ' + creds['anon_key']}
admin = {'apikey': creds['service_role_key'], 'Authorization': 'Bearer ' + creds['service_role_key']}
checks, users = [], []

def call(url, headers=None, body=None, method='GET'):
    headers = {**(headers or {}), 'Content-Type': 'application/json'}
    encoded = body.encode() if isinstance(body, str) else None if body is None else json.dumps(body).encode()
    req = Request(url, data=encoded, headers=headers, method=method)
    try:
        with urlopen(req, timeout=45) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except HTTPError as e:
        try: data = json.loads(e.read())
        except Exception: data = None
        return e.code, data

def expect(label, condition):
    checks.append({'check': label, 'passed': bool(condition)})
    if not condition: raise AssertionError(label)

def endpoint(path, headers=None, body=None, method='GET'):
    return call(edge + path, headers, body, method)

try:
    expect('backend health', endpoint('/health', anon)[0] == 200)
    for path in ['/profile', '/health-logs', '/environment']:
        expect('unauthenticated ' + path + ' denied', endpoint(path)[0] == 401)
        expect('anonymous user ' + path + ' denied', endpoint(path, anon)[0] == 401)
    expect('malformed sign-in JSON rejected', endpoint('/login', anon, '{', 'POST')[0] == 400)
    expect('missing sign-in fields rejected', endpoint('/login', anon, {}, 'POST')[0] == 400)
    expect('invalid signup rejected', endpoint('/signup', anon, {'email':'invalid','password':'x'}, 'POST')[0] == 400)
    sessions = []
    for number in range(2):
        email, password = f'allert-qa-{secrets.token_hex(10)}@example.invalid', secrets.token_urlsafe(32)
        status, data = endpoint('/signup', anon, {'email':email,'password':password,'name':'Synthetic QA'}, 'POST')
        if data and data.get('user'): users.append(data['user']['id'])
        expect(f'synthetic signup {number}', status == 200 and bool(data.get('refresh_token')))
        expect(f'wrong password {number} rejected', endpoint('/login', anon, {'email':email,'password':'incorrect-password'}, 'POST')[0] == 401)
        status, data = endpoint('/login', anon, {'email':email,'password':password}, 'POST')
        expect(f'login {number}', status == 200 and bool(data.get('refresh_token')))
        status, refreshed = call(base + '/auth/v1/token?grant_type=refresh_token', {'apikey':creds['anon_key']}, {'refresh_token':data['refresh_token']}, 'POST')
        expect(f'refresh {number}', status == 200 and bool(refreshed.get('access_token')))
        sessions.append({'Authorization':'Bearer ' + refreshed['access_token']})
    a, b = sessions
    expect('unassigned model user denied', endpoint('/environment', a)[0] == 403)
    for profile in [{'demographic':'unknown'}, {'name':3}, {'name':'x'*101}]:
        expect('invalid profile rejected ' + str(len(checks)), endpoint('/profile',a,profile,'POST')[0] == 400)
    status, saved = endpoint('/profile',a,{'demographic':'pediatric','name':'QA Updated','userId':users[1]},'POST')
    expect('profile update ignores spoofed user ID', status == 200 and saved['profile']['userId'] == users[0])
    status, data = endpoint('/profile',a)
    expect('profile persists', status == 200 and data['profile']['name'] == 'QA Updated' and data['profile']['demographic'] == 'pediatric')
    _, data = endpoint('/profile',b)
    expect('profiles isolated', data['profile']['name'] == 'Synthetic QA' and data['profile']['demographic'] == 'adult')
    expect('name can be cleared', endpoint('/profile',a,{'name':''},'POST')[1]['profile']['name'] == '')
    entry = {'vasScore':5,'tnssScore':6,'riskLevel':24,'notes':'Synthetic test only','observedAt':datetime.now(timezone.utc).isoformat(),'symptomSeverities':{'sneezing':0,'itchy-nose':1,'runny-nose':2,'congestion':3},'requestId':str(uuid.uuid4()),'userId':users[1]}
    for patch in [{'vasScore':-1},{'vasScore':11},{'vasScore':'5'},{'tnssScore':13},{'tnssScore':5},{'notes':{}},{'notes':'x'*2001},{'observedAt':(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat()}]:
        expect('invalid diary input rejected ' + str(len(checks)), endpoint('/health-logs',a,{**entry,**patch},'POST')[0] == 400)
    status, data = endpoint('/health-logs',a,entry,'POST')
    expect('diary save includes all symptoms and observation time', status == 200 and data['entry']['symptomSeverities'] == entry['symptomSeverities'] and data['entry']['observedAt'] == entry['observedAt'] and data['entry']['userId'] == users[0])
    first = data['entry']
    status, data = endpoint('/health-logs',a,entry,'POST')
    expect('retry returns same saved entry', status == 200 and data['entry'] == first)
    expect('conflicting retry rejected', endpoint('/health-logs',a,{**entry,'vasScore':7},'POST')[0] == 409)
    _, data = endpoint('/health-logs',b)
    expect('diary isolation', data['logs'] == [])
    parallel = [{**entry,'requestId':str(uuid.uuid4())} for _ in range(6)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda e:endpoint('/health-logs',a,e,'POST'), parallel))
    expect('six concurrent saves succeed', all(status == 200 for status,_ in results))
    _, data = endpoint('/health-logs',a)
    expect('concurrent saves retained without duplicates', len(data['logs']) == 7 and {e['requestId'] for e in parallel}.issubset({e['id'] for e in data['logs']}))
    duplicate = {**entry,'requestId':str(uuid.uuid4())}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _:endpoint('/health-logs',a,duplicate,'POST'), range(4)))
    expect('concurrent identical retries return one identity', all(status == 200 for status,_ in results) and len({d['entry']['date'] for _,d in results}) == 1)
    mixed = {**entry,'requestId':str(uuid.uuid4())}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda score:endpoint('/health-logs',a,{**mixed,'vasScore':score},'POST'), [4,8]))
    expect('concurrent conflicting retries choose one winner', sorted(status for status,_ in results) == [200,409])
    legacy = {'id':'legacy-synthetic','userId':users[0],'date':datetime.now(timezone.utc).isoformat(),'vasScore':2,'tnssScore':3,'riskLevel':10}
    expect('legacy fixture stored for compatibility test', call(base+'/rest/v1/kv_store_a473accf',admin,{'key':'health-logs:'+users[0],'value':[legacy]},'POST')[0] in [200,201])
    _, data = endpoint('/health-logs',a)
    expect('existing legacy diary survives new storage format', any(e['id'] == legacy['id'] for e in data['logs']))
    old_entries = [{'key':f'health-log:v2:{users[0]}:seed-{n}', 'value':{**legacy,'id':f'seed-{n}','date':(datetime(2000,1,1,tzinfo=timezone.utc)+timedelta(minutes=n)).isoformat()}} for n in range(110)]
    expect('synthetic pagination fixture stored', call(base+'/rest/v1/kv_store_a473accf',admin,old_entries,'POST')[0] in [200,201])
    status, data = endpoint('/health-logs',a)
    expect('latest 100 diary entries returned in descending order', status == 200 and len(data['logs']) == 100 and [e['date'] for e in data['logs']] == sorted([e['date'] for e in data['logs']],reverse=True) and all(any(e['id'] == p['requestId'] for e in data['logs']) for p in parallel))
finally:
    for user in users:
        for key in ['eq.profile:'+user, 'eq.health-logs:'+user, 'like.health-log:v2:'+user+':%']:
            expect('synthetic rows cleaned ' + str(len(checks)), call(base+'/rest/v1/kv_store_a473accf?'+urlencode({'key':key}),admin,method='DELETE')[0] in [200,204])
        expect('synthetic account cleaned ' + str(len(checks)), call(base+'/auth/v1/admin/users/'+user,admin,method='DELETE')[0] == 200)
    report = {'status':'passed' if all(c['passed'] for c in checks) else 'failed','checks':checks,'synthetic_accounts_removed':len(users),'existing_account_records_modified':False}
    Path(args.report).write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'status':report['status'],'checks':len(checks),'synthetic_accounts_removed':len(users)}))
