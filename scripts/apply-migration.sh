#!/usr/bin/env bash
# Applies one migration file to the live Supabase project through the
# Management API (SUPABASE_ACCESS_TOKEN in .env.local).
#   bash scripts/apply-migration.sh supabase/migrations/0030_gst_brackets.sql
set -euo pipefail
cd "$(dirname "$0")/.."
file="${1:?which migration file?}"
token=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"\r')
ref=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | sed -E 's#.*https://([^.]+)\..*#\1#' | tr -d '"\r')
python -I -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1], encoding="utf-8").read()}))' "$file" |
  curl -sS -X POST "https://api.supabase.com/v1/projects/$ref/database/query" \
    -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d @-
echo
