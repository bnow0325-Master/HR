#!/usr/bin/env bash
set -Eeuo pipefail

BASE_DIR="${BNOW_HR_DB_DIR:-/opt/bnow/hr-mariadb}"
ENV_FILE="${BASE_DIR}/.env"
COMPOSE_FILE="${BASE_DIR}/compose.yml"
BACKUP_DIR="${BASE_DIR}/backups"

if [[ ! -r "${ENV_FILE}" || ! -r "${COMPOSE_FILE}" ]]; then
  echo "HR MariaDB configuration is missing." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${MARIADB_DATABASE:?MARIADB_DATABASE is required}"
: "${MARIADB_USER:?MARIADB_USER is required}"
: "${BACKUP_RETENTION_DAYS:=14}"

install -d -m 0700 "${BACKUP_DIR}"

compose=(
  docker compose
  --project-directory "${BASE_DIR}"
  --env-file "${ENV_FILE}"
  -f "${COMPOSE_FILE}"
)

"${compose[@]}" exec -T mariadb healthcheck.sh --connect --innodb_initialized >/dev/null

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
filename="bnow_hr_${timestamp}.sql.gz"
partial_path="${BACKUP_DIR}/.${filename}.partial"
backup_path="${BACKUP_DIR}/${filename}"

cleanup_partial() {
  rm -f "${partial_path}"
}
trap cleanup_partial EXIT

umask 077
"${compose[@]}" exec -T mariadb sh -ec '
  export MYSQL_PWD="$(cat /run/secrets/mariadb_password)"
  exec mariadb-dump \
    --user="$MARIADB_USER" \
    --single-transaction \
    --quick \
    --routines \
    --events \
    --triggers \
    --hex-blob \
    --default-character-set=utf8mb4 \
    "$MARIADB_DATABASE"
' | gzip -9 >"${partial_path}"

if [[ ! -s "${partial_path}" ]]; then
  echo "Backup archive is empty." >&2
  exit 1
fi

gzip --test "${partial_path}"
mv "${partial_path}" "${backup_path}"
sha256sum "${backup_path}" >"${backup_path}.sha256"
chmod 0600 "${backup_path}" "${backup_path}.sha256"

find "${BACKUP_DIR}" -maxdepth 1 -type f \
  \( -name 'bnow_hr_*.sql.gz' -o -name 'bnow_hr_*.sql.gz.sha256' \) \
  -mtime "+${BACKUP_RETENTION_DAYS}" -delete

echo "Backup completed: ${backup_path}"
