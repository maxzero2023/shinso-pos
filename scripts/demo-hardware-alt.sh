#!/usr/bin/env bash
# AUT-110: second hardware pack + staff handheld demo (simulator)
set -euo pipefail
BASE="${TEST_BASE_URL:-http://127.0.0.1:3000}"

echo "== Login floor =="
COOKIE_JAR=$(mktemp)
curl -sS -c "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"email":"floor@shinso.demo","password":"demo1234"}' \
  "$BASE/api/auth/login" | head -c 200
echo

echo "== Devices (expect standard + alt packs) =="
DEVICES=$(curl -sS -b "$COOKIE_JAR" "$BASE/api/devices")
echo "$DEVICES" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const d=JSON.parse(s); const packs={}; for (const x of d.devices||[]) packs[x.pack]=(packs[x.pack]||0)+1; console.log(JSON.stringify({mode:d.mode,packs,codes:(d.devices||[]).map(x=>x.code)}))})"

STD_PRT=$(echo "$DEVICES" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const d=JSON.parse(s); const p=(d.devices||[]).find(x=>x.type==='printer'&&x.pack==='standard'); if(!p) process.exit(2); process.stdout.write(p.id)})")
ALT_PRT=$(echo "$DEVICES" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const d=JSON.parse(s); const p=(d.devices||[]).find(x=>x.type==='thermal_printer_alt'); if(!p) process.exit(2); process.stdout.write(p.id)})")
echo "standardPrinter=$STD_PRT altPrinter=$ALT_PRT"

echo "== Open free table (staff-like path) =="
TABLES=$(curl -sS -b "$COOKIE_JAR" "$BASE/api/tables")
TABLE_ID=$(node -e "const d=JSON.parse(process.argv[1]); const t=(d.tables||d).find(x=>x.status==='free'); if(!t) process.exit(2); process.stdout.write(t.id)" "$TABLES")
TABLE_CODE=$(node -e "const d=JSON.parse(process.argv[1]); const t=(d.tables||d).find(x=>x.id===process.argv[2]); process.stdout.write(t.code)" "$TABLES" "$TABLE_ID")
OPEN=$(curl -sS -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"guestCount":2}' "$BASE/api/tables/$TABLE_ID/open")
CHECK_ID=$(node -e "const d=JSON.parse(process.argv[1]); process.stdout.write(d.check.id)" "$OPEN")
echo "table=$TABLE_CODE check=$CHECK_ID"

echo "== Add item + fire (default routes to standard printer) =="
MENU=$(curl -sS -b "$COOKIE_JAR" "$BASE/api/menu/categories")
ITEM_ID=$(node -e "const d=JSON.parse(process.argv[1]); process.stdout.write(d.categories[0].items[0].id)" "$MENU")
curl -sS -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"menuItemId\":\"$ITEM_ID\",\"qty\":1,\"modifierIds\":[]}" \
  "$BASE/api/checks/$CHECK_ID/items" >/dev/null
FIRE=$(curl -sS -b "$COOKIE_JAR" -X POST "$BASE/api/checks/$CHECK_ID/fire")
FIRE_DEV=$(echo "$FIRE" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const d=JSON.parse(s); process.stdout.write(d.printJob?.deviceId||'')})")
echo "fire deviceId=$FIRE_DEV (expect standard)"
test "$FIRE_DEV" = "$STD_PRT"

echo "== Pay (default receipt → standard) =="
CHECK=$(curl -sS -b "$COOKIE_JAR" "$BASE/api/checks/$CHECK_ID")
TOTAL=$(node -e "const d=JSON.parse(process.argv[1]); process.stdout.write(String(d.check.totalYen??d.totalYen))" "$CHECK")
PAY=$(curl -sS -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"method\":\"paypay\",\"amountYen\":$TOTAL}" \
  "$BASE/api/checks/$CHECK_ID/pay")
PAY_DEV=$(echo "$PAY" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const d=JSON.parse(s); process.stdout.write(d.printJob?.deviceId||'')})")
echo "pay deviceId=$PAY_DEV"
test "$PAY_DEV" = "$STD_PRT"

echo "== Explicit alt reprint (does not steal default) =="
ALT_JOB=$(curl -sS -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"type\":\"receipt\",\"checkId\":\"$CHECK_ID\",\"reprint\":true,\"deviceId\":\"$ALT_PRT\"}" \
  "$BASE/api/print-jobs")
echo "$ALT_JOB" | head -c 400
echo
ALT_DEV=$(echo "$ALT_JOB" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const d=JSON.parse(s); const j=d.job||d.printJob; process.stdout.write(j.deviceId||'')})")
test "$ALT_DEV" = "$ALT_PRT"

echo "== Default reprint still standard =="
DEF_JOB=$(curl -sS -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"type\":\"receipt\",\"checkId\":\"$CHECK_ID\",\"reprint\":true}" \
  "$BASE/api/print-jobs")
DEF_DEV=$(echo "$DEF_JOB" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const d=JSON.parse(s); const j=d.job||d.printJob; process.stdout.write(j.deviceId||'')})")
echo "default reprint deviceId=$DEF_DEV"
test "$DEF_DEV" = "$STD_PRT"

echo "Demo paths: /devices  /staff  /pos?device=t1  /kitchen?device=display"
rm -f "$COOKIE_JAR"
