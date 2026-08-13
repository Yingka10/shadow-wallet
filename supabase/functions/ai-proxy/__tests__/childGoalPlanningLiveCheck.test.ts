// P1-A1.5 — Real model acceptance（**預設不跑**）
//
// ─────────────────────────────────────────────────────────────────────────
// canonical fixtures 證明的是「模型這樣回，系統會這樣處理」。
// 這一支證明的是另一件事：**真的 Gemini 照這份 prompt 回得出來嗎。**
//
// 兩件事都要有。只有前者的話，一份 contract 可以完美地驗證一種
// 從來不會發生的輸出。
//
// 這支會**真的花錢**，所以預設 skip。要跑：
//
//   LIVE_MODEL_CHECK=1 npx jest childGoalPlanningLiveCheck
//
// 金鑰從 .env.local 讀（jest 不會自己載入它 —— NODE_ENV=test 會跳過），
// 而且**只讀不印**：報告裡不會出現任何金鑰片段。
//
// 它打的是 Gemini API 本身，走與 ai-proxy 同一條 MODEL_CHAIN（從 gemini.ts
// 的原始碼解析出來，不另外寫死一份）與同一個 15 秒預算，經過同一支
// prompt builder、同一支 normalize/compose、同一支 App validator。
// **沒有部署任何東西、沒有碰 staging 的資料、沒有寫任何一列資料。**
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  buildChildGoalPlanningPrompt,
  composeChildGoalPlanningResponse,
  normalizeChildGoalPlanning,
  CHILD_GOAL_PLANNING_GEMINI_TIMEOUT_MS,
  type ChildGoalPlanningInput,
} from '../childGoalPlanningLogic';
import { validateChildGoalPlanningResult } from '../../../../src/lib/childPlanning/validateChildGoalPlanningResult';
import type {
  ChildGoalPlanningInput as AppInput,
  ChildGoalPlanningResult,
} from '../../../../src/lib/childPlanning/types';

const ROOT = process.cwd();
const ENABLED = process.env.LIVE_MODEL_CHECK === '1';
/**
 * 輸出寫到 repo **外面**的系統暫存目錄。
 *
 * 不是隨手選的：testBaselineHygiene 有一條規則是「測試不從 gitignore 掉的
 * 目錄讀檔」，而這一支雖然只寫不讀，把 repo 內的路徑寫進測試裡仍然會讓
 * 那條規則變得要靠人判斷例外。寫到 repo 外就沒有這個問題。
 */
const OUT_FILE = process.env.LIVE_CHECK_OUT ?? join(tmpdir(), 'p1-a1-live-check.json');

/** .env.local → 只取需要的那一把。jest 不載入它。 */
function readGeminiKey(): string | null {
  const file = join(ROOT, '.env.local');
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/.exec(line);
    if (match) return match[1].replace(/^["']|["']$/g, '');
  }
  return null;
}

/** MODEL_CHAIN 從 gemini.ts 解析 —— 寫死一份就會與正式路徑分岔。 */
function readModelChain(): string[] {
  const source = readFileSync(join(ROOT, 'supabase', 'functions', 'ai-proxy', 'gemini.ts'), 'utf8');
  const match = /const MODEL_CHAIN = \[([^\]]+)\]/.exec(source);
  if (!match) throw new Error('找不到 MODEL_CHAIN —— gemini.ts 的形狀變了');
  return match[1].split(',').map((item) => item.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

function parseJsonLoose<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(cleaned) as T;
}

/**
 * 每一次呼叫的預算。
 *
 * 預設就是契約裡的那個數字 —— 這支要驗的正是「那個預算夠不夠」。
 * 要量測真實延遲分布時用 LIVE_CHECK_BUDGET_MS 放大它。
 */
const BUDGET_MS = Number(process.env.LIVE_CHECK_BUDGET_MS ?? CHILD_GOAL_PLANNING_GEMINI_TIMEOUT_MS);

type LiveOutcome = {
  label: string;
  run: number;
  /** 實際花了多久。逾時的那些也有值 —— 用來決定預算該給多少。 */
  elapsedMs: number;
  model: string | null;
  /** 模型回的原始文字（截斷），供人判讀產品品質用。 */
  raw: string | null;
  parsed: unknown;
  result: ChildGoalPlanningResult | null;
  error: string | null;
};

async function callGemini(
  prompt: string,
  key: string,
  chain: string[],
): Promise<{ text: string; model: string }> {
  let lastError: unknown;
  for (const model of chain) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BUDGET_MS);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
          signal: controller.signal,
        },
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Gemini error ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      return { text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '', model };
    } catch (err) {
      lastError = err;
      const message = String(err);
      if (!message.includes('429') && !message.includes('404')) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function input(overrides: Partial<ChildGoalPlanningInput> = {}): ChildGoalPlanningInput {
  return {
    schemaVersion: 1,
    ageGroup: '9-12',
    childOriginalGoal: '',
    childOriginalMotivation: null,
    childApproach: null,
    cadence: null,
    preferredTime: null,
    planningSupportPreference: null,
    ...overrides,
  };
}

const CASES: { label: string; runs: number; input: ChildGoalPlanningInput }[] = [
  {
    label: 'A｜孩子已經規劃完整',
    runs: 2,
    input: input({
      childOriginalGoal: '我想兩週讀完神奇樹屋',
      childApproach: '平日睡前讀 15 分鐘',
      cadence: { mode: 'fixed_days', days: [1, 2, 3, 4, 5] },
      preferredTime: '睡前',
    }),
  },
  { label: 'B｜目標本身模糊', runs: 2, input: input({ childOriginalGoal: '我想變厲害' }) },
  {
    label: 'C｜目標清楚但不知道方法',
    runs: 2,
    input: input({ childOriginalGoal: '我想兩週讀完這本書，但不知道怎麼安排' }),
  },
  { label: 'D｜外部結果', runs: 2, input: input({ childOriginalGoal: '我想國文考 100 分' }) },
  {
    label: 'E｜已有老師方法',
    runs: 2,
    input: input({
      childOriginalGoal: '我想把這首鋼琴曲學會',
      childApproach: '老師叫我先練右手旋律，再練左手',
    }),
  },
  { label: 'F｜自然 staged project', runs: 1, input: input({ childOriginalGoal: '我想做一本自己的漫畫' }) },
  { label: 'G｜累積型', runs: 1, input: input({ childOriginalGoal: '暑假想讀 5 本書' }) },
  {
    label: 'H｜孩子原話含 authority wording',
    runs: 1,
    input: input({ childOriginalGoal: '我想找到最有效的讀書方法' }),
  },
  // ── 第二輪：這兩個組合第一輪觀測不到，但它們正是這份契約的重點 ──────
  {
    // external_outcome × rhythm 的 ready plan。第一輪 D 只會停在 needs_choice
    // （孩子還沒決定方法），所以不補這一個就等於沒驗過拆維度那件事。
    // approach 用的是 D#2 自己給的選項，模擬孩子挑了它。
    label: 'D2｜外部結果，孩子挑了方法之後',
    runs: 2,
    input: input({
      childOriginalGoal: '我想國文考 100 分',
      childApproach: '每次花 15 分鐘複習老師勾選的重點',
      cadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
    }),
  },
  {
    // 孩子的 authority wording 進到 ready plan 的敘述裡會怎樣。
    // 第一輪 H 停在 needs_choice，那條路徑掃不到 desiredOutcome。
    label: 'H2｜authority wording 進到計畫敘述',
    runs: 1,
    input: input({
      childOriginalGoal: '我想找到最有效的讀書方法',
      childApproach: '每天先讀 20 分鐘，再把重點整理成筆記',
      cadence: { mode: 'weekly_frequency', weeklyFrequency: 5 },
    }),
  },
];

async function runOnce(
  label: string,
  run: number,
  fnInput: ChildGoalPlanningInput,
  key: string,
  chain: string[],
): Promise<LiveOutcome> {
  const startedAt = Date.now();
  try {
    const { text, model } = await callGemini(buildChildGoalPlanningPrompt(fnInput), key, chain);
    const elapsedMs = Date.now() - startedAt;
    let parsed: unknown;
    try {
      parsed = parseJsonLoose<unknown>(text);
    } catch (err) {
      return {
        label,
        run,
        elapsedMs,
        model,
        raw: text.slice(0, 800),
        parsed: null,
        result: null,
        error: `parse: ${String(err)}`,
      };
    }

    const understanding = normalizeChildGoalPlanning(parsed);
    const response =
      understanding === null
        ? ({ status: 'unavailable', schemaVersion: 1, reason: 'INVALID_AI_OUTPUT' } as const)
        : composeChildGoalPlanningResponse({ input: fnInput, understanding, model });

    return {
      label,
      run,
      elapsedMs,
      model,
      raw: text.slice(0, 800),
      parsed,
      result: validateChildGoalPlanningResult(
        JSON.parse(JSON.stringify(response)),
        fnInput as AppInput,
      ),
      error: null,
    };
  } catch (err) {
    return {
      label,
      run,
      elapsedMs: Date.now() - startedAt,
      model: null,
      raw: null,
      parsed: null,
      result: null,
      error: String(err),
    };
  }
}

const maybe = ENABLED ? describe : describe.skip;

maybe('P1-A1 real model acceptance', () => {
  it(
    '跑完所有 canonical case 並把結果寫出來',
    async () => {
      const key = readGeminiKey();
      if (key === null) throw new Error('.env.local 裡沒有 GEMINI_API_KEY');
      const chain = readModelChain();

      const outcomes: LiveOutcome[] = [];
      // 只補跑某幾個 case 用（例如上一輪撞到配額的那兩個）。
      // 不設就是全部 —— 完整驗收永遠跑全部。
      const only = process.env.LIVE_CHECK_ONLY ?? '';
      const wanted = (label: string) => only === '' || label.startsWith(only);

      for (const testCase of CASES.filter((testCase) => wanted(testCase.label))) {
        for (let run = 1; run <= testCase.runs; run += 1) {
          outcomes.push(await runOnce(testCase.label, run, testCase.input, key, chain));
        }
      }

      // ── multi-turn：C 的第二輪 ──────────────────────────────────────────
      // 模擬孩子從 needs_choice 挑了一個選項（或自己輸入），選項文字回到
      // childApproach。第二輪必須進 ready，而且 provenance 不可以把
      // 他接受過的東西重新標成純 ai_suggested。
      const chosen = input({
        childOriginalGoal: '我想兩週讀完這本書，但不知道怎麼安排',
        childApproach: '每天睡前讀 15 分鐘',
        cadence: { mode: 'weekly_frequency', weeklyFrequency: 7 },
        preferredTime: '睡前',
      });
      if (wanted('MT')) {
        outcomes.push(await runOnce('MT｜孩子挑了選項之後的第二輪', 1, chosen, key, chain));
      }

      const custom = input({
        childOriginalGoal: '我想兩週讀完這本書，但不知道怎麼安排',
        childApproach: '我自己想：週末一次讀兩章',
        cadence: { mode: 'weekly_frequency', weeklyFrequency: 2 },
      });
      if (wanted('MT')) {
        outcomes.push(await runOnce('MT｜孩子自己輸入之後的第二輪', 1, custom, key, chain));
      }

      const latencies = outcomes.map((outcome) => outcome.elapsedMs).sort((a, b) => a - b);
      writeFileSync(
        OUT_FILE,
        JSON.stringify(
          {
            chain,
            budgetMs: BUDGET_MS,
            latency: {
              min: latencies[0],
              median: latencies[Math.floor(latencies.length / 2)],
              max: latencies[latencies.length - 1],
            },
            outcomes,
          },
          null,
          2,
        ),
        'utf8',
      );

      // 這支不判 PASS/FAIL —— 產品品質要人看。它只保證跑得完、有結果可讀。
      expect(outcomes.length).toBeGreaterThan(0);
      expect(outcomes.every((outcome) => outcome.error === null || outcome.result !== null)).toBe(
        true,
      );
    },
    15 * 60 * 1000,
  );
});
