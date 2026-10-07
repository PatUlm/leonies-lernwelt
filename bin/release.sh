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
# Versions are calendar versions YYYY.MM.MICRO (calver.org; month without a
# leading zero, MICRO counts the releases of the month from 1): 2026.10.1.
# The next one follows the git tags v<version>. The working tree must be
# committed, as the build is the commit that bin/tag-release.sh tags after the
# deploy; version and commit go to terraform/release.env for it.
#
# Usage: bin/release.sh [version]   (default: the next version of this month)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: uncommitted changes - commit first, the release is tagged on its commit." >&2
  exit 1
fi
git fetch --quiet --tags origin

# After the tags of the month and a built but not yet deployed release: its
# image already exists on the server, so its version is taken.
next_version() {
  local month last
  month="$(date +'%Y.%-m')"
  last="$( { git tag --list "v${month}.*" | sed 's/^v//'; sed -n 's/^VERSION=//p' terraform/release.env 2>/dev/null || true; } \
    | awk -F. -v m="${month}" '$1 "." $2 == m && $3 ~ /^[0-9]+$/ { print $3 }' | sort -n | tail -1)"
  echo "${month}.$(( ${last:-0} + 1 ))"
}

APP_VERSION="${1:-$(next_version)}"
COMMIT="$(git rev-parse HEAD)"
REPO="lernwelt"
IMAGE="${REPO}:${APP_VERSION}"
API_IMAGE="${REPO}-api:${APP_VERSION}"
export DOCKER_HOST="ssh://netcup1"
export DOCKER_BUILDKIT=0

if docker image inspect "${IMAGE}" >/dev/null 2>&1; then
  echo "ERROR: ${IMAGE} already exists on the server - use a new version." >&2
  exit 1
fi

echo "==> Building ${IMAGE} and ${API_IMAGE} on the server (DOCKER_HOST=${DOCKER_HOST})"
docker build -f Dockerfile --target web --build-arg "APP_VERSION=${APP_VERSION}" -t "${IMAGE}" -t "${REPO}:latest" .
# Same build stage (cached), so the tests do not run twice.
docker build -f Dockerfile --target api --build-arg "APP_VERSION=${APP_VERSION}" -t "${API_IMAGE}" -t "${REPO}-api:latest" .

printf 'image     = "%s"\napi_image = "%s"\n' "${IMAGE}" "${API_IMAGE}" > terraform/image.auto.tfvars
printf 'VERSION=%s\nCOMMIT=%s\n' "${APP_VERSION}" "${COMMIT}" > terraform/release.env
echo
echo "==> ${IMAGE} and ${API_IMAGE} built from ${COMMIT:0:7} (kept on the netcup1 daemon, no registry push)"
echo "    terraform/image.auto.tfvars updated - now run: task plan && task deploy"
