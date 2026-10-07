#!/usr/bin/env bash
#
# Tags the commit of the deployed release (terraform/release.env, written by
# bin/release.sh) as v<version> and pushes the tag. Runs after a successful
# terraform apply (task deploy); running it again for the same release is fine.
# Tags only when the live site reports this version: a rollback to an older
# image deploys without tagging the pending release.
#
# Usage: bin/tag-release.sh
set -euo pipefail
cd "$(dirname "$0")/.."

RELEASE="terraform/release.env"
HEALTH_URL="https://lernwelt.nieda.de/healthz"
if [ ! -f "${RELEASE}" ]; then
  echo "ERROR: ${RELEASE} missing - run bin/release.sh first." >&2
  exit 1
fi
VERSION="$(sed -n 's/^VERSION=//p' "${RELEASE}")"
COMMIT="$(sed -n 's/^COMMIT=//p' "${RELEASE}")"
TAG="v${VERSION}"

# Traefik switches over once the new container is healthy: a few seconds at most.
live=""
for _ in $(seq 1 15); do
  live="$(curl -fsS "${HEALTH_URL}" 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p' || true)"
  [ "${live}" = "${VERSION}" ] && break
  sleep 2
done
if [ "${live}" != "${VERSION}" ]; then
  echo "ERROR: ${HEALTH_URL} reports '${live}', not ${VERSION} - no tag set." >&2
  exit 1
fi

if existing="$(git rev-parse -q --verify "refs/tags/${TAG}^{commit}")"; then
  if [ "${existing}" != "${COMMIT}" ]; then
    echo "ERROR: ${TAG} already tags ${existing:0:7}, not the deployed ${COMMIT:0:7}." >&2
    exit 1
  fi
else
  git tag -a "${TAG}" -m "Release ${VERSION}" "${COMMIT}"
fi
git push --quiet origin "refs/tags/${TAG}"
echo "==> ${COMMIT:0:7} tagged ${TAG} and pushed"
