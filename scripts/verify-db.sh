#!/usr/bin/env bash
#
# Applies the migrations to a throwaway Postgres and checks that the role rules
# actually behave. Needs a Postgres reachable at $PGURL (default is a local
# cluster on 55432).
#
# Usage: npm run verify:db
set -euo pipefail

PGURL="${PGURL:-postgresql://postgres@localhost:55432}"
DB="${DB:-blairlawn_migtest}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

psql "$PGURL/postgres" -q -c "drop database if exists $DB;" -c "create database $DB;"

for file in "$ROOT"/scripts/test-migrations.sql "$ROOT"/supabase/migrations/*.sql; do
  psql "$PGURL/$DB" -q -v ON_ERROR_STOP=1 -f "$file" > /dev/null
done

echo "Migrations applied cleanly."

results=$(psql "$PGURL/$DB" -q -v ON_ERROR_STOP=1 -t -A -F'|' -f "$ROOT/scripts/test-rls.sql" 2>&1 |
  grep -E '\|(t|f)$' || true)

if [ -z "$results" ]; then
  echo "No checks ran. Something is wrong with the harness."
  exit 1
fi

failed=0
while IFS='|' read -r label pass; do
  if [ "$pass" = "t" ]; then
    printf '  %-32s PASS\n' "$label"
  else
    printf '  %-32s *** FAIL ***\n' "$label"
    failed=1
  fi
done <<< "$results"

total=$(printf '%s\n' "$results" | wc -l | tr -d ' ')

if [ "$failed" -ne 0 ]; then
  echo "Some database checks failed."
  exit 1
fi

echo "All $total database checks passed."
