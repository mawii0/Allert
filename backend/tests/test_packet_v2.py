import unittest
from copy import deepcopy
from datetime import datetime,timedelta,timezone
from backend.packet_v2 import normalize_packet_v2
from backend.main import DEVICE_PATTERN

class IndependentChannelPackets(unittest.TestCase):
    def setUp(self):
        self.clock=datetime.now(timezone.utc)
        end=datetime.fromtimestamp(int(self.clock.timestamp())//300*300,timezone.utc)
        self.packet={'packet_version':2,'device_id':'ALLERT-NODE-001',
          'block_start':(end-timedelta(minutes=5)).isoformat(),'block_end':end.isoformat(),
          'units':{'pm':'ug/m3','temperature':'C','humidity':'%'},
          'pm2_5':70,'pm10':100,'temperature':None,'humidity':None,
          'quality':{'pm2_5':'ok','pm10':'ok','temperature':'missing','humidity':'missing'},
          'sample_counts':{'pm2_5':30,'pm10':30,'temperature':0,'humidity':0}}

    def test_missing_weather_keeps_pm_and_strips_all_forged_identity_receipt_fields(self):
        self.packet.update(user_id='forged',received_at='1900-01-01Z',stream_id='fixture',model_id='wrong')
        device,payload=normalize_packet_v2(self.packet,DEVICE_PATTERN,self.clock)
        self.assertEqual(device,'ALLERT-NODE-001')
        self.assertEqual(payload['pm2_5'],70)
        for name in ('device_id','user_id','received_at','stream_id','model_id'):self.assertNotIn(name,payload)

    def test_wrong_units_or_short_samples_cannot_become_a_complete_block(self):
        for change in ('units','sample_counts'):
            packet=deepcopy(self.packet)
            if change=='units':packet['units']['pm']='mg/m3'
            else:packet['sample_counts']['pm2_5']=29
            self.assertIsNone(normalize_packet_v2(packet,DEVICE_PATTERN,self.clock))

    def test_missing_quality_bad_values_naive_times_and_future_data_are_rejected(self):
        variants=[{'pm2_5':True},{'pm10':float('nan')},{'temperature':25},{'block_end':'2026-10-16T19:00:00'},
          {'block_end':(self.clock+timedelta(hours=1)).isoformat()},{'quality':{}},{'packet_version':True}]
        for patch in variants:
            with self.subTest(patch=patch):self.assertIsNone(normalize_packet_v2({**self.packet,**patch},DEVICE_PATTERN,self.clock))
