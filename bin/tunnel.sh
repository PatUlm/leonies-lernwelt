#!/usr/bin/env bash
#
# Runs terraform against the netcup1 Docker daemon through an SSH tunnel.
# Usage: bin/tunnel.sh <terraform-subcommand> [args...]   (used by plan.sh / deploy.sh)
set -euo pipefail
cd "$(dirname "$0")/.."

SSH_HOST="netcup1"
NAME="clock-$1-$$"
CONTROL="/tmp/${NAME}-ctl.sock"
DOCKER_SOCK="/tmp/${NAME}-docker.sock"

if [ ! -f terraform/image.auto.tfvars ]; then
  echo "ERROR: terraform/image.auto.tfvars missing - run bin/release.sh first." >&2
  exit 1
fi

echo "==> Opening SSH tunnel to the Docker daemon (${DOCKER_SOCK} -> ${SSH_HOST})"
ssh -M -S "${CONTROL}" -fnNT -L "${DOCKER_SOCK}:/var/run/docker.sock" "${SSH_HOST}"
cleanup() {
  ssh -S "${CONTROL}" -O exit "${SSH_HOST}" 2>/dev/null || true
  rm -f "${DOCKER_SOCK}"
}
trap cleanup EXIT
sleep 2

DOCKER_HOST="unix://${DOCKER_SOCK}" terraform -chdir=terraform "$@"
