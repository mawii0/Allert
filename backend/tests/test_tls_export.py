"""Exercise the shipped certificate-export script's supported Python chain APIs."""
from contextlib import contextmanager
from pathlib import Path
import runpy
import ssl
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[2] / "firmware/Allert_node_code/prepare_tls.py"
PEM = "-----BEGIN CERTIFICATE-----\nAQID\n-----END CERTIFICATE-----\n"


@contextmanager
def entered(value):
    yield value


class CertificateExport(unittest.TestCase):
    def export(self, connection, *, insecure=False):
        with tempfile.TemporaryDirectory() as folder:
            script = Path(folder) / "prepare_tls.py"
            script.write_text(SCRIPT.read_text())
            context = SimpleNamespace(wrap_socket=lambda socket, server_hostname: entered(connection))
            scheme = "http" if insecure else "https"
            with patch.object(sys, "argv", [str(script), "--url", scheme+"://allert-api.onrender.com/api/sensor-data"]), \
                    patch("ssl.create_default_context", return_value=context) as verifier, \
                    patch("socket.create_connection", return_value=entered(object())) as network:
                runpy.run_path(str(script), run_name="__main__")
                verifier.assert_called_once()
                network.assert_called_once()
            return (Path(folder)/"tls_roots.h").read_text()

    def test_public_verified_chain_der_bytes(self):
        value = self.export(SimpleNamespace(get_verified_chain=lambda: [b"\x01\x02\x03"]))
        self.assertIn(PEM, value)
        self.assertIn("ALLERT_TLS_ROOT_CA", value)

    def test_public_verified_chain_certificate_objects(self):
        value = self.export(SimpleNamespace(get_verified_chain=lambda: [SimpleNamespace(public_bytes=lambda: PEM)]))
        self.assertIn(PEM, value)

    def test_python_311_private_verified_chain_certificate_objects(self):
        value = self.export(SimpleNamespace(_sslobj=SimpleNamespace(get_verified_chain=lambda: [SimpleNamespace(public_bytes=lambda: PEM.encode())])))
        self.assertIn(PEM, value)

    def test_insecure_export_url_cannot_open_network_or_write_a_header(self):
        with tempfile.TemporaryDirectory() as folder:
            script = Path(folder)/"prepare_tls.py"; script.write_text(SCRIPT.read_text())
            with patch.object(sys, "argv", [str(script), "--url", "http://example.invalid/api/sensor-data"]), \
                    patch("socket.create_connection") as network, self.assertRaises(SystemExit):
                runpy.run_path(str(script), run_name="__main__")
            network.assert_not_called()
            self.assertFalse((Path(folder)/"tls_roots.h").exists())


if __name__ == "__main__":
    unittest.main()
