#!/usr/bin/env bash
#
# Puts the checked recordings from .data/tts/en (scripts/render-speech.ts) into
# the volume lernwelt_data on netcup1 (/data/tts/en), replacing the old ones in
# one step. The API serves them at once; no deploy needed.
#
# The files go in with `docker cp` (Docker API upload): a tar piped into
# `docker run -i` over ssh:// never sees the end of its input and hangs.
#
# Usage: bin/tts-upload.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=".data/tts/en"
NEW="en.$(date +'%Y%m%d%H%M%S')"
export DOCKER_HOST="ssh://netcup1"

count=$(find "${SRC}" -maxdepth 1 -name '*.mp3' | wc -l)
if [ "${count}" -eq 0 ]; then
  echo "ERROR: no recordings in ${SRC} - run node scripts/render-speech.ts first." >&2
  exit 1
fi

echo "==> Uploading ${count} recordings to lernwelt_data:/data/tts/en"
# uid 1000 is the API's node user. --rm removes the container after its run;
# the trap only cleans up when the upload fails before (netcup1 refuses SSH
# connections in quick succession, so every saved docker call counts).
container=$(docker create --rm --user 1000:1000 -v lernwelt_data:/data -e NEW="${NEW}" alpine sh -c '
  set -e
  cd /data/tts
  if [ -d en ]; then mv en en.old; fi
  mv "${NEW}" en
  rm -rf en.old
  echo "$(ls en | wc -l) files in /data/tts/en"
')
trap 'docker rm -f "${container}" >/dev/null' EXIT
tar -C "${SRC}" -c --owner=1000 --group=1000 --exclude=index.html --transform "s,^\.,${NEW}," . \
  | docker cp - "${container}:/data/tts/"
trap - EXIT
docker start -a "${container}"
