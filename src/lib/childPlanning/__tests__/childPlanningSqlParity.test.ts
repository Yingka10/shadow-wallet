// P1-A1 — 孩子回應的型別清單，SQL 那一份也不准漂移
//
// ─────────────────────────────────────────────────────────────────────────
// 同一件事在這個 repo 裡宣告了**三次**：
//
//   1. App 端     ChildPlanningResponse union ＋ CHILD_PLANNING_RESPONSE_TYPES
//   2. Function 端 childGoalPlanningInputIsUsable 的 response.type 分支
//   3. SQL 端     record_child_goal_planning_round_v1 的白名單
//
// 前兩份有型別斷言與 childGoalPlanningParity 釘著。**第三份什麼都沒有**
// —— 2026-09-07 就是它漏了 duration_selection / duration_open_ended：
// 孩子選完期限，RPC 回「未知的孩子回應類型」，畫面靜默停住，而 3550 個
// 測試沒有一個變紅（它們一個都碰不到 .sql）。
//
// 這一支補的就是那一層。
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { CHILD_PLANNING_RESPONSE_TYPES } from '../types';
import { MILESTONE_SPLIT_POLICY_RATIO } from '../sharedTerms/milestoneSplit';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * 某支函式**目前生效**的定義住在哪一個 migration。
 *
 * `CREATE OR REPLACE FUNCTION` 是整支置換，所以生效的永遠是檔名排序最後
 * 的那一份 —— 不是最早定義它的那一份。今天有兩次差點以舊檔為基準改寫，
 * 那會靜默還原後來的修正而且不會有任何測試變紅，所以這條規則值得由
 * 程式碼來回答，不要靠記憶。
 */
function newestMigrationDefining(functionName: string): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const matches = files.filter((name) =>
    readFileSync(join(MIGRATIONS_DIR, name), 'utf8')
      .includes(`CREATE OR REPLACE FUNCTION public.${functionName}`),
  );
  if (matches.length === 0) throw new Error(`沒有任何 migration 定義 ${functionName}`);
  return matches[matches.length - 1];
}

describe('record RPC 的孩子回應白名單與 App 端一致', () => {
  const file = newestMigrationDefining('record_child_goal_planning_round_v1');
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');

  // 只取白名單那一段：從 `NOT IN` 到收尾的 `THEN`。
  const whitelist = /\(v_response ->> 'type'\) NOT IN\s*\(([^)]*)\)/.exec(sql);

  it('找得到那份白名單 —— 找不到就是它被改寫成別的形狀了', () => {
    expect(whitelist).not.toBeNull();
  });

  it.each(CHILD_PLANNING_RESPONSE_TYPES)('白名單收得下 %s', (type) => {
    expect(whitelist?.[1]).toContain(`'${type}'`);
  });

  it('白名單沒有 App 端不認得的型別', () => {
    const inSql = [...(whitelist?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(inSql.sort()).toEqual([...CHILD_PLANNING_RESPONSE_TYPES].sort());
  });
});

// ---------------------------------------------------------------------------
// 拆站折扣的政策常數，SQL 那一份不准自己漂走
// ---------------------------------------------------------------------------
//
// App 端 computeMilestoneSplit() 用 MILESTONE_SPLIT_POLICY_RATIO 算
// `max(1, round(session * (1 - ratio)))`；SQL 端 apply_milestone_split_v1
// 把同一個數字**寫死**成 0.6。兩邊是同一個政策常數的兩份宣告，改一邊
// 沒改另一邊，家長在畫面上看到的金額與真正入帳的金額就會不一樣 ——
// 而那是最不容易被發現的一種錯：兩邊各自都「正常運作」。
//
// §2.4 的作者自己點名這是他知道最脆弱的一點（他驗不到 SQL）。這一段
// 就是把那份人工對齊換成機器對齊。

describe('拆站折扣的政策常數兩端一致', () => {
  const file = newestMigrationDefining('apply_milestone_split_v1');
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');

  // 只取真正在算的那一行：註解裡也會出現同樣的數字，
  // 而 `v_discounted :=` 這個賦值只會出現在程式碼裡。
  const formula = new RegExp('^.*v_discounted :=.*$', 'm').exec(sql)?.[0];

  const expectedMultiplier = 1 - MILESTONE_SPLIT_POLICY_RATIO;

  it('找得到折扣算式', () => {
    expect(formula).toBeDefined();
  });

  it(`SQL 用的乘數就是 1 - MILESTONE_SPLIT_POLICY_RATIO（${1 - MILESTONE_SPLIT_POLICY_RATIO}）`, () => {
    expect(formula).toContain(`* ${expectedMultiplier}`);
  });

  it('下限與 App 端的 Math.max(1, …) 一致', () => {
    // 少了這個下限，session 幣值低的計畫拆完會變成 0 —— 孩子每次完成
    // 拿不到任何東西，而畫面上仍然寫著「完成一次有幣」。
    expect(formula).toContain('GREATEST(1');
  });
});

// ---------------------------------------------------------------------------
// 「一週幾次」怎麼從 cadence 推導出來，SQL 裡不准有兩種答案
// ---------------------------------------------------------------------------
//
// weekly_frequency 直接讀次數、fixed_days 讀星期陣列長度——這個判準
// resolve_payout_basis_v1（2026-08-18，訂價語意的原始定義）與
// apply_milestone_split_v1（2026-09-09，這次混合制回饋加的）各自寫了
// 一份。同一個政策，兩個不同時間、不同 session 的作者，各自從零推導
// 一次——今天六顆 bug 都是這個形狀：一條規則散在多處，改的時候只掃到
// 其中幾份。這裡把「兩份是同一個判準」釘住，不是釘死某一份不准改。

describe('target_per_week 的推導規則兩份 SQL 一致', () => {
  const payoutFile = newestMigrationDefining('resolve_payout_basis_v1');
  const payoutSql = readFileSync(join(MIGRATIONS_DIR, payoutFile), 'utf8');
  const payoutCase = /v_target := CASE([\s\S]*?)\bEND;/.exec(payoutSql)?.[1];

  const milestoneFile = newestMigrationDefining('apply_milestone_split_v1');
  const milestoneSql = readFileSync(join(MIGRATIONS_DIR, milestoneFile), 'utf8');
  const milestoneCase = /v_target_per_week := CASE([\s\S]*?)\bEND;/.exec(milestoneSql)?.[1];

  it('兩支都找得到各自的 CASE 判準', () => {
    expect(payoutCase).toBeDefined();
    expect(milestoneCase).toBeDefined();
  });

  it("weekly_frequency 分支兩邊都是直接回傳次數（不套 array_length）", () => {
    const payoutBranch = /WHEN\s+\S+\s*=\s*'weekly_frequency'\s+THEN\s+(\S+)/.exec(payoutCase ?? '');
    const milestoneBranch = /WHEN\s+\S+\s*=\s*'weekly_frequency'\s+THEN\s+(\S+)/.exec(milestoneCase ?? '');
    expect(payoutBranch).not.toBeNull();
    expect(milestoneBranch).not.toBeNull();
    expect(payoutBranch?.[1]).not.toMatch(/array_length/);
    expect(milestoneBranch?.[1]).not.toMatch(/array_length/);
  });

  it("fixed_days 分支兩邊都是 array_length(…, 1)", () => {
    expect(payoutCase).toMatch(/WHEN\s+\S+\s*=\s*'fixed_days'\s+THEN\s+array_length\(\S+,\s*1\)/);
    expect(milestoneCase).toMatch(/WHEN\s+\S+\s*=\s*'fixed_days'\s+THEN\s+array_length\(\S+,\s*1\)/);
  });

  it('兩邊都以 ELSE NULL 收尾——沒有第三種 cadence_mode 猜得出次數', () => {
    expect(payoutCase).toMatch(/ELSE\s+NULL/);
    expect(milestoneCase).toMatch(/ELSE\s+NULL/);
  });
});
