#!/usr/bin/env bash
# Starts the full local environment for testing VoxOrd against a live backend:
# docker backend -> adb port forwarding -> Metro bundler.
#
# Usage: ./scripts/start-dev-env.sh
set -euo pipefail

INFRA_DIR="/home/dmytro/Documents/my-project/ssz-platform/infrastructure"
VOXORD_DIR="/home/dmytro/Documents/my-project/VoxOrd"
COMPOSE="docker compose -f docker-compose.base.yml -f docker-compose.dev.yml --env-file .env.dev"

echo "==> 1/4 Starting backend containers"
cd "$INFRA_DIR"
$COMPOSE up -d

echo "==> 2/4 Waiting for Postgres and the gateway to be reachable"
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:80/api/v1/auth/roles; then
    echo "Gateway is responding."
    break
  fi
  sleep 2
  if [ "$i" -eq 30 ]; then
    echo "Gateway did not come up in time. Check: docker compose ps / docker logs infrastructure-nginx-1"
    exit 1
  fi
done

echo "==> 3/4 Checking device connection and setting up adb reverse"
if ! adb get-state >/dev/null 2>&1; then
  echo "No device connected via adb. Plug in the phone (USB debugging on) and re-run."
  exit 1
fi
adb reverse tcp:8081 tcp:8081   # Metro bundler
adb reverse tcp:80 tcp:80       # API gateway
adb reverse --list

echo "==> 4/4 Starting Metro"
cd "$VOXORD_DIR"
npx react-native start --reset-cache
