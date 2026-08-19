// LT-FINAL-1.1 §2 — audit complete_task before opening Session Check-in
//
// ─────────────────────────────────────────────────────────────────────────────
// 這一組釘住的是「打卡」與「推進」之間唯一的物理界線：complete_task 這支
// RPC，本身寫得到什麼、寫不到什麼。
//
// 找到的事實（見 supabase/migrations/20260818000000_long_term_payout_settlement.sql，
// 這是 complete_task 目前唯一還在生效的定義 —— 用 grep 找過全部 migrations，
// 20260831000000 之後沒有任何一支再 CREATE OR REPLACE 它）：
//
//   會寫：task_completions（+1 一列）、wallets/transactions（依 payout_basis
//         結算）、reward_settlements（新語意）、current_day（只限
//         category='D' AND long_term_type='habit'，數的是累計完成次數，
//         LT-FINAL-1R 已經證明過這件事跟「這一週做了幾次」無關）。
//
//   不會寫：current_level、level_definitions、current_value、value_unit、
//           long_term_goals.status。全部 migrations 一次都沒寫過這幾欄
//           （grep `current_level\s*=|current_value\s*=` 整個 migrations
//           目錄零命中）—— 不是「這次沒觸發」，是根本沒有任何 RPC 實作
//           階段推進或累積值增加。
//
// 結論：對 staged / accumulation 而言，呼叫 complete_task 只會留下一筆
// session record，不會產生 progression side effect。Session Check-in
// 可以安全重用它，不需要另開 RPC。
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations');

function read(name: string): string {
  return readFileSync(join(MIGRATIONS, name), 'utf8').replace(/\r\n/g, '\n');
}

const SQL = read('20260818000000_long_term_payout_settlement.sql');
const CODE = SQL.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

function body(source: string, name: string): string {
  const start = source.indexOf(`FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('\n$$;', start));
}

const COMPLETE_TASK = body(CODE, 'complete_task');
const FLAT = COMPLETE_TASK.replace(/\s+/g, ' ');

// ---------------------------------------------------------------------------

describe('complete_task 版本序列', () => {
  it('之後的 migrations 都不再 CREATE OR REPLACE complete_task', () => {
    const later = [
      '20260819000000_snapshot_canonical_payout_basis.sql',
      '20260820000000_shared_plan_period_target_snapshot.sql',
      '20260821000000_canonical_confirmed_reward.sql',
      '20260830000000_shared_term_pending_reward_fix.sql',
      '20260831000000_weekly_rhythm_per_completion.sql',
    ];
    for (const file of later) {
      expect(read(file)).not.toMatch(/CREATE OR REPLACE FUNCTION (public\.)?complete_task\(/);
    }
  });
});

describe('§2 audit：staged / accumulation 的欄位完全沒有寫入路徑', () => {
  it('不寫 current_level', () => {
    expect(FLAT).not.toMatch(/current_level\s*=/);
  });

  it('不寫 current_value', () => {
    expect(FLAT).not.toMatch(/current_value\s*=/);
  });

  it('不寫 level_definitions', () => {
    expect(FLAT).not.toMatch(/level_definitions\s*=/);
  });

  it('唯一會動 long_term_goals 的 UPDATE 只改 current_day，不碰 status（讀 status 只是 active 守門）', () => {
    const updates = [...COMPLETE_TASK.matchAll(/UPDATE long_term_goals\s*\n?\s*SET([\s\S]*?)WHERE/g)];
    expect(updates.length).toBeGreaterThan(0);
    for (const [, setClause] of updates) {
      const flatSet = setClause.replace(/\s+/g, ' ').trim();
      expect(flatSet).toBe('current_day = current_day + 1');
      expect(flatSet).not.toMatch(/status/);
    }
    expect(FLAT).toContain("v_goal.status IS DISTINCT FROM 'active'");
  });

  it('current_day 的兩個分支都限定 category=D 且 long_term_type=habit', () => {
    const matches = FLAT.match(/v_task\.category = 'D' AND v_task\.long_term_type = 'habit'/g) ?? [];
    expect(matches.length).toBe(2); // legacy 分支 + 新語意分支，各一次
  });
});

describe('§2 audit：completion 本身對 staged / accumulation 沒有特殊行為', () => {
  it('task_completions 的 INSERT 不分 progression，寫入欄位固定', () => {
    expect(FLAT).toContain(
      "INSERT INTO task_completions (task_id, child_id, completed_at, reported_by, status, coin_earned, time_saved_min)",
    );
  });

  it('settlement 只看 payout_basis，不看 goal 的 level/value 結構', () => {
    // settlement 區塊完全不引用 v_goal 的任何欄位 —— 它是任務層的錢包邏輯，
    // 跟 goal 是不是 staged/accumulation 無關。
    const settlementStart = FLAT.indexOf('settlement');
    const settlementBlock = FLAT.slice(settlementStart, settlementStart + 2000);
    expect(settlementBlock).not.toMatch(/v_goal\./);
  });
});
