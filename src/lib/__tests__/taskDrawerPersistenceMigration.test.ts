// 第七階段 A — task_drawer_persistence_v1 migration 驗證
//
// 這是**靜態驗證**，不是跑起來的 SQL 測試。
//
// 專案沒有本機 Postgres：supabase CLI 有（2.99.0），但 `supabase db reset`
// 需要 Docker，而這台機器沒有 Docker，也不能為了測試新增 dependency。
// 既有的兩支 migration 測試（settleInterestMigration / readingDemoMigration）
// 用的也是同一種做法：對 migration 檔案的內容做斷言。
//
// 所以這裡驗的是「這支 migration 有沒有寫出該有的保證」——
// 授權檢查、政策 guard、guard 在 insert 之前、grant/revoke、
// 子表與 constraint、以及完成流程的向後相容。
// 真正跑一次 SQL 要等到有 Docker 或 staging 環境（見報告 §19）。

import { readFileSync } from 'fs';
import { join } from 'path';

const SQL = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260728000000_task_drawer_persistence_v1.sql'),
  'utf8',
);

/**
 * 去掉註解之後的 SQL。
 * 「這個東西不存在」的斷言必須看實際程式碼 —— 註解裡解釋「為什麼不存 reminder_mode」
 * 本身就會讓字串比對命中。
 */
const CODE = SQL
  .split(/\r?\n/)
  .filter(line => !line.trim().startsWith('--'))
  .join('\n');

/** RPC 主體的起訖，用來判斷某段程式碼在函式的哪個位置。 */
const RPC_START = SQL.indexOf('CREATE OR REPLACE FUNCTION public.create_parent_task_v1');
const FIRST_TASK_INSERT = SQL.indexOf('INSERT INTO tasks (', RPC_START);

function indexInRpc(needle: string): number {
  const i = SQL.indexOf(needle, RPC_START);
  return i;
}

// ---------------------------------------------------------------------------
// 可重複套用
// ---------------------------------------------------------------------------

describe('migration 可以重複套用', () => {
  it('欄位用 IF NOT EXISTS，不會第二次就炸掉', () => {
    const addColumns = SQL.match(/ADD COLUMN(?! IF NOT EXISTS)/g) ?? [];
    expect(addColumns).toEqual([]);
  });

  it('constraint 先 DROP IF EXISTS 再 ADD', () => {
    const added = [...SQL.matchAll(/ADD CONSTRAINT (\w+)/g)].map(m => m[1]);
    // CREATE TABLE 裡的 inline constraint 不需要 drop，這裡只看 ALTER TABLE 加的。
    const alterAdded = [...SQL.matchAll(/ALTER TABLE \w+ ADD CONSTRAINT (\w+)/g)].map(m => m[1]);
    expect(alterAdded.length).toBeGreaterThan(0);
    for (const name of alterAdded) {
      expect({ name, dropped: SQL.includes(`DROP CONSTRAINT IF EXISTS ${name}`) })
        .toEqual({ name, dropped: true });
    }
    expect(added.length).toBeGreaterThanOrEqual(alterAdded.length);
  });

  it('表用 CREATE TABLE IF NOT EXISTS、policy 先 DROP IF EXISTS', () => {
    const creates = SQL.match(/CREATE TABLE(?! IF NOT EXISTS)/g) ?? [];
    expect(creates).toEqual([]);

    const policies = [...SQL.matchAll(/CREATE POLICY "([^"]+)"/g)].map(m => m[1]);
    expect(policies.length).toBe(5);
    for (const name of policies) {
      expect({ name, dropped: SQL.includes(`DROP POLICY IF EXISTS "${name}"`) })
        .toEqual({ name, dropped: true });
    }
  });

  it('新欄位都可為 null（舊 task 沒有這些資訊，也不做沒依據的猜測 backfill）', () => {
    // created_from_preset 是唯一的例外：它有 default false，語義明確。
    const notNullAdds = [...SQL.matchAll(/ADD COLUMN IF NOT EXISTS\s+(\w+)[^,;]*NOT NULL/g)]
      .map(m => m[1]);
    expect(notNullAdds).toEqual(['created_from_preset']);
    expect(SQL).toContain('created_from_preset    boolean NOT NULL DEFAULT false');
    expect(SQL).not.toMatch(/UPDATE tasks SET (duration_type|reward_policy|completion_policy)/);
  });
});

// ---------------------------------------------------------------------------
// tasks 欄位
// ---------------------------------------------------------------------------

describe('tasks 語意欄位', () => {
  const REQUIRED_COLUMNS = [
    'duration_type', 'plan_mode', 'task_source', 'reward_policy', 'completion_policy',
    'original_expectation', 'completion_description', 'task_details', 'notes',
    'schedule_mode', 'weekly_frequency', 'start_date', 'scheduled_date',
    'preferred_time', 'preferred_time_custom', 'estimated_minutes',
    'review_enabled', 'review_after_days', 'support_level',
    'task_policy_version', 'reward_policy_version',
    'preset_family_id', 'preset_variant_id', 'preset_catalog_version',
    'command_schema_version', 'created_from_preset',
  ];

  it('規格點名的欄位全部加上了', () => {
    for (const column of REQUIRED_COLUMNS) {
      expect({ column, added: SQL.includes(`ADD COLUMN IF NOT EXISTS ${column}`) })
        .toEqual({ column, added: true });
    }
  });

  it('estimated_minutes 是新欄位，不覆寫 base_time_min', () => {
    expect(SQL).toContain('ADD COLUMN IF NOT EXISTS estimated_minutes');
    // 建立時 base_time_min 寫死 0，不吃命令的分鐘數。
    expect(SQL).not.toMatch(/base_time_min\s*=\s*.*estimated/i);
    expect(indexInRpc('0, 1, NULL, 0,')).toBeGreaterThan(0);
  });

  it('scheduled_date 不寫進 due_date', () => {
    expect(SQL).toContain('-- due_date 不用來裝 scheduled_date');
    expect(SQL).not.toMatch(/due_date[^\n]*scheduledDate/);
  });

  it('reminder_mode 沒有被存進 DB', () => {
    expect(CODE).not.toContain('reminder_mode');
    expect(CODE).not.toContain("'reminderMode'");
  });

  it('constraint 涵蓋規格要求的允許值', () => {
    expect(SQL).toContain("duration_type IN ('one_time', 'recurring', 'long_term')");
    expect(SQL).toContain("plan_mode IN ('growth_plan', 'short_support', 'family_role')");
    expect(SQL).toContain("'parent', 'child', 'co_created', 'system', 'system_suggested'");
    expect(SQL).toContain("'record_only', 'family_contribution', 'progress_only'");
    expect(SQL).toContain("'coin_eligible', 'time_saving_eligible'");
    expect(SQL).toContain("'one_time', 'fixed_days', 'weekly_frequency', 'plan_schedule'");
  });

  it('support_level 涵蓋家庭角色與單次任務兩套值', () => {
    for (const level of [
      'together_first', 'remind_then_check', 'independent_with_help',
      'independent', 'check_after', 'do_together',
    ]) {
      expect({ level, allowed: SQL.includes(`'${level}'`) }).toEqual({ level, allowed: true });
    }
  });

  it('數值與日期有合理範圍檢查', () => {
    expect(SQL).toContain('weekly_frequency BETWEEN 1 AND 7');
    expect(SQL).toContain('estimated_minutes > 0');
    expect(SQL).toContain('review_after_days > 0');
    expect(SQL).toContain('command_schema_version > 0');
    expect(SQL).toContain('started_at::date <= end_date');
  });
});

// ---------------------------------------------------------------------------
// long_term_goals 與子表
// ---------------------------------------------------------------------------

describe('long_term_goals', () => {
  it('補上結束日與回顧設定，沿用既有的 total_days / started_at', () => {
    expect(SQL).toContain('ADD COLUMN IF NOT EXISTS end_date');
    expect(SQL).toContain('ADD COLUMN IF NOT EXISTS first_review_after_days');
    expect(SQL).toContain('ADD COLUMN IF NOT EXISTS weekend_review_enabled');
    // total_days / started_at 已有等價欄位，不重複新增。
    expect(SQL).not.toContain('ADD COLUMN IF NOT EXISTS duration_days');
    expect(SQL).not.toContain('ADD COLUMN IF NOT EXISTS start_date date,\n  ADD COLUMN IF NOT EXISTS end_date');
  });

  it('只有長期形式才建立 goal row', () => {
    expect(indexInRpc("IF v_duration_type = 'long_term' THEN")).toBeGreaterThan(0);
    const goalInsert = indexInRpc('INSERT INTO long_term_goals');
    const guard = indexInRpc("IF v_duration_type = 'long_term' THEN");
    expect(goalInsert).toBeGreaterThan(guard);
  });
});

describe('子表', () => {
  const TABLES = [
    'task_preset_selections',
    'task_plan_milestones',
    'task_plan_support_steps',
    'task_role_responsibilities',
    'task_change_events',
  ];

  it('五張表都建立，且 task_id 有 cascade 外鍵', () => {
    for (const table of TABLES) {
      expect({ table, created: SQL.includes(`CREATE TABLE IF NOT EXISTS ${table}`) })
        .toEqual({ table, created: true });
    }
    const cascades = SQL.match(/REFERENCES tasks\(id\) ON DELETE CASCADE/g) ?? [];
    expect(cascades.length).toBe(TABLES.length);
  });

  it('選項答案同一個 task/group/option 不重複，自填長度有限制', () => {
    expect(SQL).toContain('UNIQUE (task_id, option_group_id, option_id)');
    expect(SQL).toContain('char_length(custom_value) <= 200');
  });

  it('三張排序子表都有 sort_order，且同一 task 內不重複', () => {
    for (const table of ['task_plan_milestones', 'task_plan_support_steps', 'task_role_responsibilities']) {
      expect({ table, unique: SQL.includes(`${table}_order UNIQUE (task_id, sort_order)`) })
        .toEqual({ table, unique: true });
    }
  });

  it('沒有把里程碑或支援步驟塞進 JSONB', () => {
    expect(CODE).not.toMatch(/milestones\s+jsonb/i);
    expect(CODE).not.toMatch(/support_steps\s+jsonb/i);
    // 新表裡唯一的 jsonb 欄位是稽核快照。
    const newTableJsonb = [...CODE.matchAll(/^\s{2}(\w+)\s+jsonb,?$/gm)].map(m => m[1]);
    expect(newTableJsonb).toEqual(['snapshot']);
  });

  it('稽核事件是 append-only，且限定 event_type', () => {
    expect(SQL).toContain("event_type IN ('created_from_preset', 'updated_from_preset', 'archived')");
    expect(SQL).toContain('append-only');
  });
});

// ---------------------------------------------------------------------------
// 授權
// ---------------------------------------------------------------------------

describe('授權與 family_id', () => {
  it('anon 不可執行，authenticated 才可以', () => {
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.create_parent_task_v1(jsonb) FROM PUBLIC;');
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.create_parent_task_v1(jsonb) FROM anon;');
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.create_parent_task_v1(jsonb) TO authenticated;');
  });

  it('刻意不給 service_role 旁路', () => {
    expect(SQL).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.create_parent_task_v1\(jsonb\) TO[^;]*service_role/);
    expect(SQL).toContain('-- 刻意不 grant service_role');
  });

  it('函式內先擋未登入，不只靠 grant', () => {
    const check = indexInRpc('IF auth.uid() IS NULL THEN');
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(FIRST_TASK_INSERT);
  });

  it('family_id 由 childId 查 children，不用 parents.limit(1)', () => {
    expect(indexInRpc('SELECT c.family_id INTO v_child_family FROM children c WHERE c.id = v_child_id'))
      .toBeGreaterThan(0);
    // RPC 本體內不得出現 LIMIT 1 取家庭的寫法。
    const rpcBody = SQL.slice(RPC_START, SQL.indexOf('COMMENT ON FUNCTION public.create_parent_task_v1'));
    expect(rpcBody).not.toMatch(/FROM parents[^)]*LIMIT 1/);
  });

  it('command.familyId 必須等於 child.family_id', () => {
    expect(indexInRpc('IF v_child_family <> v_family_id THEN')).toBeGreaterThan(0);
    expect(SQL).toContain('command familyId does not match child');
  });

  it('呼叫者必須屬於這個 family，且用集合比對不是 LIMIT 1', () => {
    expect(SQL).toContain('WHERE p.user_id = auth.uid() AND p.family_id = v_child_family');
    expect(SQL).toContain('caller does not belong to family');
  });

  it('三道授權檢查都在任何 insert 之前', () => {
    for (const needle of [
      'IF auth.uid() IS NULL THEN',
      'IF v_child_family <> v_family_id THEN',
      'caller does not belong to family',
    ]) {
      expect({ needle, beforeInsert: indexInRpc(needle) < FIRST_TASK_INSERT })
        .toEqual({ needle, beforeInsert: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 政策 guard
// ---------------------------------------------------------------------------

describe('SQL policy guards', () => {
  it('時間儲蓄一律拒絕，而且是在 insert 之前就拒絕', () => {
    const guard = indexInRpc("IF v_reward = 'time_saving_eligible' THEN");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(FIRST_TASK_INSERT);
    expect(SQL).toContain('時間儲蓄建立流程尚未啟用');
  });

  it('家庭參與只能是家庭貢獻', () => {
    expect(SQL).toContain("IF v_category = 'B' AND v_reward <> 'family_contribution' THEN");
    expect(SQL).toContain('家庭參與只能以家庭貢獻回饋');
  });

  it('家庭角色：類別、回饋、結束方式、負責內容都檢查', () => {
    expect(SQL).toContain('家庭角色必須屬於家庭參與');
    expect(SQL).toContain('家庭角色的回饋固定為家庭貢獻');
    expect(SQL).toContain('家庭角色必須期滿回顧後再決定');
    expect(SQL).toContain('家庭角色至少要有一項負責內容');
  });

  it('短期支援：回饋、結束方式、期間、內容都檢查', () => {
    expect(SQL).toContain('短期支援只以進度與肯定回饋');
    expect(SQL).toContain('短期支援必須穩定後結束');
    expect(SQL).toContain('短期支援必須有明確的期間與結束日');
    expect(SQL).toContain('短期支援需要支援步驟或具體的完成標準');
  });

  it('學校作業不得成為幣源', () => {
    expect(SQL).toContain("v_preset_family = 'learn-school-assignment'");
    expect(SQL).toContain("v_reward NOT IN ('record_only', 'progress_only')");
  });

  it('單次任務必須完成一次即結束，且要有安排日期', () => {
    expect(SQL).toContain('單次任務完成一次後即結束');
    expect(SQL).toContain('單次任務需要安排日期');
  });

  it('所有 guard 都在第一個 insert 之前（被拒絕時不留半成品）', () => {
    const guards = [
      "IF v_reward = 'time_saving_eligible' THEN",
      "IF v_category = 'B' AND v_reward <> 'family_contribution' THEN",
      "IF v_plan_mode = 'family_role' THEN",
      "IF v_plan_mode = 'short_support' THEN",
      "v_preset_family = 'learn-school-assignment'",
      "IF v_duration_type = 'one_time' THEN",
    ];
    for (const guard of guards) {
      expect({ guard, before: indexInRpc(guard) < FIRST_TASK_INSERT })
        .toEqual({ guard, before: true });
    }
  });

  it('沒有在 SQL 裡重寫整份 26 family catalog', () => {
    // 只有學校作業這一個 preset id 被硬編碼（它有專屬的產品硬規則）。
    const presetIds = SQL.match(/'(learn|fam|life|own)-[a-z-]+'/g) ?? [];
    expect(new Set(presetIds)).toEqual(new Set(["'learn-school-assignment'"]));
  });
});

// ---------------------------------------------------------------------------
// 原子建立
// ---------------------------------------------------------------------------

describe('原子建立', () => {
  it('所有 insert 都在同一個函式裡，沒有 delete 補償', () => {
    const rpcBody = SQL.slice(RPC_START, SQL.indexOf('COMMENT ON FUNCTION public.create_parent_task_v1'));
    expect(rpcBody).not.toMatch(/DELETE FROM/i);
  });

  it('依序寫入 tasks → child_tasks → long_term_goals → 子表 → 事件', () => {
    const order = [
      'INSERT INTO tasks (',
      'INSERT INTO child_tasks',
      'INSERT INTO long_term_goals',
      'INSERT INTO task_preset_selections',
      'INSERT INTO task_plan_milestones',
      'INSERT INTO task_plan_support_steps',
      'INSERT INTO task_role_responsibilities',
      'INSERT INTO task_change_events',
    ].map(needle => indexInRpc(needle));

    for (const index of order) expect(index).toBeGreaterThan(0);
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });

  it('建立時寫一筆 created_from_preset 事件，帶著版本資訊', () => {
    expect(SQL).toContain("'created_from_preset', auth.uid()");
    expect(SQL).toContain('task_policy_version, command_schema_version, snapshot');
  });

  it('回傳 taskId 與 relatedIds', () => {
    expect(SQL).toContain("'taskId', v_task_id");
    expect(SQL).toContain("'relatedIds', to_jsonb(v_related)");
  });

  it('preset 溯源與 catalog 版本都寫進去', () => {
    expect(SQL).toContain('v_preset_family, v_preset_variant,');
    expect(SQL).toContain("v_meta ->> 'presetCatalogVersion'");
  });

  it('每週次數不會被丟掉', () => {
    expect(SQL).toContain("v_weekly_freq    := NULLIF(v_schedule ->> 'weeklyFrequency', '')::int;");
    expect(SQL).toContain('v_schedule_mode, v_weekly_freq, v_start_date, v_scheduled_date,');
  });

  it('三種排程各自推導出 claim 規則與 day_type', () => {
    expect(SQL).toContain("v_claim_period := 'once';");
    expect(SQL).toContain("v_day_type     := 'once';");
    expect(SQL).toContain('v_max_claims   := v_weekly_freq;');
    expect(SQL).toContain("v_day_type     := 'custom';");
  });
});

// ---------------------------------------------------------------------------
// RLS
// ---------------------------------------------------------------------------

describe('RLS 與 table 權限', () => {
  it('五張新表都啟用 RLS', () => {
    const enabled = SQL.match(/ENABLE ROW LEVEL SECURITY/g) ?? [];
    expect(enabled.length).toBe(5);
  });

  it('只有 SELECT policy —— 寫入一律走 SECURITY DEFINER 函式', () => {
    expect(SQL).not.toMatch(/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE)/i);
    const selects = SQL.match(/FOR SELECT TO authenticated/g) ?? [];
    expect(selects.length).toBe(5);
  });

  it('只 GRANT SELECT，不給 client 直接寫', () => {
    expect(SQL).toMatch(/GRANT SELECT ON task_preset_selections[\s\S]*TO authenticated;/);
    expect(SQL).not.toMatch(/GRANT INSERT ON task_/);
  });

  it('存取邊界跟著 family 走，且用集合比對', () => {
    const policyChecks = SQL.match(/SELECT p\.family_id FROM parents p WHERE p\.user_id = auth\.uid\(\)/g) ?? [];
    expect(policyChecks.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 完成流程的向後相容
// ---------------------------------------------------------------------------

describe('complete_task 的 reward_policy guard', () => {
  const COMPLETE_START = SQL.indexOf('CREATE OR REPLACE FUNCTION complete_task(');

  it('reward_policy 為 null 走 legacy path', () => {
    expect(SQL).toContain('v_legacy := (v_task.reward_policy IS NULL);');
    expect(SQL).toContain('-- 舊路徑：A/B 不發幣，其餘依 base_time_min × difficulty。');
  });

  it('legacy path 保留 A/B 不發幣與 B 類時間儲蓄', () => {
    const legacy = SQL.slice(COMPLETE_START);
    expect(legacy).toContain("IF v_task.category IN ('A', 'B') THEN");
    expect(legacy).toContain("WHEN v_task.category = 'B' THEN COALESCE(v_task.time_saving_min, 0)");
  });

  it('新任務只有 coin_eligible 才進幣值流程', () => {
    expect(SQL).toContain(
      "IF v_task.reward_policy = 'coin_eligible' AND v_task.category NOT IN ('A', 'B') THEN",
    );
  });

  it('family_contribution / record_only / progress_only 都得到 0 幣', () => {
    // 三者都落在 coin_eligible 之外的 ELSE 分支。
    expect(SQL).toContain('    ELSE\n      v_coin_earned := 0;\n    END IF;');
    expect(SQL).toContain('--   family_contribution / record_only / progress_only → 只留下完成紀錄，不發幣');
  });

  it('新任務一律不寫 time_savings', () => {
    expect(SQL).toContain('-- 新任務一律不寫 time_savings');
    expect(SQL).toContain('v_time_saved := 0;');
  });

  it('time_saving_eligible 在完成端也被擋，且不會被當成 coin 或 record_only', () => {
    expect(SQL).toContain("RETURN jsonb_build_object('error', 'time_saving_not_enabled');");
  });

  it('claim_period = once 是整個生命週期一次，不分日期', () => {
    expect(SQL).toContain("IF v_task.claim_period = 'once' THEN");
    expect(SQL).toContain("      AND status   = 'completed';");
  });
});

describe('mark_task_atomic 不成為發幣後門', () => {
  it('非 coin_eligible 的新任務調整幣值一律夾到 0', () => {
    expect(SQL).toContain(
      "WHEN v_reward_policy IS NOT NULL AND v_reward_policy <> 'coin_eligible' THEN 0",
    );
  });

  it('舊任務（reward_policy 為 null）行為不變', () => {
    expect(SQL).toContain('ELSE p_adjusted_coin');
    expect(SQL).toContain('-- 舊任務（NULL）維持原本行為。');
  });
});
