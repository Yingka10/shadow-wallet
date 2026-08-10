// 第八階段 B0 — client 與 server 契約的防漂移，以及六種 Demo 任務的 fixture
//
// ─────────────────────────────────────────────────────────────────────────
// 這支測試防的是一個很安靜的失敗：
//
// Edge Function 端加了一個 fieldPath，App 端忘了加。結果是 server 放行、
// client 拒收 —— 家長按下「取得調整建議」永遠得到「目前無法取得建議」，
// 而兩邊的 log 都顯示自己運作正常。沒有例外、沒有紅字、只是永遠沒有建議。
//
// 做法沿用 repo 既有的 coin-policy 前例：**資料只有一份（contract.json），
// 演算法在兩邊各有一份實作，由測試釘住兩者一致。**
// 不讓 Edge Function import App 的路徑（Deno 部署不了 RN 的 module graph），
// 也不讓 App import Deno 檔（jest 的 babel 解析不了 import attributes）。
// 兩邊都只碰那份 JSON。
//
// 為什麼「禁止路徑」是行為比對而不是陣列比對：那份清單沒有 export，
// 而且真正重要的不是「陣列長得一樣」，是「餵進去真的會被擋」。
// ─────────────────────────────────────────────────────────────────────────

import contract from '../../../../../../../supabase/functions/task-ai-recommendation/contract.json';
import fixtures from '../../../../../../../supabase/functions/task-ai-recommendation/__fixtures__/contractFixtures.json';

import {
  AI_FIELD_VALUE_KIND,
  AI_LIMITS,
  ALLOWED_BENEFITS,
  ALLOWED_SUGGESTION_KINDS,
  IMMUTABLE_FIELDS,
  validateTaskAiRecommendationResult,
  type TaskAiRecommendationInput,
} from '../index';

// ---------------------------------------------------------------------------
// 1. contract.json 與 types.ts 沒有漂移
// ---------------------------------------------------------------------------

describe('contract.json 與 App 端型別一致', () => {
  it('allowlist 的 fieldPath 與型別完全相同', () => {
    expect(contract.allowedFieldPaths).toEqual(AI_FIELD_VALUE_KIND);
  });

  it('suggestion kind 相同且順序一致', () => {
    expect(contract.allowedSuggestionKinds).toEqual([...ALLOWED_SUGGESTION_KINDS]);
  });

  it('expectedBenefit 相同', () => {
    expect(contract.allowedBenefits).toEqual([...ALLOWED_BENEFITS]);
  });

  it('immutable 欄位相同', () => {
    expect(contract.immutableFields).toEqual([...IMMUTABLE_FIELDS]);
  });

  it('限制值相同', () => {
    // contract.json 多一個 maxIdLength（server 端才需要），其餘必須逐項相等。
    for (const [key, value] of Object.entries(AI_LIMITS)) {
      expect({ [key]: (contract.limits as Record<string, number>)[key] }).toEqual({ [key]: value });
    }
  });

  it('unavailable 的原因相同', () => {
    expect(contract.unavailableReasons).toEqual([
      'TIMEOUT', 'INVALID_RESPONSE', 'SERVICE_ERROR', 'UNSAFE_OUTPUT',
      // B2A.5 新增。刻意加在 reason 而非 status —— 理由見 types.ts。
      'NOT_ELIGIBLE', 'SERVICE_DISABLED',
    ]);
  });

  it('契約列出的每個 reason，App validator 都收得下', () => {
    // 這條測的是「server 回了一個 App 不認得的 reason」這個失敗。
    // 那種情況 App 會把它降級成 INVALID_RESPONSE —— 於是「這種任務
    // 第一版不開放」在 log 裡看起來像「模型壞掉」。
    for (const reason of contract.unavailableReasons) {
      const result = validateTaskAiRecommendationResult({
        status: 'unavailable', schemaVersion: 1, reason, suggestions: [],
      });
      expect({ reason, got: result }).toEqual({
        reason,
        got: { status: 'unavailable', schemaVersion: 1, reason, suggestions: [] },
      });
    }
  });

  it('timeout 設定存在且落在合理範圍', () => {
    // 太短會把正常回應誤判成逾時，太長等於沒有 timeout。
    expect(contract.timeouts.geminiRequestMs).toBeGreaterThanOrEqual(10000);
    expect(contract.timeouts.totalHandlerMs).toBeLessThanOrEqual(15000);
    expect(contract.timeouts.geminiRequestMs).toBeLessThan(contract.timeouts.totalHandlerMs);
  });
});

// ---------------------------------------------------------------------------
// 1b. B2A.5 —— 使用範圍與限流的契約內在一致性
// ---------------------------------------------------------------------------
//
// 這一組不比對兩端，比對的是 contract.json **自己有沒有自相矛盾**。
// eligibility 是一份手寫的清單，很容易在改欄位時漏掉一處；
// 而它一旦指到不存在的 fieldPath，結果是安靜的 —— 那個欄位只是永遠
// 不會被建議，沒有人會收到錯誤。

describe('eligibility 契約自洽', () => {
  const e = contract.eligibility;
  const allPaths = Object.keys(contract.allowedFieldPaths);

  it('context allowlist 只能是全域 allowlist 的子集', () => {
    // 「更窄」是這一層的全部意義。如果它能開出全域沒有的路徑，
    // 那 outputValidator 的雙重檢查就變成單重檢查了。
    const referenced = [
      ...e.baseFieldPaths,
      ...Object.values(e.extraFieldPathsByEditorKind).flat(),
    ];
    expect(referenced.filter((p) => !allPaths.includes(p))).toEqual([]);
  });

  it('每一種 editorKind 都有明確的 extra 清單', () => {
    // 沒列到的 kind 會拿到 `?? []`，也就是「只有 base」——
    // 那是安全的預設，但無聲。明確列出來才看得出是決定過的。
    const known = ['growth_plan', 'short_support', 'recurring', 'one_time', 'family_role'];
    expect(Object.keys(e.extraFieldPathsByEditorKind).sort()).toEqual([...known].sort());
  });

  it('neverAllowed 的路徑不會從任何一種 editorKind 溜進來', () => {
    const reachable = new Set([
      ...e.baseFieldPaths,
      ...Object.values(e.extraFieldPathsByEditorKind).flat(),
    ]);
    for (const denied of e.neverAllowedFieldPaths) {
      // 就算它出現在 base 或 extra 裡，fieldPathsFor 也會把它濾掉；
      // 但讓它同時出現在兩份清單只會讓下一個人看不懂哪邊說了算。
      expect({ denied, reachable: reachable.has(denied) }).toEqual({ denied, reachable: false });
    }
  });

  it('被拒絕的 editorKind 不會同時出現在允許清單', () => {
    for (const denied of e.deniedEditorKinds) {
      expect({ denied, allowed: e.allowedEditorKinds.includes(denied) })
        .toEqual({ denied, allowed: false });
    }
  });

  it('每個開放的 fieldPath 都至少有一個 kind 指得到它', () => {
    // 反方向的不變量。少了它，一個欄位可以是「開放的」卻沒有任何
    // 合法的 kind 能指向它 —— 於是它永遠不會被建議，而且沒有人會發現。
    //
    // 這條測試是實測長出來的：taskDetails 一度就是這個狀態。
    const targeted = new Set(
      Object.values(contract.suggestionKindFieldPaths as Record<string, string[]>).flat(),
    );
    const reachable = [
      ...e.baseFieldPaths,
      ...Object.values(e.extraFieldPathsByEditorKind).flat(),
    ].filter((p) => !e.neverAllowedFieldPaths.includes(p));

    expect(reachable.filter((p) => !targeted.has(p))).toEqual([]);
  });

  it('每個 suggestion kind 都對得到至少一個合法 fieldPath', () => {
    // 對不到的 kind 是死的：模型可以回它，但目標欄位永遠被擋，
    // 於是整批建議被丟掉 —— 一個只在 production 才看得到的失敗。
    for (const kind of contract.allowedSuggestionKinds) {
      const targets =
        (contract.suggestionKindFieldPaths as Record<string, string[]>)[kind] ?? [];
      expect({ kind, targets: targets.length > 0 }).toEqual({ kind, targets: true });
      expect({ kind, unknown: targets.filter((t) => !allPaths.includes(t)) })
        .toEqual({ kind, unknown: [] });
    }
  });
});

describe('rateLimit 契約自洽', () => {
  const r = contract.rateLimit;

  it('預設值低於上限', () => {
    expect(r.defaultPer10Minutes).toBeLessThanOrEqual(r.maxPer10Minutes);
    expect(r.defaultPerDay).toBeLessThanOrEqual(r.maxPerDay);
  });

  it('十分鐘的額度不會反過來大於一天的額度', () => {
    expect(r.defaultPer10Minutes).toBeLessThanOrEqual(r.defaultPerDay);
    expect(r.maxPer10Minutes).toBeLessThanOrEqual(r.maxPerDay);
  });

  it('bucket 種類與 migration 的 CHECK constraint 一致', () => {
    // SQL 那邊寫死了 `CHECK (bucket_type IN ('per_10min','per_day'))`。
    // 這裡改了那裡沒改的話，RPC 會在 insert 時炸掉 —— 而那是在
    // 真實請求路徑上，不是在測試裡。
    expect(r.bucketTypes).toEqual(['per_10min', 'per_day']);
  });

  it('prompt 要求的建議數不超過契約硬上限', () => {
    // prompt 要的是 3，validator 擋的是 5。
    // 這個差距是刻意的緩衝，但不能反過來。
    expect(contract.limits.promptMaxSuggestions)
      .toBeLessThanOrEqual(contract.limits.maxSuggestions);
  });
});

// ---------------------------------------------------------------------------
// 2. 禁止路徑是「真的被擋」，不是「清單長得一樣」
// ---------------------------------------------------------------------------

describe('explicitlyForbiddenPaths 每一條都被 client validator 拒絕', () => {
  it.each(contract.explicitlyForbiddenPaths)('%s', path => {
    const result = validateTaskAiRecommendationResult({
      status: 'suggestions',
      schemaVersion: 1,
      summary: '一項調整建議。',
      suggestions: [{
        id: 's1',
        kind: 'clarify_completion',
        fieldPath: path,
        currentValue: null,
        suggestedValue: '任意值',
        rationale: '任意理由。',
        expectedBenefit: 'clearer_expectation',
        confidence: 'high',
      }],
    });
    expect(result.status).toBe('unavailable');
  });
});

// ---------------------------------------------------------------------------
// 3. Fixture：六種 Demo 任務
// ---------------------------------------------------------------------------

type FixtureTask = { id: string; demoTaskName: string; input: TaskAiRecommendationInput };

/**
 * fixture 的 expect 是**雙端**的：
 *   status / appReason      —— 這一支（App 端 validator）要對上的
 *   serverStatus / serverReason —— Edge Function 那一支要對上的
 *
 * 兩邊的 reason 允許不同：server 把「形狀錯」與「越界」分開，App 端不分。
 * `serverOnlySafety` 標的是 server 多擋一層內容安全的案例 ——
 * 那些在這裡會**通過**，而那正是「client validator 不能取代 server」的證據。
 */
type FixtureExpect = {
  status: string;
  suggestionCount?: number;
  appReason?: string;
  serverStatus?: string;
  serverReason?: string;
};

type FixtureCase = {
  id: string;
  taskId: string;
  kind: 'valid_suggestions' | 'no_change' | 'immutable_violation' | 'prompt_injection';
  note?: string;
  serverOnlySafety?: boolean;
  inputOverride?: Record<string, unknown>;
  modelOutput: unknown;
  expect: FixtureExpect;
};

type FixtureEdgeCase = {
  id: string;
  ageGroup: string;
  note?: string;
  serverOnlySafety?: boolean;
  modelOutput: unknown;
  expect: FixtureExpect;
};

const TASKS = fixtures.tasks as unknown as FixtureTask[];
const CASES = fixtures.cases as unknown as FixtureCase[];
const EDGE_CASES = fixtures.edgeCases as unknown as FixtureEdgeCase[];

const DEMO_TASK_NAMES = [
  '完成學校作業', '餐後整理', '運動練習',
  '四週閱讀計畫', '整理書包 14 天', '四週餐桌小幫手',
];

describe('fixture 覆蓋六種 Demo 任務', () => {
  it('六筆任務都在，而且與 demo_seed 的名稱一致', () => {
    expect(TASKS.map(t => t.demoTaskName).sort()).toEqual([...DEMO_TASK_NAMES].sort());
  });

  it('每一筆任務都有四種案例', () => {
    for (const task of TASKS) {
      const kinds = CASES.filter(c => c.taskId === task.id).map(c => c.kind).sort();
      expect({ task: task.demoTaskName, kinds }).toEqual({
        task: task.demoTaskName,
        kinds: ['immutable_violation', 'no_change', 'prompt_injection', 'valid_suggestions'],
      });
    }
  });

  it('每一個 case 都指向存在的任務，case id 不重複', () => {
    const taskIds = new Set(TASKS.map(t => t.id));
    for (const c of CASES) expect(taskIds.has(c.taskId)).toBe(true);
    expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length);
  });
});

// ---------------------------------------------------------------------------
// 4. Fixture 的 input 不含個資
// ---------------------------------------------------------------------------

describe('fixture 不含真實家庭資料', () => {
  const serialized = JSON.stringify(TASKS);

  it('沒有姓名、email、UUID、JWT、Supabase key', () => {
    expect(serialized).not.toContain('承恩');
    expect(serialized).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(serialized).not.toMatch(/supabase\.co/);
  });

  it('沒有 childId / familyId / 錢包餘額這類欄位', () => {
    // 只看「會被送出去的值」。immutablePolicies.blockedFields 本來就會**列出**
    // childId / familyId 這些名字 —— 那是在告訴 AI 不准碰，不是在給它資料。
    // 兩者差一個字：一邊是欄位名稱，一邊是欄位內容。
    const payload = JSON.stringify(TASKS.map(t => ({
      childContext: t.input.childContext,
      taskContext: t.input.taskContext,
      parentIntent: t.input.parentIntent,
      currentDraft: t.input.currentDraft,
    })));

    for (const forbidden of ['childId', 'familyId', 'child_id', 'family_id', 'balance', 'accessToken', 'nickname', 'birthDate']) {
      expect({ forbidden, present: payload.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });

  it('blockedFields 反過來必須列出這些欄位 —— 它們被告知過，是可稽核的', () => {
    for (const task of TASKS) {
      expect(task.input.immutablePolicies.blockedFields).toEqual([...IMMUTABLE_FIELDS]);
    }
  });

  it('孩子只以 ageGroup 出現，而且是分級不是生日', () => {
    for (const task of TASKS) {
      expect(Object.keys(task.input.childContext)).toEqual(['ageGroup']);
      expect(task.input.childContext.ageGroup).toMatch(/^\d+-\d+$/);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. 每一個 case 的結論
// ---------------------------------------------------------------------------
//
// 這一段就是 server validator 未來要對齊的目標：同樣的 modelOutput，
// 兩邊必須得到同一個 status 與 reason。B1 在 Deno 端寫一支等價的測試，
// 讀同一份 fixture。

describe('client validator 對每一個 fixture 的結論', () => {
  it.each(CASES.map(c => [c.id, c] as const))('%s', (_id, c) => {
    const result = validateTaskAiRecommendationResult(c.modelOutput);

    expect(result.status).toBe(c.expect.status);
    if (c.expect.appReason) {
      expect(result).toMatchObject({ reason: c.expect.appReason });
    }
    if (c.expect.suggestionCount !== undefined) {
      expect(result.suggestions).toHaveLength(c.expect.suggestionCount);
    }
  });

  it.each(EDGE_CASES.map(c => [c.id, c] as const))('%s', (_id, c) => {
    const result = validateTaskAiRecommendationResult(c.modelOutput);

    expect(result.status).toBe(c.expect.status);
    if (c.expect.appReason) {
      expect(result).toMatchObject({ reason: c.expect.appReason });
    }
    if (c.expect.suggestionCount !== undefined) {
      expect(result.suggestions).toHaveLength(c.expect.suggestionCount);
    }
  });
});

describe('分組結論', () => {
  const resultOf = (c: FixtureCase) => validateTaskAiRecommendationResult(c.modelOutput);

  it('所有 immutable_violation 一律整批 unavailable，不留下任何一張卡', () => {
    for (const c of CASES.filter(c => c.kind === 'immutable_violation')) {
      const r = resultOf(c);
      expect({ id: c.id, status: r.status, kept: r.suggestions.length })
        .toEqual({ id: c.id, status: 'unavailable', kept: 0 });
    }
  });

  it('immutable-01 證明「壞一項就整批丟」：那批裡有一項是完全合法的', () => {
    const c = CASES.find(x => x.id === 'immutable-01')!;
    const raw = c.modelOutput as { suggestions: Array<{ fieldPath: string }> };
    expect(raw.suggestions[0].fieldPath).toBe('completionDescription'); // 合法
    expect(raw.suggestions[1].fieldPath).toBe('coinAmount');            // 違規
    expect(resultOf(c).suggestions).toHaveLength(0);                    // 兩張都不留
  });

  it('prompt_injection 的形狀攻擊都被擋下', () => {
    const injections = CASES.filter(c => c.kind === 'prompt_injection');
    const blocked = injections.filter(c => resultOf(c).status === 'unavailable').map(c => c.id);

    expect(blocked).toEqual(['injection-01', 'injection-02', 'injection-03', 'injection-04', 'injection-05']);
  });

  it('injection-06 在這一層仍然通過 —— 這正是 server validator 存在的理由', () => {
    // 這一筆通過**不是** bug，是證據。structural validation 依定義看不到
    // 「叫 6-9 歲的孩子清理瓦斯爐」有什麼問題 —— 那不是 schema 問題。
    //
    // B1 起 Edge Function 的 contentSafety 會擋下它（見
    // supabase/functions/task-ai-recommendation/tests/parity_test.ts）。
    // 這一條留在這裡是為了釘住一件事：**client validator 不能取代 server。**
    // 如果哪天有人把內容安全搬到 client 端當成唯一防線，這條測試會紅。
    const c = CASES.find(x => x.id === 'injection-06')!;
    expect(c.serverOnlySafety).toBe(true);

    const r = resultOf(c);
    expect(r.status).toBe('suggestions');
    expect(JSON.stringify(r)).toContain('瓦斯爐');
  });

  it('所有 serverOnlySafety 的案例在 App 端都通過，在 server 端都被擋', () => {
    const all = [
      ...CASES.filter(c => c.serverOnlySafety),
      ...EDGE_CASES.filter(c => c.serverOnlySafety),
    ];
    expect(all.length).toBeGreaterThanOrEqual(5);

    for (const c of all) {
      // App 端：放行。
      expect({ id: c.id, status: validateTaskAiRecommendationResult(c.modelOutput).status })
        .toEqual({ id: c.id, status: 'suggestions' });
      // fixture 上 server 端的預期：擋下。
      expect({ id: c.id, server: c.expect.serverStatus, reason: c.expect.serverReason })
        .toEqual({ id: c.id, server: 'unavailable', reason: 'UNSAFE_OUTPUT' });
    }
  });

  it('valid_suggestions 與 no_change 都不會被誤擋', () => {
    for (const c of CASES.filter(c => c.kind === 'valid_suggestions' || c.kind === 'no_change')) {
      expect({ id: c.id, status: resultOf(c).status })
        .toEqual({ id: c.id, status: c.expect.status });
    }
  });
});
