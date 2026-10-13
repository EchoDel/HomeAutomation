#!/usr/bin/env python3
"""Tiny file-backed server for the Lighting Dashboard Builder.

Run it from this folder:

    python3 server.py                 # http://127.0.0.1:8765
    python3 server.py --port 9000     # different port
    python3 server.py --host 0.0.0.0  # reachable from other machines

It serves the builder page and adds just enough of a REST API to keep drafts
and uploaded base images on disk:

    GET    /api/health                     status, draft dir, repo image dir
    GET    /api/drafts                     list of saved drafts
    GET    /api/draft?name=<name>          one draft (JSON)
    PUT    /api/draft?name=<name>          create/overwrite a draft
    DELETE /api/draft?name=<name>          delete a draft
    GET    /api/base-images                floor plans found in the parent folder
    POST   /api/base-image?name=<name>     copy one of them into temp/images
    PUT    /api/image?name=<name>          store an uploaded base image
    GET    /api/image?name=<name>          read a stored base image
    GET    /api/image?path=<local path>    resolve a /local/... path for preview
    DELETE /api/image?name=<name>          remove a stored base image

    GET    /api/ha/status                  is a Home Assistant URL/token set?
    PUT    /api/ha/config                  save {url, token}; empty url disconnects
    DELETE /api/ha/config                  forget the URL and token
    GET    /api/ha/entities?domains=...    states from HA, slimmed for the picker

The Home Assistant token is used only to read /api/states. It lives in
temp/ha-config.json (git-ignored), is never returned to the page and is never
written into a draft or the generated YAML.

No third party packages: standard library only, Python 3.8+.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import shutil
import sys
import threading
import time
from datetime import datetime, timezone
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

HERE = Path(__file__).resolve().parent
REPO_LIGHTS = HERE.parent          # LightingControls/
DRAFTS_DIR = HERE / "temp" / "drafts"
IMAGES_DIR = HERE / "temp" / "images"
HA_CONFIG = HERE / "temp" / "ha-config.json"
MAX_BODY = 12 * 1024 * 1024        # 12 MB, plenty for a floor plan
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"}
LOCK = threading.Lock()

SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]{0,80}$")
BLOCKED = {"", ".", "..", "drafts", "images"}

HA_TIMEOUT = 8                 # seconds to ask Home Assistant for states
HA_CACHE_TTL = 20              # reuse a states reply briefly, pickers refetch often
HA_DEFAULT_DOMAINS = "light,switch,number,binary_sensor,person"
_ha_cache: dict = {"key": None, "at": 0.0, "data": None}


class HAError(Exception):
    """A problem talking to Home Assistant, with the status to answer with."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def safe_name(raw: str | None, fallback: str = "unnamed") -> str:
    """Reduce user input to a harmless file name."""
    name = Path((raw or "").strip()).name          # strips any directory part
    name = re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip(" .")
    if not name or name.lower() in BLOCKED:
        return fallback
    if not SAFE_NAME.match(name):
        return fallback
    return name


def safe_image_name(raw: str | None) -> str:
    """Image file names avoid whitespace so the /local/ path stays clean."""
    name = safe_name(raw, "image.png")
    stem, dot, suffix = name.rpartition(".")
    if not dot:
        stem, suffix = name, "png"
    stem = re.sub(r"\s+", "_", stem).strip("_") or "image"
    return "%s.%s" % (stem, suffix.lower())


def draft_path(name: str) -> Path:
    return DRAFTS_DIR / (safe_name(name) + ".draft.json")


def image_path(name: str) -> Path:
    return IMAGES_DIR / safe_image_name(name)


def public_image_path(name: str) -> str:
    """The /local/ path a Home Assistant user should copy the file to."""
    return "/local/lighting/" + safe_image_name(name)


def resolve_image_path(raw: str | None) -> Path | None:
    """Map a /local/... path (or a bare file name) onto a file we can serve.

    The builder stores a Home Assistant path like /local/lighting/floor1.png,
    but the file itself lives either in temp/images/ (uploaded or copied) or
    still in the repo folder. Looking the name up in both places is what lets
    the canvas preview a path the user typed by hand.
    """
    wanted = Path(unquote(raw or "")).name
    if not wanted or not wanted.lower().endswith(tuple(IMAGE_SUFFIXES)):
        return None

    def normalise(text: str) -> str:
        return re.sub(r"[\s_]+", "", text).lower()

    direct = image_path(wanted)
    if direct.is_file():
        return direct

    repo = REPO_LIGHTS / wanted
    if repo.is_file():
        return repo

    target = normalise(Path(wanted).stem)
    if not target:
        return None
    for folder in (IMAGES_DIR, REPO_LIGHTS):
        for candidate in sorted(folder.rglob("*")):
            if not candidate.is_file():
                continue
            if candidate.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            if normalise(candidate.stem) == target:
                return candidate
    return None


def load_ha_config() -> dict | None:
    """Read the stored Home Assistant URL and token, if there is a usable one."""
    try:
        data = json.loads(HA_CONFIG.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    url = str(data.get("url") or "").strip().rstrip("/")
    token = str(data.get("token") or "").strip()
    if not token:
        return None
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    if any(ch.isspace() for ch in url):
        return None
    return {"url": url, "token": token}


def save_ha_config(url: str | None, token: str | None) -> dict:
    """Store the connection. An empty URL or token clears it instead.

    The file sits in temp/, which is git-ignored wholesale, and is written
    readable by the owner only because it holds a long lived token.
    """
    clean_url = (url or "").strip().rstrip("/")
    clean_token = (token or "").strip()
    parsed = urlparse(clean_url)
    if clean_url and (parsed.scheme not in {"http", "https"} or not parsed.netloc):
        raise ValueError("url must be an absolute http:// or https:// address")
    if any(ch.isspace() for ch in clean_url):
        raise ValueError("url must not contain spaces")
    if not clean_url or not clean_token:
        if clean_url and not clean_token:
            # The page cannot resend a token it never sees: changing the URL
            # alone keeps the token already on disk, if it belongs to it.
            stored = load_ha_config()
            if stored and stored["url"] == clean_url:
                clean_token = stored["token"]
            else:
                raise ValueError("a long lived token is required for that URL")
        else:
            delete_ha_config()
            return ha_status()

    ensure_dirs()
    payload = json.dumps({"url": clean_url, "token": clean_token}, indent=2)
    tmp = HA_CONFIG.with_suffix(".tmp")
    tmp.write_text(payload, encoding="utf-8")
    try:
        os.chmod(tmp, 0o600)
    except OSError:                      # pragma: no cover - platform dependent
        pass
    tmp.replace(HA_CONFIG)
    _ha_cache.update(key=None, at=0.0, data=None)
    return ha_status()


def delete_ha_config() -> None:
    try:
        HA_CONFIG.unlink()
    except OSError:
        pass
    _ha_cache.update(key=None, at=0.0, data=None)


def ha_status() -> dict:
    """What the page may know about the connection: never the token itself."""
    cfg = load_ha_config()
    return {
        "configured": bool(cfg),
        "url": cfg["url"] if cfg else "",
        "tokenSet": bool(cfg and cfg["token"]),
    }


def _ha_request(cfg: dict, path: str) -> list:
    request = urllib.request.Request(
        cfg["url"] + path,
        headers={
            "Authorization": "Bearer " + cfg["token"],
            "Accept": "application/json",
            "User-Agent": "LightingDashboardBuilder/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=HA_TIMEOUT) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise HAError(401, "Home Assistant rejected the token (HTTP %d)" % exc.code)
        raise HAError(502, "Home Assistant answered with HTTP %d" % exc.code)
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        if isinstance(reason, TimeoutError) or "timed out" in str(reason):
            raise HAError(504, "Home Assistant did not answer within %ds" % HA_TIMEOUT)
        raise HAError(502, "could not reach Home Assistant: %s" % reason)
    except TimeoutError:
        raise HAError(504, "Home Assistant did not answer within %ds" % HA_TIMEOUT)
    try:
        return json.loads(raw.decode("utf-8"))
    except ValueError as exc:
        raise HAError(502, "Home Assistant did not return JSON: %s" % exc)


def fetch_ha_entities(domains: str | None) -> list[dict]:
    """States from HA, stripped to what the entity pickers actually show."""
    cfg = load_ha_config()
    if not cfg:
        raise HAError(503, "no Home Assistant URL and token saved yet")

    wanted = [d.strip().lower() for d in (domains or HA_DEFAULT_DOMAINS).split(",") if d.strip()]
    all_domains = "all" in wanted
    key = (cfg["url"], cfg["token"], tuple(sorted(set(wanted))))
    now = time.time()
    if _ha_cache["key"] == key and _ha_cache["data"] is not None and now - _ha_cache["at"] < HA_CACHE_TTL:
        return _ha_cache["data"]

    states = _ha_request(cfg, "/api/states")
    if not isinstance(states, list):
        raise HAError(502, "Home Assistant returned an unexpected states reply")

    out = []
    for item in states:
        if not isinstance(item, dict):
            continue
        entity_id = item.get("entity_id")
        if not isinstance(entity_id, str) or "." not in entity_id:
            continue
        domain = entity_id.split(".", 1)[0]
        if not all_domains and domain not in wanted:
            continue
        attrs = item.get("attributes") or {}
        if not isinstance(attrs, dict):
            attrs = {}
        modes = attrs.get("supported_color_modes")
        out.append({
            "id": entity_id,
            "name": attrs.get("friendly_name") or entity_id.split(".", 1)[1],
            "state": item.get("state"),
            "domain": domain,
            "unit": attrs.get("unit_of_measurement"),
            "deviceClass": attrs.get("device_class"),
            "dims": isinstance(modes, list) and "brightness" in modes,
        })
    _ha_cache.update(key=key, at=now, data=out)
    return out


def ensure_dirs() -> None:
    """Create the scratch folders and keep them out of git."""
    for folder in (HERE / "temp", DRAFTS_DIR, IMAGES_DIR):
        folder.mkdir(parents=True, exist_ok=True)
    keep = HERE / "temp" / ".gitignore"
    if not keep.exists():
        keep.write_text("# Drafts and uploaded floor plans saved by server.py\n*\n!.gitignore\n",
                        encoding="utf-8")


def draft_entries() -> list[dict]:
    ensure_dirs()
    out = []
    for path in sorted(DRAFTS_DIR.glob("*.draft.json")):
        try:
            stat = path.stat()
        except OSError:
            continue
        out.append({
            "name": path.name[: -len(".draft.json")],
            "bytes": stat.st_size,
            "updated": datetime.fromtimestamp(stat.st_mtime, timezone.utc)
                        .isoformat(timespec="seconds")
                        .replace("+00:00", "Z"),
        })
    out.sort(key=lambda item: item["updated"], reverse=True)
    return out


def repo_images() -> list[dict]:
    """Floor plans that already sit in LightingControls/ (e.g. Floor1.png)."""
    if not REPO_LIGHTS.is_dir():
        return []
    out = []
    for path in sorted(REPO_LIGHTS.iterdir()):
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES:
            out.append({
                "name": path.name,
                "bytes": path.stat().st_size,
                "suggestedPath": "/local/lighting/" + path.name,
            })
    return out


class Handler(BaseHTTPRequestHandler):
    server_version = "LightingBuilder/1.0"
    protocol_version = "HTTP/1.1"

    # ------------------------------------------------------------- utilities

    def log_message(self, fmt: str, *args) -> None:
        if "--verbose" in sys.argv:
            sys.stderr.write("%s  %s\n" % (self.log_date_time_string(), fmt % args))

    def _send(self, code: int, body: bytes, content_type: str,
              extra: dict | None = None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, payload, code: int = 200) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")
        self._send(code, body, "application/json; charset=utf-8")

    def _error(self, code: int, message: str) -> None:
        self._json({"error": message}, code)

    def _ha_error(self, exc: HAError) -> None:
        self._json({"error": exc.message}, exc.status)

    def _body(self) -> bytes:
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            raise ValueError("body too large (%d bytes, limit %d)" % (length, MAX_BODY))
        if length <= 0:
            return b""
        return self.rfile.read(length)

    def _query(self) -> dict:
        raw = parse_qs(urlparse(self.path).query)
        return {key: values[0] for key, values in raw.items()}

    # ----------------------------------------------------------------- routes

    def do_HEAD(self) -> None:            # noqa: N802
        self.do_GET()

    def do_GET(self) -> None:             # noqa: N802
        route = urlparse(self.path).path
        try:
            if route == "/api/health":
                return self._json({
                    "ok": True,
                    "server": "LightingBuilder",
                    "draftsDir": str(DRAFTS_DIR),
                    "imagesDir": str(IMAGES_DIR),
                    "repoLights": str(REPO_LIGHTS),
                    "time": time.strftime("%Y-%m-%dT%H:%M:%S"),
                })
            if route == "/api/drafts":
                return self._json(draft_entries())
            if route == "/api/draft":
                return self.get_draft()
            if route == "/api/base-images":
                return self._json(repo_images())
            if route == "/api/image":
                return self.get_image()
            if route == "/api/ha/status":
                return self._json(ha_status())
            if route == "/api/ha/entities":
                return self.get_ha_entities()
            return self.serve_static(route)
        except Exception as exc:                          # noqa: BLE001
            self._error(500, str(exc))

    def do_PUT(self) -> None:              # noqa: N802
        route = urlparse(self.path).path
        try:
            if route == "/api/draft":
                return self.put_draft()
            if route == "/api/image":
                return self.put_image()
            if route == "/api/ha/config":
                return self.put_ha_config()
            return self._error(404, "unknown endpoint")
        except ValueError as exc:
            self._error(413, str(exc))
        except Exception as exc:                          # noqa: BLE001
            self._error(500, str(exc))

    def do_POST(self) -> None:             # noqa: N802
        route = urlparse(self.path).path
        try:
            if route == "/api/base-image":
                return self.copy_repo_image()
            if route == "/api/draft":
                return self.put_draft()
            if route == "/api/ha/config":
                return self.put_ha_config()
            return self._error(404, "unknown endpoint")
        except ValueError as exc:
            self._error(413, str(exc))
        except Exception as exc:                          # noqa: BLE001
            self._error(500, str(exc))

    def do_DELETE(self) -> None:           # noqa: N802
        route = urlparse(self.path).path
        try:
            query = self._query()
            if route == "/api/draft":
                path = draft_path(query.get("name", ""))
                with LOCK:
                    if path.exists():
                        path.unlink()
                        return self._json({"deleted": path.name})
                    return self._json({"deleted": None}, 404)
            if route == "/api/image":
                path = image_path(query.get("name", ""))
                with LOCK:
                    if path.exists():
                        path.unlink()
                        return self._json({"deleted": path.name})
                    return self._json({"deleted": None}, 404)
            if route == "/api/ha/config":
                with LOCK:
                    delete_ha_config()
                return self._json({"configured": False})
            return self._error(404, "unknown endpoint")
        except Exception as exc:                          # noqa: BLE001
            self._error(500, str(exc))

    # -------------------------------------------------------------- handlers

    def get_draft(self) -> None:
        path = draft_path(self._query().get("name", ""))
        if not path.is_file():
            return self._error(404, "draft not found")
        self._send(200, path.read_bytes(), "application/json; charset=utf-8")

    def put_draft(self) -> None:
        name = self._query().get("name", "")
        if not safe_name(name, ""):
            return self._error(400, "bad draft name")
        raw = self._body()
        if not raw:
            return self._error(400, "empty body")
        try:
            json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError) as exc:
            return self._error(400, "draft is not valid JSON: %s" % exc)
        path = draft_path(name)
        with LOCK:
            tmp = path.with_suffix(".tmp")
            tmp.write_bytes(raw)
            tmp.replace(path)
        stat = path.stat()
        return self._json({
            "name": path.name[: -len(".draft.json")],
            "bytes": stat.st_size,
            "updated": datetime.fromtimestamp(stat.st_mtime, timezone.utc)
                        .isoformat(timespec="seconds").replace("+00:00", "Z"),
        })

    def get_image(self) -> None:
        query = self._query()
        path = resolve_image_path(query.get("name", "") or query.get("path", ""))
        if not path or not path.is_file():
            return self._error(404, "image not found")
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self._send(200, path.read_bytes(), ctype)

    def put_image(self) -> None:
        name = self._query().get("name", "image")
        if Path(name).suffix.lower() not in IMAGE_SUFFIXES:
            name = Path(name).stem + ".png"
        data = self._body()
        if not data:
            return self._error(400, "empty image")
        path = image_path(name)
        with LOCK:
            path.write_bytes(data)
        return self._json({
            "file": path.name,
            "path": public_image_path(path.name),
            "bytes": len(data),
        })
    def get_ha_entities(self) -> None:
        query = self._query()
        try:
            entities = fetch_ha_entities(query.get("domains", HA_DEFAULT_DOMAINS))
        except HAError as exc:
            return self._ha_error(exc)
        self._json({"entities": entities, "count": len(entities)})

    def put_ha_config(self) -> None:
        raw = self._body()
        try:
            data = json.loads(raw.decode("utf-8")) if raw else {}
        except (ValueError, UnicodeDecodeError) as exc:
            return self._error(400, "body is not JSON: %s" % exc)
        if not isinstance(data, dict):
            return self._error(400, "expected an object with url and token")
        try:
            with LOCK:
                status = save_ha_config(data.get("url"), data.get("token"))
        except ValueError as exc:
            return self._error(400, str(exc))
        return self._json(status)

    def copy_repo_image(self) -> None:
        name = self._query().get("name", "")
        source = REPO_LIGHTS / Path(name).name
        if not source.is_file() or source.suffix.lower() not in IMAGE_SUFFIXES:
            return self._error(404, "no such image in %s" % REPO_LIGHTS)
        target = image_path(source.name)
        with LOCK:
            shutil.copyfile(source, target)
        return self._json({
            "file": target.name,
            "path": public_image_path(target.name),
            "bytes": target.stat().st_size,
            "copiedFrom": str(source),
        })

    def serve_static(self, route: str) -> None:
        rel = route.lstrip("/") or "index.html"
        candidate = (HERE / rel).resolve()
        if not str(candidate).startswith(str(HERE)):
            return self._error(403, "forbidden")
        # temp/ holds drafts and the Home Assistant token. Everything the page
        # needs from it is served through /api/image and /api/draft instead.
        if candidate == (HERE / "temp") or str(candidate).startswith(str(HERE / "temp") + os.sep):
            return self._error(403, "forbidden")
        if candidate.is_dir():
            candidate = candidate / "index.html"
        if not candidate.is_file():
            return self._error(404, "not found: %s" % rel)
        ctype = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript",
                                                  "application/json"):
            ctype += "; charset=utf-8"
        self._send(200, candidate.read_bytes(), ctype)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--host", default="127.0.0.1",
                        help="interface to bind (default 127.0.0.1, localhost only)")
    parser.add_argument("--port", type=int, default=8765, help="port (default 8765)")
    parser.add_argument("--verbose", action="store_true", help="log every request")
    args = parser.parse_args()

    ensure_dirs()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    url = "http://%s:%d/" % (args.host, args.port)
    print("Lighting Dashboard Builder")
    print("  page    %s" % url)
    print("  drafts  %s" % DRAFTS_DIR)
    print("  images  %s" % IMAGES_DIR)
    print("  floor plans read from %s" % REPO_LIGHTS)
    print("  Ctrl+C to stop", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
