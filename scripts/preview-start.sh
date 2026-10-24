#!/usr/bin/env bash
# Launcher khusus lingkungan preview Emergent (bukan untuk produksi/Docker).
# Menjalankan MariaDB lokal (datadir persisten di folder proyek), migration, seed, lalu server Express di port 3000.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a; . "$ROOT/.env"; set +a
DATADIR="$ROOT/.preview/mysql"
SOCK=/run/mysqld/mysqld.sock

if ! command -v mariadbd >/dev/null 2>&1; then
  echo "[preview] memasang mariadb-server..."
  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mariadb-server >/dev/null
fi
mkdir -p /run/mysqld "$ROOT/.preview" && chown mysql:mysql /run/mysqld
if [ ! -d "$DATADIR/mysql" ]; then
  mariadb-install-db --user=mysql --datadir="$DATADIR" >/dev/null
fi
chown -R mysql:mysql "$DATADIR"
if ! mariadb-admin --socket="$SOCK" ping >/dev/null 2>&1; then
  mariadbd --user=mysql --datadir="$DATADIR" --socket="$SOCK" --bind-address=127.0.0.1 --port=3306 >"$ROOT/.preview/mysqld.log" 2>&1 &
  for i in $(seq 1 30); do mariadb-admin --socket="$SOCK" ping >/dev/null 2>&1 && break; sleep 1; done
fi
mariadb --socket="$SOCK" -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}_test\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
GRANT ALL PRIVILEGES ON \`${DB_NAME}_test\`.* TO '${DB_USER}'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`${DB_NAME}_test\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
node backend/src/scripts/migrate.js
node backend/src/scripts/seed.js
exec node backend/src/server.js
