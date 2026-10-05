"""Vercel serverless function for the ckpool user lookup.

Handle GET /api/user?address=<address>. The route proxies the request to
ckpool, because ckpool sends no CORS header. Vercel runs this file as a
function, one call per request. The local dev_server.py imports lookup_user
from this file, so the core logic lives in one place.

The frontend calls the same path, /api/user, in both places.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

POOL_USERS = "https://solo.ckpool.org/users/"
ADDRESS_PATTERN = re.compile(
    r"^(bc1[a-z0-9]{25,89}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$"
)
TIMEOUT_SECONDS = 15


def lookup_user(address: str) -> tuple[int, object]:
    """Look one address up on the pool.

    Args:
        address: The Bitcoin address.

    Returns:
        A pair of the HTTP status and the JSON-ready payload.
    """
    if not ADDRESS_PATTERN.match(address):
        return 400, {"error": "invalid address"}

    url = POOL_USERS + urllib.parse.quote(address)
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_SECONDS) as reply:
            body = reply.read()
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return 404, {"error": "no miner found"}
        return 502, {"error": f"pool error {error.code}"}
    except (urllib.error.URLError, TimeoutError, OSError):
        return 502, {"error": "pool unreachable"}

    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return 502, {"error": "bad pool reply"}

    return 200, data


class handler(BaseHTTPRequestHandler):
    """The Vercel entrypoint. Vercel calls this class per request."""

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        address = (query.get("address") or [""])[0].strip()
        status_code, payload = lookup_user(address)
        self._send_json(status_code, payload)

    def _send_json(self, status_code: int, payload: object) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
