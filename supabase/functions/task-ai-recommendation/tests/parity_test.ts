// 30. Client / server parity。
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支和 App 端的 contractParity.test.ts 讀**同一份 fixture**。
//
// 防的失敗很安靜：server 加了一個 fieldPath，App 忘了加。結果是 server 放行、
// client 拒收，家長按下按鈕永遠得到「目前無法取得建議」，
// 而兩邊的 log 都顯示自己運作正常。沒有例外、沒有紅字。
//
// 契約是 **status**，不是 reason：
//   - server 把「形狀錯」（INVALID_RESPONSE）與「越界」（UNSAFE_OUTPUT）分開
//   - App 端不分，兩者都算 UNSAFE_OUTPUT
//   兩邊對「這批能不能給家長看」的結論一定相同，那才是重要的那件事。
//
// 唯一允許不同的是**內容安全**：server 多擋一層。標了 serverOnlySafety
// 的案例就是那些 —— 而它們正好證明了 client validator 不能取代 server。
// ─────────────────────────────────────────────────────────────────────────

import { assert, assertEquals } from './assert.ts';
import { validateModelOutput } from '../outputValidator.ts';
import { validateTaskAiInput } from '../inputValidator.ts';
import { CASES, EDGE_CASES, TASKS, serverStatusOf, type FixtureExpect } from './fixtures.ts';
import type { AgeGroup } from '../contract.ts';

function conclusion(raw: unknown, ageGroup: AgeGroup): { status: string; reason?: string } {
  const { result } = validateModelOutput(raw, ageGroup);
  return result.status === 'unavailable'
    ? { status: result.status, reason: result.reason }
    : { status: result.status };
}

function expected(e: FixtureExpect): { status: string; reason?: string } {
  const status = serverStatusOf(e);
  return status === 'unavailable' ? { status, reason: e.serverReason } : { status };
}

// ---------------------------------------------------------------------------
// 六種 Demo 任務 × 四種情境
// ---------------------------------------------------------------------------

Deno.test('30a. 六種 Demo 任務的 24 筆案例，server 端結論與 fixture 相符', () => {
  for (const c of CASES) {
    const task = TASKS.find((t) => t.id === c.taskId);
    assert(task !== undefined, `fixture 沒有這個任務：${c.taskId}`);
    const ageGroup = task!.input.childContext.ageGroup;

    assertEquals(
      { id: c.id, ...conclusion(c.modelOutput, ageGroup) },
      { id: c.id, ...expected(c.expect) },
    );
  }
});

Deno.test('30b. validator 行為案例（edgeCases）', () => {
  for (const c of EDGE_CASES) {
    assertEquals(
      { id: c.id, ...conclusion(c.modelOutput, c.ageGroup) },
      { id: c.id, ...expected(c.expect) },
    );
  }
});

// ---------------------------------------------------------------------------
// 分組不變量
// ---------------------------------------------------------------------------

Deno.test('所有 immutable_violation 一律整批拒絕，一張卡都不留', () => {
  for (const c of CASES.filter((x) => x.kind === 'immutable_violation')) {
    const task = TASKS.find((t) => t.id === c.taskId)!;
    const { result } = validateModelOutput(c.modelOutput, task.input.childContext.ageGroup);
    assertEquals(
      { id: c.id, status: result.status, kept: result.suggestions.length },
      { id: c.id, status: 'unavailable', kept: 0 },
    );
  }
});

Deno.test('所有 prompt_injection 都被擋下 —— 包含 B0 標成 knownGap 的那一筆', () => {
  const injections = CASES.filter((x) => x.kind === 'prompt_injection');
  assertEquals(injections.length, 6, '六種任務各一筆');

  for (const c of injections) {
    const task = TASKS.find((t) => t.id === c.taskId)!;
    const { result } = validateModelOutput(c.modelOutput, task.input.childContext.ageGroup);
    assertEquals(
      { id: c.id, status: result.status },
      { id: c.id, status: 'unavailable' },
      `${c.id} 應該被擋下`,
    );
  }
});

Deno.test('injection-06 從 knownGap 變成被 contentSafety 擋下', () => {
  // B0 的時候這一筆會通過 —— 形狀完全合法，只有內容不安全。
  // 它現在被擋，靠的是 outputValidator 之外的那一層。
  const c = CASES.find((x) => x.id === 'injection-06')!;
  assertEquals(c.serverOnlySafety, true, 'fixture 應該標明這是 server 多擋的一層');

  const task = TASKS.find((t) => t.id === c.taskId)!;
  const { result, rejection } = validateModelOutput(c.modelOutput, task.input.childContext.ageGroup);

  assertEquals(result.status, 'unavailable');
  assertEquals(result.status === 'unavailable' ? result.reason : '', 'UNSAFE_OUTPUT');
  assertEquals(rejection?.kind, 'safety', '被擋的原因必須是內容安全，不是形狀');
});

Deno.test('serverOnlySafety 的案例：App 端會放行，server 端擋下 —— 這是設計不是漂移', () => {
  const all = [
    ...CASES.filter((c) => c.serverOnlySafety),
    ...EDGE_CASES.filter((c) => c.serverOnlySafety),
  ];
  assert(all.length >= 5, `應該有數筆，實際 ${all.length}`);

  for (const c of all) {
    // fixture 上 App 端的預期是 suggestions（放行）。
    assertEquals(c.expect.status, 'suggestions', `${c.id} 的 App 端預期應該是放行`);
    // server 端的預期是擋下。
    assertEquals(serverStatusOf(c.expect), 'unavailable', `${c.id} 的 server 端應該擋下`);
    assertEquals(c.expect.serverReason, 'UNSAFE_OUTPUT');
  }
});

Deno.test('valid_suggestions 與 no_change 不會被任何一層誤擋', () => {
  for (const c of CASES.filter((x) => x.kind === 'valid_suggestions' || x.kind === 'no_change')) {
    const task = TASKS.find((t) => t.id === c.taskId)!;
    const { result } = validateModelOutput(c.modelOutput, task.input.childContext.ageGroup);
    assertEquals({ id: c.id, status: result.status }, { id: c.id, status: c.expect.status });
  }
});

// ---------------------------------------------------------------------------
// input 這一側
// ---------------------------------------------------------------------------

Deno.test('六種 Demo 任務的 input 全部通過 server input validator', () => {
  // App 端 buildTaskAiInput 真的會產出的形狀，server 必須收得下。
  // 這一條會抓到「兩邊對 input 結構的理解分岔」。
  for (const task of TASKS) {
    const result = validateTaskAiInput(task.input);
    assertEquals(
      { task: task.demoTaskName, ok: result.ok, why: result.ok ? '' : result.rejection.detail },
      { task: task.demoTaskName, ok: true, why: '' },
    );
  }
});

Deno.test('fixture 的 input 不含真實家庭資料', () => {
  // 只看會被送出去的值。blockedFields 裡的 "childId" 是欄位名稱，不是資料。
  const outbound = JSON.stringify(TASKS.map((t) => ({
    childContext: t.input.childContext,
    taskContext: t.input.taskContext,
    parentIntent: t.input.parentIntent,
    currentDraft: t.input.currentDraft,
  })));

  for (const [name, pattern] of [
    ['姓名', /承恩/],
    ['email', /[\w.+-]+@[\w-]+\.[\w.]+/],
    ['uuid', /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
    ['jwt', /eyJ[A-Za-z0-9_-]{10,}/],
    ['project ref', /supabase\.co/],
  ] as Array<[string, RegExp]>) {
    assertEquals({ name, found: pattern.test(outbound) }, { name, found: false });
  }
});
