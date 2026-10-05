"""Downloads a Piper voice file and checks its SHA-256 (image build only)."""
import hashlib
import sys
import urllib.request
from pathlib import Path

url, expected, dest = sys.argv[1:4]
data = urllib.request.urlopen(url, timeout=120).read()
actual = hashlib.sha256(data).hexdigest()
if actual != expected:
    sys.exit(f'checksum mismatch for {url}: {actual}')
Path(dest).write_bytes(data)
