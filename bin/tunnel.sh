#!/usr/bin/env bash
#
# Runs terraform against the netcup1 Docker daemon through an SSH tunnel.
# Usage: bin/tunnel.sh <terraform-subcommand> [args...]   (used by plan.sh / deploy.sh)
set -euo pipefail
cd "$(dirname "$0")/.."

SSH_HOST="netcup1"

if [ ! -f terraform/image.auto.tfvars ]; then
  echo "ERROR: terraform/image.auto.tfvars missing - run bin/release.sh first." >&2
  exit 1
fi

# Private directory, so no other local user can pre-create the sockets.
TUNNEL_DIR="$(mktemp -d)"
CONTROL="${TUNNEL_DIR}/ctl.sock"
DOCKER_SOCK="${TUNNEL_DIR}/docker.sock"

echo "==> Opening SSH tunnel to the Docker daemon (${DOCKER_SOCK} -> ${SSH_HOST})"
cleanup() {
  ssh -S "${CONTROL}" -O exit "${SSH_HOST}" 2>/dev/null || true
  rm -rf "${TUNNEL_DIR}"
}
trap cleanup EXIT
ssh -M -S "${CONTROL}" -o ExitOnForwardFailure=yes -fnNT -L "${DOCKER_SOCK}:/var/run/docker.sock" "${SSH_HOST}"

sleep 2

DOCKER_HOST="unix://${DOCKER_SOCK}" terraform -chdir=terraform "$@"
