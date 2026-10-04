#!/usr/bin/env bash
#
# Builds the image on the netcup1 server and writes terraform/image.auto.tfvars,
# so the following bin/deploy.sh rolls out exactly this tag.
#
# No registry: the image is built on the Docker daemon that runs the container
# (DOCKER_HOST=ssh://netcup1). Only the build context (filtered by
# .dockerignore) goes over SSH. The previous image stays on the daemon for
# rollback until `docker image prune`.
#
# DOCKER_BUILDKIT=0 forces the classic builder over a single API connection;
# buildx over ssh:// opens a flood of SSH connections that sshd rejects.
# The build runs the tests and aborts when they fail.
#
# Tags are never reused: Terraform compares the tag name, so a rebuilt image
# under an existing tag would not be rolled out.
#
# Usage: bin/release.sh [version]   (default: YYYYMMDD-HHMMSS)
set -euo pipefail
cd "$(dirname "$0")/.."

APP_VERSION="${1:-$(date +'%Y%m%d-%H%M%S')}"
REPO="clock"
IMAGE="${REPO}:${APP_VERSION}"
export DOCKER_HOST="ssh://netcup1"
export DOCKER_BUILDKIT=0

if docker image inspect "${IMAGE}" >/dev/null 2>&1; then
  echo "ERROR: ${IMAGE} already exists on the server - use a new version." >&2
  exit 1
fi

echo "==> Building ${IMAGE} on the server (DOCKER_HOST=${DOCKER_HOST})"
docker build -f Dockerfile --build-arg "APP_VERSION=${APP_VERSION}" -t "${IMAGE}" -t "${REPO}:latest" .

echo "image = \"${IMAGE}\"" > terraform/image.auto.tfvars
echo
echo "==> ${IMAGE} built (kept on the netcup1 daemon, no registry push)"
echo "    terraform/image.auto.tfvars updated - now run: task plan && task deploy"
