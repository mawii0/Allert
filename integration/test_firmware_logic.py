"""Host checks for firmware timing helpers. Not an ESP8266 compilation or hardware test."""
from pathlib import Path
import subprocess
import tempfile
import shutil
root = Path(__file__).resolve().parents[1]
compiler = shutil.which('g++') or shutil.which('clang++')
if not compiler:
    raise SystemExit('Install a host C++ compiler to run these optional timing checks.')
source = r'''
#include "node-logic.h"
#include <cassert>
#include <cstring>
int main() {
  assert(std::strcmp(allertBaseName("123.json"),"123.json")==0);
  assert(std::strcmp(allertBaseName("/queue/123.json"),"123.json")==0);
  assert(std::strcmp(allertBaseName(nullptr),"")==0);
  assert(allertNextBlock(1700000100U)==1700000400U);
  assert(allertNextBlock(1700000101U)==1700000400U);
  assert(!allertElapsed(499,0xffffffffU-500U,1001));
  assert(allertElapsed(500,0xffffffffU-500U,1001));
  assert(allertBackoff(30000)==60000);
  assert(allertBackoff(120000)==240000);
  assert(allertBackoff(240000)==300000);
  assert(allertBackoff(300000)==300000);
  assert(allertDeviceTokenValid("abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"));
  assert(!allertDeviceTokenValid(nullptr));
  assert(!allertDeviceTokenValid(""));
  assert(!allertDeviceTokenValid("REPLACE_WITH_64_CHARACTER_UPLOAD_TOKEN"));
  assert(!allertDeviceTokenValid("abcdef0123456789abcdef0123456789abcdef0123456789abcdef012345678"));
  assert(!allertDeviceTokenValid("abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789a"));
  assert(!allertDeviceTokenValid("gbcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"));
  assert(allertHttpsUploadUrlValid("https://allert-api.onrender.com/api/sensor-data"));
  assert(allertHttpsUploadUrlValid("https://fugziwuyiecvdopdnkmn.supabase.co/functions/v1/sensor-ingest"));
  assert(!allertHttpsUploadUrlValid(nullptr));
  assert(!allertHttpsUploadUrlValid(""));
  assert(!allertHttpsUploadUrlValid("https:/"));
  assert(!allertHttpsUploadUrlValid("https:///api/sensor-data"));
  assert(!allertHttpsUploadUrlValid("http://allert-api.onrender.com/api/sensor-data"));
  assert(!allertHttpsUploadUrlValid("https://user:password@allert-api.onrender.com/api/sensor-data"));
  assert(!allertHttpsUploadUrlValid("https://allert-api.onrender.com/api/sensor-data?token=secret"));
  assert(!allertHttpsUploadUrlValid("https://allert-api.onrender.com/api/sensor-data#token"));
  assert(!allertHttpsUploadUrlValid("https://allert-api.onrender.com/api/sensor-data "));
  assert(allertHttpSuccess(200)); assert(allertHttpSuccess(299));
  assert(!allertHttpSuccess(-1)); assert(!allertHttpSuccess(302)); assert(!allertHttpSuccess(503));
}
'''
with tempfile.TemporaryDirectory() as temp:
    folder=Path(temp);(folder/'test.cpp').write_text(source)
    executable=folder/'test'
    subprocess.run([compiler,'-std=c++11','-I',str(root/'firmware/Allert_node_code'),str(folder/'test.cpp'),'-o',str(executable)],check=True)
    subprocess.run([str(executable)],check=True)
print('Firmware queue paths, UTC boundary, rollover, bounded retry, device credentials and HTTPS endpoint checks passed.')
