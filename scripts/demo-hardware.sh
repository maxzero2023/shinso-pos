#!/usr/bin/env bash
# AUT-70: standard hardware pack demo (simulator)
set -euo pipefail
BASE="${TEST_BASE_URL:-http://127.0.0.1:3000}"

echo "== Login floor =="
COOKIE_JAR=$(mktemp)
curl -sS -c "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"email":"floor@shinso.demo","password":"demo1234"}' \
  "$BASE/api/auth/login" | head -c 200
echo

echo "== Devices =="
curl -sS -b "$COOKIE_JAR" "$BASE/api/devices" | head -c 800
echo

echo "== Open free table =="
TABLES=$(curl -sS -b "$COOKIE_JAR" "$BASE/api/tables")
TABLE_ID=$(node -e "const d=JSON.parse(process.argv[1]); const t=(d.tables||d).find(x=>x.status==='free'); if(!t) process.exit(2); process.stdout.write(t.id)" "$TABLES")
OPEN=$(curl -sS -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"guestCount":2}' "$BASE/api/tables/$TABLE_ID/open")
CHECK_ID=$(node -e "const d=JSON.parse(process.argv[1]); process.stdout.write(d.check.id)" "$OPEN")
echo "check=$CHECK_ID"

echo "== Add item + fire (kitchen print) =="
MENU=$(curl -sS -b "$COOKIE_JAR" "$BASE/api/menu/categories")
ITEM_ID=$(node -e "const d=JSON.parse(process.argv[1]); process.stdout.write(d.categories[0].items[0].id)" "$MENU")
curl -sS -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"menuItemId\":\"$ITEM_ID\",\"qty\":1,\"modifierIds\":[]}" \
  "$BASE/api/checks/$CHECK_ID/items" >/dev/null
FIRE=$(curl -sS -b "$COOKIE_JAR" -X POST "$BASE/api/checks/$CHECK_ID/fire")
echo "$FIRE" | head -c 500
echo

echo "== Pay (receipt print) =="
CHECK=$(curl -sS -b "$COOKIE_JAR" "$BASE/api/checks/$CHECK_ID")
TOTAL=$(node -e "const d=JSON.parse(process.argv[1]); process.stdout.write(String(d.check.totalYen??d.check.totalYen??d.totalYen))" "$CHECK")
PAY=$(curl -sS -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"method\":\"paypay\",\"amountYen\":$TOTAL}" \
  "$BASE/api/checks/$CHECK_ID/pay")
echo "$PAY" | head -c 500
echo

echo "== Print jobs =="
curl -sS -b "$COOKIE_JAR" "$BASE/api/print-jobs?limit=5" | head -c 1000
echo

echo "== Simulate printer out_of_paper then retry =="
PRINTER_ID=$(curl -sS -b "$COOKIE_JAR" "$BASE/api/devices" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const d=JSON.parse(s); const p=d.devices.find(x=>x.type==='printer'); process.stdout.write(p.id)})")
curl -sS -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"status":"out_of_paper"}' "$BASE/api/devices/$PRINTER_ID/simulate" >/dev/null
curl -sS -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"type\":\"receipt\",\"checkId\":\"$CHECK_ID\",\"reprint\":true}" \
  "$BASE/api/print-jobs" | head -c 400
echo
echo "Demo paths: /devices  /pos?device=t1  /kitchen?device=display"
rm -f "$COOKIE_JAR"
