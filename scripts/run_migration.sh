#!/usr/bin/env bash
set -euo pipefail

# Load env vars from .env at project root
if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
else
  echo ".env not found. Aborting." >&2
  exit 1
fi

: "${DB_HOST:?missing DB_HOST}"
: "${DB_PORT:?missing DB_PORT}"
: "${DB_USER:?missing DB_USER}"
: "${DB_PASSWORD:?missing DB_PASSWORD}"
: "${DB_NAME:?missing DB_NAME}"

echo "Running migration on database '${DB_NAME}' (${DB_HOST}:${DB_PORT}) as ${DB_USER}..."

mariadb \
  -h"${DB_HOST}" -P"${DB_PORT}" -u"${DB_USER}" -p"${DB_PASSWORD}" \
  "${DB_NAME}" < scripts/migrate.sql

echo "Migration completed."

