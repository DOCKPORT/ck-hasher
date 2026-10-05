#!/usr/bin/env python3
"""Local development server for ck-hasher.

Serve the static page and answer the pool lookup under /api/user. The lookup
logic lives in api/user.py, which Vercel runs as a function. So one copy of the
logic serves both places. The route proxies to ckpool, because ckpool sends no
CORS header.

Run:
    python3 dev_server.py [port]
"""  # noqa: EXE001

from __future__ import annotations

import json
import sys
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from api.user import lookup_user

HOST = "127.0.0.1"
DEFAULT_PORT = 8000
ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    """Serve the static files and proxy the pool lookup."""

    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/user":
            query = urllib.parse.parse_qs(parsed.query)
            address = (query.get("address") or [""])[0].strip()
            status_code, payload = lookup_user(address)
            self._send_json(status_code, payload)
            return
        super().do_GET()

    def _send_json(self, status_code: int, payload: object) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        sys.stderr.write(f"{self.address_string()} - {format % args}\n")


def main() -> None:
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            sys.stderr.write("port must be a number\n")
            raise SystemExit(2)

    server = ThreadingHTTPServer((HOST, port), Handler)
    sys.stderr.write(f"ck-hasher dev server on http://{HOST}:{port}/\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.stderr.write("\nstopped\n")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
