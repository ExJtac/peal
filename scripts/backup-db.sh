#!/usr/bin/env bash
#
# backup-db.sh — timestamped pg_dump of the whole `pbx` database with retention pruning.
#
# Everything lives in ONE database: schema public (our app, Prisma) + schema asterisk
# (ps_*/cdr/cel). A single custom-format dump captures both, so a restore rebuilds the entire
# system (config, CDR history, voicemail metadata). Run by pbx-backup.timer daily; also safe by
# hand:  bash scripts/backup-db.sh
#
# Env knobs (also read from the systemd EnvironmentFile / .env):
#     DATABASE_URL      postgres connection string  (preferred — parsed for host/port/user/db)
#     PGDATABASE        db name         (default: parsed from DATABASE_URL, else "pbx")
#     PBX_BACKUP_DIR    output dir      (default: /var/backups/pbx)
#     PBX_BACKUP_KEEP   keep N newest   (default: 14)
#
set -euo pipefail

BACKUP_DIR="${PBX_BACKUP_DIR:-/var/backups/pbx}"
KEEP="${PBX_BACKUP_KEEP:-14}"

# Prefer DATABASE_URL (pg_dump understands it directly); fall back to PG* / defaults.
DB_URL="${DATABASE_URL:-}"
if [ -n "${DB_URL}" ]; then
  # Strip any ?schema=... query so pg_dump dumps ALL schemas (public + asterisk), not just one.
  DUMP_TARGET="${DB_URL%%\?*}"
  DB_NAME="$(basename "${DUMP_TARGET}")"
else
  DB_NAME="${PGDATABASE:-pbx}"
  DUMP_TARGET="${DB_NAME}"
fi

TS="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/pbx-${TS}.dump"

mkdir -p "${BACKUP_DIR}"

echo "[backup] pg_dump ${DB_NAME} -> ${OUT}"
# -Fc = custom (compressed, restore with pg_restore); tmp file + atomic rename so a crash mid-dump
# never leaves a truncated file that looks like a good backup.
if pg_dump -Fc -f "${OUT}.tmp" "${DUMP_TARGET}"; then
  mv "${OUT}.tmp" "${OUT}"
  echo "[backup] ok: $(du -h "${OUT}" | cut -f1) ${OUT}"
else
  rm -f "${OUT}.tmp"
  echo "[backup] FAILED" >&2
  exit 1
fi

# Retention: keep the N newest .dump files, delete the rest.
echo "[backup] pruning to ${KEEP} newest"
ls -1t "${BACKUP_DIR}"/pbx-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  echo "[backup]   rm ${old}"
  rm -f "${old}"
done

echo "[backup] done. Restore with:  pg_restore --clean --if-exists -d ${DB_NAME} <file>.dump"
