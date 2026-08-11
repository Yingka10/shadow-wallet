#!/usr/bin/env bash
# GrowBook Demo 資料的 reset / seed 執行器。
#
#   ./run_demo.sh reset
#   ./run_demo.sh seed    --state=a     # 需要 DEMO_PASSWORD
#   ./run_demo.sh reseed  --state=a     # reset 之後接著 seed
#   ./run_demo.sh dry-run --state=a     # 只數不寫
#
# 預設 --state=a。State B（閱讀提案 4→3 → 孩子接受）尚未實作，
# 傳 --state=b 會明確拒絕，不會偷偷退回 A。
#
# 走 `supabase db query --linked`，用 CLI 的臨時登入角色，**不需要資料庫密碼**。
# DEMO_PASSWORD 是 Demo 家長帳號的登入密碼，只從環境變數讀，不寫進檔案、
# 不出現在指令列、不印出來。
#
# 這支腳本會刪資料。所有安全檢查都在真正執行之前跑完，而且沒有 --force
# 可以繞過 —— 上限被觸發代表那個 id 底下的東西不是我們以為的，該由人去看。

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
LINKED_FILE="$ROOT/supabase/.temp/project-ref"

# Demo 身分。這兩個值同時也寫在 demo_seed.sql / demo_reset.sql 裡，
# 三邊必須一致 —— demoData.test.ts 會釘住這件事。
EXPECTED_FAMILY='d0e70000-0000-4000-8000-000000000001'
EXPECTED_FAMILY_NAME='GrowBook Demo Family'
EXPECTED_CHILD='d0e70000-0000-4000-8000-000000000021'
EXPECTED_CHILD_NAME='承恩'
EXPECTED_PROJECT_NAME='growbook-staging'

# 正式環境的 project ref。這個值出現在任何一個 target 證據裡就立刻退出。
# P0-5A 與 P0-6 都已經證明 supabase/config.toml 的預設 target 指向這裡，
# 所以「執行的人記得看一下」不能當作保護。
PRODUCTION_REF='mduaghqszbwmoigllpbj'

# ── 參數 ────────────────────────────────────────────────────────────────────
CMD="${1:-}"
shift || true
STATE='a'
for arg in "$@"; do
  case "$arg" in
    --state=*) STATE="${arg#--state=}" ;;
    *) echo "!! 不認得的參數：$arg" >&2; exit 1 ;;
  esac
done

case "$STATE" in
  a) ;;
  b)
    echo "STATE_B_NOT_AVAILABLE_YET" >&2
    echo "State B（閱讀提案 → 媽媽 4→3 → 孩子接受）等 P0-5B merge 後由 P0-10B 實作。" >&2
    exit 2
    ;;
  *) echo "!! 不認得的 state：$STATE（目前只有 a）" >&2; exit 1 ;;
esac

# ── 目標必須被證明，而不是被假設 ────────────────────────────────────────────
EXPECTED_PROJECT="${DEMO_STAGING_REF:-}"
if [ -z "$EXPECTED_PROJECT" ]; then
  echo "!! 中止：請設定 DEMO_STAGING_REF，這支腳本不猜目標" >&2
  exit 1
fi

if [ ! -f "$LINKED_FILE" ]; then
  echo "!! 中止：找不到 $LINKED_FILE，請先 supabase link" >&2
  exit 1
fi
LINKED="$(tr -d '\r\n' < "$LINKED_FILE")"

# production 黑名單：三個 target 證據任何一個命中就退出。
for evidence in "$LINKED" "$EXPECTED_PROJECT" "${SUPABASE_URL:-}"; do
  case "$evidence" in
    *"$PRODUCTION_REF"*)
      echo "!! 中止：target 證據命中 production ref（$PRODUCTION_REF）" >&2
      exit 1
      ;;
  esac
done

if [ "$LINKED" != "$EXPECTED_PROJECT" ]; then
  echo "!! 中止：linked ref 與 DEMO_STAGING_REF 不符" >&2
  exit 1
fi

# 專案名稱必須是 growbook-staging。ref 打錯一個字母仍可能是別的專案，
# 名稱是比 ref 更難意外撞上的第二道證據。
NAME="$( cd "$ROOT" && npx supabase projects list 2>/dev/null \
        | awk -F'|' -v ref="$LINKED" '$3 ~ ref { gsub(/ /,"",$4); print $4 }' )"
if [ "$NAME" != "$EXPECTED_PROJECT_NAME" ]; then
  echo "!! 中止：目標專案是「$NAME」，不是 $EXPECTED_PROJECT_NAME" >&2
  exit 1
fi

run_sql() {
  ( cd "$ROOT" && npx supabase db query --linked ) < "$1"
}

run_sql_stdin() {
  ( cd "$ROOT" && npx supabase db query --linked )
}

# ── 身分證據：family 與 child 都必須是我們認得的那一組 ──────────────────────
# 沒有資料是合法狀態（剛 reset 完），有資料但名字不對就停手。
IDENTITY_SQL="$(cat <<SQL
DO \$identity\$
DECLARE
  v_family text;
  v_child  text;
BEGIN
  SELECT family_name INTO v_family FROM families WHERE id = '$EXPECTED_FAMILY';
  SELECT nickname    INTO v_child  FROM children WHERE id = '$EXPECTED_CHILD';

  IF v_family IS NOT NULL AND v_family <> '$EXPECTED_FAMILY_NAME' THEN
    RAISE EXCEPTION '中止：% 不是 Demo family（實際：%）', '$EXPECTED_FAMILY', v_family;
  END IF;
  IF v_child IS NOT NULL AND v_child <> '$EXPECTED_CHILD_NAME' THEN
    RAISE EXCEPTION '中止：% 不是 Demo child（實際：%）', '$EXPECTED_CHILD', v_child;
  END IF;
END
\$identity\$;
SELECT
  COALESCE((SELECT family_name FROM families WHERE id = '$EXPECTED_FAMILY'), '(尚未建立)') AS family,
  COALESCE((SELECT nickname FROM children WHERE id = '$EXPECTED_CHILD'), '(尚未建立)') AS child;
SQL
)"

echo "── 目標 ──"
echo "PROJECT REF  : $LINKED"
echo "PROJECT NAME : $NAME"
echo "FAMILY       : $EXPECTED_FAMILY  ($EXPECTED_FAMILY_NAME)"
echo "CHILD        : $EXPECTED_CHILD  ($EXPECTED_CHILD_NAME)"
echo "STATE        : $STATE"
echo "COMMAND      : $CMD"
echo

printf '%s\n' "$IDENTITY_SQL" | run_sql_stdin

# ── dry-run：只 SELECT / count，一列都不寫 ─────────────────────────────────
run_dry() {
  cat <<SQL | run_sql_stdin
SELECT 'WILL DELETE' AS phase, x.tbl, x.n FROM (
  SELECT 'intervention_log' AS tbl, count(*) AS n FROM intervention_log WHERE family_id = '$EXPECTED_FAMILY'
  UNION ALL SELECT 'child_proposals', count(*) FROM child_proposals WHERE family_id = '$EXPECTED_FAMILY'
  UNION ALL SELECT 'child_proposal_plan_versions', count(*) FROM child_proposal_plan_versions v
              JOIN child_proposals p ON p.id = v.proposal_id WHERE p.family_id = '$EXPECTED_FAMILY'
  UNION ALL SELECT 'reward_items', count(*) FROM reward_items ri
              JOIN children c ON c.id = ri.child_id WHERE c.family_id = '$EXPECTED_FAMILY'
  UNION ALL SELECT 'redemption_requests', count(*) FROM redemption_requests WHERE family_id = '$EXPECTED_FAMILY'
  UNION ALL SELECT 'task_completions', count(*) FROM task_completions tc
              JOIN tasks t ON t.id = tc.task_id WHERE t.family_id = '$EXPECTED_FAMILY'
  UNION ALL SELECT 'transactions', count(*) FROM transactions tr WHERE tr.wallet_id IN (
              SELECT w.id FROM wallets w JOIN children c ON c.id = w.child_id
              WHERE c.family_id = '$EXPECTED_FAMILY')
  UNION ALL SELECT 'child_tasks', count(*) FROM child_tasks ct
              JOIN tasks t ON t.id = ct.task_id WHERE t.family_id = '$EXPECTED_FAMILY'
  UNION ALL SELECT 'long_term_goals', count(*) FROM long_term_goals g
              JOIN tasks t ON t.id = g.task_id WHERE t.family_id = '$EXPECTED_FAMILY'
  UNION ALL SELECT 'tasks', count(*) FROM tasks WHERE family_id = '$EXPECTED_FAMILY'
  UNION ALL SELECT 'weekly_reports', count(*) FROM weekly_reports WHERE family_id = '$EXPECTED_FAMILY'
  UNION ALL SELECT 'growth_moments', count(*) FROM growth_moments gm
              JOIN children c ON c.id = gm.child_id WHERE c.family_id = '$EXPECTED_FAMILY'
  UNION ALL SELECT 'wallets', count(*) FROM wallets w
              JOIN children c ON c.id = w.child_id WHERE c.family_id = '$EXPECTED_FAMILY'
  UNION ALL SELECT 'children', count(*) FROM children WHERE family_id = '$EXPECTED_FAMILY'
  UNION ALL SELECT 'parents', count(*) FROM parents WHERE family_id = '$EXPECTED_FAMILY'
  UNION ALL SELECT 'families', count(*) FROM families WHERE id = '$EXPECTED_FAMILY'
) x WHERE x.n > 0
UNION ALL
SELECT 'WILL CREATE (state $STATE)', y.tbl, y.n FROM (
  VALUES ('families', 1), ('parents', 1), ('children', 1), ('wallets', 1),
         ('tasks', 6), ('child_tasks', 6), ('long_term_goals', 3),
         ('task_completions', 9), ('transactions', 3)
) y(tbl, n)
ORDER BY 1 DESC, 2;
SQL
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

case "$CMD" in
  reset)   run_sql "$HERE/demo_reset.sql" ;;
  seed)    run_seed ;;
  reseed)  run_sql "$HERE/demo_reset.sql"; run_seed ;;
  dry-run) run_dry ;;
  *) echo "用法：$0 {reset|seed|reseed|dry-run} [--state=a]" >&2; exit 1 ;;
esac
