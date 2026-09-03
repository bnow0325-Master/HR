#!/usr/bin/env bash
set -Eeuo pipefail

BASE_DIR="${BNOW_HR_DB_DIR:-/opt/bnow/hr-mariadb}"
ENV_FILE="${BASE_DIR}/.env"
SECRETS_DIR="${BASE_DIR}/secrets"
IMAGE_TAG="mariadb:11.4"

if [[ "$(id -u)" != "0" ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

install -d -m 0700 "${BASE_DIR}" "${SECRETS_DIR}" "${BASE_DIR}/backups" "${BASE_DIR}/source-backups" "${BASE_DIR}/app-env-backups"

docker pull "${IMAGE_TAG}" >/dev/null
image_digest="$(docker image inspect --format '{{index .RepoDigests 0}}' "${IMAGE_TAG}")"
if [[ ! "${image_digest}" =~ ^mariadb@sha256:[a-f0-9]{64}$ ]]; then
  echo "Unable to resolve the MariaDB image digest." >&2
  exit 1
fi

if [[ ! -s "${SECRETS_DIR}/mariadb_password" ]]; then
  umask 077
  openssl rand -base64 48 >"${SECRETS_DIR}/mariadb_password"
fi
if [[ ! -s "${SECRETS_DIR}/mariadb_root_password" ]]; then
  umask 077
  openssl rand -base64 48 >"${SECRETS_DIR}/mariadb_root_password"
fi
chmod 0600 "${SECRETS_DIR}/mariadb_password" "${SECRETS_DIR}/mariadb_root_password"

cat >"${ENV_FILE}" <<EOF
MARIADB_IMAGE=${image_digest}
MARIADB_DATABASE=bnow_hr
MARIADB_USER=bnow_hr_app
BACKUP_RETENTION_DAYS=14
EOF
chmod 0600 "${ENV_FILE}"

docker compose \
  --project-directory "${BASE_DIR}" \
  --env-file "${ENV_FILE}" \
  -f "${BASE_DIR}/compose.yml" config --quiet
docker compose \
  --project-directory "${BASE_DIR}" \
  --env-file "${ENV_FILE}" \
  -f "${BASE_DIR}/compose.yml" up -d mariadb

for _ in $(seq 1 36); do
  if docker compose \
    --project-directory "${BASE_DIR}" \
    --env-file "${ENV_FILE}" \
    -f "${BASE_DIR}/compose.yml" exec -T mariadb \
    healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1; then
    echo "HR MariaDB is healthy (${image_digest})."
    exit 0
  fi
  sleep 5
done

echo "HR MariaDB did not become healthy." >&2
exit 1
