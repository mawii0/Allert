"""Isolated deployed sensor checks; never edits existing users or devices."""
import argparse,json,secrets
from pathlib import Path
from datetime import datetime,timedelta,timezone
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from urllib.parse import urlencode
p=argparse.ArgumentParser();p.add_argument('--credentials',required=True);p.add_argument('--report',required=True);a=p.parse_args()
c=json.loads(Path(a.credentials).read_text(encoding='utf-8-sig'));base=f"https://{c['project_ref']}.supabase.co";edge=base+'/functions/v1/make-server-a473accf'
admin={'apikey':c['service_role_key'],'Authorization':'Bearer '+c['service_role_key']};anon={'apikey':c['anon_key'],'Authorization':'Bearer '+c['anon_key']};checks=[];users=[];devices=[]
def call(path,headers,body=None,method='GET'):
 r=Request(base+path,headers={**headers,'Content-Type':'application/json'},data=None if body is None else json.dumps(body).encode(),method=method)
 try:
  with urlopen(r,timeout=45) as res:
   raw=res.read();return res.status,json.loads(raw) if raw else None
 except HTTPError as e:
  try:d=json.loads(e.read())
  except Exception:d=None
  return e.code,d
def check(label,ok):
 checks.append({'check':label,'passed':bool(ok)})
 if not ok:raise AssertionError(label)
def read(h):return call('/functions/v1/make-server-a473accf/sensor-telemetry',h)
def db(t,h=admin,b=None,m='GET',q=None):return call('/rest/v1/'+t+('?' +urlencode(q) if q else ''),h,b,m)
try:
 check('missing authentication rejected',read({'apikey':c['anon_key']})[0]==401)
 check('invalid session rejected',read({**anon,'Authorization':'Bearer invalid'})[0]==401)
 for _ in range(2):
  email='allert-telemetry-qa-'+secrets.token_hex(10)+'@example.invalid';password=secrets.token_urlsafe(32)
  status,u=call('/auth/v1/admin/users',admin,{'email':email,'password':password,'email_confirm':True},'POST');check('synthetic account created',status==200);users.append(u['id'])
  status,s=call('/functions/v1/make-server-a473accf/login',anon,{'email':email,'password':password},'POST');check('synthetic login succeeds',status==200)
  if len(users)==1:h={**anon,'Authorization':'Bearer '+s['access_token']}
  else:other={**anon,'Authorization':'Bearer '+s['access_token']}
 status,d=read(h);check('no hardware returns truthful empty state',status==200 and d=={'device':None,'latest':None,'history':[]})
 for owner in [users[0],users[1],users[0]]:
  device='allert-qa-'+secrets.token_hex(12);devices.append(device)
  check('server creates isolated device',db('sensor_devices',b={'device_id':device,'user_id':owner,'is_active':len(devices)<3},m='POST')[0] in [200,201])
 status,d=read(h);check('assigned device without readings returns empty history',status==200 and d['device']['device_id']==devices[0] and d['latest'] is None and d['history']==[])
 now=datetime.now(timezone.utc)
 rows=[{'id':secrets.randbits(48),'device_id':devices[0],'timestamp':(now-timedelta(hours=hours)).isoformat(),'pm2_5':value,'pm10':value*2,'temperature':27,'humidity':70} for hours,value in [(25,11),(2,22),(1,33)]]
 rows.append({'id':secrets.randbits(48),'device_id':devices[1],'timestamp':now.isoformat(),'pm2_5':999,'pm10':1998,'temperature':27,'humidity':70})
 check('server inserts synthetic readings',db('sensor_readings',b=rows,m='POST')[0] in [200,201])
 status,d=read(h);check('latest reading matches assigned device',status==200 and d['latest']['pm2_5']==33 and d['latest']['device_id']==devices[0]);check('24 hour history excludes old and other device readings',[r['pm2_5'] for r in d['history']]==[22,33])
 status,d=read(other);check('other account sees only its own readings',status==200 and d['latest']['pm2_5']==999 and len(d['history'])==1)
 for role,headers in [('anonymous',anon),('other account',other)]:
  for table in ['sensor_devices','sensor_readings']:
   status,data=db(table,h=headers,q={'device_id':'eq.'+devices[0],'select':'device_id'})
   check(role+' cannot directly read another device '+table,status in [401,403] or status==200 and data==[])
 check('browser cannot reassign device ownership',db('sensor_devices',h=other,b={'user_id':users[1]},m='PATCH',q={'device_id':'eq.'+devices[0]})[0] in [200,204,401,403])
 status,data=db('sensor_devices',q={'device_id':'eq.'+devices[0],'select':'user_id'});check('ownership remains unchanged after client attempt',status==200 and data[0]['user_id']==users[0])
 check('activate second isolated device',db('sensor_devices',b={'is_active':True},m='PATCH',q={'device_id':'eq.'+devices[2]})[0] in [200,204]);check('multiple active devices rejected',read(h)[0]==409)
 check('deactivate second isolated device',db('sensor_devices',b={'is_active':False},m='PATCH',q={'device_id':'eq.'+devices[2]})[0] in [200,204])
 check('remove recent synthetic readings',db('sensor_readings',m='DELETE',q={'device_id':'eq.'+devices[0],'timestamp':'gte.'+(now-timedelta(hours=24)).isoformat()})[0] in [200,204])
 status,d=read(h);check('old reading remains available with empty recent history',status==200 and d['latest']['pm2_5']==11 and d['history']==[])
finally:
 for device in devices:
  for t in ['sensor_readings','sensor_devices']:
   status,_=db(t,m='DELETE',q={'device_id':'eq.'+device});checks.append({'check':'synthetic '+t+' removed','passed':status in [200,204]})
 for u in users:
  status,_=call('/auth/v1/admin/users/'+u,admin,method='DELETE');checks.append({'check':'synthetic account removed','passed':status==200})
 Path(a.report).write_text(json.dumps({'status':'passed' if all(x['passed'] for x in checks) else 'failed','checks':checks,'existing_records_modified':False},indent=2)+'\n')
print(json.dumps({'passed':sum(x['passed'] for x in checks),'total':len(checks)}))
