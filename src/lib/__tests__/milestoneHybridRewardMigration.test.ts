// P1-M1B §2.4 — 混合制回饋的啟用層
//
// ─────────────────────────────────────────────────────────────────────────
// 靜態檢查：migration 跑不起來的東西本機 jest 一個字都測不到，這裡驗的是
// SQL 文字本身的不變式。真正的行為驗收在 staging（這支 migration 尚未套用，
// 見檔頭：A/B 驗收通過、與 app-7c 複驗過才套用）。
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const TARGET = join(MIGRATIONS, '20260909000000_milestone_hybrid_reward.sql');

function readSql(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

function codeOnly(sql: string): string {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
}

function functionBody(sql: string, signature: string, occurrence = 0): string {
  let start = -1;
  for (let i = 0; i <= occurrence; i += 1) {
    start = sql.indexOf(signature, start + 1);
    expect(start).toBeGreaterThan(-1);
  }
  const end = sql.indexOf('\n$$;', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

const raw = () => readSql(TARGET);
const sql = () => codeOnly(raw());
const applySplit = () => functionBody(sql(), 'FUNCTION public.apply_milestone_split_v1(');
const publish = () => functionBody(sql(), 'FUNCTION public.publish_child_confirmed_plan_v1(');
const propose = () => functionBody(sql(), 'FUNCTION public.propose_child_planning_terms_v1(');
const confirm = () => functionBody(sql(), 'FUNCTION public.confirm_child_planning_proposal_v1(');
const accept = () => functionBody(sql(), 'FUNCTION public.accept_child_planning_terms_v1(');

describe('SQL 結構完整', () => {
  it('BEGIN; 與 COMMIT; 成對', () => {
    const text = raw();
    expect(text.match(/^BEGIN;/gm) ?? []).toHaveLength(1);
    expect(text.match(/^COMMIT;/gm) ?? []).toHaveLength(1);
  });

  it('每一個 AS $$ 正好對應一個 $$; 收尾（5 支函式）', () => {
    const text = raw();
    const opens = text.match(/^AS \$\$\s*$/gm) ?? [];
    const closes = text.match(/^\$\$;/gm) ?? [];
    expect(opens).toHaveLength(5);
    expect(closes).toHaveLength(5);
  });

  it('沒有裸 CASE 出現在 IF 條件裡（PL/pgSQL 已知地雷）', () => {
    expect(sql()).not.toMatch(/IF[^\n]*\bCASE\b/);
  });
});

describe('新欄位', () => {
  it('milestone_reward_choice 只收 NULL 或 flat_per_completion', () => {
    expect(sql()).toContain(
      "CHECK (milestone_reward_choice IS NULL OR milestone_reward_choice = 'flat_per_completion')",
    );
  });
});

describe('apply_milestone_split_v1 —— internal-only，家長身分是參數不是 auth.uid()', () => {
  it('函式本體完全不讀 auth.uid()', () => {
    expect(applySplit()).not.toContain('auth.uid()');
  });

  it('家長選 flat_per_completion 就整個跳過，不建任何站', () => {
    expect(applySplit()).toMatch(/flat_per_completion[\s\S]{0,80}RETURN 0/);
  });

  it('折扣比例與 App 端 milestoneSplit.ts 的 0.4 同一個常數', () => {
    expect(applySplit()).toContain('0.6');
  });

  it('沒有 expectedWeeks 的站直接 CONTINUE，不進 INSERT', () => {
    expect(applySplit()).toMatch(/CONTINUE WHEN v_phase_weeks IS NULL[\s\S]{0,600}INSERT INTO milestone_agreements/);
  });

  it('對齊 Asia/Taipei 週一，跟既有 create_milestone_agreement_v1 同一套語意', () => {
    expect(applySplit()).toContain("date_trunc(\n    'week'");
    expect(applySplit()).toContain("AT TIME ZONE 'Asia/Taipei'");
  });
});

describe('publish_child_confirmed_plan_v1 —— staged 拆站要逼進協商，不能默默 Direct Confirm', () => {
  it('帶著 §2 的期限邏輯，證明基準是 20260907 不是更早的版本', () => {
    expect(publish()).toContain('GOAL_DURATION_MISSING');
  });

  it('staged 且有 expectedWeeks 時強制 reward 進 pending', () => {
    expect(publish()).toMatch(
      /v_progression = 'staged'[\s\S]{0,400}phase \? 'expectedWeeks'[\s\S]{0,200}v_pending := array_append\(v_pending, 'reward'\)/,
    );
  });
});

describe('propose_child_planning_terms_v1 —— 收 flat_per_completion，帶著 §3 的放寬', () => {
  it('帶著 weekly_rhythm 排除 one_time 的放寬，證明基準是 20260906', () => {
    expect(propose()).toContain("v_source.duration_type <> 'one_time'");
  });

  it('rewardChoice 收 flat_per_completion', () => {
    expect(propose()).toContain("'growbook_default', 'no_coin', 'flat_per_completion'");
  });

  it('沒提這一欄時沿用來源版本（carry-forward，不是每輪重問）', () => {
    expect(propose()).toContain('ELSE v_source.milestone_reward_choice');
  });

  it('寫進 INSERT 的欄位清單，不是只驗證沒儲存', () => {
    expect(propose()).toMatch(/milestone_reward_choice,[\s\S]{0,2000}v_milestone_choice,/);
  });
});

describe('confirm_child_planning_proposal_v1 —— 直接確認路徑', () => {
  it('phases 讀 v_plan（這條路徑沒有協商過，v_plan 本身就是孩子版本）', () => {
    expect(confirm()).toContain('p_child_confirmed_plan => v_plan.child_confirmed_plan');
  });

  it('家長身分直接查 auth.uid()（這支的呼叫者本來就是家長）', () => {
    expect(confirm()).toMatch(/v_parent_id[\s\S]{0,40}auth\.uid\(\)/);
  });

  it('讀回來驗：站數對不上就整筆 rollback', () => {
    expect(confirm()).toContain('MILESTONE_SPLIT_NOT_PERSISTED');
  });

  it('effective_plan_version_id 用新建的家長版本，不是孩子原版本', () => {
    expect(confirm()).toContain('p_effective_plan_version_id => v_parent_plan_id');
  });
});

describe('accept_child_planning_terms_v1 —— 孩子接受家長條件的路徑', () => {
  it('phases 讀 v_root（孩子原版本），不是 v_plan（可能是家長草案）', () => {
    expect(accept()).toContain('p_child_confirmed_plan => v_root.child_confirmed_plan');
  });

  it('家長身分讀 v_plan.author_user_id，不是 auth.uid()（呼叫者是孩子）', () => {
    expect(accept()).toContain('FROM parents p WHERE p.user_id = v_plan.author_user_id');
  });

  it('milestone_reward_choice 讀 v_plan（這一輪真正談定的版本）', () => {
    expect(accept()).toContain('p_milestone_reward_choice => v_plan.milestone_reward_choice');
  });

  it('讀回來驗：站數對不上就整筆 rollback', () => {
    expect(accept()).toContain('MILESTONE_SPLIT_NOT_PERSISTED');
  });

  it('effective_plan_version_id 用被接受的那一版，不是孩子原版本', () => {
    expect(accept()).toContain('p_effective_plan_version_id => v_expected_plan_id');
  });
});
