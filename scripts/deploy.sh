#!/usr/bin/env bash
# Deploy the artwork container from origin/main on the prod host.
# Hard-aligns to origin/main, rebuilds, and waits for the app to answer HTTP.
#
# Usage (on the server):  bash ~/apps/apple-music-artwork-search/scripts/deploy.sh
#   or from anywhere:     ssh root@<host> 'bash -s' < scripts/deploy.sh
# Assumes the compose project lives in ~/apps and the repo in ~/apps/apple-music-artwork-search.
# The server-side `dockerfile` is untracked; reset --hard leaves it alone.
set -euo pipefail

APP_DIR="$HOME/apps/apple-music-artwork-search"
COMPOSE_DIR="$HOME/apps"
SERVICE="artwork"
URL="http://127.0.0.1:3002/"

cd "$APP_DIR"
echo "→ HEAD before: $(git rev-parse --short HEAD)"

git fetch --prune origin
git reset --hard origin/main
echo "→ deployed: $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"

cd "$COMPOSE_DIR"
docker compose up -d --build "$SERVICE"

echo "→ waiting for HTTP 200 on $URL..."
for i in $(seq 1 24); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$URL" || true)
  if [ "$code" = 200 ]; then echo "✅ up"; exit 0; fi
  sleep 5
done
echo "❌ still $code after timeout — check: docker compose logs --tail 50 $SERVICE"; exit 1
