#!/usr/bin/env bash
# Read-only, for an operator-approved privileged session. No environment values.
set -Eeuo pipefail
test "$(id -u)" = 0 || { echo 'An approved operator must run this file as root.' >&2; exit 77; }
docker inspect --format 'APP_ID={{.Id}}
APP_IMAGE={{.Image}}
APP_STATE={{.State.Status}}
APP_HEALTH={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}
COMPOSE_PROJECT={{index .Config.Labels "com.docker.compose.project"}}
COMPOSE_WORKDIR={{index .Config.Labels "com.docker.compose.project.working_dir"}}' bnow-checkinout-app-1
docker inspect --format 'DB_ID={{.Id}} DB_STATE={{.State.Status}} DB_HEALTH={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' bnow-hr-mariadb
docker exec bnow-checkinout-app-1 node -e '
const raw=process.env.WORKBOARD_STAFF_CHAT_WEBHOOK_URL||"";
try {
 const url=new URL(raw);
 console.log(JSON.stringify({hrWebhookOrigin:url.origin,hrWebhookPath:url.pathname,
  hrWebhookCredentialConfigured:Boolean(process.env.WORKBOARD_STAFF_CHAT_WEBHOOK_TOKEN),
  hrRepresentativeOverrideConfigured:Boolean(process.env.APPROVAL_CEO_EMAIL)}));
} catch { console.log(JSON.stringify({hrWebhookConfigured:false})); }
'
printf 'PUBLIC_CHECK_HTTP='
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' --max-time 15 https://hr.bnow.co.kr/check
printf 'AT_UTC='; date -u +%FT%TZ
