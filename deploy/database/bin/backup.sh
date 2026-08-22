#!/usr/bin/env bash
set -Eeuo pipefail

BASE_DIR="${BNOW_HR_DB_DIR:-/opt/bnow/hr-database}"
ENV_FILE="${BASE_DIR}/.env"
COMPOSE_FILE="${BASE_DIR}/compose.yml"
BACKUP_DIR="${BASE_DIR}/backups"

if [[ ! -r "${ENV_FILE}" || ! -r "${COMPOSE_FILE}" ]]; then
  echo "HR database configuration is missing." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${BACKUP_RETENTION_DAYS:=14}"

install -d -m 0700 "${BACKUP_DIR}"

compose=(
  docker compose
  --project-directory "${BASE_DIR}"
  --env-file "${ENV_FILE}"
  -f "${COMPOSE_FILE}"
)

"${compose[@]}" exec -T postgres \
  pg_isready --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" >/dev/null

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
filename="bnow_hr_${timestamp}.dump"
partial_path="${BACKUP_DIR}/.${filename}.partial"
backup_path="${BACKUP_DIR}/${filename}"

cleanup_partial() {
  rm -f "${partial_path}"
}
trap cleanup_partial EXIT

umask 077
"${compose[@]}" exec -T postgres \
  pg_dump \
    --username "${POSTGRES_USER}" \
    --dbname "${POSTGRES_DB}" \
    --format custom \
    --compress 9 \
    --no-owner \
    --no-acl >"${partial_path}"

if [[ ! -s "${partial_path}" ]]; then
  echo "Backup archive is empty." >&2
  exit 1
fi

"${compose[@]}" exec -T postgres pg_restore --list <"${partial_path}" >/dev/null
mv "${partial_path}" "${backup_path}"
sha256sum "${backup_path}" >"${backup_path}.sha256"
chmod 0600 "${backup_path}" "${backup_path}.sha256"

find "${BACKUP_DIR}" -maxdepth 1 -type f \
  \( -name 'bnow_hr_*.dump' -o -name 'bnow_hr_*.dump.sha256' \) \
  -mtime "+${BACKUP_RETENTION_DAYS}" -delete

echo "Backup completed: ${backup_path}"
