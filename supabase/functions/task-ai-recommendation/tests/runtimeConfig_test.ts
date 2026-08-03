// 執行期設定：model 與 timeout。
//
// 這一支存在的理由是 B2A 的逾時驗證：我們要能把 timeout 調到極小、
// 觸發一次真的逾時、然後調回來。可設定就代表可以設錯，
// 所以每一條路徑都要有定義好的行為 —— 尤其是「設成 0」和「設成 abc」。

import { assertEquals } from './assert.ts';
import {
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  TIMEOUT_BOUNDS,
  resolveModel,
  resolveTimeoutMs,
} from '../runtimeConfig.ts';

Deno.test('沒設定就用 production-safe 預設值 12000', () => {
  assertEquals(DEFAULT_TIMEOUT_MS, 12000);
  for (const raw of [undefined, null, '', '   ']) {
    assertEquals(resolveTimeoutMs(raw), { timeoutMs: 12000, source: 'default' });
  }
});

Deno.test('合法值直接採用', () => {
  assertEquals(resolveTimeoutMs('8000'), { timeoutMs: 8000, source: 'env' });
  assertEquals(resolveTimeoutMs('50'), { timeoutMs: 50, source: 'env' });
  assertEquals(resolveTimeoutMs('30000'), { timeoutMs: 30000, source: 'env' });
});

Deno.test('設錯不會讓 Function 掛掉，但也不會安靜地照用', () => {
  for (const raw of ['abc', '12.5', '-1', '0', 'NaN', 'Infinity', '1e5x', '  ']) {
    const out = resolveTimeoutMs(raw);
    assertEquals(
      { raw, timeoutMs: out.timeoutMs },
      { raw, timeoutMs: DEFAULT_TIMEOUT_MS },
      `「${raw}」應該退回預設值`,
    );
  }
  // source 分得出「沒設定」與「設錯了」——後者是需要有人去看的。
  assertEquals(resolveTimeoutMs('abc').source, 'env_invalid');
  assertEquals(resolveTimeoutMs('0').source, 'env_invalid');
  assertEquals(resolveTimeoutMs(undefined).source, 'default');
});

Deno.test('超出範圍會被夾回，而且 source 看得出來', () => {
  assertEquals(resolveTimeoutMs('1'), { timeoutMs: TIMEOUT_BOUNDS.minMs, source: 'env_clamped' });
  assertEquals(resolveTimeoutMs('999999'), { timeoutMs: TIMEOUT_BOUNDS.maxMs, source: 'env_clamped' });
});

Deno.test('B2A 逾時驗證用的值是合法設定，不是特例分支', () => {
  // 10–50ms 這個範圍要能直接用。如果它被當成非法值退回 12000，
  // 逾時驗證就會靜靜地測不到東西 —— 而且看起來像「通過了」。
  for (const raw of ['10', '20', '50']) {
    assertEquals(resolveTimeoutMs(raw).source, 'env', `${raw}ms 應該是合法設定`);
  }
});

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

Deno.test('model 沒設定就用後備值', () => {
  assertEquals(resolveModel(undefined), { model: DEFAULT_MODEL, source: 'default' });
  assertEquals(resolveModel('  '), { model: DEFAULT_MODEL, source: 'default' });
});

Deno.test('合法 model 名稱直接採用，前後空白會去掉', () => {
  assertEquals(resolveModel('gemini-2.5-flash'), { model: 'gemini-2.5-flash', source: 'env' });
  assertEquals(resolveModel('  gemini-flash-latest  '), { model: 'gemini-flash-latest', source: 'env' });
});

Deno.test('model 名稱會被拼進 URL —— 含路徑字元的一律拒絕', () => {
  // 這不是「順手驗一下」：一個含 `/` 或 `?` 的值可以把請求導到別的路徑。
  for (const raw of [
    '../../../evil',
    'gemini/../../v1/models',
    'model?key=leak',
    'model#frag',
    'model with space',
    'MODEL-UPPER',
    'a',
    'x'.repeat(80),
  ]) {
    assertEquals(
      { raw, model: resolveModel(raw).model, source: resolveModel(raw).source },
      { raw, model: DEFAULT_MODEL, source: 'env_invalid' },
    );
  }
});
