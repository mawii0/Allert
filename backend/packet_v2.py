"""Explicit independent-channel packet contract, normalized before privileged RPC."""
from datetime import datetime,timedelta,timezone
import re


def normalize_packet_v2(body,device_pattern,clock=None):
    if not isinstance(body,dict) or type(body.get('packet_version')) is not int or body['packet_version']!=2:
        return None
    device=body.get('device_id')
    if not isinstance(device,str) or not device_pattern.fullmatch(device):return None
    times=[]
    for k in ('block_start','block_end'):
        raw=body.get(k)
        if not isinstance(raw,str) or not re.search(r'(Z|[+-]\d\d:\d\d)$',raw):return None
        try:times.append(datetime.fromisoformat(raw.replace('Z','+00:00')).astimezone(timezone.utc))
        except (ValueError,OverflowError):return None
    start,end=times;clock=clock or datetime.now(timezone.utc)
    if end-start!=timedelta(minutes=5) or end.timestamp()%300 or not clock-timedelta(days=7)<=end<=clock+timedelta(minutes=1):return None
    units={'pm':'ug/m3','temperature':'C','humidity':'%'}
    if body.get('units')!=units:return None
    quality=body.get('quality');counts=body.get('sample_counts')
    if not isinstance(quality,dict) or not isinstance(counts,dict):return None
    payload={'packet_version':2,'block_start':start.isoformat(),'block_end':end.isoformat(),
             'quality':{},'sample_counts':{},'units':units}
    for key,(lo,hi) in {'pm2_5':(0,1000),'pm10':(0,1000),'temperature':(-40,125),'humidity':(0,100)}.items():
        q=quality.get(key);value=body.get(key);count=counts.get(key)
        if q not in ('ok','missing','invalid') or type(count) is not int or not 0<=count<=30:return None
        if q=='ok':
            if count!=30 or type(value) not in (float,int) or not lo<=value<=hi:return None
        elif value is not None:return None
        payload[key]=value;payload['quality'][key]=q;payload['sample_counts'][key]=count
    return device,payload
