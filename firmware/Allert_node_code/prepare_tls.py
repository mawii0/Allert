"""Export the verified root CA for the configured Supabase hostname. No secrets needed.
Run on an internet-connected PC; never disable TLS verification to make this succeed.
"""
import argparse
from pathlib import Path
import socket
import ssl
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='https://fugziwuyiecvdopdnkmn.supabase.co/functions/v1/sensor-ingest')
args = parser.parse_args()
url = urlsplit(args.url)
if url.scheme != 'https' or not url.hostname or url.username or url.password:
    parser.error('Use the HTTPS ingestion URL without credentials.')
context = ssl.create_default_context()
with socket.create_connection((url.hostname, url.port or 443), timeout=15) as connection:
    with context.wrap_socket(connection, server_hostname=url.hostname) as secure:
        getter = getattr(secure, 'get_verified_chain', None)
        if getter:
            chain = getter()
            pem = ssl.DER_cert_to_PEM_cert(chain[-1])
        else:
            # CPython 3.11/3.12 expose the same verified chain through their SSL object.
            getter = getattr(secure._sslobj, 'get_verified_chain', None)
            if not getter:
                raise SystemExit('Use CPython 3.13+ to export the verified chain.')
            chain = getter()
            pem = chain[-1].public_bytes()
            if isinstance(pem, bytes):
                pem = pem.decode('ascii')
        if '-----BEGIN CERTIFICATE-----' not in pem:
            raise SystemExit('A verified PEM root certificate could not be exported.')
output = Path(__file__).with_name('tls_roots.h')
output.write_text('#pragma once\nstatic const char ALLERT_TLS_ROOT_CA[] PROGMEM = R"ALLERT_CA(\n' + pem + ')ALLERT_CA";\n', encoding='ascii')
print('Verified HTTPS hostname:', url.hostname)
print('Saved', output.name, 'beside the sketch. Re-run if the server changes its certificate authority.')
