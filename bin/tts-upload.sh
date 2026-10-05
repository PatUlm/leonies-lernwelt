#!/usr/bin/env bash
#
# Puts the checked recordings from .data/tts/en (scripts/render-speech.ts) into
# the volume lernwelt_data on netcup1 (/data/tts/en), replacing the old ones in
# one step. The API serves them at once; no deploy needed.
#
# Usage: bin/tts-upload.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=".data/tts/en"
export DOCKER_HOST="ssh://netcup1"

count=$(find "${SRC}" -maxdepth 1 -name '*.mp3' | wc -l)
if [ "${count}" -eq 0 ]; then
  echo "ERROR: no recordings in ${SRC} - run node scripts/render-speech.ts first." >&2
  exit 1
fi

echo "==> Uploading ${count} recordings to lernwelt_data:/data/tts/en"
# One container and one SSH connection; uid 1000 is the API's node user.
tar -C "${SRC}" -c --exclude=index.html . | docker run -i --rm --user 1000:1000 -v lernwelt_data:/data alpine sh -c '
  set -e
  rm -rf /data/tts/en.new && mkdir -p /data/tts/en.new
  tar -C /data/tts/en.new -x
  rm -rf /data/tts/en.old
  if [ -d /data/tts/en ]; then mv /data/tts/en /data/tts/en.old; fi
  mv /data/tts/en.new /data/tts/en
  rm -rf /data/tts/en.old
  echo "$(ls /data/tts/en | wc -l) files in /data/tts/en"
'
