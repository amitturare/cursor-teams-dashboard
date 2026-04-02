#!/usr/bin/env bash
# One-shot local setup: .env, npm install, create Postgres DB if missing, Drizzle migrate.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
	if [[ -f .env.example ]]; then
		cp .env.example .env
		echo "Created .env from .env.example."
		echo "Edit .env (set CURSOR_ADMIN_API_KEY and DATABASE_URL), then run: npm run setup"
		exit 1
	fi
	echo "Missing .env and .env.example."
	exit 1
fi

# Load .env (simple KEY=value lines; no export keyword required)
set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
	echo "DATABASE_URL is empty in .env."
	exit 1
fi

url="${DATABASE_URL%%\?*}"
db_name="${url##*/}"
admin_url="${url%/*}/postgres"

if [[ ! "$db_name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
	echo "Invalid database name in DATABASE_URL (use letters, numbers, underscore, hyphen): $db_name"
	exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
	echo "psql not found. Install PostgreSQL client tools and ensure Postgres is running."
	exit 1
fi

echo "Installing npm dependencies..."
npm install

echo "Ensuring database exists: $db_name"
if psql "$admin_url" -v ON_ERROR_STOP=1 -tc "SELECT 1 FROM pg_database WHERE datname = '$db_name'" | grep -q 1; then
	echo "Database already exists."
else
	psql "$admin_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$db_name\""
	echo "Created database $db_name."
fi

echo "Applying Drizzle migrations..."
npm run db:migrate

echo ""
echo "Setup finished. Start the app with: npm run dev"
