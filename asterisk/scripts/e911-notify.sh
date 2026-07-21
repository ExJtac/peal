#!/usr/bin/env bash
#
# e911-notify.sh — on-site emergency-call notification hook (Kari's Law §506 compliance).
#
# Invoked NATIVELY from the [emergency] context in extensions.conf the instant a 911 call is
# placed — BEFORE the Dial, and independent of the Node control plane. Kari's Law requires that
# someone on-site is notified WITHOUT impeding the call, so this returns immediately: the actual
# notification (an HTTP POST to the control plane, which emails/pages the on-site contact) is
# backgrounded and fail-soft.
#
# Args:  $1 = callback number (CALLERID / DEVICE_CALLBACK)
#        $2 = timestamp string  ("YYYY-MM-DD HH:MM:SS")
#
# Config (optional /etc/asterisk/e911-notify.env, sourced if present):
#   E911_NOTIFY_URL    control-plane endpoint  (default http://127.0.0.1:3001/api/e911/notify)
#   E911_NOTIFY_TOKEN  shared secret matching the app's E911_NOTIFY_TOKEN env
set -e

CALLBACK="${1:-unknown}"
WHEN="${2:-$(date '+%Y-%m-%d %H:%M:%S')}"
LOG="/var/log/asterisk/e911-notify.log"

# Always log locally first — the on-site audit trail must survive even if the network is down.
echo "[E911 ALERT] ${WHEN} — 911 dialed. Callback=${CALLBACK}" >> "${LOG}" 2>/dev/null || true

[ -f /etc/asterisk/e911-notify.env ] && . /etc/asterisk/e911-notify.env || true
URL="${E911_NOTIFY_URL:-http://127.0.0.1:3001/api/e911/notify}"
TOKEN="${E911_NOTIFY_TOKEN:-}"

# Fire the HTTP notification in the BACKGROUND with a short timeout so this script returns fast and
# never delays the 911 Dial. Fail-soft: a notification error must never affect the emergency call.
if command -v curl >/dev/null 2>&1 && [ -n "${TOKEN}" ]; then
  (
    curl -fsS --max-time 5 -X POST "${URL}" \
      -H "Content-Type: application/json" \
      -H "x-e911-token: ${TOKEN}" \
      -d "{\"callback\":\"${CALLBACK}\",\"when\":\"${WHEN}\"}" \
      >> "${LOG}" 2>&1 || echo "[E911 ALERT] notify POST failed (call proceeded)" >> "${LOG}" 2>/dev/null
  ) &
fi

exit 0
