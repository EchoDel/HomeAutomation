"""Stand-in Home Assistant: the same /api/states shape, correct auth checking.

Used by e2e-check.js. Port 0 picks a free one and prints `PORT <n>` so the
caller knows where it landed.

Run:  python3 fake_ha.py [port]
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATES = [
    {"entity_id": "light.matter_kitchen_pendant", "state": "on",
     "attributes": {"friendly_name": "Kitchen pendant", "supported_color_modes": ["brightness"]}},
    {"entity_id": "switch.tuya_plug_1", "state": "off",
     "attributes": {"friendly_name": "Smart Life plug"}},
    {"entity_id": "number.hallway_dimmer", "state": "42",
     "attributes": {"friendly_name": "Hallway dimmer", "unit_of_measurement": "%"}},
    {"entity_id": "binary_sensor.hall_motion", "state": "off",
     "attributes": {"friendly_name": "Hall motion", "device_class": "motion"}},
    {"entity_id": "person.echo", "state": "home", "attributes": {"friendly_name": "Echo"}},
]
TOKEN = "e2e-token"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):          # keep the test output clean
        pass

    def do_GET(self):
        authorised = self.headers.get("Authorization") == "Bearer " + TOKEN
        body = (json.dumps(STATES).encode() if authorised
                else b'{"message": "unauthorized"}')
        self.send_response(200 if authorised else 401)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("PORT %d" % server.server_address[1], flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
