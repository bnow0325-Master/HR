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

backup_path="${1:-}"
if [[ -z "${backup_path}" ]]; then
  backup_path="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'bnow_hr_*.sql.gz' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
fi

if [[ -z "${backup_path}" || ! -r "${backup_path}" ]]; then
  echo "A readable backup archive is required." >&2
  exit 1
fi

checksum_path="${backup_path}.sha256"
if [[ ! -r "${checksum_path}" ]]; then
  echo "Backup checksum is missing." >&2
  exit 1
fi

sha256sum --check "${checksum_path}"
gzip --test "${backup_path}"

compose=(
  docker compose
  --project-directory "${BASE_DIR}"
  --env-file "${ENV_FILE}"
  -f "${COMPOSE_FILE}"
)

restore_db="bnow_hr_restore_check_$(date -u +%Y%m%d%H%M%S)"
if [[ ! "${restore_db}" =~ ^bnow_hr_restore_check_[0-9]{14}$ ]]; then
  echo "Unsafe restore database name." >&2
  exit 1
fi

root_sql() {
  "${compose[@]}" exec -T mariadb sh -ec '
    export MYSQL_PWD="$(cat /run/secrets/mariadb_root_password)"
    exec mariadb --user=root --batch --skip-column-names "$@"
  ' sh "$@"
}

cleanup_restore_db() {
  root_sql --execute "DROP DATABASE IF EXISTS \`${restore_db}\`;" >/dev/null
}
trap cleanup_restore_db EXIT

root_sql --execute "CREATE DATABASE \`${restore_db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
gzip -dc "${backup_path}" | root_sql "${restore_db}"

table_count="$(root_sql --execute "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${restore_db}' AND table_name IN ('Employee','AttendanceRecord','LeaveRequest','BusinessTrip','NaverWorksDailyRecord');")"
if [[ "${table_count}" != "5" ]]; then
  echo "Restore verification failed: expected 5 HR tables, got ${table_count}." >&2
  exit 1
fi

echo "Restore smoke test completed: ${restore_db}"
