#!/usr/bin/env bash
#
# setup-node.sh — ensure Node.js >= 20 is installed (via NodeSource). Idempotent: a no-op when a
# recent-enough node is already on PATH. Called by install.sh; safe to run standalone as root.
#
# Env: NODE_MAJOR (default 20).
#
set -euo pipefail

NODE_MAJOR="${NODE_MAJOR:-20}"
log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if command -v node >/dev/null 2>&1; then
  cur="$(node -v | sed 's/^v\([0-9]*\).*/\1/')"
  if [ "${cur:-0}" -ge "${NODE_MAJOR}" ] 2>/dev/null; then
    echo "  node $(node -v) already >= ${NODE_MAJOR} — skipping"
    exit 0
  fi
  echo "  node $(node -v) is older than ${NODE_MAJOR} — upgrading via NodeSource"
fi

log "Installing Node.js ${NODE_MAJOR}.x (NodeSource)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y ca-certificates curl gnupg
curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
apt-get install -y nodejs
echo "  installed node $(node -v) / npm $(npm -v)"
