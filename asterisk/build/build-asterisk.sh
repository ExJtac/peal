#!/usr/bin/env bash
#
# build-asterisk.sh — compile Asterisk 22 LTS from source on Debian 13 (trixie).
#
# Why from source: Debian ships an old Asterisk (v20) via apt. We need >= 22.8.0 for
# PJSIP realtime + ARI outbound websockets + chan_websocket. Scripting the build means
# dev (Lima VM) == prod (real Debian VM): the SAME script + asterisk/etc/* + asterisk/sql/*
# provision both.
#
# Invocation (from the Lima provision hook, or by hand as root in the VM):
#     REPO_DIR=/repo bash /repo/asterisk/build/build-asterisk.sh
#
# Env knobs:
#     ASTERISK_VERSION   pinned release to build   (default 22.10.0)
#     REPO_DIR           where this repo is mounted (default /repo)
#
# Idempotent where practical: re-running skips the download/extract if present and
# rebuilds. Safe to run again after editing asterisk/etc/*.
#
set -euo pipefail

ASTERISK_VERSION="${ASTERISK_VERSION:-22.10.0}"
REPO_DIR="${REPO_DIR:-/repo}"
SRC_DIR="/usr/src"
BUILD_DIR="${SRC_DIR}/asterisk-${ASTERISK_VERSION}"
TARBALL="asterisk-${ASTERISK_VERSION}.tar.gz"
DL_URL="https://downloads.asterisk.org/pub/telephony/asterisk/releases/${TARBALL}"

export DEBIAN_FRONTEND=noninteractive

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run as root (this installs system packages + writes to /usr, /etc)." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Build dependencies
# ---------------------------------------------------------------------------
log "Installing build dependencies (apt)"
apt-get update
apt-get install -y --no-install-recommends \
  build-essential git wget curl ca-certificates \
  libedit-dev libjansson-dev libsqlite3-dev libxml2-dev uuid-dev libssl-dev \
  unixodbc unixodbc-dev odbc-postgresql \
  libsrtp2-dev pkg-config

# ---------------------------------------------------------------------------
# 2. Download + extract pinned Asterisk release
# ---------------------------------------------------------------------------
log "Fetching Asterisk ${ASTERISK_VERSION}"
mkdir -p "${SRC_DIR}"
cd "${SRC_DIR}"
if [ ! -f "${TARBALL}" ]; then
  wget -O "${TARBALL}" "${DL_URL}"
else
  echo "  tarball already present, skipping download"
fi
if [ ! -d "${BUILD_DIR}" ]; then
  tar -xzf "${TARBALL}"
else
  echo "  source tree already extracted, skipping"
fi
cd "${BUILD_DIR}"

# ---------------------------------------------------------------------------
# 3. Asterisk-shipped prerequisite installer (bundled deps like libpjproject prereqs)
# ---------------------------------------------------------------------------
log "Running Asterisk install_prereq (non-interactive)"
# We run as root; install_prereq drives apt itself. DEBIAN_FRONTEND is already exported.
contrib/scripts/install_prereq install || {
  echo "WARN: install_prereq returned non-zero; continuing (core deps installed above)." >&2
}

# ---------------------------------------------------------------------------
# 4. configure
# ---------------------------------------------------------------------------
log "configure (bundled jansson + bundled pjproject)"
./configure --with-jansson-bundled --with-pjproject-bundled

# ---------------------------------------------------------------------------
# 5. menuselect — enable exactly the modules our control plane needs
# ---------------------------------------------------------------------------
log "menuselect: generating default makeopts"
make menuselect.makeopts

# Modules to enable. Many are already on by default with the bundled build; enabling
# again is a no-op, so the list is explicit and self-documenting (this is the contract
# of what our ARI control plane depends on).
MODULES=(
  # --- ARI (REST + websocket) ---
  res_ari res_ari_applications res_ari_channels res_ari_bridges res_ari_endpoints
  res_ari_playbacks res_ari_recordings res_ari_asterisk
  # --- Stasis (the dialplan handoff target: Stasis(pbx-app)) ---
  res_stasis res_stasis_answer res_stasis_playback res_stasis_recording res_stasis_snoop
  app_stasis
  # --- PJSIP (the only channel driver we use) ---
  chan_pjsip res_pjsip res_pjsip_outbound_registration
  res_pjsip_endpoint_identifier_ip res_pjsip_registrar res_pjsip_mwi res_pjsip_pubsub
  # res_pjsip_notify backs pjsip_notify.conf + AMI PJSIPNotify (phone reboot / force-provision).
  res_pjsip_notify
  # --- Realtime / ODBC (ps_* live in Postgres schema "asterisk") ---
  res_odbc res_config_odbc res_sorcery_realtime
  # --- CDR / CEL to Postgres ---
  cdr_pgsql cel_pgsql
  # --- Voicemail + MOH + core call apps ---
  app_voicemail res_musiconhold app_dial app_playback app_mixmonitor
  # --- Media security + RTP ---
  res_srtp chan_rtp
  # --- AudioSocket (seam for Phase 3 real-time AI media path) ---
  res_audiosocket app_audiosocket
)

log "menuselect: enabling ${#MODULES[@]} modules"
for mod in "${MODULES[@]}"; do
  if menuselect/menuselect --enable "${mod}" menuselect.makeopts; then
    echo "  enabled ${mod}"
  else
    # A module absent in this release should not abort the whole build.
    echo "  WARN: could not enable ${mod} (not present in ${ASTERISK_VERSION}?)" >&2
  fi
done

# Optional: keep debug symbols readable. Uncomment for troubleshooting builds.
# menuselect/menuselect --enable DONT_OPTIMIZE menuselect.makeopts

# ---------------------------------------------------------------------------
# 6. Compile + install (NO `make samples` — we ship our own asterisk/etc/*)
# ---------------------------------------------------------------------------
log "make -j$(nproc)"
make -j"$(nproc)"

log "make install"
make install

# ---------------------------------------------------------------------------
# 7. asterisk user/group + directory ownership
# ---------------------------------------------------------------------------
log "Creating asterisk user/group and fixing ownership"
getent group asterisk >/dev/null || groupadd asterisk
id -u asterisk >/dev/null 2>&1 || useradd -r -g asterisk -d /var/lib/asterisk -s /usr/sbin/nologin asterisk

for d in /etc/asterisk /var/lib/asterisk /var/log/asterisk /var/spool/asterisk /var/run/asterisk /usr/lib/asterisk; do
  mkdir -p "$d"
  chown -R asterisk:asterisk "$d"
done

ldconfig

# ---------------------------------------------------------------------------
# 8. Drop our checked-in configs into /etc/asterisk + ODBC configs into /etc
# ---------------------------------------------------------------------------
log "Installing configs from ${REPO_DIR}/asterisk/etc -> /etc/asterisk"
if [ -d "${REPO_DIR}/asterisk/etc" ]; then
  # *.conf -> /etc/asterisk
  cp -f "${REPO_DIR}/asterisk/etc/"*.conf /etc/asterisk/ 2>/dev/null || true
  # ODBC driver + DSN definitions -> /etc (system-wide unixODBC)
  [ -f "${REPO_DIR}/asterisk/etc/odbcinst.ini" ] && cp -f "${REPO_DIR}/asterisk/etc/odbcinst.ini" /etc/odbcinst.ini
  [ -f "${REPO_DIR}/asterisk/etc/odbc.ini" ] && cp -f "${REPO_DIR}/asterisk/etc/odbc.ini" /etc/odbc.ini
  chown -R asterisk:asterisk /etc/asterisk
else
  echo "WARN: ${REPO_DIR}/asterisk/etc not found — configs NOT installed." >&2
fi

# Ensure the e911 notify helper is present + executable where the dialplan expects it.
if [ -f "${REPO_DIR}/asterisk/scripts/e911-notify.sh" ]; then
  mkdir -p /etc/asterisk/scripts
  cp -f "${REPO_DIR}/asterisk/scripts/e911-notify.sh" /etc/asterisk/scripts/e911-notify.sh
  chmod 0755 /etc/asterisk/scripts/e911-notify.sh
  chown -R asterisk:asterisk /etc/asterisk/scripts
fi

# ---------------------------------------------------------------------------
# 9. systemd unit (best-effort — do NOT fail if systemd is unavailable)
# ---------------------------------------------------------------------------
log "Installing systemd unit (best-effort)"
UNIT=/etc/systemd/system/asterisk.service
cat > "${UNIT}" <<'UNITEOF'
[Unit]
Description=Asterisk PBX (custom AI-PBX engine)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=asterisk
Group=asterisk
# -f = foreground (systemd owns the process), -U/-G belt-and-suspenders on the runuser.
ExecStart=/usr/sbin/asterisk -f -U asterisk -G asterisk
ExecReload=/usr/sbin/asterisk -rx "core reload"
Restart=always
RestartSec=2
# Emergency dial-tone must come back fast after a crash; keep restarts aggressive.
LimitCORE=infinity
LimitNOFILE=8192

[Install]
WantedBy=multi-user.target
UNITEOF

if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  systemctl daemon-reload || true
  systemctl enable asterisk.service || true
  echo "  systemd unit installed + enabled (start with: systemctl start asterisk)"
else
  echo "  systemd not active in this environment; unit written to ${UNIT} but not enabled."
fi

# ---------------------------------------------------------------------------
# 10. Done — surface the one manual value that MUST be filled per host
# ---------------------------------------------------------------------------
cat <<'DONEEOF'

============================================================================
Asterisk build + install complete.

NEXT (manual, per-deployment):
  1. Set MAC_HOST_IP in /etc/odbc.ini  (Servername=) to the Mac's IP as seen
     from this VM  ->  the ODBC DSN "asterisk-pg" must reach Postgres:5432.
     Also set MAC_HOST_IP in /etc/asterisk/cdr_pgsql.conf, cel_pgsql.conf,
     and (if using outbound ARI ws) /etc/asterisk/ari.conf.
  2. Set the ARI password in /etc/asterisk/ari.conf ([pbx] password=...) to
     match the control plane's ARI_PASSWORD env var (replace CHANGEME_ARI_PASSWORD).
  3. Ensure Postgres on the Mac accepts connections from this VM's subnet
     (pg_hba.conf) and the schemas exist:
         psql -d pbx -f /repo/asterisk/sql/001_ps_tables.sql
         psql -d pbx -f /repo/asterisk/sql/002_cdr_cel.sql
  4. Start Asterisk:   systemctl start asterisk    (or: asterisk -f -U asterisk)
  5. Verify realtime + ARI:
         asterisk -rx "odbc show"
         asterisk -rx "pjsip show endpoints"
         asterisk -rx "ari show apps"
============================================================================
DONEEOF
