#!/bin/bash
# Scheduler for the backup sidecar (docs/ARCHITECTURE.md §4).
#
# A plain loop instead of cron: the postgres image has no cron, and one loop
# that also watches the manual trigger file is less machinery than installing
# one. Checks every minute:
#   * manual trigger  — /data/backups/.trigger written by POST /api/backups/run
#   * daily backup    — at BACKUP_HOUR, at most once per day
#   * maintenance     — expired sessions/tokens/invites/off_cache, once per day
set -uo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/data/backups}"
BACKUP_HOUR="${BACKUP_HOUR:-03}"
TRIGGER="$BACKUP_ROOT/.trigger"
STATE="$BACKUP_ROOT/.state"

mkdir -p "$BACKUP_ROOT" "$STATE"

echo "[backup] sidecar běží; denní záloha v ${BACKUP_HOUR}:00, ruční spuštění přes $TRIGGER"

# Wait for the database before the first run so a cold `docker compose up`
# does not log a spurious failure.
until PGPASSWORD="$POSTGRES_PASSWORD" pg_isready -q \
      -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do
  sleep 5
done

maintenance() {
  echo "[backup] údržba: mažu expirované sessions, tokeny, pozvánky a starou OFF cache"
  PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -q \
    -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL' >/dev/null
DELETE FROM sessions WHERE expires_at < now();
DELETE FROM password_reset_tokens WHERE expires_at < now() OR used_at IS NOT NULL;
DELETE FROM household_invites WHERE expires_at < now() OR used_at IS NOT NULL;
DELETE FROM off_cache WHERE fetched_at < now() - interval '30 days';
SQL
}

while true; do
  TODAY="$(date +%F)"
  HOUR="$(date +%H)"

  if [ -f "$TRIGGER" ]; then
    rm -f "$TRIGGER"
    /usr/local/bin/backup.sh manual
  fi

  if [ "$HOUR" = "$BACKUP_HOUR" ] && [ ! -f "$STATE/last-auto-$TODAY" ]; then
    rm -f "$STATE"/last-auto-* 2>/dev/null
    touch "$STATE/last-auto-$TODAY"
    /usr/local/bin/backup.sh auto
    maintenance
  fi

  sleep 60
done
