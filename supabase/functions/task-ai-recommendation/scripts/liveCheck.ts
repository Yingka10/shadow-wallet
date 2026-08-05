// task-ai-recommendation — 配額受限的真實服務檢查
//
// ─────────────────────────────────────────────────────────────────────────
// 為什麼需要一個「會自己踩煞車」的腳本：
//
// B2A 的驗證把三個 model 的當日免費額度**全部用完**，而且是在我沒有察覺
// 的情況下 —— 前十筆 red-team 結果全部回 SERVICE_ERROR，看起來像
// 「攻擊都被擋下了」，實際上是 429。那批結果只能整批丟掉。
//
// 這支腳本因此有三個硬性設計：
//
//   1. **有預算上限。** 超過就停，不是警告。
//   2. **預算跨次數累計。** 重跑不會從零開始 —— 同一個 UTC 日的用量記在
//      ledger 檔裡。這是「測試腳本不得因重跑自動消耗大量請求」的落實。
//   3. **429 / SERVICE_ERROR 永遠不算通過。** 配額耗盡看起來很像
//      「安全層擋下了攻擊」，那個誤讀已經發生過一次。
//
// ⚠️ 這支腳本只打 staging。它會在送出任何請求之前比對 project ref，
//    對到 production 就直接結束。
//
// ⚠️ 不印 token、不印 API key、不印密碼、不印完整 Authorization header。
//
// 用法：
//   deno run --allow-env --allow-net --allow-read --allow-write \
//     scripts/liveCheck.ts --mode=protocol --out=<資料夾>
//
// 環境變數（從 shell 傳入，不從 repo 讀）：
//   TASK_AI_STAGING_URL        staging 的 https://<ref>.supabase.co
//   TASK_AI_STAGING_ANON_KEY   staging anon key
//   TASK_AI_TEST_EMAIL         測試帳號
//   TASK_AI_TEST_PASSWORD      測試帳號密碼
//   TASK_AI_MAX_LIVE_TEST_CALLS 這一天最多幾次真實模型呼叫（預設 8）
// ─────────────────────────────────────────────────────────────────────────

import fixtures from '../__fixtures__/contractFixtures.json' with { type: 'json' };

// 只認這一個 ref，其餘一律拒絕。
//
// 刻意**不**寫一份「禁止的 ref 清單」：黑名單漏一個就等於放行，
// 而且那份清單本身會把 production ref 帶進 repo。
// 白名單漏一個只會讓腳本拒跑 —— 錯的方向是對的那一邊。
const STAGING_REF = 'lcmzbdgzehjxwuyduqwj';

const DEFAULT_BUDGET = 8;

type Mode = 'protocol' | 'e2e' | 'timeout' | 'redteam';

type Args = { mode: Mode; out: string };

function parseArgs(): Args {
  const get = (name: string): string | undefined =>
    Deno.args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

  const mode = (get('mode') ?? 'protocol') as Mode;
  const out = get('out');

  if (!['protocol', 'e2e', 'timeout', 'redteam'].includes(mode)) {
    fail(`未知的 mode：${mode}`);
  }
  // 刻意不給預設輸出路徑：結果檔含模型原文，不該不小心落進 repo。
  if (!out) fail('必須指定 --out=<資料夾>（結果檔含模型輸出，不要放進 repo）');

  return { mode, out: out! };
}

function fail(message: string): never {
  console.error(`[停止] ${message}`);
  Deno.exit(1);
}

function env(name: string, required = true): string {
  const value = Deno.env.get(name)?.trim();
  if (!value && required) fail(`缺少環境變數 ${name}`);
  return value ?? '';
}

// ---------------------------------------------------------------------------
// 部署目標
// ---------------------------------------------------------------------------

function assertStaging(url: string): string {
  if (!url.includes(STAGING_REF)) {
    // 不是拒絕某個特定環境，是拒絕**沒有被確認過**的環境 ——
    // production 也落在這裡面。
    fail(`目標不是已知的 staging（預期 ref ${STAGING_REF}）。`);
  }
  return url.replace(/\/+$/, '');
}

// ---------------------------------------------------------------------------
// 預算
// ---------------------------------------------------------------------------
//
// ledger 記的是「這一天已經花掉幾次真實模型呼叫」。
// 只記數字與日期，不記內容 —— 它會被反覆讀寫，不該裝任何敏感資訊。

type Ledger = { day: string; used: number };

class Budget {
  #path: string;
  #limit: number;
  #ledger: Ledger;

  constructor(outDir: string, limit: number) {
    this.#path = `${outDir}/.task-ai-live-usage.json`;
    this.#limit = limit;
    this.#ledger = this.#read();
  }

  #today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  #read(): Ledger {
    try {
      const parsed = JSON.parse(Deno.readTextFileSync(this.#path)) as Partial<Ledger>;
      if (parsed.day === this.#today() && typeof parsed.used === 'number') {
        return { day: parsed.day, used: parsed.used };
      }
    } catch {
      // 檔案不存在或壞掉都當作今天還沒用過。
    }
    return { day: this.#today(), used: 0 };
  }

  #write(): void {
    Deno.writeTextFileSync(this.#path, JSON.stringify(this.#ledger));
  }

  get remaining(): number {
    return Math.max(0, this.#limit - this.#ledger.used);
  }

  /** 花掉一次。回傳 false 代表**不可以**送這個請求。 */
  spend(): boolean {
    if (this.remaining <= 0) return false;
    this.#ledger.used += 1;
    this.#write();
    return true;
  }

  describe(): string {
    return `今日已用 ${this.#ledger.used} / ${this.#limit}（剩 ${this.remaining}）`;
  }
}

// ---------------------------------------------------------------------------
// 登入
// ---------------------------------------------------------------------------

/** 回傳 access token。**呼叫端不可以印它。** */
async function signIn(baseUrl: string, anonKey: string): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: anonKey },
    body: JSON.stringify({
      email: env('TASK_AI_TEST_EMAIL'),
      password: env('TASK_AI_TEST_PASSWORD'),
    }),
  });

  if (!res.ok) fail(`登入失敗（HTTP ${res.status}）`);
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) fail('登入回應沒有 access_token');
  return data.access_token;
}

// ---------------------------------------------------------------------------
// 呼叫
// ---------------------------------------------------------------------------

type CallResult = {
  httpStatus: number;
  latencyMs: number;
  body: unknown;
};

async function callFunction(
  baseUrl: string,
  anonKey: string,
  token: string | null,
  body: unknown,
): Promise<CallResult> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    apikey: anonKey,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const startedAt = Date.now();
  const res = await fetch(`${baseUrl}/functions/v1/task-ai-recommendation`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - startedAt;

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    // 保留原文，讓 gateway 的非 JSON 回應也看得見。
  }

  return { httpStatus: res.status, latencyMs, body: parsed };
}

/** 從回應裡取出結論。**SERVICE_ERROR 與 429 永遠不算通過。** */
function verdictOf(result: CallResult): { status: string; reason?: string; usable: boolean } {
  if (result.httpStatus === 429) return { status: 'rate_limited', usable: false };

  const body = result.body as { result?: { status?: string; reason?: string } } | null;
  const inner = body?.result;
  if (!inner?.status) return { status: `http_${result.httpStatus}`, usable: false };

  // 配額耗盡長得像「服務暫時不可用」。B2A 就是在這裡把 429 讀成
  // 「攻擊被擋下了」。所以它一律標成不可用作結論。
  const usable = inner.status !== 'unavailable' || inner.reason === 'NOT_ELIGIBLE';
  return { status: inner.status, reason: inner.reason, usable };
}

// ---------------------------------------------------------------------------
// 情境
// ---------------------------------------------------------------------------

type FixtureTask = { id: string; input: unknown };
const TASKS = (fixtures as { tasks: FixtureTask[] }).tasks;

function taskInput(id: string): unknown {
  const task = TASKS.find((t) => t.id === id);
  if (!task) fail(`fixture 沒有這個任務：${id}`);
  return task!.input;
}

/** 不消耗模型呼叫的協定檢查：它們在到達 Gemini 之前就被擋下。 */
async function runProtocol(baseUrl: string, anonKey: string, token: string) {
  const cases: Array<[string, string | null, unknown]> = [
    ['沒有 token', null, { input: taskInput('sport-practice') }],
    ['偽造 token', 'forged.token.value', { input: taskInput('sport-practice') }],
    ['body 不是預期結構', token, { nope: true }],
    ['含禁止欄位', token, {
      input: { ...(taskInput('sport-practice') as object), childNickname: '測試' },
    }],
    ['不符合資格的任務', token, { input: taskInput('after-meal-tidy') }],
  ];

  const results = [];
  for (const [name, tok, body] of cases) {
    const result = await callFunction(baseUrl, anonKey, tok, body);
    results.push({ name, httpStatus: result.httpStatus, ...verdictOf(result) });
    console.log(`  ${name} → HTTP ${result.httpStatus}`);
  }
  return results;
}

/** 真實模型呼叫。每一筆都要先跟 budget 借。 */
async function runE2E(baseUrl: string, anonKey: string, token: string, budget: Budget) {
  // 只挑通過使用範圍閘門的三種任務 —— 其餘三種不會呼叫 Gemini，
  // 放進來只會讓「花了幾次」這件事變得難算。
  const eligible = ['school-assignment', 'sport-practice', 'reading-plan'];

  const results = [];
  for (const id of eligible) {
    if (!budget.spend()) {
      console.log(`  [預算用盡] 略過 ${id} —— ${budget.describe()}`);
      results.push({ id, skipped: true, reason: 'BUDGET_EXHAUSTED' });
      continue;
    }

    const result = await callFunction(baseUrl, anonKey, token, { input: taskInput(id) });
    const verdict = verdictOf(result);
    results.push({ id, latencyMs: result.latencyMs, ...verdict, body: result.body });
    console.log(`  ${id} → ${verdict.status}${verdict.reason ? `/${verdict.reason}` : ''} (${result.latencyMs}ms)`);
  }
  return results;
}

/** 逾時基準：同一個任務量測多次，看真實延遲分布。 */
async function runTimeout(baseUrl: string, anonKey: string, token: string, budget: Budget) {
  // 用最慢的那一種（成長計畫，欄位最多、輸出最長）。
  const id = 'reading-plan';
  const samples = [];

  while (budget.remaining > 0) {
    if (!budget.spend()) break;
    const result = await callFunction(baseUrl, anonKey, token, { input: taskInput(id) });
    const verdict = verdictOf(result);
    samples.push({ latencyMs: result.latencyMs, ...verdict });
    console.log(`  #${samples.length} ${verdict.status}${verdict.reason ? `/${verdict.reason}` : ''} ${result.latencyMs}ms`);
  }

  const usable = samples.filter((s) => s.usable).map((s) => s.latencyMs).sort((a, b) => a - b);
  return {
    taskId: id,
    samples,
    // 樣本太少時不算百分位 —— 三筆資料算出來的 p95 是一個假的數字。
    stats: usable.length >= 5
      ? {
          n: usable.length,
          min: usable[0],
          median: usable[Math.floor(usable.length / 2)],
          max: usable[usable.length - 1],
        }
      : { n: usable.length, note: '樣本不足，不計百分位' },
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();
  const baseUrl = assertStaging(env('TASK_AI_STAGING_URL'));
  const anonKey = env('TASK_AI_STAGING_ANON_KEY');
  const limit = Number(Deno.env.get('TASK_AI_MAX_LIVE_TEST_CALLS') ?? DEFAULT_BUDGET);

  if (!Number.isInteger(limit) || limit <= 0 || limit > 40) {
    fail(`TASK_AI_MAX_LIVE_TEST_CALLS 必須是 1-40 的整數（收到 ${limit}）`);
  }

  const budget = new Budget(args.out, limit);
  console.log(`目標：staging（ref …${STAGING_REF.slice(-6)}）`);
  console.log(`預算：${budget.describe()}`);

  if (args.mode !== 'protocol' && budget.remaining === 0) {
    fail('今日預算已用盡。等明天，或調高 TASK_AI_MAX_LIVE_TEST_CALLS 後再跑。');
  }

  const token = await signIn(baseUrl, anonKey);
  console.log('登入成功。\n');

  let payload: unknown;
  switch (args.mode) {
    case 'protocol':
      console.log('協定檢查（不消耗模型呼叫）：');
      payload = await runProtocol(baseUrl, anonKey, token);
      break;
    case 'e2e':
      console.log('端到端（消耗模型呼叫）：');
      payload = await runE2E(baseUrl, anonKey, token, budget);
      break;
    case 'timeout':
      console.log('逾時基準（消耗模型呼叫）：');
      payload = await runTimeout(baseUrl, anonKey, token, budget);
      break;
    case 'redteam':
      fail('red-team 情境含完整惡意輸入，請單獨執行並自行保管結果檔。');
  }

  const outPath = `${args.out}/liveCheck_${args.mode}.json`;
  Deno.writeTextFileSync(
    outPath,
    JSON.stringify({ mode: args.mode, at: new Date().toISOString(), payload }, null, 2),
  );

  console.log(`\n結果寫入 ${outPath}`);
  console.log(budget.describe());
}

await main();
