// 伺服器端限流的 Edge 側。
//
// ─────────────────────────────────────────────────────────────────────────
// 真正的原子性在 Postgres（row lock + ON CONFLICT DO UPDATE），
// 那一層要在 staging 上用真的並行請求驗證，不是在這裡。
//
// 這一支測的是它旁邊那些同樣會出錯、但安靜得多的地方：
// RPC 壞掉時放不放行、回了看不懂的東西怎麼辦、retry 秒數會不會被亂傳。
// ─────────────────────────────────────────────────────────────────────────

import { assertEquals } from './assert.ts';
import { QUOTA_RPC, consumeQuota, type QuotaRpcCaller } from '../rateLimit.ts';

const LIMITS = { per10Minutes: 6, perDay: 40 };

function caller(impl: QuotaRpcCaller['rpc']): QuotaRpcCaller {
  return { rpc: impl };
}

function returns(data: unknown): QuotaRpcCaller {
  return caller(() => Promise.resolve({ data, error: null }));
}

Deno.test('放行', async () => {
  const decision = await consumeQuota(returns({ allowed: true }), LIMITS);
  assertEquals(decision, { allowed: true });
});

Deno.test('超額 → 帶回 retry 秒數', async () => {
  const decision = await consumeQuota(
    returns({ allowed: false, reason: 'RATE_LIMITED', retry_after_seconds: 320 }),
    LIMITS,
  );
  assertEquals(decision, { allowed: false, outcome: 'RATE_LIMITED', retryAfterSeconds: 320 });
});

Deno.test('RPC 收到的是上限，不是使用者 id', async () => {
  // 這條看起來瑣碎，實際上是這一層的安全前提：
  // RPC 自己讀 auth.uid()。只要參數裡出現 user_id，
  // 任何人都可以消耗別人的額度或用別人的身分繞過自己的。
  let seen: Record<string, unknown> = {};
  let seenFn = '';
  await consumeQuota(
    caller((fn, args) => {
      seenFn = fn;
      seen = args;
      return Promise.resolve({ data: { allowed: true }, error: null });
    }),
    LIMITS,
  );

  assertEquals(seenFn, QUOTA_RPC);
  assertEquals(seen, { p_limit_per_10min: 6, p_limit_per_day: 40 });
  assertEquals(Object.keys(seen).some((k) => k.includes('user')), false);
});

Deno.test('RPC 回 error → 不放行', async () => {
  const decision = await consumeQuota(
    caller(() => Promise.resolve({ data: null, error: { message: 'relation does not exist' } })),
    LIMITS,
  );
  assertEquals(decision, { allowed: false, outcome: 'ERROR', detail: 'RPC_ERROR' });
});

Deno.test('RPC 直接丟例外 → 不放行', async () => {
  const decision = await consumeQuota(
    caller(() => Promise.reject(new Error('network down'))),
    LIMITS,
  );
  assertEquals(decision, { allowed: false, outcome: 'ERROR', detail: 'RPC_THREW' });
});

Deno.test('RPC 回了看不懂的形狀 → 不放行', async () => {
  for (const data of [null, 'ok', 42, {}, { allowed: 'yes' }, []]) {
    const decision = await consumeQuota(returns(data), LIMITS);
    assertEquals(
      { data: JSON.stringify(data), allowed: decision.allowed },
      { data: JSON.stringify(data), allowed: false },
    );
  }
});

Deno.test('錯誤細節不含 SQL 或表名', async () => {
  const decision = await consumeQuota(
    caller(() => Promise.resolve({
      data: null,
      error: { message: 'permission denied for table task_ai_rate_limit_counters' },
    })),
    LIMITS,
  );
  // detail 會進 log。原始訊息可能含表名或 SQL 片段，只留分類代碼。
  assertEquals(decision, { allowed: false, outcome: 'ERROR', detail: 'RPC_ERROR' });
});

Deno.test('retry 秒數會被夾在合理範圍', async () => {
  const cases: Array<[unknown, number]> = [
    [undefined, 1],      // 沒回就給最小值，不要回 0 讓 client 立刻重打
    [0, 1],
    [-5, 1],
    ['abc', 1],
    [12.3, 13],          // 無條件進位：說 12 秒但實際還要等 12.3 秒會再被擋一次
    [999_999, 86_400],   // 壞掉的值不該變成永久封鎖
  ];

  for (const [raw, expected] of cases) {
    const decision = await consumeQuota(
      returns({ allowed: false, retry_after_seconds: raw }),
      LIMITS,
    );
    assertEquals(
      { raw: String(raw), seconds: decision.allowed ? -1 : (decision as { retryAfterSeconds?: number }).retryAfterSeconds },
      { raw: String(raw), seconds: expected },
    );
  }
});

Deno.test('就算 RPC 多回了用量欄位，也不會被帶出去', async () => {
  const decision = await consumeQuota(
    returns({ allowed: false, retry_after_seconds: 60, request_count: 41, limit: 40 }),
    LIMITS,
  );
  assertEquals(Object.keys(decision).sort(), ['allowed', 'outcome', 'retryAfterSeconds']);
});
