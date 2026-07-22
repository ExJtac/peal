#!/usr/bin/env bash
#
# setup-postgres.sh — install PostgreSQL and create the `pbx` role + `pbx` database with loopback
# trust, so the co-located control plane + Asterisk connect as `pbx` over 127.0.0.1 with no password.
# Idempotent: guarded role/db creation + a marked pg_hba block added at most once. Run as root.
#
# Env: PBX_DB_USER (default pbx), PBX_DB_NAME (default pbx).
#
set -euo pipefail

PG_USER="${PBX_DB_USER:-pbx}"
PG_DB="${PBX_DB_NAME:-pbx}"
log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
psql_q() { sudo -u postgres psql -tAc "$1"; }

log "Installing PostgreSQL"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y postgresql postgresql-client
systemctl enable --now postgresql

log "Ensuring role '${PG_USER}' + database '${PG_DB}'"
if [ "$(psql_q "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'")" != "1" ]; then
  sudo -u postgres createuser "${PG_USER}"
  echo "  created role ${PG_USER}"
else
  echo "  role ${PG_USER} already exists"
fi
if [ "$(psql_q "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'")" != "1" ]; then
  sudo -u postgres createdb -O "${PG_USER}" "${PG_DB}"
  echo "  created database ${PG_DB} (owner ${PG_USER})"
else
  echo "  database ${PG_DB} already exists"
fi

# Loopback trust for the pbx role (127.0.0.1 / ::1 / local socket) — inserted BEFORE the default
# rules so it wins. Guarded by a marker so re-runs never duplicate it.
HBA="$(psql_q 'SHOW hba_file')"
MARK="# pbx installer: loopback trust for ${PG_USER}"
if [ -f "${HBA}" ] && ! grep -qF "${MARK}" "${HBA}"; then
  log "Granting loopback trust in ${HBA}"
  cp "${HBA}" "${HBA}.pbx.bak"
  tmp="$(mktemp)"
  {
    printf '%s\n' "${MARK}"
    printf 'local   %s   %s                     trust\n' "${PG_DB}" "${PG_USER}"
    printf 'host    %s   %s   127.0.0.1/32      trust\n' "${PG_DB}" "${PG_USER}"
    printf 'host    %s   %s   ::1/128           trust\n' "${PG_DB}" "${PG_USER}"
    cat "${HBA}"
  } > "${tmp}"
  install -o postgres -g postgres -m 0640 "${tmp}" "${HBA}"
  rm -f "${tmp}"
  systemctl reload postgresql
  echo "  loopback trust added for ${PG_USER}/${PG_DB}"
else
  echo "  loopback trust already present (or hba_file not found)"
fi
