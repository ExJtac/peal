#!/usr/bin/env bash
#
# install.sh — one-command installer for peal, the self-hosted AI-native PBX.
#
# On a FRESH Debian 13 host (VM, cloud instance, or bare metal) this stands up the entire stack
# unattended: Node.js, PostgreSQL, Asterisk 22, the Node/TS control plane, the database, all secrets,
# and a hardened SIP edge (no separate SBC — Asterisk is the SBC for a <=25-phone deployment).
# Every phase is idempotent, so it is safe to re-run.
#
#   curl -fsSL https://raw.githubusercontent.com/ExJtac/peal/main/install.sh \
#     | sudo REPO_URL=https://github.com/ExJtac/peal.git bash
#
# The same one-liner works as cloud-init user-data (in a `runcmd:` block).
#
# Env knobs: REPO_URL (clone source), REPO_BRANCH (default main), PBX_DIR (default /opt/pbx),
#            PBX_USER (default pbx).
#
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ExJtac/peal.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
PBX_DIR="${PBX_DIR:-/opt/pbx}"
PBX_USER="${PBX_USER:-pbx}"
export REPO_DIR="${PBX_DIR}" # sub-scripts (build-asterisk.sh, configure-host.sh, …) read REPO_DIR

C_CYAN=$'\033[1;36m'; C_RED=$'\033[1;31m'; C_GRN=$'\033[1;32m'; C_YEL=$'\033[1;33m'; C_OFF=$'\033[0m'
log() { printf '\n%s==> %s%s\n' "${C_CYAN}" "$*" "${C_OFF}"; }
die() { printf '\n%s✗ install FAILED during: %s%s\n' "${C_RED}" "$*" "${C_OFF}" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "must run as root (use sudo)"

# --- read a KEY="value" from .env (values may contain = / + so only strip the surrounding quotes) ---
env_get() {
  local v
  v="$(grep -E "^[[:space:]]*$1[[:space:]]*=" "${PBX_DIR}/.env" 2>/dev/null | head -1 | cut -d= -f2-)"
  v="${v%\"}"; v="${v#\"}"
  printf '%s' "${v}"
}

# --- E911 (Kari's Law) on-site notify config that extensions.conf's e911-notify.sh sources ---
write_e911_env() {
  local token; token="$(env_get E911_NOTIFY_TOKEN)"
  {
    printf 'E911_NOTIFY_URL="http://127.0.0.1:3001/api/e911/notify"\n'
    printf 'E911_NOTIFY_TOKEN="%s"\n' "${token}"
  } > /etc/asterisk/e911-notify.env
  chown root:asterisk /etc/asterisk/e911-notify.env 2>/dev/null || true
  chmod 0640 /etc/asterisk/e911-notify.env
  echo "  wrote /etc/asterisk/e911-notify.env"
}

# ---------------------------------------------------------------------------
# Bootstrap mode — piped from curl (no local checkout): install git, clone, re-exec from disk.
# ---------------------------------------------------------------------------
if [ ! -f "$(dirname "$0")/asterisk/build/build-asterisk.sh" ]; then
  log "Bootstrap: fetching peal into ${PBX_DIR}"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq && apt-get install -y git ca-certificates curl
  if [ -d "${PBX_DIR}/.git" ]; then
    git -C "${PBX_DIR}" fetch --depth 1 origin "${REPO_BRANCH}" && git -C "${PBX_DIR}" reset --hard "origin/${REPO_BRANCH}"
  else
    git clone --branch "${REPO_BRANCH}" --depth 1 "${REPO_URL}" "${PBX_DIR}"
  fi
  exec bash "${PBX_DIR}/install.sh"
fi

# ---------------------------------------------------------------------------
# In-repo mode — run every phase from the checkout.
# ---------------------------------------------------------------------------
cd "${PBX_DIR}"
# shellcheck disable=SC1091
. /etc/os-release 2>/dev/null || true
echo "Installing peal → ${PBX_DIR} on ${PRETTY_NAME:-this host} ($(dpkg --print-architecture 2>/dev/null || uname -m))"

PHASE_TOTAL=11
CURRENT="preflight"
phase() { CURRENT="$2"; log "[$1/${PHASE_TOTAL}] $2"; }
trap 'die "${CURRENT}"' ERR

phase 1  "Node.js >= 20";                 bash asterisk/build/setup-node.sh
phase 2  "PostgreSQL + pbx role/database"; bash asterisk/build/setup-postgres.sh
phase 3  "Build Asterisk 22";             bash asterisk/build/build-asterisk.sh
phase 4  "Host config + network";         bash asterisk/build/configure-host.sh
phase 5  "App dependencies (npm ci)";     npm ci
phase 6  "Generate + fan out secrets";    npm run secrets:write --silent -- --env "${PBX_DIR}/.env"
phase 7  "Build the console";             npm run build
phase 8  "Control-plane services";        NODE_BIN="$(command -v node)" PBX_DIR="${PBX_DIR}" PBX_USER="${PBX_USER}" RUN_BUILD=0 bash asterisk/build/install-control-plane.sh
phase 9  "Database migrate + seed + reconcile"; sudo -u "${PBX_USER}" env HOME="${PBX_DIR}" bash -c "cd ${PBX_DIR} && npm run setup && npm run db:reconcile"
phase 10 "E911 notify config";            write_e911_env
phase 11 "Harden the SIP edge";           bash asterisk/build/harden-host.sh

# ---------------------------------------------------------------------------
# Start everything, then a read-only self-test + summary (non-fatal from here on).
# ---------------------------------------------------------------------------
trap - ERR
log "Enabling + starting services"
systemctl enable --now asterisk pbx-ari pbx-worker pbx-pnp pbx-web pbx-backup.timer pbx-health.timer 2>&1 | sed 's/^/  /' || true

log "Self-test"
sleep 6
for u in asterisk pbx-ari pbx-worker pbx-pnp pbx-web; do
  printf '  %-12s %s\n' "${u}" "$(systemctl is-active "${u}" 2>/dev/null || echo inactive)"
done
if curl -fsS --max-time 6 http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
  echo "  health endpoint: ${C_GRN}OK${C_OFF}"
else
  echo "  health endpoint: not ready yet — check 'journalctl -u pbx-web -f'"
fi

IP="$(env_get SIP_SERVER_HOST)"; [ -n "${IP}" ] || IP="127.0.0.1"
SEEDPW="$(env_get SEED_PASSWORD)"
cat <<BANNER

${C_GRN}============================================================================${C_OFF}
 ${C_GRN}peal is installed.${C_OFF}

   Console : http://${IP}:3001
   Login   : admin@pbx.local   /   ${SEEDPW}
             ${C_YEL}^ change this now (Users admin) — it is your only admin login${C_OFF}

   Next:
     • Go live with a phone line ......... TRUNK-SETUP.md
       (also: nft add element inet pbx trunk_ips { <TRUNK_IP> } to open the firewall)
     • Optional TLS/SRTP + outbound-WS .... HARDENING.md
     • Backups + health alerts ............ already enabled (pbx-backup.timer, pbx-health.timer)

   Re-run this installer any time — every step is idempotent.
${C_GRN}============================================================================${C_OFF}
BANNER
