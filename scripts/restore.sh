#!/usr/bin/env bash
# Restore database dari file backup .sql.gz. PERINGATAN: data saat ini akan ditimpa.
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?Gunakan: scripts/restore.sh backups/nama-file.sql.gz}"
read -r -p "Data database saat ini akan DITIMPA oleh $FILE. Ketik RESTORE untuk melanjutkan: " OK
[ "$OK" = "RESTORE" ] || { echo "Dibatalkan."; exit 1; }
gunzip -c "$FILE" | docker compose exec -T db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'
docker compose restart app
echo "Restore selesai."
