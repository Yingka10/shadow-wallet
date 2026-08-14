// P1-A3 — 正式 Plan Bridge 的持久化不變式
//
// ─────────────────────────────────────────────────────────────────────────────
// 這一組守的是六件事，而每一件只有在 SQL 裡才真正成立：
//
//   1. **正式計畫的做法作者是孩子。** 不為了讓 Direct Confirm 過而假裝是 AI。
//   2. **計畫本體由伺服器複製。** 呼叫端送不進第二份計畫。
//   3. **enrichment 只補政策欄位。** P0 Plan Draft 的標題／摘要／下一步／
//      建議節奏一個都不准覆蓋孩子。
//   4. **progressionKind ≠ progress_model，更 ≠ payout。**
//   5. **一場對話最多一個正式版本。**
//   6. **停在 proposed。** 不建任務、不發幣、不碰錢包。
//
// 斷言刻意有一半是「**沒有**出現某些字」—— 那才是這幾條會被破壞的方式。
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations');
// 行尾正規化：Windows 上 autocrlf 會讓跨行斷言隨 checkout 方式時綠時紅。
const SQL = readFileSync(
  join(MIGRATIONS, '20260825000000_child_confirmed_plan_bridge.sql'),
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

const PUBLISH = 'publish_child_confirmed_plan_v1';

/**
 * 這支**新增**的 SQL —— 不含被原封不動抄回來的 append-only guard。
 *
 * 那個 guard 本來就列著 confirmed_payout_basis、confirmed_source_task_id
 * 這些欄位（它的工作就是擋住它們被改）。把它算進「這一包有沒有碰 payout」
 * 的檢查裡，只會逼下一個人為了讓測試變綠而把 guard 的保護拿掉。
 */
const NEW_CODE = CODE.replace(
  CODE.slice(
    CODE.indexOf('FUNCTION public.child_proposal_plan_version_guard('),
    CODE.indexOf('$$;', CODE.indexOf('FUNCTION public.child_proposal_plan_version_guard(')),
  ),
  '',
);

// ---------------------------------------------------------------------------

describe('1. 正式計畫的做法作者是孩子', () => {
  it('RPC 寫死 authored_by = child，不從命令讀', () => {
    const publish = body(PUBLISH);
    expect(publish).toContain("'child', auth.uid()");
    // 收 authoredBy 的話，某一天「先讓 Direct Confirm 能用」就會有人傳 'ai'。
    expect(publish).not.toMatch(/p_command\s*->>?\s*'authoredBy'/);
  });

  it('CHECK 讓「帶 planning lineage 但作者不是孩子」寫不出來', () => {
    expect(CODE).toContain('child_proposal_plan_versions_planning_authored_by_child');
    expect(CODE).toMatch(
      /planning_authored_by_child[\s\S]*?CHECK \(source_planning_session_id IS NULL OR authored_by = 'child'\)/,
    );
  });

  it('不去改 Direct Confirm 的 AI-authored 前提', () => {
    // 目前 confirm_child_proposal_v1 要求 current plan 是 authored_by='ai'，
    // 所以 P1 版本會被 PLAN_NOT_CONFIRMABLE 擋 —— **那是對的**。
    // Parent Confirmation 的語意還沒重新定義（P1-A4），在那之前放寬它
    // 等於讓家長對著一份沒有設計過的流程按確認。
    expect(CODE).not.toContain('confirm_child_proposal_v1');
    expect(CODE).not.toContain('PLAN_NOT_CONFIRMABLE');
  });
});

describe('2. 計畫本體由伺服器從 session 複製', () => {
  const publish = body(PUBLISH);

  it('計畫來自 session.confirmed_plan', () => {
    expect(publish).toContain('v_plan := v_session.confirmed_plan');
  });

  it('命令裡出現任何一份計畫文字就整筆拒絕', () => {
    expect(publish).toContain('PLAN_NOT_CLIENT_SUPPLIED');
    for (const key of [
      'plan',
      'confirmedPlan',
      'childConfirmedPlan',
      'planTitle',
      'planSummary',
      'nextStep',
      'desiredOutcome',
      'actionPlanSummary',
    ]) {
      expect({ key, rejected: publish.includes(`'${key}'`) }).toEqual({ key, rejected: true });
    }
  });

  it('計畫的欄位不從 p_command 讀，只從 v_plan 讀', () => {
    // 「伺服器複製」如果只是把 p_command 換個變數名，等於沒有做。
    expect(publish).toContain("v_plan ->> 'desiredOutcome'");
    expect(publish).toContain("v_plan ->> 'actionPlanSummary'");
    expect(publish).toContain("v_plan -> 'nextAction' ->> 'text'");
    expect(publish).not.toMatch(/p_command[^;]*'desiredOutcome'\s*\)?\s*,?\s*$/m);
  });
});

describe('3. enrichment 只補政策欄位', () => {
  const publish = body(PUBLISH);

  it('P0 Plan Draft 那幾個「看起來更漂亮」的欄位一律拒絕', () => {
    expect(publish).toContain('ENRICHMENT_MAY_NOT_OVERRIDE_CHILD');
    for (const key of [
      'planTitle',
      'planSummary',
      'nextStepSuggestion',
      'cadence',
      'desiredOutcome',
      'actionPlanSummary',
      'currentFocus',
      'phases',
      'progressionKind',
      'provenance',
    ]) {
      expect({ key, rejected: publish.includes(`'${key}'`) }).toEqual({ key, rejected: true });
    }
  });

  it('可以用的只有政策層那幾個', () => {
    for (const key of [
      'purposeCategory',
      'completionDescription',
      'durationType',
      'durationDays',
      'estimatedMinutes',
      'taskPolicyVersion',
    ]) {
      expect({ key, used: publish.includes(`'${key}'`) }).toEqual({ key, used: true });
    }
    // 判定要有依據的政策版本，否則整欄退回 not_evaluated。
    expect(publish).toContain("v_eligibility := 'not_evaluated'");
  });

  it('enrichment 掛掉時孩子的計畫照樣成立', () => {
    // AI policy helper 掛掉不可以把孩子已經確認的提案永遠鎖在 draft。
    expect(publish).toContain("'unavailable'");
    expect(publish).toContain('enrichment_status');
    // 但不可以假裝成功。
    expect(CODE).toMatch(
      /enrichment_status_check[\s\S]*?IN \('enriched', 'unavailable'\)/,
    );
  });
});

describe('4. 節奏：孩子 > 孩子原提案 > 未決定', () => {
  const publish = body(PUBLISH);

  it('判準是 provenance，不是「這一欄有沒有值」', () => {
    // 契約允許模型在孩子沒表態時提一個節奏（provenance 標 ai_suggested）。
    // 孩子按確認是同意計畫的方向，不是逐欄拍板每個細節 —— 直接寫進正式
    // 欄位的話，家長會看到「孩子想一週三次」，而他從來沒這樣說過。
    expect(publish).toMatch(
      /provenance' -> 'fields' ->> 'cadence'\)\s*\n?\s*IN \('child_stated', 'derived_from_child'\)/,
    );
    expect(publish).toMatch(
      /provenance' -> 'fields' ->> 'sessionSize'\)\s*\n?\s*IN \('child_stated', 'derived_from_child'\)/,
    );
  });

  it('先讀孩子確認過的計畫，再退回提案上的選擇', () => {
    expect(publish).toContain("v_plan -> 'cadence'");
    expect(publish).toContain('v_proposal.cadence_mode');
    // 兩個來源都沒有時就是沒有 —— 這裡沒有第三個「建議值」的來源。
    expect(publish).not.toMatch(/v_cadence_mode\s*:=\s*'(weekly_frequency|fixed_days)'/);
    expect(publish).not.toMatch(/v_weekly\s*:=\s*\d/);
  });

  it('沒決定就列進 requires_parent_decision，不捏一個出來', () => {
    expect(publish).toContain("v_pending := v_pending || 'cadence'");
    expect(publish).toContain("v_pending := v_pending || 'duration'");
    expect(publish).toContain("v_pending := v_pending || 'reward'");
    // 自己生 durationDays = 30 / weeklyFrequency = 3 是這一包最想防的事。
    expect(publish).not.toMatch(/v_duration_days\s*:=\s*\d/);
  });
});

describe('5. progressionKind 不是 progress_model，也不是 payout', () => {
  const publish = body(PUBLISH);

  it('只有 rhythm ＋ long_term ＋ 真有節奏才是 weekly_rhythm', () => {
    expect(publish).toMatch(
      /v_progression = 'rhythm'\s*\n\s*AND v_duration = 'long_term'\s*\n\s*AND v_cadence_mode IN \('weekly_frequency', 'fixed_days'\)/,
    );
    expect(publish).toContain("v_progress := 'weekly_rhythm'");
  });

  it('staged / accumulation 不會變成 weekly_rhythm', () => {
    // 塞進去的話，孩子畫面會出現一個沒有依據的「本週 0/0」。
    expect(publish).not.toMatch(/'staged'[\s\S]{0,80}weekly_rhythm/);
    expect(publish).not.toMatch(/'accumulation'[\s\S]{0,80}weekly_rhythm/);
    expect(publish).toContain('v_progress := NULL');
  });

  it('progress_model 的合法值沒有被擴充', () => {
    expect(CODE).not.toContain('progress_model_check');
    expect(CODE).not.toContain("'staged_progress'");
    expect(CODE).not.toContain("'accumulation'::");
  });

  it('沒有任何 progression → payout 的對應', () => {
    // staged ≠ per_milestone，accumulation ≠ final_completion。
    // payout policy 有自己的正式語意，這一包一個字都不碰。
    for (const forbidden of [
      'per_milestone',
      'final_completion',
      'per_period',
      'payout_basis',
      'payout_type',
    ]) {
      expect({ forbidden, present: NEW_CODE.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });

  it('goalControlType 完全不參與資格或幣值', () => {
    expect(CODE).not.toContain('goalControlType');
    expect(CODE).not.toContain('external_outcome');
    expect(CODE).not.toContain('directly_actionable');
  });
});

describe('6. 一場對話最多一個正式版本', () => {
  it('用 unique index，不是先查再寫', () => {
    expect(CODE).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS child_proposal_plan_versions_planning_source_unique',
    );
    expect(CODE).toMatch(
      /planning_source_unique[\s\S]*?WHERE source_planning_session_id IS NOT NULL/,
    );
  });

  it('重送回同一版，而且在所有狀態檢查之前', () => {
    const publish = body(PUBLISH);
    const replayAt = publish.indexOf('source_planning_session_id = v_session_id');
    const statusAt = publish.indexOf("v_session.status <> 'child_confirmed'");
    const proposalAt = publish.indexOf("v_proposal.status <> 'draft'");
    expect(replayAt).toBeGreaterThan(-1);
    // 「已經成功了但回應掉了」的重試必須拿回原本那一版，
    // 而不是撞到「提案已經是 proposed」然後看到紅字。
    expect(replayAt).toBeLessThan(statusAt);
    expect(replayAt).toBeLessThan(proposalAt);
    expect(publish).toContain("'idempotentReplay', true");
  });

  it('session 必須屬於這份提案', () => {
    expect(body(PUBLISH)).toContain('SESSION_PROPOSAL_MISMATCH');
  });
});

describe('7. 停在 proposed', () => {
  const publish = body(PUBLISH);

  it('提案轉 proposed 並指向新版本', () => {
    expect(publish).toContain("status      = 'proposed'");
    expect(publish).toContain('current_plan_version_id = v_version_id');
    expect(publish).toContain("'draft', 'proposed', 'child', auth.uid()");
  });

  it('不建任務、不發幣、不碰錢包', () => {
    for (const forbidden of [
      'INSERT INTO tasks',
      'INSERT INTO child_tasks',
      'INSERT INTO transactions',
      'wallets',
      'create_parent_task',
      'confirmed_coin_amount',
      'confirmed_reward_policy',
      'reward_coin_amount',
      'time_saving',
    ]) {
      expect({ forbidden, present: NEW_CODE.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });

  it('不轉 active，也沒有碰 activated_at / task_id', () => {
    expect(NEW_CODE).not.toContain("'active'");
    expect(NEW_CODE).not.toContain('activated_at');
    expect(NEW_CODE).not.toContain('task_id');
  });

  it('effective_at 與 parent_confirmed_at 都是 NULL', () => {
    // effective_at IS NOT NULL 在 P0-8 的調整路徑上等於「已生效的共同版本」。
    // 家長還沒確認就填它，等於讓一份沒人同意過的計畫進入共同版本流程。
    expect(publish).toContain('effective_at, parent_confirmed_at');
    expect(publish).toContain('NULL, NULL');
    expect(publish).not.toMatch(/effective_at\s*=\s*v_now/);
  });
});

describe('8. Canonical planning payload', () => {
  it('四欄同進同出', () => {
    expect(CODE).toContain('child_proposal_plan_versions_planning_shape');
    expect(CODE).toMatch(/planning_shape[\s\S]*?child_confirmed_plan IS NULL/);
    expect(CODE).toMatch(/planning_shape[\s\S]*?planning_schema_version IS NULL/);
    expect(CODE).toMatch(/planning_shape[\s\S]*?enrichment_status IS NULL/);
  });

  it('child_confirmed_plan 與 ai_snapshot 是兩欄，不是同一個桶子', () => {
    // 前者是孩子點頭的產品資料，後者是某一次 enrichment 的稽核證據。
    // 合成一欄之後「AI snapshot 不能當 canonical source」就沒有意義了。
    expect(CODE).toContain('child_confirmed_plan jsonb');
    expect(CODE).toContain("v_enrich -> 'aiSnapshot'");
    expect(CODE).not.toMatch(/child_confirmed_plan\s*=\s*[^;]*ai_snapshot/);
  });

  it('新欄位一併納入 append-only guard', () => {
    const guard = body('child_proposal_plan_version_guard');
    for (const column of [
      'source_planning_session_id',
      'planning_schema_version',
      'child_confirmed_plan',
      'requires_parent_decision',
      'enrichment_status',
    ]) {
      expect({ column, guarded: guard.includes(`NEW.${column} IS DISTINCT FROM OLD.${column}`) })
        .toEqual({ column, guarded: true });
    }
    // 既有的 write-once 回饋證據規則沒有被這次改動弄掉。
    expect(guard).toContain('confirmed reward evidence is write-once');
  });

  it('requires_parent_decision 是封閉列舉', () => {
    expect(CODE).toMatch(
      /requires_parent_decision_check[\s\S]*?ARRAY\['cadence', 'session_size', 'duration', 'reward', 'purpose_category'\]/,
    );
  });
});

describe('9. 授權', () => {
  it('表的寫入權限仍然只有 RPC —— 收回預設授權，只留 SELECT', () => {
    // P1-A2.5 staging 抓到的缺口就是這一段被漏掉。這裡再寫一次是刻意的。
    expect(CODE).toContain(
      'REVOKE ALL ON child_proposal_plan_versions FROM PUBLIC, anon, authenticated;',
    );
    expect(CODE).toContain('GRANT SELECT ON child_proposal_plan_versions TO authenticated;');
    expect(CODE).not.toMatch(
      /GRANT[^;]*\b(INSERT|UPDATE|DELETE|ALL)\b[^;]*child_proposal_plan_versions/,
    );
  });

  it('RPC 收回 anon 的執行權', () => {
    expect(CODE).toContain(
      `REVOKE ALL ON FUNCTION public.${PUBLISH}(jsonb) FROM PUBLIC, anon;`,
    );
    expect(CODE).toContain(
      `GRANT EXECUTE ON FUNCTION public.${PUBLISH}(jsonb) TO authenticated;`,
    );
  });

  it('沿用既有的家庭邊界，沒有另外發明一套', () => {
    expect(body(PUBLISH)).toContain('assert_child_in_caller_family');
    // actorRole 是稽核／UI 角色，不是身分證明。
    expect(CODE).not.toContain('actorRole');
  });
});

describe('10. provider 中立', () => {
  it('沒有任何 provider 專屬的欄位或字眼', () => {
    for (const forbidden of ['gemini', 'google', 'openai', 'anthropic', 'candidates']) {
      expect({ forbidden, present: CODE.toLowerCase().includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });
});
