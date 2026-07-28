#!/usr/bin/env bash
# GrowBook Demo 資料的 reset / seed 執行器。
#
# 只做三件事：確認目標是 staging、把密碼替換進去、送出 SQL。
#
#   ./run_demo.sh reset
#   ./run_demo.sh seed     # 需要 DEMO_PASSWORD
#   ./run_demo.sh reseed   # reset 之後接著 seed
#
# 走 `supabase db query --linked`，用 CLI 的臨時登入角色，**不需要資料庫密碼**。
# DEMO_PASSWORD 是 Demo 家長帳號的登入密碼，只從環境變數讀，不寫進檔案、
# 不出現在指令列、不印出來。

set -euo pipefail

EXPECTED_PROJECT="${DEMO_STAGING_REF:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
LINKED_FILE="$ROOT/supabase/.temp/project-ref"

if [ ! -f "$LINKED_FILE" ]; then
  echo "!! 中止：找不到 $LINKED_FILE，請先 supabase link" >&2
  exit 1
fi
LINKED="$(tr -d '\r\n' < "$LINKED_FILE")"

# 目標必須是明確指定的那一個。沒指定就不猜 —— 這支腳本會刪資料。
if [ -z "$EXPECTED_PROJECT" ]; then
  echo "!! 中止：請設定 DEMO_STAGING_REF，這支腳本不猜目標" >&2
  exit 1
fi
if [ "$LINKED" != "$EXPECTED_PROJECT" ]; then
  echo "!! 中止：linked ref 與 DEMO_STAGING_REF 不符" >&2
  exit 1
fi

echo "── 目標 ──"
( cd "$ROOT" && npx supabase projects list 2>/dev/null | grep '●' ) || true
echo "linked project ref : $LINKED"

# 專案名稱必須是 growbook-staging，否則停手。
NAME="$( cd "$ROOT" && npx supabase projects list 2>/dev/null \
        | awk -F'|' -v ref="$LINKED" '$3 ~ ref { gsub(/ /,"",$4); print $4 }' )"
if [ "$NAME" != "growbook-staging" ]; then
  echo "!! 中止：目標專案是「$NAME」，不是 growbook-staging" >&2
  exit 1
fi
echo "linked project name: $NAME"
echo

run_sql() {
  local file="$1"
  ( cd "$ROOT" && npx supabase db query --linked ) < "$file"
}

run_seed() {
  if [ -z "${DEMO_PASSWORD:-}" ]; then
    echo "!! 中止：seed 需要 DEMO_PASSWORD（Demo 家長帳號的登入密碼）" >&2
    exit 1
  fi
  # 用 python 做替換：sed 對多位元組內容與特殊字元都不可靠，
  # 而且這樣密碼不會出現在任何指令列參數裡。
  #
  # **一定要寫 stdout.buffer**：Windows 的 sys.stdout 預設走本機 codepage，
  # 中文任務名稱會在送進資料庫之前就被轉壞，而且壞得很安靜 ——
  # seed 會成功、筆數會正確、只有名稱是亂碼。
  ( cd "$ROOT" && DEMO_PASSWORD="$DEMO_PASSWORD" python -c "
import os, sys
sql = open(sys.argv[1], encoding='utf-8').read()
sys.stdout.buffer.write(sql.replace('__DEMO_PASSWORD__', os.environ['DEMO_PASSWORD']).encode('utf-8'))
" "$HERE/demo_seed.sql" | npx supabase db query --linked )
}

case "${1:-}" in
  reset)  run_sql "$HERE/demo_reset.sql" ;;
  seed)   run_seed ;;
  reseed) run_sql "$HERE/demo_reset.sql"; run_seed ;;
  *) echo "用法：$0 {reset|seed|reseed}" >&2; exit 1 ;;
esac
