#!/usr/bin/env bash
# Backup database MySQL dari container Docker ke folder backups/ dan catat statusnya di tabel backup_records.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
mkdir -p backups
FILE="backups/${DB_NAME}-$(date +%Y%m%d-%H%M%S).sql.gz"
if docker compose exec -T db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' | gzip > "$FILE"; then
  STATUS=success
else
  STATUS=failed
fi
SIZE=$(stat -c %s "$FILE" 2>/dev/null || echo 0)
docker compose exec -T db sh -c "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" \"\$MYSQL_DATABASE\" -e \"INSERT INTO backup_records (file_name, status, size_bytes) VALUES ('$(basename "$FILE")', '$STATUS', $SIZE)\""
echo "Backup $STATUS: $FILE ($SIZE bytes)"
