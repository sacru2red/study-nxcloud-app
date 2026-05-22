#!/usr/bin/env bash
# 앱(Prisma) DB와 Nextcloud DB를 분리합니다.
# nxcloud_app에 oc_* 가 남아 있으면 prisma db push 가 실패합니다.
# 해결: docker compose down -v && up -d 후 init-nextcloud.sh (볼륨 초기화)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PG_CONTAINER="${PG_CONTAINER:-nxcloud-postgres}"
PG_USER="${PG_USER:-nxcloud}"
APP_DB="${APP_DB:-nxcloud_app}"
NC_DB="${NC_DB:-nextcloud}"

if ! docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  echo "Postgres is not running. Start: docker compose -f infra/docker-compose.yml up -d"
  exit 1
fi

exists="$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '${NC_DB}'")"

if [ "$exists" != "1" ]; then
  echo "Creating database: ${NC_DB}"
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -c "CREATE DATABASE ${NC_DB};"
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -c \
    "GRANT ALL PRIVILEGES ON DATABASE ${NC_DB} TO ${PG_USER};"
fi

oc_count="$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$APP_DB" -tAc \
  "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'oc_%'" 2>/dev/null || echo 0)"

if [ "${oc_count:-0}" != "0" ]; then
  echo "ERROR: ${APP_DB} still has ${oc_count} Nextcloud (oc_*) table(s)."
  echo "Prisma and Nextcloud must use separate databases."
  echo ""
  echo "Fix (recommended):"
  echo "  docker compose -f infra/docker-compose.yml down -v"
  echo "  docker compose -f infra/docker-compose.yml up -d"
  echo "  ./infra/init-nextcloud.sh"
  echo "  npx nx run backend:prepare-e2e"
  exit 1
fi

docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$APP_DB" -c "CREATE EXTENSION IF NOT EXISTS vector;"
echo "OK: ${APP_DB} is ready for prisma db push (Nextcloud uses ${NC_DB})."
