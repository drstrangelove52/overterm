#!/bin/bash
set -e

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "No .env found – copying .env.example"
  cp .env.example .env
fi

docker compose down
docker compose build
docker compose up -d

echo ""
echo "OverTerm started:"
echo "  Frontend: http://localhost"
echo "  Backend:  http://localhost:8000/docs"
