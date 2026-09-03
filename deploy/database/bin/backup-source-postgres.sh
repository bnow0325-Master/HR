#!/usr/bin/env bash
set -Eeuo pipefail

BASE_DIR="${BNOW_HR_DB_DIR:-/opt/bnow/hr-mariadb}"
APP_DIR="${1:-${BNOW_HR_APP_DIR:-/opt/bnow/checkinout}}"
MIGRATION_ENV="${APP_DIR}/.env.migration.local"
BACKUP_DIR="${BASE_DIR}/source-backups"

if [[ "$(id -u)" != "0" ]]; then
  echo "Run this script as root." >&2
  exit 1
fi
if [[ "${APP_DIR}" != "/opt/bnow/checkinout" && ! "${APP_DIR}" =~ ^/opt/bnow/hr-releases/[a-f0-9]{7,40}$ ]]; then
  echo "Refusing to read an unexpected HR application path." >&2
  exit 1
fi
if [[ ! -r "${MIGRATION_ENV}" ]]; then
  echo "Prepare the migration environment first." >&2
  exit 1
fi

SOURCE_DATABASE_URL="$(python3 - "${MIGRATION_ENV}" <<'PY'
import json
import sys
from pathlib import Path
for line in Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
    if line.startswith("SOURCE_DATABASE_URL="):
        print(json.loads(line.split("=", 1)[1]))
        break
else:
    raise SystemExit("SOURCE_DATABASE_URL is missing")
PY
)"
export SOURCE_DATABASE_URL

if [[ ! "${SOURCE_DATABASE_URL}" =~ ^postgresql:// ]]; then
  echo "Invalid PostgreSQL source URL." >&2
  exit 1
fi

install -d -m 0700 "${BACKUP_DIR}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="${BACKUP_DIR}/hr-postgresql-${timestamp}.dump"
partial_path="${backup_path}.partial"
trap 'rm -f "${partial_path}"' EXIT

umask 077
docker run --rm -i \
  --env SOURCE_DATABASE_URL \
  postgres:17-alpine \
  sh -ec 'exec pg_dump --dbname "$SOURCE_DATABASE_URL" --format custom --compress 9 --no-owner --no-acl' \
  >"${partial_path}"

docker run --rm -i postgres:17-alpine pg_restore --list <"${partial_path}" >/dev/null
mv "${partial_path}" "${backup_path}"
sha256sum "${backup_path}" >"${backup_path}.sha256"
chmod 0600 "${backup_path}" "${backup_path}.sha256"
echo "Source PostgreSQL backup validated: ${backup_path}"
