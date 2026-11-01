#!/usr/bin/env bash
# LOCAL TESTING ONLY: runs every migration (up, then down, then up again) and every SQL test on a
# throwaway PostgreSQL cluster with the Supabase shim. Needs PostgreSQL 15+ binaries on PATH or in
# PG_BIN. Usage: supabase/tests/local/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PG_BIN:$PATH"
tmp="$(mktemp -d)"
port="${PGPORT_TEST:-55439}"
trap 'pg_ctl -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
initdb -D "$tmp/data" -U postgres -A trust >/dev/null
pg_ctl -D "$tmp/data" -o "-p $port -k $tmp -c listen_addresses=''" -l "$tmp/log" start >/dev/null
psql_() { psql -h "$tmp" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
ups() { for f in $(ls "$root"/migrations/*.up.sql | sort); do psql_ -f "$f"; done; }
downs() { for f in $(ls "$root"/migrations/*.down.sql | sort -r); do psql_ -f "$f"; done; }
psql_ -f "$here/supabase-shim.sql"
ups
downs
ups
for t in "$root"/tests/*.sql; do
  echo "== $(basename "$t")"
  if ! out="$(psql_ -f "$t" 2>&1)"; then echo "$out"; echo "FAILED: $(basename "$t")"; exit 1; fi
  echo "$out" | grep -E "NOTICE" || true
done
echo "local SQL checks: done"
