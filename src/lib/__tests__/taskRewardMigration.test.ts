// 第七階段 B — migration 靜態驗證
//
// ⚠️ 這**不是** integration test。它讀 .sql 檔案的文字，不連任何資料庫。
//    本機沒有 Docker（`supabase db reset` 跑不起來），也沒有獨立的 staging
//    project —— supabase/config.toml 的 project_id 與 .env 的 URL 是同一個
//    正式專案，不可以拿來試 migration。真正的 Postgres 驗證仍是待辦，
//    步驟寫在 docs/TASK_REWARD_POLICY_AUDIT.md。
//
//    這支能保證的是「SQL 裡確實寫了那些規則」，不能保證「Postgres 接受這段 SQL」。
//    專案既有的兩支 migration 測試用的也是同一種做法。

import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const SQL = readFileSync(
  join(MIGRATIONS, '20260729000000_task_reward_and_completion_authz.sql'),
  'utf8',
);

/** 去掉註解行 —— 「SQL 有做這件事」不能靠註解裡提到它來證明。 */
const CODE = SQL.split(/\r?\n/)
  .filter(line => !line.trim().startsWith('--'))
  .join('\n');

/** 取出某一支函式的定義區塊，避免跨函式誤判。 */
function functionBody(name: string): string {
  const start = CODE.indexOf(`FUNCTION ${name}(`);
  if (start < 0) throw new Error(`找不到函式：${name}`);
  const end = CODE.indexOf('\n$$;', start);
  if (end < 0) throw new Error(`找不到函式結尾：${name}`);
  return CODE.slice(start, end);
}

// ---------------------------------------------------------------------------
// 欄位
// ---------------------------------------------------------------------------

describe('成長幣欄位', () => {
  it('四個欄位都加上了，而且都是 nullable（舊資料不受影響）', () => {
    for (const column of [
      'reward_coin_amount           integer',
      'reward_coin_suggested_amount integer',
      'reward_coin_min              integer',
      'reward_coin_max              integer',
    ]) {
      expect({ column, added: CODE.includes(`ADD COLUMN IF NOT EXISTS ${column}`) })
        .toEqual({ column, added: true });
    }
    expect(CODE).not.toMatch(/reward_coin_amount\s+integer\s+NOT NULL/);
  });

  it('沒有重用 base_time_min / coin_override / estimated_minutes 當幣值', () => {
    // 三者的語義都不是「這個任務值多少幣」。
    expect(CODE).not.toMatch(/base_time_min\s*=\s*/);
    expect(CODE).not.toMatch(/reward_coin_amount\s*:?=\s*v_estimated_min/);
    expect(CODE).not.toMatch(/coin_override\s*:?=\s*v_coin_final/);
  });

  it('沒有 backfill：不對舊任務猜幣值', () => {
    expect(CODE).not.toMatch(/UPDATE\s+tasks\s+SET\s+reward_coin_amount/i);
  });
});

describe('CHECK constraint', () => {
  it('可發幣的任務一定要有正整數金額、範圍與政策版本', () => {
    expect(CODE).toContain('tasks_coin_eligible_needs_amount_check');
    expect(CODE).toContain("reward_policy IS DISTINCT FROM 'coin_eligible'");
    expect(CODE).toContain('reward_coin_amount > 0');
    expect(CODE).toContain('reward_coin_amount BETWEEN reward_coin_min AND reward_coin_max');
    // 要求的是「做出這筆定價的政策版本」，不是任務分類版本。
    expect(CODE).toContain('reward_policy_version IS NOT NULL');
  });

  it('不發幣的政策不可以夾帶幣值', () => {
    expect(CODE).toContain('tasks_non_coin_has_no_amount_check');
  });

  it('舊任務（reward_policy IS NULL）不受這兩條限制', () => {
    // 兩條 CHECK 都以 reward_policy 為前提，NULL 一律通過。
    expect(CODE).toMatch(/tasks_non_coin_has_no_amount_check[\s\S]*reward_policy IS NULL/);
  });

  it('min 不得大於 max', () => {
    expect(CODE).toContain('reward_coin_min <= reward_coin_max');
  });

  it('constraint 先 DROP IF EXISTS，可重複套用', () => {
    const adds = CODE.match(/ADD CONSTRAINT (\w+)/g) ?? [];
    expect(adds.length).toBeGreaterThan(0);
    for (const add of adds) {
      const name = add.replace('ADD CONSTRAINT ', '');
      expect({ name, dropped: CODE.includes(`DROP CONSTRAINT IF EXISTS ${name}`) })
        .toEqual({ name, dropped: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 18-21. create_parent_task_v1 的 coin guard
// ---------------------------------------------------------------------------

describe('建立時的成長幣 guard', () => {
  const RPC = functionBody('public.create_parent_task_v1');

  it('18. 缺決策或缺幣值 → 擋下', () => {
    expect(RPC).toContain("v_decision := p_command -> 'reward' -> 'decision'");
    expect(RPC).toContain('命令缺少回饋決策');
    expect(RPC).toContain('可獲得成長幣的任務缺少幣值');
  });

  it('19. 幣值為 0 → 擋下，而且訊息說得出為什麼', () => {
    expect(RPC).toContain('v_coin_final IS NULL OR v_coin_final <= 0');
    expect(RPC).toContain('不建立 0 幣的成長幣任務');
  });

  it('20. 超出 min/max → 擋下', () => {
    expect(RPC).toContain('v_coin_final < v_coin_min OR v_coin_final > v_coin_max');
    expect(RPC).toContain('不在政策允許的');
  });

  it('決策的政策與命令不一致 → 擋下', () => {
    expect(RPC).toContain('v_decision_policy IS DISTINCT FROM v_reward');
  });

  it('決策是 blocked → 擋下', () => {
    expect(RPC).toContain("v_eligibility <> 'allowed'");
  });

  it('缺 taskPolicyVersion 或 rewardPolicyVersion 都擋下，而且是分開檢查的', () => {
    expect(RPC).toContain('命令缺少任務政策版本');
    expect(RPC).toContain('回饋決策缺少回饋政策版本');
  });

  it('21. 不發幣的政策一律把幣值欄位清成 NULL，不寫假數字', () => {
    expect(RPC).toContain('v_coin_final     := NULL;');
    expect(RPC).toContain('v_coin_suggested := NULL;');
  });

  it('所有 coin guard 都在第一個 INSERT 之前', () => {
    const firstInsert = RPC.indexOf('INSERT INTO tasks');
    expect(firstInsert).toBeGreaterThan(0);
    for (const marker of [
      '命令缺少回饋決策',
      '可獲得成長幣的任務缺少幣值',
      '不建立 0 幣的成長幣任務',
      '不在政策允許的',
      'v_decision_policy IS DISTINCT FROM v_reward',
    ]) {
      expect({ marker, beforeInsert: RPC.indexOf(marker) < firstInsert })
        .toEqual({ marker, beforeInsert: true });
    }
  });

  it('沒有 delete 補償 —— 失敗靠 transaction 回滾', () => {
    expect(RPC).not.toMatch(/DELETE\s+FROM/i);
  });

  it('時間儲蓄仍然一律 POLICY_REJECTED', () => {
    expect(RPC).toContain('時間儲蓄建立流程尚未啟用');
  });

  it('兩種版本分開取、分開存，沒有一個模糊的 policy_version', () => {
    expect(RPC).toContain("v_task_policy_version   := v_meta ->> 'taskPolicyVersion'");
    expect(RPC).toContain("v_reward_policy_version := v_decision ->> 'rewardPolicyVersion'");
    expect(RPC).toContain('v_task_policy_version, v_reward_policy_version,');
    // 舊的共用欄位名不可以還留著。
    expect(CODE).not.toMatch(/[^_]policy_version/);
  });

  it('稽核事件攤平保存建議值、最終值、範圍與計算依據', () => {
    for (const key of [
      "'suggestedAmount',     v_coin_suggested",
      "'finalAmount',         v_coin_final",
      "'minAllowed',          v_coin_min",
      "'maxAllowed',          v_coin_max",
      "'calculationBasis',    v_coin -> 'calculationBasis'",
      "'rewardPolicyVersion', v_reward_policy_version",
      "'commandSchemaVersion',  v_schema_version",
      "'presetCatalogVersion',  v_meta ->> 'presetCatalogVersion'",
      "'taskPolicyVersion',     v_task_policy_version",
      "'rewardPolicyVersion',   v_reward_policy_version",
    ]) {
      expect({ key, saved: RPC.includes(key) }).toEqual({ key, saved: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 23-26. 授權
// ---------------------------------------------------------------------------

describe('家庭授權', () => {
  it('整份 migration 沒有任何 `parents ... LIMIT 1` 授權', () => {
    expect(CODE).not.toMatch(/FROM parents[^;]*LIMIT 1/i);
    expect(CODE).not.toMatch(/parents WHERE user_id = auth\.uid\(\) LIMIT 1/i);
  });

  it('三支函式都改用集合比對', () => {
    for (const name of [
      'complete_task',
      'mark_task_atomic',
      'redeem_wish',
    ]) {
      const body = functionBody(name);
      expect({
        name,
        setBased: /EXISTS \(\s*SELECT 1 FROM parents p\s*WHERE p\.user_id = auth\.uid\(\) AND p\.family_id = v_child_family/.test(body),
      }).toEqual({ name, setBased: true });
    }
  });

  it('23. 先由孩子取得 family，再問呼叫者是不是這個 family 的家長', () => {
    for (const name of ['complete_task', 'mark_task_atomic', 'redeem_wish']) {
      const body = functionBody(name);
      const childLookup = body.indexOf('SELECT c.family_id INTO v_child_family');
      const authCheck = body.indexOf('p.family_id = v_child_family');
      expect({ name, ordered: childLookup >= 0 && childLookup < authCheck })
        .toEqual({ name, ordered: true });
    }
  });

  it('任務也必須屬於同一個家庭（舊版只驗孩子）', () => {
    for (const name of ['complete_task', 'mark_task_atomic']) {
      const body = functionBody(name);
      expect({ name, checked: body.includes('IS DISTINCT FROM v_child_family') })
        .toEqual({ name, checked: true });
    }
  });

  it('兌換品也必須同家庭，否則可以拿別人家的獎勵扣自己的錢包', () => {
    expect(functionBody('redeem_wish')).toContain('r.family_id = v_child_family');
  });

  it('26. anon 過不了：auth.uid() 為 NULL 時集合比對不會成立', () => {
    // 授權失敗一律 42501，service adapter 會把它翻成 POLICY_REJECTED。
    const occurrences = CODE.match(/ERRCODE = '42501'/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(6);
  });

  it('25. 同 family 多 parent 仍可操作 —— 用 EXISTS 而不是「等於某一筆」', () => {
    expect(CODE).not.toMatch(/c\.family_id = \(SELECT family_id FROM parents/i);
  });

  it('override 的 parent_id 取的是這個家庭裡的那一筆', () => {
    const body = functionBody('mark_task_atomic');
    expect(body).toContain('SELECT p.id INTO v_parent_id');
    expect(body).toMatch(/WHERE p\.user_id = auth\.uid\(\) AND p\.family_id = v_child_family/);
  });
});

// ---------------------------------------------------------------------------
// 27-28. 完成流程
// ---------------------------------------------------------------------------

describe('完成流程的幣值', () => {
  const COMPLETE = functionBody('complete_task');

  it('新任務讀 reward_coin_amount，不現場重算', () => {
    expect(COMPLETE).toContain('v_coin_earned := COALESCE(v_task.reward_coin_amount, 0)');
  });

  it('新任務不套前置解鎖 ×0.7（會掉出政策範圍）', () => {
    // ×0.7 在整支函式裡只出現一次，而且是在 legacy 分支。
    expect((COMPLETE.match(/0\.7/g) ?? []).length).toBe(1);
    // 新路徑的賦值是單純的讀值，沒有任何乘算。
    expect(COMPLETE).toContain('v_coin_earned := COALESCE(v_task.reward_coin_amount, 0);');
    expect(COMPLETE).not.toMatch(/reward_coin_amount[^;]*\*/);
  });

  it('27. legacy 路徑完全不變：base_time_min × difficulty 與 ×0.7 都在', () => {
    expect(COMPLETE).toContain('v_legacy := (v_task.reward_policy IS NULL)');
    expect(COMPLETE).toContain(
      'ROUND(v_task.base_time_min::numeric * v_task.difficulty::numeric)',
    );
    expect(COMPLETE).toContain('CASE WHEN p_is_prerequisite_met THEN 1.0 ELSE 0.7 END');
  });

  it('非 coin_eligible 的新任務一律 0 幣', () => {
    expect(COMPLETE).toContain(
      "IF v_task.reward_policy = 'coin_eligible' AND v_task.category NOT IN ('A', 'B') THEN",
    );
  });

  it('28. 時間儲蓄完成被拒絕，不降級成 coin 或 record_only', () => {
    expect(COMPLETE).toContain("'time_saving_not_enabled'");
    const rejectAt = COMPLETE.indexOf("'time_saving_not_enabled'");
    const firstInsert = COMPLETE.indexOf('INSERT INTO task_completions');
    expect(rejectAt).toBeLessThan(firstInsert);
  });

  it('新任務不寫 time_savings', () => {
    expect(COMPLETE).toContain('v_time_saved := 0;');
  });

  it('claim_period = once 仍然是整個生命週期的上限', () => {
    expect(COMPLETE).toContain("IF v_task.claim_period = 'once' THEN");
  });
});

describe('22. override 不能繞過政策', () => {
  const MARK = functionBody('mark_task_atomic');

  it('非 coin_eligible 的新任務一律夾到 0', () => {
    expect(MARK).toContain("WHEN v_reward_policy <> 'coin_eligible' THEN 0");
  });

  it('coin_eligible 的新任務受政策上限夾制', () => {
    expect(MARK).toContain('LEAST(GREATEST(p_adjusted_coin, 0), COALESCE(v_coin_max, p_adjusted_coin))');
    expect(MARK).toContain('reward_coin_max');
  });

  it('舊任務行為不變', () => {
    expect(MARK).toContain('WHEN v_reward_policy IS NULL THEN p_adjusted_coin');
  });

  it('請求值與實際套用值都寫進 intervention_log，夾制看得見', () => {
    expect(MARK).toContain("'requested_coin', p_adjusted_coin");
    expect(MARK).toContain("'applied_coin', v_adjusted_coin");
  });
});

// ---------------------------------------------------------------------------
// migration 衛生
// ---------------------------------------------------------------------------

describe('migration 衛生', () => {
  it('沒有修改 20260728000000 —— 那支已是既成事實', () => {
    const previous = readFileSync(
      join(MIGRATIONS, '20260728000000_task_drawer_persistence_v1.sql'),
      'utf8',
    );
    // 舊 migration 不該知道本輪的欄位。
    expect(previous).not.toContain('reward_coin_amount');
  });

  it('可重複套用：欄位 IF NOT EXISTS、函式 CREATE OR REPLACE', () => {
    expect(CODE).not.toMatch(/ADD COLUMN (?!IF NOT EXISTS)/);
    const creates = CODE.match(/CREATE (OR REPLACE )?FUNCTION/g) ?? [];
    expect(creates.length).toBeGreaterThan(0);
    expect(creates.every(c => c.includes('OR REPLACE'))).toBe(true);
  });

  it('沒有 DROP TABLE / DROP COLUMN —— 這支只做加法', () => {
    expect(CODE).not.toMatch(/DROP TABLE/i);
    expect(CODE).not.toMatch(/DROP COLUMN/i);
  });

  it('建立 RPC 的 grant 沒有放寬', () => {
    expect(CODE).toContain('REVOKE ALL ON FUNCTION public.create_parent_task_v1(jsonb) FROM anon');
    expect(CODE).toContain('GRANT EXECUTE ON FUNCTION public.create_parent_task_v1(jsonb) TO authenticated');
    expect(CODE).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.create_parent_task_v1\(jsonb\) TO service_role/);
  });

  it('全部維持 SECURITY DEFINER + 固定 search_path', () => {
    const definers = CODE.match(/SECURITY DEFINER/g) ?? [];
    const paths = CODE.match(/SET search_path = public/g) ?? [];
    expect(definers.length).toBe(paths.length);
    expect(definers.length).toBeGreaterThanOrEqual(4);
  });
});
