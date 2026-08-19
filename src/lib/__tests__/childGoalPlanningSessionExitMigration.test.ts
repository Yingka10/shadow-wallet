// P1-A2 Correction — Planning Session 的終點與 atomic exit
//
// ─────────────────────────────────────────────────────────────────────────────
// 補的是一個真實的漏洞：孩子按「先把想法送給爸媽」時，提案變成 proposed，
// 但那場 planning session 還停在 in_progress / ready —— 一份「進行中的規劃」
// 掛在一個已經送出去的提案上，還佔著位子、還收得了新的一輪。
//
// ⚠️ 這一組驗的是 **SQL 的結構**，不是執行結果。這支 migration 從來沒有
//    對真實資料庫套用過（staging acceptance 尚未授權），所以「它真的會這樣
//    運作」還沒有被證明。這裡證明的是「它被寫成這樣」。
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations');
const SQL = readFileSync(
  join(MIGRATIONS, '20260823000000_child_goal_planning_session_exit.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

const CODE = SQL.split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

function body(name: string): string {
  const start = CODE.indexOf(`FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = CODE.indexOf('$$;', start);
  return CODE.slice(start, end);
}

// ---------------------------------------------------------------------------

describe('B. abandoned 是一個真正的終點', () => {
  it('status 收得下它', () => {
    expect(CODE).toMatch(
      /CHECK \(status IN \('in_progress', 'ready', 'child_confirmed', 'abandoned'\)\)/,
    );
  });

  it('abandoned 不得有 confirmed_plan 或 child_confirmed_at', () => {
    // 既有的 confirmed_shape 其實已經涵蓋，但那是推論出來的保證。
    // 這一條把它寫成一個讀得懂的名字，之後有人放寬那一條時會被擋住。
    expect(CODE).toContain('child_goal_planning_sessions_abandoned_shape');
    expect(CODE).toMatch(
      /status <> 'abandoned'\s*\n?\s*OR \(confirmed_plan IS NULL AND child_confirmed_at IS NULL\)/,
    );
  });

  it('放棄過的不會復活 —— trigger 擋掉任何離開 abandoned 的轉換', () => {
    const guard = body('child_goal_planning_session_guard');
    expect(guard).toContain("OLD.status = 'abandoned' AND NEW.status IS DISTINCT FROM OLD.status");
  });

  it('abandoned 之後不再接受任何一輪', () => {
    const record = body('record_child_goal_planning_round_v1');
    expect(record).toContain("v_session.status = 'abandoned'");
    expect(record).toContain("'SESSION_ABANDONED'");
  });

  it('abandoned 之後也不能反悔確認', () => {
    const confirm = body('confirm_child_goal_planning_session_v1');
    expect(confirm).toContain("v_session.status = 'abandoned'");
    expect(confirm).toContain("'SESSION_ABANDONED'");
  });
});

describe('C. 離開必須是一次原子操作', () => {
  const exit = body('submit_child_proposal_without_planning_v1');

  it('同一支 RPC 裡同時鎖提案與 session', () => {
    // 分兩次呼叫的話，中間斷掉會留下「已放棄但沒送出」或
    // 「已送出但規劃還開著」—— 而那正好是畫面在轉圈的那一刻。
    expect(exit).toContain('FROM child_proposals WHERE id = v_proposal_id FOR UPDATE');
    expect(exit).toMatch(/FROM child_goal_planning_sessions[\s\S]*?FOR UPDATE/);
  });

  it('提案必須仍是 draft', () => {
    expect(exit).toContain("v_proposal.status <> 'draft'");
  });

  it('已確認的計畫**不得**被當成沒規劃送出', () => {
    // 偷走一份孩子同意過的計畫，等於讓它從來沒發生過。
    expect(exit).toContain("v_session.status = 'child_confirmed'");
    expect(exit).toContain("'PLANNING_ALREADY_CONFIRMED'");
  });

  it('這一條排在「已經送出過了」的冪等回覆之前', () => {
    // 順序有意義：已經送出是可以冪等回覆的，偷走已確認的計畫是真的錯了。
    const confirmedAt = exit.indexOf('PLANNING_ALREADY_CONFIRMED');
    const replayAt = exit.indexOf("v_proposal.status = 'proposed'");
    expect(confirmedAt).toBeGreaterThan(-1);
    expect(confirmedAt).toBeLessThan(replayAt);
  });

  it('in_progress / ready 的 session 會被標成 abandoned', () => {
    expect(exit).toMatch(/status IN \('in_progress', 'ready', 'child_confirmed'\)/);
    expect(exit).toContain("SET status   = 'abandoned'");
  });

  it('沒有 session 也送得出去', () => {
    // AI 關著、或孩子根本沒開始規劃 —— 兩種都完全合法。
    expect(exit).toContain('IF v_session.id IS NOT NULL THEN');
    expect(exit).toContain('UPDATE child_proposals');
  });

  it('保留既有的 status event 語意：一筆 draft → proposed，actor 是 child', () => {
    expect(exit).toContain('INSERT INTO child_proposal_status_events');
    expect(exit).toMatch(/'draft', 'proposed', 'child', auth\.uid\(\)/);
  });

  it('支援冪等重送 —— 連點兩下不該產生第二筆狀態事件', () => {
    expect(exit).toContain("'idempotentReplay', true");
  });

  it('授權沿用既有的家庭邊界', () => {
    expect(exit).toContain('assert_child_in_caller_family');
  });

  it('沒有碰 Plan Version、Direct Confirm、幣值或任務', () => {
    for (const forbidden of [
      'child_proposal_plan_versions',
      'confirm_child_proposal_v1',
      'create_parent_task_v1',
      'tasks',
      'coin',
      'reward',
    ]) {
      expect({ forbidden, present: CODE.toLowerCase().includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });

  it('只有 authenticated 叫得動', () => {
    expect(CODE).toContain(
      'REVOKE ALL ON FUNCTION public.submit_child_proposal_without_planning_v1(jsonb)',
    );
    expect(CODE).toContain('GRANT EXECUTE ON FUNCTION public.submit_child_proposal_without_planning_v1(jsonb)');
  });
});

describe('start 的冪等對帳沒有被這一包改掉', () => {
  it('exit RPC 不會自己開一場新的對話', () => {
    // 「送出」不該是「開始規劃」的副作用。
    expect(body('submit_child_proposal_without_planning_v1'))
      .not.toContain('INSERT INTO child_goal_planning_sessions');
  });
});
