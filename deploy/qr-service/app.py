"""Small internal-only QR SVG renderer. It never persists or logs token payloads."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import json
import os

from qrcode import QRCode
from qrcode.constants import ERROR_CORRECT_M
from qrcode.image.svg import SvgPathImage

TOKEN = os.environ.get("INTERNAL_SERVICE_TOKEN", "")
HOST = "0.0.0.0"
PORT = int(os.environ.get("QR_SERVICE_PORT", "8000"))
MAX_BODY = 2048

class Handler(BaseHTTPRequestHandler):
    server_version = "NHQR/1.0"

    def log_message(self, format, *args):
        # Avoid logging secrets embedded in the QR content or Authorization header.
        return

    def _json(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"status": "ok"})
        else:
            self._json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/internal/render":
            self._json(404, {"error": "not_found"})
            return
        auth = self.headers.get("Authorization", "")
        presented = auth[7:] if auth.startswith("Bearer ") else ""
        if not TOKEN or not hmac.compare_digest(presented, TOKEN):
            self._json(401, {"error": "unauthorized"})
            return
        length = self.headers.get("Content-Length", "")
        try:
            size = int(length)
        except ValueError:
            self._json(411, {"error": "content_length_required"})
            return
        if size < 1 or size > MAX_BODY:
            self._json(413, {"error": "payload_too_large"})
            return
        try:
            body = json.loads(self.rfile.read(size))
            payload = body.get("text") if isinstance(body, dict) else None
            if not isinstance(payload, str) or not payload or len(payload) > 512:
                self._json(422, {"error": "invalid_text"})
                return
            qr = QRCode(version=None, error_correction=ERROR_CORRECT_M, box_size=5, border=3)
            qr.add_data(payload)
            qr.make(fit=True)
            image = qr.make_image(image_factory=SvgPathImage)
            from io import BytesIO
            output = BytesIO()
            image.save(output)
            raw = output.getvalue()
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store, max-age=0")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(raw)
        except (ValueError, TypeError, json.JSONDecodeError):
            self._json(400, {"error": "invalid_request"})
        except Exception:
            self._json(500, {"error": "render_failed"})

if __name__ == "__main__":
    if not TOKEN:
        raise RuntimeError("INTERNAL_SERVICE_TOKEN must be set")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
