"""
Piper text-to-speech for the Lernwelt API: POST /synthesize renders one text as MP3.

Reachable only from the API on an internal Docker network. The API decides what
may be spoken and caches the result; this service only renders.
"""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import lameenc
from piper import PiperVoice, SynthesisConfig

VOICE_DIR = Path(os.environ.get('VOICE_DIR', '/voices'))
PORT = int(os.environ.get('PORT', '5000'))
MAX_TEXT = 500
MAX_BODY = 4096

VOICES = {path.stem: PiperVoice.load(str(path)) for path in sorted(VOICE_DIR.glob('*.onnx'))}
# One rendering at a time: the server has few cores, and the API caches anyway.
render_lock = threading.Lock()


def render(voice: PiperVoice, text: str, length_scale: float) -> bytes:
    with render_lock:
        chunks = list(voice.synthesize(text, syn_config=SynthesisConfig(length_scale=length_scale)))
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(32)
    encoder.set_in_sample_rate(voice.config.sample_rate)
    encoder.set_channels(1)
    encoder.set_quality(2)
    mp3 = b''.join(encoder.encode(c.audio_int16_bytes) for c in chunks)
    return mp3 + encoder.flush()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == '/health':
            self.reply(200, 'application/json', json.dumps({'ok': True, 'voices': sorted(VOICES)}).encode())
        else:
            self.reply(404, 'application/json', b'{"error":"not_found"}')

    def do_POST(self) -> None:
        if self.path != '/synthesize':
            self.reply(404, 'application/json', b'{"error":"not_found"}')
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BODY:
                raise ValueError('body size')
            body = json.loads(self.rfile.read(length))
            voice = VOICES[body['voice']]
            text = body['text']
            length_scale = float(body.get('lengthScale', 1.0))
            if not isinstance(text, str) or not 0 < len(text) <= MAX_TEXT or not 0.5 <= length_scale <= 2.5:
                raise ValueError('invalid request')
        except (ValueError, KeyError, TypeError):
            self.reply(400, 'application/json', b'{"error":"invalid_request"}')
            return
        self.reply(200, 'audio/mpeg', render(voice, text, length_scale))

    def reply(self, status: int, content_type: str, data: bytes) -> None:
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: object) -> None:
        # No access log: the texts are not stored (see datenschutz.html).
        pass


if __name__ == '__main__':
    print(f'lernwelt tts listening on :{PORT} with voices {sorted(VOICES)}', flush=True)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
