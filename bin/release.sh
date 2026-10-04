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
# Usage: bin/release.sh [version]   (default: YYYYMMDD-HHMM)
set -euo pipefail
cd "$(dirname "$0")/.."

APP_VERSION="${1:-$(date +'%Y%m%d-%H%M')}"
REPO="clock"
IMAGE="${REPO}:${APP_VERSION}"
export DOCKER_HOST="ssh://netcup1"
export DOCKER_BUILDKIT=0

echo "==> Building ${IMAGE} on the server (DOCKER_HOST=${DOCKER_HOST})"
docker build -f Dockerfile --build-arg "APP_VERSION=${APP_VERSION}" -t "${IMAGE}" -t "${REPO}:latest" .

echo "image = \"${IMAGE}\"" > terraform/image.auto.tfvars
echo
echo "==> ${IMAGE} built (kept on the netcup1 daemon, no registry push)"
echo "    terraform/image.auto.tfvars updated - now run bin/deploy.sh"
