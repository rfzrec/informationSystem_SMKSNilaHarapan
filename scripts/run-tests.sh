#!/usr/bin/env bash
# Menjalankan pengujian otomatis terhadap database uji terpisah (<DB_NAME>_test). Database utama tidak disentuh.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
export NODE_ENV=test DB_HOST=127.0.0.1 DB_NAME="${DB_NAME%_test}_test" PRIVATE_STORAGE_DIR=storage/test-private PUBLIC_UPLOAD_DIR=storage/test-public
export RATE_LIMIT_LOGIN=1000 RATE_LIMIT_REGISTER=1000 RATE_LIMIT_FORGOT=1000 TRUST_PROXY=1
node --test --test-concurrency=1 tests/*.test.js
