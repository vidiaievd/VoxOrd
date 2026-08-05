#!/usr/bin/env bash
# Starts the full local environment for testing VoxOrd against a live backend:
# docker backend -> adb port forwarding -> Metro bundler.
#
# Usage: ./scripts/start-dev-env.sh
#
# Wireless debugging: if no device is attached over USB, this tries to
# reconnect to PHONE_IP over Wi-Fi (`adb connect`) before giving up. This
# only works once adbd has already been switched to TCP mode, which requires
# one USB connection first (or Android 11+ pairing, done manually):
#   adb tcpip 5555 && adb connect <phone-ip>:5555
# adbd reverts to USB-only mode on every phone reboot, so redo `adb tcpip
# 5555` (over USB) after a reboot. Override the IP if it changes (DHCP):
#   PHONE_IP=192.168.1.42 ./scripts/start-dev-env.sh
set -euo pipefail

INFRA_DIR="/home/dmytro/Documents/my-project/ssz-platform/infrastructure"
VOXORD_DIR="/home/dmytro/Documents/my-project/VoxOrd"
COMPOSE="docker compose -f docker-compose.base.yml -f docker-compose.dev.yml --env-file .env.dev"
PHONE_IP="${PHONE_IP:-192.168.50.36}"
PHONE_ADB_PORT=5555

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
  echo "No device attached over USB — trying Wi-Fi ($PHONE_IP:$PHONE_ADB_PORT)..."
  if ! adb connect "$PHONE_IP:$PHONE_ADB_PORT" | grep -q "connected to\|already connected"; then
    echo "Could not reach the phone over Wi-Fi. Either:"
    echo "  - it's off/asleep/on a different network — wake it and check PHONE_IP, or"
    echo "  - adbd isn't in TCP mode yet (resets on every reboot) — plug in USB once and run:"
    echo "      adb tcpip 5555 && adb connect $PHONE_IP:$PHONE_ADB_PORT"
    exit 1
  fi
fi
adb reverse tcp:8081 tcp:8081   # Metro bundler
adb reverse tcp:80 tcp:80       # API gateway
adb reverse --list

echo "==> 4/4 Starting Metro"
cd "$VOXORD_DIR"
npx react-native start --reset-cache
