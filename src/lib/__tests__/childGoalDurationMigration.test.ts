// P1-A1 §2 — 期限由 RPC 從孩子確認過的計畫決定
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支是**靜態**檢查：migration 跑不起來的東西，本機 jest 一個字都測不到，
// 所以這裡驗的是 SQL 文字本身的幾條不變式。真正的行為驗收在 staging。
//
// 其中最重要的一條是「基準檔對不對」——
// §2 的 migration 必須從 20260906（已含 §3 放寬）複製 publish 的函式本體，
// 不是從 20260828。CREATE OR REPLACE 是全體置換，而 migration 依檔名順序
// 套用，所以從舊版複製會把 weekly_rhythm 的修正**靜默蓋掉**。
// 那是資料庫端行為，childGoalPlanningParity 也擋不住。
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const TARGET = join(MIGRATIONS, '20260907000000_child_goal_duration.sql');

function readSql(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

function codeOnly(sql: string): string {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
}

function functionBody(sql: string, signature: string): string {
  const start = sql.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf('$$;', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

const sql = () => codeOnly(readSql(TARGET));
const publish = () => functionBody(sql(), 'FUNCTION public.publish_child_confirmed_plan_v1(');
const round = () => functionBody(sql(), 'FUNCTION public.record_child_goal_planning_round_v1(');

describe('基準檔（交接條件）', () => {
  // 從 20260828 複製的話這一條會紅 —— 那一版寫的是 v_duration = 'long_term'。
  it('publish 帶著 §3 的放寬，證明是從 20260906 複製的', () => {
    expect(publish()).toContain("v_duration <> 'one_time'");
  });

  it('publish 沒有留下 §3 之前那條會把 recurring 擋掉的判斷', () => {
    expect(publish()).not.toContain("v_duration = 'long_term'");
  });
});

describe('SQL 結構完整', () => {
  // 逐字複製的區段本身就以 $$; 結尾，收尾時很容易再補一個 —— 那是語法錯，
  // 而 functionBody() 只找第一個 $$;，所以上面每一條都還是綠的。
  it('每一個 AS $$ 正好對應一個 $$; 收尾', () => {
    const text = readSql(TARGET);
    const opens = text.match(/AS \$\$/g) ?? [];
    const closes = text.match(/^\$\$;/gm) ?? [];

    expect(closes).toHaveLength(opens.length);
  });

  it('BEGIN; 與 COMMIT; 成對', () => {
    const text = readSql(TARGET);

    expect(text.match(/^BEGIN;/gm) ?? []).toHaveLength(1);
    expect(text.match(/^COMMIT;/gm) ?? []).toHaveLength(1);
  });
});

describe('§2 期限由孩子決定', () => {
  it('期限讀 child_confirmed_plan 的 goalDuration', () => {
    expect(publish()).toContain("'goalDuration'");
  });

  // enrichment 的 durationType 來自 P0 那條鏈，輸入只有孩子最初打的那段話。
  it('不再採用 enrichment 的 durationType / durationDays', () => {
    expect(publish()).not.toContain("v_enrich ->> 'durationType'");
    expect(publish()).not.toContain("v_enrich ->> 'durationDays'");
  });

  it('open_ended → recurring，沒有天數', () => {
    expect(publish()).toContain("'open_ended'");
    expect(publish()).toMatch(/open_ended[\s\S]{0,400}v_duration\s*:=\s*'recurring'/);
  });

  it('選了天數 → long_term', () => {
    expect(publish()).toMatch(/'days'[\s\S]{0,600}v_duration\s*:=\s*'long_term'/);
  });

  // §5：舊的 child_confirmed_plan 沒有這一欄，一律不放行。
  it('沒有 goalDuration 就拒絕發布，不補預設值', () => {
    expect(publish()).toContain('GOAL_DURATION_MISSING');
  });

  // §4：把 200 悄悄改成 180，就是讓孩子確認一個他沒說過的期限。
  it('天數超出 1-180 擋下，不 clamp', () => {
    expect(publish()).toContain('GOAL_DURATION_OUT_OF_RANGE');
    expect(publish()).toContain('180');
  });
});

describe('needs_duration 這一輪記得起來', () => {
  it('round RPC 的 status 白名單收 needs_duration', () => {
    expect(round()).toContain('needs_duration');
  });

  it('白名單其餘四個值原樣保留', () => {
    for (const status of ['needs_clarification', 'needs_choice', 'ready', 'unavailable']) {
      expect(round()).toContain(status);
    }
  });
});
