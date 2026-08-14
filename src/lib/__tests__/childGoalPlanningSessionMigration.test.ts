// P1-A2 — Planning Session 的持久化不變式
//
// ─────────────────────────────────────────────────────────────────────────────
// 這一組守的是四件事，而它們每一件都只有在 SQL 裡才真正成立：
//
//   1. **這不是 Plan Version。** 一場還沒定案的對話不可以出現在正式共同
//      計畫的生命週期上，也不可以帶著幣值。
//   2. **確認過的計畫不可變，而且不是呼叫端送進來的。**
//   3. **上限由 DB 自己算。** 次數收呼叫端的值，上限就只是建議。
//   4. **這一包停在 draft。** 確認規劃不會把提案往前推。
//
// 斷言刻意有一半是「**沒有**出現某些字」—— 那才是這幾條會被破壞的方式。
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join } from 'path';

import {
  CHILD_GOAL_PLANNING_MAX_ATTEMPTS,
  CHILD_GOAL_PLANNING_MAX_ROUNDS,
} from '../childPlanning/types';

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations');
// 行尾正規化：Windows 上 autocrlf 會讓跨行斷言隨 checkout 方式時綠時紅。
const SQL = readFileSync(
  join(MIGRATIONS, '20260822000000_child_goal_planning_sessions.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

/** 去掉註解，只留真正會被執行的 SQL。註解裡提到某個字不算數。 */
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

describe('1. 這是思考過程，不是 Plan Version', () => {
  it('自己一張表，沒有寫進 child_proposal_plan_versions', () => {
    expect(CODE).toContain('CREATE TABLE IF NOT EXISTS child_goal_planning_sessions');
    // 一場還在問「你想先怎麼開始？」的對話出現在那條線上，
    // 家長端會看到「有一個新版本」。
    expect(CODE).not.toContain('INSERT INTO child_proposal_plan_versions');
    expect(CODE).not.toContain('add_child_proposal_plan_version');
  });

  it('沒有任何幣值 / 資格 / 定價欄位', () => {
    // P1 的計畫回答的是「怎麼往前走」。分類、完成標準、資格、幣值
    // 是 P1-A3 的 policy enrichment —— 在這裡先長出來，就會有人開始寫入。
    for (const forbidden of [
      'coin',
      'reward',
      'eligibility',
      'purpose_category',
      'completion_description',
      'policy_version',
    ]) {
      expect({ forbidden, present: CODE.toLowerCase().includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });

  it('沒有 provider 專屬的欄位或字眼', () => {
    // 換付費 API 時這張表一個欄位都不用改。
    //
    // 比對的是**會被執行的 SQL**：註解裡寫「這裡存的不是 Gemini 的回應本體」
    // 正是我們要的說明，把它一起禁掉只會讓下一個人刪掉那句話。
    for (const forbidden of ['gemini', 'google', 'openai', 'anthropic', 'candidates', 'raw_']) {
      expect({ forbidden, present: CODE.toLowerCase().includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });
});

describe('2. 不變式 A：一個提案同時只有一場進行中的對話', () => {
  it('用 partial unique index，不是先查再寫', () => {
    // 先查再寫在兩個裝置同時按下去時會兩個都通過，
    // 而連點兩下正是孩子最容易做的事。
    expect(CODE).toContain('CREATE UNIQUE INDEX IF NOT EXISTS child_goal_planning_sessions_one_active_idx');
    expect(CODE).toMatch(/one_active_idx[\s\S]*?WHERE status IN \('in_progress', 'ready'\)/);
  });

  it('已確認的那些不佔位子 —— 重新規劃開得了新的一場', () => {
    // 條件是「還沒確認」而不是「全部」：確認過的是歷史，要留著。
    const index = /one_active_idx[\s\S]*?;/.exec(CODE)?.[0] ?? '';
    expect(index).not.toContain('child_confirmed');
  });
});

describe('3. 不變式 C：孩子確認過的計畫不可變', () => {
  const guard = body('child_goal_planning_session_guard');

  it('trigger 擋掉對已確認計畫的任何修改', () => {
    expect(guard).toContain("OLD.status = 'child_confirmed'");
    expect(guard).toContain('NEW.confirmed_plan IS DISTINCT FROM OLD.confirmed_plan');
  });

  it('對話只能變長 —— 截短等於刪掉孩子說過的話', () => {
    expect(guard).toContain('jsonb_array_length(NEW.conversation_context)');
  });

  it('revision 不可倒退 —— 否則一個舊的寫入會突然變合法', () => {
    expect(guard).toContain('NEW.revision < OLD.revision');
  });

  it('confirmed 狀態與計畫是同一件事，CHECK 不准只有一半', () => {
    expect(CODE).toContain('child_goal_planning_sessions_confirmed_shape');
  });
});

describe('4. 確認的計畫由 RPC 複製，不是呼叫端送的', () => {
  const confirm = body('confirm_child_goal_planning_session_v1');

  it('計畫來自 latest_result，命令裡沒有計畫這個東西', () => {
    // 與 confirmed_reward 從 tasks 複製同一個理由：呼叫端送得進來的話，
    // 孩子確認的就不一定是他螢幕上那一份。
    expect(confirm).toContain("v_plan := v_session.latest_result -> 'plan'");
    expect(confirm).not.toMatch(/p_command\s*->\s*'plan'/);
    expect(confirm).not.toMatch(/p_command\s*->\s*'confirmedPlan'/);
  });

  it('重複確認回原本那筆，不是錯誤', () => {
    expect(confirm).toContain("'idempotentReplay', true");
  });
});

describe('5. 上限由 DB 自己算', () => {
  const record = body('record_child_goal_planning_round_v1');

  it('次數不收呼叫端的值', () => {
    // 收的話，一個被改過的 client 每次都送 0 就能無限問下去。
    expect(record).not.toMatch(/p_command\s*->>?\s*'roundsUsed'/);
    expect(record).not.toMatch(/p_command\s*->>?\s*'attemptsUsed'/);
    expect(record).toContain('v_session.rounds_used +');
    expect(record).toContain('v_session.attempts_used + 1');
  });

  it('逾時不吃 round，但吃 attempt', () => {
    // 一次逾時不是孩子講得不清楚，不該吃掉他被問的額度；
    // 但它必須吃掉「再試一次」的額度，否則服務掛著時會按到天荒地老。
    expect(record).toContain("v_failed := v_status = 'unavailable'");
    expect(record).toContain('IF NOT v_failed AND v_session.rounds_used >=');
  });

  it('DB 的上限與 App 端常數同值', () => {
    expect(CODE).toMatch(
      new RegExp(`child_goal_planning_max_rounds[\\s\\S]{0,120}?${CHILD_GOAL_PLANNING_MAX_ROUNDS}::smallint`),
    );
    expect(CODE).toMatch(
      new RegExp(`child_goal_planning_max_attempts[\\s\\S]{0,120}?${CHILD_GOAL_PLANNING_MAX_ATTEMPTS}::smallint`),
    );
  });
});

describe('6. 不變式 B / D / E', () => {
  it('B：只有 draft 提案可以規劃 —— 三支 RPC 都擋', () => {
    for (const name of [
      'start_child_goal_planning_session_v1',
      'record_child_goal_planning_round_v1',
      'confirm_child_goal_planning_session_v1',
    ]) {
      expect({ name, guarded: body(name).includes("<> 'draft'") }).toEqual({ name, guarded: true });
    }
  });

  it('D：授權沿用既有的家庭邊界，沒有另外發明一套', () => {
    for (const name of [
      'start_child_goal_planning_session_v1',
      'record_child_goal_planning_round_v1',
      'confirm_child_goal_planning_session_v1',
    ]) {
      expect({ name, asserted: body(name).includes('assert_child_in_caller_family') })
        .toEqual({ name, asserted: true });
    }
    // actorRole 不是身分證明，這一包不該假裝它是。
    expect(CODE).not.toContain('actorRole');
  });

  it('E：clientRequestId 在任何狀態檢查之前就決定', () => {
    const start = body('start_child_goal_planning_session_v1');
    const replayAt = start.indexOf('client_request_id = v_client_id');
    const statusAt = start.indexOf("v_proposal.status <> 'draft'");
    expect(replayAt).toBeGreaterThan(-1);
    // 「已經成功了但回應掉了」的重試必須拿回原本那筆，而不是撞到狀態檢查。
    expect(replayAt).toBeLessThan(statusAt);
  });
});

describe('7. 寫入只走 RPC，讀取只限家庭', () => {
  it('RLS 開著，而且只有 SELECT policy', () => {
    expect(CODE).toContain('ENABLE ROW LEVEL SECURITY');
    expect(CODE).toContain('FOR SELECT TO authenticated');
    expect(CODE).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)\s+TO/);
  });

  it('table 權限與 child_proposals 一致：收回預設授權，只留 SELECT', () => {
    // 2026-08-14 staging acceptance 抓到的：建表時沒有收回 Supabase 對
    // public schema 的預設授權，於是 anon / authenticated 對這張表還有
    // INSERT / UPDATE / DELETE 的 table-level 權限。
    //
    // RLS 擋得住（沒有寫入 policy），所以不是現成的漏洞 —— 但同家族其他
    // 五張表都有明確 REVOKE，差別在縱深：留著預設授權的話，只要之後有人
    // 加一條寬鬆的寫入 policy，權限那一層已經是開的了。
    // 只看會被執行的 SQL —— 註解裡解釋「其他表都有 REVOKE ALL」正是我們要的
    // 說明，把它一起掃進去只會逼下一個人刪掉那段話。
    const grants = readFileSync(
      join(MIGRATIONS, '20260824000000_child_goal_planning_sessions_grants.sql'),
      'utf8',
    )
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    expect(grants).toContain(
      'REVOKE ALL ON child_goal_planning_sessions FROM PUBLIC, anon, authenticated;',
    );
    expect(grants).toContain('GRANT SELECT ON child_goal_planning_sessions TO authenticated;');
    // 寫入一律走 RPC —— 這裡不該出現任何寫入授權。
    expect(grants).not.toMatch(/GRANT[^;]*\b(INSERT|UPDATE|DELETE|ALL)\b[^;]*child_goal_planning_sessions/);
  });

  it('三支 RPC 都收回 anon 的執行權', () => {
    for (const name of [
      'start_child_goal_planning_session_v1',
      'record_child_goal_planning_round_v1',
      'confirm_child_goal_planning_session_v1',
    ]) {
      expect(CODE).toContain(`REVOKE ALL ON FUNCTION public.${name}(jsonb) FROM PUBLIC, anon;`);
    }
  });
});

describe('8. 這一包停在 draft', () => {
  const confirm = body('confirm_child_goal_planning_session_v1');

  it('孩子確認規劃**不會**把提案轉成 proposed', () => {
    // 現在就轉的話，孩子看的是 P1 計畫、家長看到的會是另一份 P0 草稿。
    // 兩份「真正的計畫」不可以同時存在 —— P1-A3 才做那座橋。
    expect(confirm).not.toContain('transition_child_proposal');
    expect(confirm).not.toContain("'proposed'");
    expect(confirm).not.toContain('UPDATE child_proposals');
  });

  it('整份 migration 沒有碰 Direct Confirm 那條線', () => {
    expect(CODE).not.toContain('confirm_child_proposal_v1');
    expect(CODE).not.toContain('create_parent_task_v1');
    expect(CODE).not.toContain('tasks');
  });
});
