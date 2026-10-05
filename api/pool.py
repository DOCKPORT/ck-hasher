"""Vercel serverless function for the ckpool pool hashrate.

Handle GET /api/pool. Fetch the pool status from solo.ckpool.org and return the
one minute hashrate. The status file is NDJSON: one JSON object per line, so the
body is read line by line. This source is separate from mempool, so a failure
here does not touch the network data. Vercel runs this file as a function, one
call per request. The local dev_server.py imports fetch_pool_hashrate from this
file, so the core logic lives in one place.

The frontend calls the same path, /api/pool, in both places.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler

POOL_STATUS_URL = "https://solo.ckpool.org/pool/pool.status"
TIMEOUT_SECONDS = 15
# The cache time in seconds. 0 turns the cache off.
CACHE_SECONDS = 60

# The last good payload and the time of the fetch. time.monotonic keeps the
# value immune to a clock change.
_CACHE: dict[str, object] = {"time": 0.0, "payload": None}


def _fetch(url: str) -> bytes | None:
    """Return the reply body, or None on a failure."""
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_SECONDS) as reply:
            return reply.read()
    except (urllib.error.URLError, TimeoutError, OSError):
        return None


def _read_pool_hashrate() -> tuple[int, object]:
    """Fetch the pool status and shape the one minute hashrate."""
    body = _fetch(POOL_STATUS_URL)
    if body is None:
        return 502, {"error": "pool unreachable"}

    text = body.decode("utf-8", "replace")
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        try:
            record = json.loads(stripped)
        except json.JSONDecodeError:
            continue
        if isinstance(record, dict) and "hashrate1m" in record:
            return 200, {"hashrate": record["hashrate1m"]}

    return 502, {"error": "bad pool reply"}


def fetch_pool_hashrate() -> tuple[int, object]:
    """Return the pool hashrate, with a short cache when the cache is on.

    Returns:
        A pair of the HTTP status and the JSON-ready payload.
    """
    if CACHE_SECONDS > 0:
        payload = _CACHE["payload"]
        age = time.monotonic() - float(_CACHE["time"])
        if payload is not None and age < CACHE_SECONDS:
            return 200, payload

    status, payload = _read_pool_hashrate()
    if status == 200 and CACHE_SECONDS > 0:
        _CACHE["payload"] = payload
        _CACHE["time"] = time.monotonic()
    return status, payload


class handler(BaseHTTPRequestHandler):
    """The Vercel entrypoint. Vercel calls this class per request."""

    def do_GET(self) -> None:
        status_code, payload = fetch_pool_hashrate()
        self._send_json(status_code, payload)

    def _send_json(self, status_code: int, payload: object) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        if CACHE_SECONDS > 0:
            self.send_header(
                "Cache-Control",
                f"public, s-maxage={CACHE_SECONDS}, "
                f"stale-while-revalidate={CACHE_SECONDS * 2}, max-age=0",
            )
        else:
            self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
