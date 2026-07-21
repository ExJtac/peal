#!/usr/bin/env bash
#
# e911-notify.sh — on-site emergency-call notification hook (Kari's Law §506 compliance).
#
# Invoked NATIVELY from the [emergency] context in extensions.conf the moment a 911 call
# is placed — independent of the Node control plane (which may be down). Kari's Law
# requires that someone on-site (front desk, security, a central location) is notified
# WITHOUT impeding the call. This stub logs the event; wire real notification below.
#
# Args:  $1 = callback number (CALLERID/DEVICE_CALLBACK)
#        $2 = timestamp string  ("YYYY-MM-DD HH:MM:SS")
#
set -e

CALLBACK="${1:-unknown}"
WHEN="${2:-$(date '+%Y-%m-%d %H:%M:%S')}"
LOG="/var/log/asterisk/e911-notify.log"

echo "[E911 ALERT] ${WHEN} — 911 dialed. Callback=${CALLBACK}" >> "${LOG}"

# ---------------------------------------------------------------------------------------
# TODO (per-deployment): fire the real on-site notification here. This is the single hook
# for Kari's Law compliance — e.g.:
#   - Email/SMS the front desk + manager (mail / a Telnyx SMS API call).
#   - Post to a Slack/Teams webhook.
#   - Trigger paging / a desk-phone broadcast page.
# Keep it FAST and NON-BLOCKING (the dialplan already placed the 911 call; this runs
# alongside via System()). Fail soft — never let a notification error affect the call.
# ---------------------------------------------------------------------------------------

exit 0
