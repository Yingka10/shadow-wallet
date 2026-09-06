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
