"""Home Assistant endpoints in server.py, exercised against a fake HA instance.

Run:  python3 -m unittest test_server -v

Nothing here needs a real Home Assistant: a second stdlib server stands in for
it, records the Authorization header it was sent, and can be told to answer
with 401, an unreachable port or nonsense instead of states.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402


class FakeHA(BaseHTTPRequestHandler):
    """Stands in for Home Assistant's /api/states."""

    behaviour = "ok"
    states: list = []
    hits = 0
    last_auth = None

    def log_message(self, *args):      # keep the test output clean
        pass

    def do_GET(self):
        FakeHA.hits += 1
        FakeHA.last_auth = self.headers.get("Authorization")
        if self.path != "/api/states":
            self.send_response(404)
            self.end_headers()
            return
        if FakeHA.behaviour == "unauthorized":
            body = b'{"message": "invalid token"}'
            self.send_response(401)
        elif FakeHA.behaviour == "garbage":
            body = b"<html>oops</html>"
            self.send_response(200)
        else:
            body = json.dumps(FakeHA.states).encode()
            self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def request(url, method="GET", body=None):
    """Call the test server, returning (status, parsed json)."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            raw = response.read().decode()
            try:
                return response.status, json.loads(raw or "{}")
            except ValueError:
                return response.status, {"raw": raw}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            return exc.code, json.loads(raw)
        except ValueError:
            return exc.code, {"raw": raw}


class HATest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self._patched = {
            "HA_CONFIG": root / "ha-config.json",
            "DRAFTS_DIR": root / "drafts",
            "IMAGES_DIR": root / "images",
        }
        self._original = {name: getattr(server, name) for name in self._patched}
        for name, value in self._patched.items():
            setattr(server, name, value)
        server._ha_cache.update(key=None, at=0.0, data=None)
        server.delete_ha_config()

        FakeHA.behaviour = "ok"
        FakeHA.hits = 0
        FakeHA.last_auth = None
        FakeHA.states = [
            {"entity_id": "light.matter_kitchen_pendant", "state": "on",
             "attributes": {"friendly_name": "Kitchen pendant",
                            "supported_color_modes": ["brightness", "color_temp"]}},
            {"entity_id": "switch.tuya_plug_1", "state": "off",
             "attributes": {"friendly_name": "Plug 1"}},
            {"entity_id": "number.hallway_dimmer", "state": "42",
             "attributes": {"friendly_name": "Hallway dimmer", "unit_of_measurement": "%"}},
            {"entity_id": "binary_sensor.hall_motion", "state": "off",
             "attributes": {"friendly_name": "Hall motion", "device_class": "motion"}},
            {"entity_id": "person.echo", "state": "home",
             "attributes": {"friendly_name": "Echo"}},
            {"entity_id": "cover.lounge_blind", "state": "open",
             "attributes": {"friendly_name": "Lounge blind"}},
        ]
        self.fake = ThreadingHTTPServer(("127.0.0.1", 0), FakeHA)
        threading.Thread(target=self.fake.serve_forever, daemon=True).start()
        self.fake_url = "http://127.0.0.1:%d" % self.fake.server_address[1]

        self.app = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        threading.Thread(target=self.app.serve_forever, daemon=True).start()
        self.base = "http://127.0.0.1:%d" % self.app.server_address[1]

    def tearDown(self):
        self.app.shutdown()
        self.app.server_close()
        self.fake.shutdown()
        self.fake.server_close()
        for name, value in self._original.items():
            setattr(server, name, value)
        self.tmp.cleanup()

    def connect(self, url=None, token="long-lived-token"):
        return request(self.base + "/api/ha/config", "PUT",
                       {"url": url or self.fake_url, "token": token})

    # ------------------------------------------------------------ status

    def test_status_starts_empty_and_never_leaks_the_token(self):
        status, body = request(self.base + "/api/ha/status")
        self.assertEqual(status, 200)
        self.assertEqual(body, {"configured": False, "url": "", "tokenSet": False})

        status, body = self.connect()
        self.assertEqual(status, 200)
        self.assertTrue(body["configured"])
        self.assertTrue(body["tokenSet"])
        self.assertNotIn("long-lived-token", json.dumps(body))
        self.assertNotIn("token\"", json.dumps(body).replace("tokenSet", ""))

    def test_config_file_is_private_and_outside_static_reach(self):
        self.connect()
        path = Path(self._patched["HA_CONFIG"])
        self.assertTrue(path.is_file())
        self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)

        status, _ = request(self.base + "/temp/ha-config.json")
        self.assertEqual(status, 403)
        status, _ = request(self.base + "/temp/drafts/x.draft.json")
        self.assertEqual(status, 403)
        # ... while the page itself is still served
        status, _ = request(self.base + "/")
        self.assertEqual(status, 200)

    def test_blank_token_reuses_the_saved_one(self):
        self.connect(url="http://ha.local:8123", token="abc")
        status, body = request(self.base + "/api/ha/config", "PUT",
                               {"url": "http://ha.local:8123", "token": ""})
        self.assertEqual(status, 200)
        self.assertTrue(body["tokenSet"])
        self.assertEqual(json.loads(Path(self._patched["HA_CONFIG"]).read_text())["token"], "abc")

    def test_blank_token_for_an_unknown_url_is_refused(self):
        self.connect(url="http://ha.local:8123", token="abc")
        status, body = request(self.base + "/api/ha/config", "PUT",
                               {"url": "http://other.local:8123", "token": ""})
        self.assertEqual(status, 400)
        self.assertIn("token", body["error"])

    def test_bad_urls_are_refused(self):
        for bad in ["ftp://ha.local", "ha.local:8123", "http://sp ace.local",
                    "javascript:alert(1)"]:
            status, body = self.connect(url=bad, token="abc")
            self.assertEqual(status, 400, bad)
            self.assertIn("url", body["error"])

    def test_empty_url_forgets_everything(self):
        self.connect()
        status, body = request(self.base + "/api/ha/config", "PUT", {"url": "", "token": ""})
        self.assertEqual(status, 200)
        self.assertFalse(body["configured"])
        self.assertFalse(Path(self._patched["HA_CONFIG"]).exists())

        status, _ = request(self.base + "/api/ha/config", "DELETE")
        self.assertEqual(status, 200)
        status, body = request(self.base + "/api/ha/status")
        self.assertFalse(body["configured"])

    # ------------------------------------------------------------ entities

    def test_entities_need_a_connection_first(self):
        status, body = request(self.base + "/api/ha/entities")
        self.assertEqual(status, 503)
        self.assertIn("no Home Assistant", body["error"])

    def test_entities_are_forwarded_with_the_token_and_slimmed(self):
        self.connect()
        status, body = request(self.base + "/api/ha/entities?domains=light,switch,number")
        self.assertEqual(status, 200)
        self.assertEqual(FakeHA.last_auth, "Bearer long-lived-token")
        ids = [item["id"] for item in body["entities"]]
        self.assertEqual(ids, ["light.matter_kitchen_pendant", "switch.tuya_plug_1",
                               "number.hallway_dimmer"])
        first = body["entities"][0]
        self.assertEqual(first["name"], "Kitchen pendant")
        self.assertEqual(first["domain"], "light")
        self.assertTrue(first["dims"])
        # Only the fields the picker shows: no attributes, no token anywhere.
        self.assertEqual(set(first), {"id", "name", "state", "domain", "unit",
                                      "deviceClass", "dims"})
        self.assertNotIn("long-lived-token", json.dumps(body))

    def test_default_domains_cover_the_motion_and_person_pickers(self):
        self.connect()
        status, body = request(self.base + "/api/ha/entities")
        self.assertEqual(status, 200)
        domains = {item["domain"] for item in body["entities"]}
        self.assertEqual(domains, {"light", "switch", "number", "binary_sensor", "person"})

    def test_states_are_cached_briefly(self):
        self.connect()
        request(self.base + "/api/ha/entities")
        request(self.base + "/api/ha/entities")
        self.assertEqual(FakeHA.hits, 1)
        server._ha_cache.update(key=None, at=0.0, data=None)
        request(self.base + "/api/ha/entities")
        self.assertEqual(FakeHA.hits, 2)

    def test_saving_a_new_connection_drops_the_cache(self):
        self.connect()
        request(self.base + "/api/ha/entities")
        self.connect(token="second-token")
        request(self.base + "/api/ha/entities")
        self.assertEqual(FakeHA.hits, 2)
        self.assertEqual(FakeHA.last_auth, "Bearer second-token")

    def test_a_rejected_token_is_reported_as_such(self):
        self.connect()
        FakeHA.behaviour = "unauthorized"
        status, body = request(self.base + "/api/ha/entities")
        self.assertEqual(status, 401)
        self.assertIn("rejected", body["error"])

    def test_a_garbled_reply_is_reported_as_such(self):
        self.connect()
        FakeHA.behaviour = "garbage"
        status, body = request(self.base + "/api/ha/entities")
        self.assertEqual(status, 502)
        self.assertIn("JSON", body["error"])

    def test_an_unreachable_url_is_reported_as_such(self):
        # Bind a port and close it, so nothing is listening there.
        probe = ThreadingHTTPServer(("127.0.0.1", 0), FakeHA)
        dead = "http://127.0.0.1:%d" % probe.server_address[1]
        probe.server_close()
        self.connect(url=dead)
        status, body = request(self.base + "/api/ha/entities")
        self.assertEqual(status, 502)
        self.assertIn("could not reach", body["error"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
