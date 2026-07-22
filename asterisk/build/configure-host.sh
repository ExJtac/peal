#!/usr/bin/env bash
#
# configure-host.sh — co-locate the shipped /etc configs on THIS host: point Asterisk's DB configs at
# local Postgres (127.0.0.1 / role `pbx`), pick the right PostgreSQL ODBC driver for the CPU arch, bind
# AMI to loopback, and write host/network values into .env. Every edit is idempotent (targets vanish
# after the first pass / line-level replace converges). Run AFTER build-asterisk.sh has populated /etc.
#
# Env: REPO_DIR (default /opt/pbx), PBX_DB_USER (default pbx), PBX_DB_NAME (default pbx), ENV_FILE.
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/pbx}"
PG_USER="${PBX_DB_USER:-pbx}"
PG_DB="${PBX_DB_NAME:-pbx}"
ENV_FILE="${ENV_FILE:-${REPO_DIR}/.env}"
log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# ---- 1. Asterisk DB configs: MAC_HOST_IP -> 127.0.0.1 (config lines only, not ; comments) ----
log "Pointing Asterisk's DB configs at local Postgres"
for f in /etc/odbc.ini /etc/asterisk/cdr_pgsql.conf /etc/asterisk/cel_pgsql.conf; do
  [ -f "${f}" ] && sed -i -E '/^[[:space:]]*;/! s/MAC_HOST_IP/127.0.0.1/g' "${f}"
done
# Shipped configs hardcode the Mac dev superuser `james`; a fresh host has role `${PG_USER}`.
[ -f /etc/odbc.ini ] && sed -i -E "s/^([[:space:]]*Username[[:space:]]*=[[:space:]]*)james[[:space:]]*$/\1${PG_USER}/" /etc/odbc.ini
[ -f /etc/asterisk/res_odbc.conf ] && sed -i -E "s/^([[:space:]]*username[[:space:]]*=[[:space:]]*)james[[:space:]]*$/\1${PG_USER}/" /etc/asterisk/res_odbc.conf
for f in /etc/asterisk/cdr_pgsql.conf /etc/asterisk/cel_pgsql.conf; do
  [ -f "${f}" ] && sed -i -E "s/^([[:space:]]*user[[:space:]]*=[[:space:]]*)james[[:space:]]*$/\1${PG_USER}/" "${f}"
done

# ---- 2. PostgreSQL ODBC driver path by arch — resolve the REAL installed .so, don't hardcode ----
log "Selecting the PostgreSQL ODBC driver for this architecture"
DRV="$(dpkg -L odbc-postgresql 2>/dev/null | grep -m1 '/psqlodbcw\.so$' || true)"
SETUP="$(dpkg -L odbc-postgresql 2>/dev/null | grep -m1 '/libodbcpsqlS\.so$' || true)"
if [ -n "${DRV}" ] && [ -n "${SETUP}" ] && [ -f /etc/odbcinst.ini ]; then
  sed -i -E "s|^Driver[[:space:]]*=.*|Driver = ${DRV}|" /etc/odbcinst.ini
  sed -i -E "s|^Setup[[:space:]]*=.*|Setup  = ${SETUP}|" /etc/odbcinst.ini
  echo "  Driver = ${DRV}"
else
  echo "  ! could not resolve odbc-postgresql driver via dpkg -L — leaving odbcinst.ini defaults"
fi

# ---- 3. AMI -> loopback (co-located control plane). http.conf 8088 deliberately STAYS 0.0.0.0:
#         it also serves the WebRTC /ws softphone, so the firewall restricts it to the LAN instead. ----
log "Binding AMI to loopback"
[ -f /etc/asterisk/manager.conf ] && \
  sed -i -E 's/^(bindaddr[[:space:]]*=[[:space:]]*)0\.0\.0\.0[[:space:]]*$/\1127.0.0.1/' /etc/asterisk/manager.conf

# ---- 4. Network detection -> .env host values ----
log "Writing host/network values into ${ENV_FILE}"
[ -f "${ENV_FILE}" ] || cp "${REPO_DIR}/.env.example" "${ENV_FILE}"
LAN_IP="$(ip -4 -o route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' || true)"
[ -n "${LAN_IP}" ] || LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "${LAN_IP}" ] || LAN_IP="127.0.0.1"

set_env() { # KEY VALUE — upsert KEY="VALUE" into ENV_FILE (| delimiter: our values have no |)
  local key="$1" val="$2" line
  line="${key}=\"${val}\""
  if grep -qE "^[[:space:]]*${key}[[:space:]]*=" "${ENV_FILE}"; then
    sed -i -E "s|^[[:space:]]*${key}[[:space:]]*=.*|${line}|" "${ENV_FILE}"
  else
    printf '%s\n' "${line}" >> "${ENV_FILE}"
  fi
}
set_env DATABASE_URL    "postgresql://${PG_USER}@127.0.0.1:5432/${PG_DB}?schema=public"
set_env APP_URL         "http://${LAN_IP}:3001"
set_env ARI_HTTP_URL    "http://127.0.0.1:8088"
set_env SIP_SERVER_HOST "${LAN_IP}"
set_env SIP_WS_URL      "ws://${LAN_IP}:8088/ws"
set_env ALLOW_MOCK      ""
echo "  LAN_IP=${LAN_IP} — the console will be http://${LAN_IP}:3001"

# ---- 5. NAT hint (best-effort; warning only, never edits pjsip.conf) ----
PUB_IP="$(curl -fsS --max-time 4 https://api.ipify.org 2>/dev/null || true)"
if [ -n "${PUB_IP}" ] && [ "${PUB_IP}" != "${LAN_IP}" ]; then
  cat <<NAT
  ! Public IP ${PUB_IP} != LAN IP ${LAN_IP} — this host is behind NAT. If your SIP TRUNK reaches
    it across that NAT, uncomment + set in /etc/asterisk/pjsip.conf:
        external_media_address=${PUB_IP}
        external_signaling_address=${PUB_IP}
        local_net=${LAN_IP%.*}.0/24
    (A REGISTER trunk like Telnyx usually needs none of these — the registration pinhole handles it.)
NAT
fi
