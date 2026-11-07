#!/usr/bin/env bash
# Run ONLY after explicit operating authorization and privileged-file approval.
# Args: archive archive_sha256 main_commit expected_running_image expected_workdir release_id
set -Eeuo pipefail
umask 077
test "$(id -u)" = 0 || { echo 'An approved operator must run this file as root.' >&2; exit 77; }
test "$#" = 6 || { echo 'Expected six reviewed deployment arguments.' >&2; exit 64; }
archive=$1; digest=$2; commit=$3; expected_image=$4; old_dir=$5; release_id=$6
[[ "$archive" =~ ^/home/elonchoo/[A-Za-z0-9._-]+\.tar\.gz$ ]]
[[ "$digest" =~ ^[a-f0-9]{64}$ && "$commit" =~ ^[a-f0-9]{40}$ ]]
[[ "$expected_image" =~ ^sha256:[a-f0-9]{64}$ ]]
[[ "$old_dir" =~ ^/opt/bnow/(hr-releases|hr/releases)/[A-Za-z0-9._-]+$ ]]
[[ "$release_id" =~ ^[a-f0-9]{7}-[0-9]{8}-[0-9]{4}-hr-notifications$ ]]
[[ "$release_id" = "${commit:0:7}-"* ]]
new_dir="/opt/bnow/hr-releases/$release_id"
backup="/var/backups/bnow-releases/hr-notifications-$release_id"
test ! -e "$new_dir" && test ! -e "$backup"
test ! -e /etc/systemd/system/bnow-hr-notifications.timer
test ! -e /etc/systemd/system/bnow-hr-notifications.service
test "$(docker inspect --format '{{.Image}}' bnow-checkinout-app-1)" = "$expected_image"
test "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' bnow-checkinout-app-1)" = "$old_dir"
test "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' bnow-checkinout-app-1)" = bnow-checkinout
test "$(docker inspect --format '{{.State.Health.Status}}' bnow-hr-mariadb)" = healthy
printf '%s  %s\n' "$digest" "$archive" | sha256sum --check --status
tar -tzf "$archive" | awk 'BEGIN{ok=1} /^\//{ok=0} /(^|\/)\.\.(\/|$)/{ok=0} END{exit !ok}'
install -d -m 0700 "$backup"
install -d -m 0755 "$new_dir"
tar -xzf "$archive" -C "$new_dir" --no-same-owner
test -f "$new_dir/deploy/hr-notifications/dispatch-tick.mjs"
test -f "$new_dir/prisma/migrations-mariadb/20261107130000_hr_notification_outbox/migration.sql"
install -m 0600 "$old_dir/.env.production.local" "$new_dir/.env.production.local"
# Keep existing credentials private; generate only the new scheduler token.
python3 - "$new_dir/.env.production.local" <<'PY'
import pathlib,secrets,sys,urllib.parse
p=pathlib.Path(sys.argv[1]); text=p.read_text(); values={}
for line in text.splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        k,v=line.split('=',1); values[k.strip()]=v.strip().strip('"\'')
target=urllib.parse.urlsplit(values.get('WORKBOARD_STAFF_CHAT_WEBHOOK_URL',''))
if target.scheme!='https' or target.netloc!='chat.bnow.co.kr' or target.path!='/api/staff-chat/webhooks/incoming':
    raise SystemExit('Existing HR notification destination must be verified before deployment')
if not values.get('WORKBOARD_STAFF_CHAT_WEBHOOK_TOKEN'):
    raise SystemExit('Existing HR inbound credential is not configured')
if not values.get('HR_NOTIFICATION_CRON_TOKEN'):
    p.write_text(text.rstrip()+'\nHR_NOTIFICATION_CRON_TOKEN='+secrets.token_hex(32)+'\n')
PY
printf '%s\n' "$commit" > "$new_dir/.deployment-commit"
printf '%s\n' "$old_dir" > "$backup/previous-release.txt"
printf '%s\n' "$expected_image" > "$backup/previous-image.txt"
tar -C "$old_dir" -czf "$backup/previous-release.tar.gz" .
docker image tag "$expected_image" "bnow-checkinout-app:rollback-$release_id"
docker exec bnow-hr-mariadb sh -ec '
  export MYSQL_PWD="$(cat /run/secrets/mariadb_root_password)"
  exec mariadb-dump -uroot --single-transaction --quick --routines --events --triggers --hex-blob "$MARIADB_DATABASE"
' | gzip -9 > "$backup/hr-database.sql.gz"
gzip -t "$backup/hr-database.sql.gz"
test -s "$backup/hr-database.sql.gz"
cat > "$backup/rollback.sh" <<ROLLBACK
#!/usr/bin/env bash
set -Eeuo pipefail
test "\$(id -u)" = 0
systemctl disable --now bnow-hr-notifications.timer || true
systemctl stop bnow-hr-notifications.service || true
docker image tag '$expected_image' bnow-checkinout-app:latest
docker compose --project-name bnow-checkinout --project-directory '$old_dir' --env-file '$old_dir/.env.production.local' -f '$old_dir/compose.production.yml' up -d --no-build --no-deps app
echo 'Code restored; newly recorded attendance and outbox data were preserved. Check container health and HTTPS.'
ROLLBACK
chmod 0700 "$backup/rollback.sh"
bash -n "$backup/rollback.sh"
(cd "$backup" && sha256sum previous-release.tar.gz hr-database.sql.gz previous-release.txt previous-image.txt rollback.sh > backup.sha256 && sha256sum --check backup.sha256)
# Validate this new schema against a fresh, isolated restore before touching production schema.
restore_db="bnow_hr_notify_verify_$(date -u +%Y%m%d%H%M%S)"
[[ "$restore_db" =~ ^bnow_hr_notify_verify_[0-9]{14}$ ]]
db_sql() {
  docker exec -i bnow-hr-mariadb sh -ec 'export MYSQL_PWD="$(cat /run/secrets/mariadb_root_password)"; exec mariadb -uroot --batch --skip-column-names "$@"' sh "$@"
}
cleanup_restore() { db_sql --execute "DROP DATABASE IF EXISTS \`$restore_db\`;" >/dev/null; }
trap cleanup_restore EXIT
db_sql --execute "CREATE DATABASE \`$restore_db\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
gzip -dc "$backup/hr-database.sql.gz" | db_sql "$restore_db"
db_sql "$restore_db" < "$new_dir/prisma/migrations-mariadb/20261107130000_hr_notification_outbox/migration.sql"
test "$(db_sql --execute "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$restore_db' AND table_name IN ('Employee','AttendanceRecord','LeaveRequest','BusinessTrip','HrNotificationOutbox');")" = 5
cleanup_restore
trap - EXIT
compose=(docker compose --project-name bnow-checkinout --project-directory "$new_dir" --env-file "$new_dir/.env.production.local" -f "$new_dir/compose.production.yml")
"${compose[@]}" config --quiet
switched=false
on_failure() {
  rc=$?
  docker image tag "$expected_image" bnow-checkinout-app:latest || true
  if $switched; then bash "$backup/rollback.sh"; fi
  echo 'Deployment stopped; inspect the reviewed deployment record. No production database restore was performed.' >&2
  exit "$rc"
}
trap on_failure ERR
"${compose[@]}" build app migrate
# Build failure never replaces the running app. Migration adds the outbox table only.
"${compose[@]}" run --rm migrate
switched=true
"${compose[@]}" up -d --no-build --no-deps app
healthy=false
for attempt in $(seq 1 60); do
  if test "$(docker inspect --format '{{.State.Health.Status}}' bnow-checkinout-app-1)" = healthy; then healthy=true; break; fi
  sleep 3
done
$healthy
test "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' bnow-checkinout-app-1)" = "$new_dir"
for page in attendance check records leave business-trips; do
  curl --fail --silent --show-error --max-time 20 "https://hr.bnow.co.kr/$page" >/dev/null
done
install -m 0644 "$new_dir/deploy/hr-notifications/bnow-hr-notifications.service" /etc/systemd/system/bnow-hr-notifications.service
install -m 0644 "$new_dir/deploy/hr-notifications/bnow-hr-notifications.timer" /etc/systemd/system/bnow-hr-notifications.timer
systemctl daemon-reload
systemctl enable --now bnow-hr-notifications.timer
systemctl start bnow-hr-notifications.service
systemctl is-active --quiet bnow-hr-notifications.timer
printf 'DEPLOYMENT_COMMIT=%s\nRELEASE=%s\nBACKUP=%s\nROLLBACK=bash %s/rollback.sh\n' "$commit" "$new_dir" "$backup" "$backup"
printf 'APP_IMAGE='; docker inspect --format '{{.Image}}' bnow-checkinout-app-1
echo 'Server deployment completed. Representative private-room and employee permission UI checks are still required.'
