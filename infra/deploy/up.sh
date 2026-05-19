#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  echo "Missing .env — copy infra/.env.prod.example to .env and edit it."
  exit 1
fi

docker compose --env-file .env -f infra/docker-compose.prod.yml up -d --build "$@"

echo ""
echo "Stack started. Open CORS_ORIGIN from .env (default port ${HTTP_PORT:-80})."
echo "Logs: docker compose --env-file .env -f infra/docker-compose.prod.yml logs -f"
