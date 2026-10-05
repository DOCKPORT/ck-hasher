"""Vercel serverless function for the Bitcoin network data.

Handle GET /api/network. Fetch the block height and the mining statistics from
mempool.space, and return one small JSON with the height, the network
difficulty, and the network hashrate. Vercel runs this file as a function, one
call per request. The local dev_server.py imports fetch_network from this file,
so the core logic lives in one place.

The frontend calls the same path, /api/network, in both places.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler

HEIGHT_URL = "https://mempool.space/api/blocks/tip/height"
STATS_URL = "https://mempool.space/api/v1/mining/hashrate/3d"
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


def _read_network() -> tuple[int, object]:
    """Fetch and shape the network data from mempool.space."""
    with ThreadPoolExecutor(max_workers=2) as pool:
        height_future = pool.submit(_fetch, HEIGHT_URL)
        stats_future = pool.submit(_fetch, STATS_URL)
        height_body = height_future.result()
        stats_body = stats_future.result()
    if height_body is None or stats_body is None:
        return 502, {"error": "mempool unreachable"}

    try:
        height = int(height_body.decode("utf-8", "replace").strip())
    except ValueError:
        return 502, {"error": "bad height reply"}

    try:
        stats = json.loads(stats_body)
        difficulty = float(stats["currentDifficulty"])
        hashrate = float(stats["currentHashrate"])
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        return 502, {"error": "bad stats reply"}

    return 200, {
        "height": height,
        "difficulty": difficulty,
        "hashrate": hashrate,
    }


def fetch_network() -> tuple[int, object]:
    """Return the network data, with a short cache when the cache is on.

    Returns:
        A pair of the HTTP status and the JSON-ready payload.
    """
    if CACHE_SECONDS > 0:
        payload = _CACHE["payload"]
        age = time.monotonic() - float(_CACHE["time"])
        if payload is not None and age < CACHE_SECONDS:
            return 200, payload

    status, payload = _read_network()
    if status == 200 and CACHE_SECONDS > 0:
        _CACHE["payload"] = payload
        _CACHE["time"] = time.monotonic()
    return status, payload


class handler(BaseHTTPRequestHandler):
    """The Vercel entrypoint. Vercel calls this class per request."""

    def do_GET(self) -> None:
        status_code, payload = fetch_network()
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
