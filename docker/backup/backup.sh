#!/bin/bash
# One backup run: pg_dump + uploads archive + rotation, recorded in backup_runs.
# Usage: backup.sh auto|manual
set -uo pipefail

KIND="${1:-auto}"
BACKUP_ROOT="${BACKUP_ROOT:-/data/backups}"
UPLOADS_DIR="${UPLOADS_DIR:-/data/uploads}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${KEEP_MONTHLY:-12}"

DATE="$(date +%F)"
STAMP="$(date +%F_%H%M%S)"
TARGET="$BACKUP_ROOT/daily/$DATE"
STARTED_AT="$(date -Iseconds)"
RUN_ID="$(cat /proc/sys/kernel/random/uuid)"

psql_do() {
  PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -q \
    -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1" >/dev/null
}

# sql_escape: single quotes doubled, so a message can never break the statement.
sql_escape() { printf "%s" "$1" | sed "s/'/''/g"; }

finish() {
  local status="$1" detail="$2" size="${3:-NULL}"
  psql_do "UPDATE backup_runs
             SET status = '$status',
                 finished_at = now(),
                 size_bytes = $size,
                 detail = '$(sql_escape "$detail")'
           WHERE id = '$RUN_ID'"
}

echo "[backup] $STAMP start ($KIND)"
if ! psql_do "INSERT INTO backup_runs (id, kind, started_at, status)
              VALUES ('$RUN_ID', '$KIND', '$STARTED_AT', 'running')"; then
  echo "[backup] nelze zapsat do backup_runs — je databáze dostupná?" >&2
  exit 1
fi

mkdir -p "$TARGET"

# 1) Database — custom format, compressed, restorable with pg_restore.
if ! PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -Fc \
      -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
      -f "$TARGET/db.dump" 2> "$TARGET/pg_dump.log"; then
  finish failed "pg_dump selhal: $(tail -c 500 "$TARGET/pg_dump.log")"
  echo "[backup] pg_dump selhal" >&2
  exit 1
fi
rm -f "$TARGET/pg_dump.log"

# 2) Photos — plain tar.gz of the whole uploads tree.
if [ -d "$UPLOADS_DIR" ]; then
  if ! tar -czf "$TARGET/uploads.tar.gz" -C "$UPLOADS_DIR" . 2> "$TARGET/tar.log"; then
    finish failed "archivace fotek selhala: $(tail -c 500 "$TARGET/tar.log")"
    echo "[backup] tar selhal" >&2
    exit 1
  fi
  rm -f "$TARGET/tar.log"
else
  echo "[backup] $UPLOADS_DIR neexistuje — zálohuji jen databázi"
fi

echo "$STAMP $KIND" > "$TARGET/INFO"
SIZE="$(du -sb "$TARGET" | cut -f1)"

# 3) Promotion + rotation — only AFTER a successful backup, never before
#    (docs/ARCHITECTURE.md §4.1).
if [ "$(date +%u)" = "7" ]; then
  mkdir -p "$BACKUP_ROOT/weekly"
  rm -rf "$BACKUP_ROOT/weekly/$DATE"
  cp -r "$TARGET" "$BACKUP_ROOT/weekly/$DATE"
fi
if [ "$(date +%d)" = "01" ]; then
  mkdir -p "$BACKUP_ROOT/monthly"
  rm -rf "$BACKUP_ROOT/monthly/$DATE"
  cp -r "$TARGET" "$BACKUP_ROOT/monthly/$DATE"
fi

prune() { # prune <dir> <keep>
  local dir="$1" keep="$2"
  [ -d "$dir" ] || return 0
  # Names are ISO dates, so lexicographic order is chronological.
  ls -1 "$dir" | sort -r | tail -n "+$((keep + 1))" | while read -r old; do
    echo "[backup] mažu starou zálohu $dir/$old"
    rm -rf "${dir:?}/$old"
  done
}
prune "$BACKUP_ROOT/daily" "$KEEP_DAILY"
prune "$BACKUP_ROOT/weekly" "$KEEP_WEEKLY"
prune "$BACKUP_ROOT/monthly" "$KEEP_MONTHLY"

finish ok "$TARGET" "$SIZE"
echo "[backup] hotovo: $TARGET ($((SIZE / 1024 / 1024)) MB)"
