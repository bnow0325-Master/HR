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

: "${POSTGRES_USER:?POSTGRES_USER is required}"

backup_path="${1:-}"
if [[ -z "${backup_path}" ]]; then
  backup_path="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'bnow_hr_*.dump' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
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

cleanup_restore_db() {
  "${compose[@]}" exec -T postgres \
    dropdb --username "${POSTGRES_USER}" --if-exists --force "${restore_db}" >/dev/null
}
trap cleanup_restore_db EXIT

"${compose[@]}" exec -T postgres \
  createdb --username "${POSTGRES_USER}" --template template0 "${restore_db}"

"${compose[@]}" exec -T postgres \
  pg_restore \
    --username "${POSTGRES_USER}" \
    --dbname "${restore_db}" \
    --exit-on-error \
    --no-owner \
    --no-acl <"${backup_path}"

"${compose[@]}" exec -T postgres \
  psql --username "${POSTGRES_USER}" --dbname "${restore_db}" \
    --set ON_ERROR_STOP=1 --command 'SELECT current_database();'

if [[ "${BNOW_HR_RESTORE_EXPECT_PROBE:-0}" == "1" ]]; then
  probe_count="$(
    "${compose[@]}" exec -T postgres \
      psql --username "${POSTGRES_USER}" --dbname "${restore_db}" \
        --tuples-only --no-align --set ON_ERROR_STOP=1 \
        --command 'SELECT count(*) FROM "__backup_restore_probe";'
  )"

  if [[ "${probe_count}" != "1" ]]; then
    echo "Restore probe validation failed: expected 1 row, got ${probe_count}." >&2
    exit 1
  fi
fi

echo "Restore smoke test completed: ${restore_db}"
