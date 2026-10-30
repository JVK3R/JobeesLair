# Copyright (C) 2026 half144 and PS5 React contributors
# SPDX-License-Identifier: GPL-3.0-or-later
# Additional attribution term: see LICENSE-ATTRIBUTION.
"""Test server for the PS4 network layer: ranges, ETags, refusals, HTML pages, flaky answers and PNG images."""
import hashlib
import http.server
import json
import socketserver
import struct
import sys
import threading
import time
import zlib

FILE = bytes((i * 7 + (i >> 9)) & 255 for i in range(3 * 1024 * 1024 + 123))
ETAG = '"' + hashlib.sha256(FILE).hexdigest()[:16] + '"'
counts = {}
lock = threading.Lock()


def png(width, height, seed):
    rows = []
    for y in range(height):
        row = bytearray(b"\x00")
        for x in range(width):
            row += bytes(((x * seed + y) & 255, (y * 3) & 255, (x + seed) & 255, 255))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) +
            chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def send_body(self, status, body, kind="application/octet-stream", extra=()):
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        for name, value in extra:
            self.send_header(name, value)
        self.end_headers()
        if self.command != "HEAD":
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def serve_file(self, ranged, slow):
        start = 0
        header = self.headers.get("Range")
        if_range = self.headers.get("If-Range")
        status, extra = 200, [("ETag", ETAG), ("Accept-Ranges", "bytes" if ranged else "none")]
        if ranged and header and header.startswith("bytes=") and (not if_range or if_range == ETAG):
            start = int(header[6:].split("-")[0])
            status = 206
            extra.append(("Content-Range", f"bytes {start}-{len(FILE) - 1}/{len(FILE)}"))
        body = FILE[start:]
        self.send_response(status)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        for name, value in extra:
            self.send_header(name, value)
        self.end_headers()
        try:
            for i in range(0, len(body), 64 * 1024):
                self.wfile.write(body[i:i + 64 * 1024])
                if slow:
                    time.sleep(0.05)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        data = self.rfile.read(length)
        self.send_body(200, json.dumps({"got": data.decode(), "method": "POST"}).encode(), "application/json")

    def do_GET(self):
        path = self.path.split("?")[0]
        with lock:
            counts[path] = counts.get(path, 0) + 1
            count = counts[path]
        if path == "/json":
            self.send_body(200, b'{"hello":"ps4"}', "application/json", [("ETag", '"j1"'), ("Set-Cookie", "secret=1")])
        elif path == "/big":
            self.send_body(200, b"x" * (6 * 1024 * 1024))
        elif path == "/file":
            self.serve_file(True, False)
        elif path == "/slowfile":
            self.serve_file(True, True)
        elif path == "/norange":
            self.serve_file(False, "slow" in self.path)
        elif path == "/deny":
            self.send_body(403, b"no")
        elif path == "/html":
            self.send_body(200, b"<!doctype html><p>check</p>", "text/html; charset=utf-8")
        elif path == "/fail500":
            self.send_body(500, b"down")
        elif path == "/flaky":
            if count <= 2:
                self.send_body(503, b"busy", extra=[("Retry-After", "0")])
            else:
                self.send_body(200, b"steady now", "text/plain")
        elif path == "/notfound":
            self.send_body(404, b"missing")
        elif path.startswith("/img/"):
            name = path[5:].split(".")[0]
            if name == "missing":
                self.send_body(404, b"no")
            else:
                seed = int(name) if name.isdigit() else 3
                if seed >= 90:
                    time.sleep(1.5)
                self.send_body(200, png(64 + seed, 48 + seed, seed), "image/png")
        elif path == "/reset":
            with lock:
                counts.clear()
            self.send_body(200, b"ok")
        else:
            self.send_body(404, b"unknown")


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    port = int(sys.argv[1])
    open(sys.argv[2], "w").write(hashlib.sha256(FILE).hexdigest() + " " + str(len(FILE)) + "\n")
    Server(("127.0.0.1", port), Handler).serve_forever()
