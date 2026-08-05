#!/usr/bin/env bash
# Shadow Wallet — idempotency 競態驗證的驅動腳本
#
# 為什麼要一支腳本：兩個 session 必須**真的重疊**。分兩次手動執行的話，
# 前一個很容易在後一個開始前就 commit 完了 —— 那時輸出看起來完全一樣
# （B 一樣回 idempotentReplay: true），但走的是普通查詢路徑，
# 例外處理那一段根本沒被執行到。
#
# assert 腳本會用 race_log 的時間戳擋掉這種假通過。
#
# 用法：
#   ./supabase/verify/run_idempotency_race.sh <host> <port> <db>
#
# 前提：該資料庫已經跑過 task_reward_verification.sql。

set -euo pipefail

HOST="${1:-127.0.0.1}"
PORT="${2:-55432}"
DB="${3:-growbook_task_verify}"
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -d "$DB" -v ON_ERROR_STOP=1)

REQ=$("${PSQL[@]}" -q -t -A -c "SELECT gen_random_uuid()")
echo "── 建立請求識別碼：$REQ"

# A：建立任務後 hold 住 transaction 10 秒不 commit。
"${PSQL[@]}" -v req="$REQ" -f supabase/verify/idempotency_race_a.sql > /tmp/race_a.out 2>&1 &
A_PID=$!

# 等 A 進入 pg_sleep。用 pg_sleep 當計時器而不是 sleep(1)，
# 因為某些環境（含這個專案的開發機）沒有可用的 shell sleep。
"${PSQL[@]}" -q -c "SELECT pg_sleep(2)" > /dev/null 2>&1

echo "── B 進場（此時 A 尚未 commit）"
START=$(date +%s%N)
"${PSQL[@]}" -q -t -A -v req="$REQ" -f supabase/verify/idempotency_race_b.sql 2>&1 | grep '{' || true
END=$(date +%s%N)
echo "── B 被擋住 $(( (END - START) / 1000000 )) ms"

wait "$A_PID"
echo "── A 已 commit"

"${PSQL[@]}" -f supabase/verify/idempotency_race_assert.sql
