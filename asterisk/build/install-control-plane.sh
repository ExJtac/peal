#!/usr/bin/env bash
#
# install-control-plane.sh — supervise the Node control plane with systemd (PROD VM only).
#
# In DEV the control plane runs natively on the Mac (npm run ari / worker / pnp / dev), by hand.
# In PROD (single-VM: Asterisk + Node + Postgres on one Debian box) the four long-running
# processes must survive crashes + reboots unattended. This installs systemd units for:
#     pbx-ari.service      call-control daemon      (worker/ari)   — Restart=always
#     pbx-worker.service   async-AI job worker      (worker/jobs)  — Restart=always
#     pbx-pnp.service      SIP-PnP responder        (worker/pnp)   — Restart=always
#     pbx-web.service      Next.js console + portal (next start)   — Restart=always
#     pbx-backup.timer     daily pg_dump                           — scripts/backup-db.sh
#     pbx-health.timer     control-plane health alert (every 2m)   — scripts/health-check.ts
#
# KillMode=control-group on the daemon units reaps tsx's child node process on restart, so a
# restart never leaves the orphaned children that race for jobs/events (the dev "run exactly one"
# footgun goes away under systemd).
#
# Usage (as root in the prod VM, from a WRITABLE checkout — NOT the read-only /repo dev mount):
#     PBX_DIR=/opt/pbx bash /opt/pbx/asterisk/build/install-control-plane.sh
#
# Env knobs:
#     PBX_DIR    install dir = a writable checkout with node_modules + a built .next  (default /opt/pbx)
#     PBX_USER   service account to run as                                            (default pbx)
#     PBX_ENV    EnvironmentFile the units read (DATABASE_URL, ARI_*, SMTP_*, …)      (default /etc/pbx/pbx.env)
#     NODE_BIN   node binary                                                (default: $(command -v node))
#     RUN_BUILD  set to 0 to skip `npm ci` + `next build` at install time            (default 1)
#
set -euo pipefail

PBX_DIR="${PBX_DIR:-/opt/pbx}"
PBX_USER="${PBX_USER:-pbx}"
PBX_ENV="${PBX_ENV:-/etc/pbx/pbx.env}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
RUN_BUILD="${RUN_BUILD:-1}"
UNIT_SRC="${PBX_DIR}/asterisk/build/systemd"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run as root (writes /etc/systemd/system, creates the service user)." >&2
  exit 1
fi
if [ -z "${NODE_BIN}" ]; then
  echo "ERROR: node not found on PATH — install Node.js (>=20) first, or pass NODE_BIN=." >&2
  exit 1
fi
if [ ! -d "${UNIT_SRC}" ]; then
  echo "ERROR: ${UNIT_SRC} not found — is PBX_DIR=${PBX_DIR} a full checkout?" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Service account
# ---------------------------------------------------------------------------
log "Ensuring service user '${PBX_USER}'"
getent group "${PBX_USER}" >/dev/null || groupadd -r "${PBX_USER}"
id -u "${PBX_USER}" >/dev/null 2>&1 || \
  useradd -r -g "${PBX_USER}" -d "${PBX_DIR}" -s /usr/sbin/nologin "${PBX_USER}"

# ---------------------------------------------------------------------------
# 2. EnvironmentFile (the units read this; never commit real secrets — 0640, owned by the user)
# ---------------------------------------------------------------------------
log "Ensuring EnvironmentFile ${PBX_ENV}"
mkdir -p "$(dirname "${PBX_ENV}")"
if [ ! -f "${PBX_ENV}" ]; then
  if [ -f "${PBX_DIR}/.env" ]; then
    cp "${PBX_DIR}/.env" "${PBX_ENV}"
    echo "  seeded ${PBX_ENV} from ${PBX_DIR}/.env"
  else
    cat > "${PBX_ENV}" <<'ENVEOF'
# PBX control-plane environment (systemd EnvironmentFile). Fill these in.
DATABASE_URL="postgresql://pbx@127.0.0.1:5432/pbx?schema=public"
ARI_HTTP_URL="http://127.0.0.1:8088"
ARI_USER="pbx"
ARI_PASSWORD=""
APP_URL="http://127.0.0.1:3001"
# Health alerts (optional): recipient + SMTP. Unset SMTP_HOST → logs instead of sending.
ALERT_EMAIL=""
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
EMAIL_FROM="PBX <pbx@yourdomain.com>"
# Backups
PBX_BACKUP_DIR="/var/backups/pbx"
PBX_BACKUP_KEEP="14"
ENVEOF
    echo "  wrote a TEMPLATE ${PBX_ENV} — EDIT IT before starting the services"
  fi
fi
chown "${PBX_USER}:${PBX_USER}" "${PBX_ENV}"
chmod 0640 "${PBX_ENV}"

# ---------------------------------------------------------------------------
# 3. Ownership + (optional) build
# ---------------------------------------------------------------------------
log "Fixing ownership of ${PBX_DIR}"
chown -R "${PBX_USER}:${PBX_USER}" "${PBX_DIR}"

if [ "${RUN_BUILD}" = "1" ]; then
  log "Installing deps + building the Next app (RUN_BUILD=1)"
  ( cd "${PBX_DIR}" && sudo -u "${PBX_USER}" env HOME="${PBX_DIR}" npm ci --omit=dev=false )
  ( cd "${PBX_DIR}" && sudo -u "${PBX_USER}" env HOME="${PBX_DIR}" npm run build )
else
  echo "  RUN_BUILD=0 — skipping npm ci + next build (expecting an existing node_modules + .next)"
fi

# ---------------------------------------------------------------------------
# 4. Render + install units (substitute @PLACEHOLDERS@)
# ---------------------------------------------------------------------------
log "Installing systemd units"
render() { # <src-basename>
  sed -e "s|@PBX_DIR@|${PBX_DIR}|g" \
      -e "s|@PBX_USER@|${PBX_USER}|g" \
      -e "s|@PBX_ENV@|${PBX_ENV}|g" \
      -e "s|@NODE_BIN@|${NODE_BIN}|g" \
      "${UNIT_SRC}/$1" > "/etc/systemd/system/$1"
  echo "  installed /etc/systemd/system/$1"
}
for u in pbx-ari.service pbx-worker.service pbx-pnp.service pbx-web.service \
         pbx-backup.service pbx-backup.timer pbx-health.service pbx-health.timer; do
  render "${u}"
done

# ---------------------------------------------------------------------------
# 5. Enable (best-effort — don't fail where systemd isn't the init)
# ---------------------------------------------------------------------------
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  systemctl daemon-reload
  systemctl enable pbx-ari.service pbx-worker.service pbx-pnp.service pbx-web.service \
                   pbx-backup.timer pbx-health.timer || true
  echo "  units enabled. Start now with:"
  echo "    systemctl start pbx-ari pbx-worker pbx-pnp pbx-web pbx-backup.timer pbx-health.timer"
else
  echo "  systemd not active here; units written but not enabled."
fi

cat <<DONEEOF

============================================================================
Control-plane supervision installed.

  Services:  pbx-ari  pbx-worker  pbx-pnp  pbx-web
  Timers:    pbx-backup.timer (daily pg_dump)  pbx-health.timer (health alerts)
  Env file:  ${PBX_ENV}   (edit DATABASE_URL / ARI_PASSWORD / SMTP_* / ALERT_EMAIL)

  Status:    systemctl status pbx-ari
  Logs:      journalctl -u pbx-ari -f
  Restart proof: systemctl start pbx-ari; kill \$(systemctl show -p MainPID --value pbx-ari)
                 → systemd restarts it in ~2s (journalctl shows the restart + channel re-adopt).
============================================================================
DONEEOF
