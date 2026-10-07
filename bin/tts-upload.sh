#!/usr/bin/env bash
#
# Puts the checked recordings from .data/tts/<lang> into the volume
# lernwelt_data on netcup1 (/data/tts/<lang>), replacing the old ones in one
# step. The API serves them at once; no deploy needed.
#   en: English words (scripts/render-speech.ts)
#   de: German sentences with manifest.json (scripts/render-german.ts)
#
# The files go in with `docker cp` (Docker API upload): a tar piped into
# `docker run -i` over ssh:// never sees the end of its input and hangs.
#
# Usage: bin/tts-upload.sh [en|de]   (default: en)
set -euo pipefail
cd "$(dirname "$0")/.."

TTS_LANG="${1:-en}"
case "${TTS_LANG}" in
  en) RENDER="scripts/render-speech.ts" ;;
  de) RENDER="scripts/render-german.ts" ;;
  *) echo "ERROR: unknown language '${TTS_LANG}' (en or de)." >&2; exit 1 ;;
esac
SRC=".data/tts/${TTS_LANG}"
NEW="${TTS_LANG}.$(date +'%Y%m%d%H%M%S')"
export DOCKER_HOST="ssh://netcup1"

count=$(find "${SRC}" -maxdepth 1 -name '*.mp3' 2>/dev/null | wc -l)
if [ "${count}" -eq 0 ]; then
  echo "ERROR: no recordings in ${SRC} - run node ${RENDER} first." >&2
  exit 1
fi

echo "==> Uploading ${count} recordings to lernwelt_data:/data/tts/${TTS_LANG}"
# uid 1000 is the API's node user. --rm removes the container after its run;
# the trap only cleans up when the upload fails before (netcup1 refuses SSH
# connections in quick succession, so every saved docker call counts).
container=$(docker create --rm --user 1000:1000 -v lernwelt_data:/data -e NEW="${NEW}" -e L="${TTS_LANG}" alpine sh -c '
  set -e
  cd /data/tts
  if [ -d "${L}" ]; then mv "${L}" "${L}.old"; fi
  mv "${NEW}" "${L}"
  rm -rf "${L}.old"
  echo "$(ls "${L}" | wc -l) files in /data/tts/${L}"
')
trap 'docker rm -f "${container}" >/dev/null' EXIT
tar -C "${SRC}" -c --owner=1000 --group=1000 --exclude=index.html --exclude=flags.json --transform "s,^\.,${NEW}," . \
  | docker cp - "${container}:/data/tts/"
trap - EXIT
docker start -a "${container}"
