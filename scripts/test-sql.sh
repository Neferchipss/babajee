#!/usr/bin/env bash
# Runs a migration plus its SQL test against the live project inside ONE
# transaction that is always rolled back, so nothing persists.
#   bash scripts/test-sql.sh supabase/migrations/0050_stock_in.sql supabase/tests/0050_stock_in.test.sql
# An empty response ([]) means every assertion passed. A "FAIL: <name>" or any
# error in the response means it did not.
set -euo pipefail
cd "$(dirname "$0")/.."
migration="${1:?which migration file?}"
test="${2:?which test file?}"
token=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"\r')
ref=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | sed -E 's#.*https://([^.]+)\..*#\1#' | tr -d '"\r')
python -I -c '
import json, sys
parts = ["begin;\n"] + [open(p, encoding="utf-8").read() + "\n" for p in sys.argv[1:]] + ["rollback;\n"]
print(json.dumps({"query": "".join(parts)}))' "$migration" "$test" |
  curl -sS -X POST "https://api.supabase.com/v1/projects/$ref/database/query" \
    -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d @-
echo
