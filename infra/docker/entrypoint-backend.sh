#!/bin/sh
set -e

cd /workspace

echo "Waiting for PostgreSQL..."
until pg_isready -h "${POSTGRES_HOST:-postgres}" -U "${POSTGRES_USER:-nxcloud}" >/dev/null 2>&1; do
  sleep 2
done

echo "Applying Prisma schema..."
npx prisma db push --schema=prisma/schema.prisma --config=prisma/prisma.config.ts

if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "Seeding database..."
  npx tsx prisma/seed.ts
fi

cd /workspace/dist/apps/backend
exec "$@"
