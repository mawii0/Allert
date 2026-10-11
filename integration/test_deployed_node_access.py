"""Persistent node-access regression. Never edits deployment secrets or existing assignments."""
import argparse, concurrent.futures, hashlib, json, secrets
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument('--credentials', required=True)
parser.add_argument('--report', required=True)
args = parser.parse_args()
c = json.loads(Path(args.credentials).read_text(encoding='utf-8-sig'))
base = f"https://{c['project_ref']}.supabase.co"
edge = base + '/functions/v1/make-server-a473accf'
table = base + '/rest/v1/kv_store_a473accf'
admin = {'apikey':c['service_role_key'], 'Authorization':'Bearer '+c['service_role_key'], 'Prefer':'resolution=merge-duplicates'}
anon = {'apikey':c['anon_key'], 'Authorization':'Bearer '+c['anon_key']}
checks, users = [], []

def call(url, headers, body=None, method='GET'):
    req = Request(url, headers={**headers,'Content-Type':'application/json'}, data=None if body is None else json.dumps(body).encode(), method=method)
    try:
        with urlopen(req,timeout=45) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except HTTPError as e:
        try: data = json.loads(e.read())
        except Exception: data = None
        return e.code, data

def expect(label, condition):
    checks.append({'check':label,'passed':bool(condition)})
    if not condition: raise AssertionError(label)

def login(email, password):
    status, session = call(edge+'/login',anon,{'email':email,'password':password},'POST')
    expect('fresh login succeeds '+str(len(checks)),status==200 and bool(session.get('refresh_token')))
    return session, {'apikey':c['anon_key'],'Authorization':'Bearer '+session['access_token']}

def read(headers): return call(edge+'/environment', headers)

def set_assignment(key, value):
    expect('server assignment persisted '+str(len(checks)),call(table,admin,{'key':key,'value':value},'POST')[0] in [200,201])

try:
    status, health = call(edge+'/health',anon)
    expect('deployed authorization revision is current',status==200 and health.get('revision')=='persistent-node-assignment-v1')
    expect('publication without worker credential denied',call(edge+'/environment/publish',anon,{},'POST')[0]==401)
    expect('publication with incorrect worker credential denied',call(edge+'/environment/publish',{**anon,'X-Allert-Worker-Token':'incorrect'}, {}, 'POST')[0]==401)
    for _ in range(2):
        email, password = f'allert-access-qa-{secrets.token_hex(10)}@example.invalid',secrets.token_urlsafe(32)
        status,user=call(base+'/auth/v1/admin/users',admin,{'email':email,'password':password,'email_confirm':True},'POST')
        expect('synthetic account created '+str(len(checks)),status==200)
        users.append({'id':user['id'],'email':email,'password':password})
    user, other = users
    key=f"node-assignment:v1:{user['id']}:node-1"
    record={'schema_version':1,'user_id':user['id'],'node_id':'node-1','active':True,'assigned_at':datetime.now(timezone.utc).isoformat(),'source':'synthetic-regression-test'}
    session,headers=login(user['email'],user['password'])
    _,other_headers=login(other['email'],other['password'])
    expect('unassigned real session denied',read(headers)[0]==403)
    expect('browser cannot self-assign through database',call(table,headers,{'key':key,'value':record},'POST')[0] in [401,403])
    set_assignment(key,record)
    for role,role_headers in [('anonymous',anon),('authenticated',headers)]:
        status,rows=call(table+'?'+urlencode({'key':'eq.'+key,'select':'key'}),role_headers)
        expect(role+' cannot read private assignment rows',status in [401,403] or status==200 and rows==[])
    status,rows=call(table+'?'+urlencode({'key':'eq.environment:v1:historical_fixture','select':'key'}),headers)
    expect('authenticated direct database access cannot bypass model authorization',status in [401,403] or status==200 and rows==[])
    fingerprints=set()
    reference=None
    for cycle in range(4):
        session,headers=login(user['email'],user['password'])
        fingerprints.add(hashlib.sha256(session['access_token'].encode()).hexdigest())
        status,data=read(headers)
        if status != 200 or data.get('availability') != 'historical_replay':
            print(json.dumps({'login_cycle':cycle+1,'read_status':status,'availability':data.get('availability'),'error_code':data.get('code')}))
        expect(f'assignment survives login cycle {cycle+1}',status==200 and data['availability']=='historical_replay' and len(data['snapshot']['forecast']['forecasts'])==6)
        reference=reference or data['snapshot']
        expect(f'forecast values stable on login cycle {cycle+1}',data['snapshot']==reference)
        status,fresh=call(base+'/auth/v1/token?grant_type=refresh_token',anon,{'refresh_token':session['refresh_token']},'POST')
        expect(f'refresh succeeds cycle {cycle+1}',status==200)
        refreshed_headers={'apikey':c['anon_key'],'Authorization':'Bearer '+fresh['access_token']}
        status,data=read(refreshed_headers)
        expect(f'assignment survives token refresh cycle {cycle+1}',status==200 and data['snapshot']==reference)
        # Revoking this synthetic session reproduces logout followed by a fresh login.
        expect(f'synthetic logout succeeds cycle {cycle+1}',call(base+'/auth/v1/logout?scope=local',refreshed_headers,method='POST')[0] in [200,204])
    expect('cycles used distinct sessions rather than one cached token',len(fingerprints)==4)
    session,headers=login(user['email'],user['password'])
    expect('other account remains denied',read(other_headers)[0]==403)
    status,_=call(edge+'/profile',headers,{'name':'Synthetic Access Test','demographic':'pediatric','node_id':'node-2','nodeAccess':True,'userId':other['id']},'POST')
    expect('profile update succeeds without changing assignment',status==200 and read(headers)[0]==200 and read(other_headers)[0]==403)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        results=list(pool.map(lambda _:read(headers),range(20)))
    expect('20 concurrent reads have no intermittent access denials',all(status==200 and data['snapshot']==reference for status,data in results))
    for label,patch in [('revoked',{'active':False}),('wrong account',{'user_id':other['id']}),('wrong node',{'node_id':'node-2'}),('unknown version',{'schema_version':2})]:
        set_assignment(key,{**record,**patch})
        expect(label+' assignment fails closed',read(headers)[0]==403)
    set_assignment(key,record)
    expect('reinstated assignment works without re-login',read(headers)[0]==200)
    status,rows=call(table+'?'+urlencode({'key':'eq.'+key,'select':'value'}),admin)
    expect('logins and profile changes preserve the stored assignment',status==200 and rows[0]['value']==record)
finally:
    for user in users:
        for key_filter in ['eq.profile:'+user['id'],'eq.node-assignment:v1:'+user['id']+':node-1']:
            status,_=call(table+'?'+urlencode({'key':key_filter}),admin,method='DELETE')
            checks.append({'check':'synthetic rows removed '+str(len(checks)),'passed':status in [200,204]})
        status,_=call(base+'/auth/v1/admin/users/'+user['id'],admin,method='DELETE')
        checks.append({'check':'synthetic account removed '+str(len(checks)),'passed':status==200})
    report={'status':'passed' if all(check['passed'] for check in checks) else 'failed','checks':checks,'existing_assignments_modified':False,'deployment_secrets_modified':False,'synthetic_accounts_removed':len(users)}
    Path(args.report).write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'status':report['status'],'checks':len(checks),'synthetic_accounts_removed':len(users),'deployment_secrets_modified':False}))
