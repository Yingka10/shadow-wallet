// P0-3 — App 端與 Edge Function 端的契約沒有漂移
//
// ─────────────────────────────────────────────────────────────────────────
// 防的是一個很安靜的失敗：
//
// Function 端加了一個 pricingStatus，App 端的 validator 沒加。結果是
// server 放行、client 拒收 —— 孩子每次送出提案都「剛好沒有草稿」，
// 而兩邊的 log 都顯示自己運作正常。
//
// 做法沿用 taskAi 的 contractParity：兩邊各有一份實作，由測試釘住一致。
// 不讓 Function import App 的 module graph（Deno 部署不了），
// 也不讓 App import Deno 檔（jest 解析不了 import attributes 與 Deno 全域）。
// 這裡比對的是**原始碼裡的字面值**，因為那正是會各自漂移的東西。
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join } from 'path';

import { PLAN_DRAFT_LIMITS, CHILD_PROPOSAL_PLAN_DRAFT_REQUEST_TYPE } from '../types';
import { PLAN_DRAFT_TIMEOUT_MS } from '../planDraftClient';
import { validatePlanDraftResult } from '../validatePlanDraftResult';

const FUNCTION_DIR = join(
  process.cwd(), 'supabase', 'functions', 'ai-proxy',
);

function read(...parts: string[]): string {
  return readFileSync(join(FUNCTION_DIR, ...parts), 'utf8').split(/\r\n/).join('\n');
}

const LOGIC = read('childProposalPlanDraftLogic.ts');
const HANDLER = read('childProposalPlanDraft.ts');
const INDEX = read('index.ts');

describe('request type 兩邊一致', () => {
  it('ai-proxy 的 switch 認得 App 送出的那個字串', () => {
    expect(INDEX).toContain(`case '${CHILD_PROPOSAL_PLAN_DRAFT_REQUEST_TYPE}':`);
  });

  it('App 打的是既有的 ai-proxy，不是另外一支 Function', () => {
    const client = readFileSync(
      join(process.cwd(), 'src', 'lib', 'childProposal', 'planDraft', 'planDraftClient.ts'),
      'utf8',
    );
    expect(client).toContain("AI_PROXY_FUNCTION_NAME = 'ai-proxy'");
  });
});

describe('上限兩邊一致', () => {
  it.each(Object.entries(PLAN_DRAFT_LIMITS))('%s = %s', (key, value) => {
    // Function 端的 PLAN_DRAFT_LIMITS 也要有同一個鍵與同一個值。
    expect(LOGIC).toMatch(new RegExp(`${key}:\\s*${value}\\b`));
  });
});

describe('列舉兩邊一致', () => {
  it.each([
    ['類別', ['A', 'B', 'C', 'D']],
    ['難度', ['easy', 'standard', 'hard']],
    ['執行形式', ['one_time', 'recurring', 'long_term']],
    ['幣值狀態', ['priced', 'unpriced', 'coin_disabled', 'gated']],
    ['節奏來源', ['child', 'ai_suggested', 'none']],
    ['回饋方式', ['record_only', 'family_contribution', 'progress_only', 'coin_eligible']],
    // 封閉列舉。少一個值，App 端就會把那種活動整筆拒收。
    ['活動種類', ['reading', 'practice', 'exercise', 'creating', 'learning', 'helping', 'other']],
  ])('%s', (_label, values) => {
    for (const value of values) {
      expect({ value, inFunction: LOGIC.includes(`'${value}'`) })
        .toEqual({ value, inFunction: true });
    }
  });

  it('Function 端會回的 unavailable 理由，App 端全部認得', () => {
    // handler 只用這三個 —— 其餘（TIMEOUT / SERVICE_DISABLED）是 App 自己判斷的。
    for (const reason of ['INVALID_AI_OUTPUT', 'SERVICE_ERROR', 'INVALID_INPUT']) {
      expect(HANDLER).toContain(`'${reason}'`);
      expect(
        validatePlanDraftResult({ status: 'unavailable', schemaVersion: 1, reason }),
      ).toEqual({ status: 'unavailable', schemaVersion: 1, reason });
    }
  });

  it('schema 版本兩邊都是 1', () => {
    expect(LOGIC).toContain('CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION = 1');
  });

  it('Function 端有回 activityKind 與 nextStepSuggestion —— App 端靠它們組 canonical 欄位', () => {
    expect(LOGIC).toContain('activityKind');
    expect(LOGIC).toContain('nextStepSuggestion');
    // prompt 也必須真的要求它們，否則模型不會給。
    expect(LOGIC).toContain('"activityKind":"reading"');
    expect(LOGIC).toContain('"nextStepSuggestion"');
  });
});

describe('兩端的 timeout 預算對得上', () => {
  // 2026-08-11 staging：Function 端沿用 gemini.ts 的 8 秒預設，而這一支
  // 穩定要 9-11 秒 —— 於是每一次都逾時，回的是 SERVICE_ERROR。
  // 症狀看起來像服務壞掉，實際上只是預算給錯了，所以把數字釘在測試裡。
  const budget = Number(
    /PLAN_DRAFT_GEMINI_TIMEOUT_MS = ([\d_]+)/.exec(LOGIC)?.[1]?.replace(/_/g, ''),
  );

  it('Function 端有自己的預算，沒有沿用 8 秒預設', () => {
    expect(budget).toBeGreaterThan(8000);
  });

  it('而且比 App 端放棄的時間短 —— 否則拿不到結構化的 reason', () => {
    // client 先 abort 的話，「模型太慢」與「模型亂寫」會一起變成 TIMEOUT，
    // 兩種完全不同的問題就分不出來了。
    expect(budget).toBeLessThan(PLAN_DRAFT_TIMEOUT_MS);
  });

  it('Function 端真的把預算傳進 callGeminiWithModel', () => {
    expect(HANDLER).toContain('PLAN_DRAFT_GEMINI_TIMEOUT_MS');
  });
});

describe('canonical 欄位由 App 端算，Function 端不越權', () => {
  it('Function 端不決定 progress model', () => {
    // Function 回的是「理解」，不是 canonical 欄位。這兩個識別字出現在
    // Function 端，就代表它開始自己組 P0-5 要的值了 —— 那會變成兩個地方
    // 各有一套推導規則，而其中一套遲早會被忘記。
    //
    // （prompt 裡的「完成一次約定的閱讀時段」是給模型的**範例**，
    //   那一句只會進 ai_snapshot 當候選，不是結構化欄位的值。）
    for (const forbidden of ['progressModel', 'weekly_rhythm']) {
      expect({ forbidden, present: LOGIC.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });

  it('canonical 完成標準的句型只在 App 端', () => {
    const canonical = readFileSync(
      join(process.cwd(), 'src', 'lib', 'childProposal', 'planDraft', 'canonicalPlanFields.ts'),
      'utf8',
    );
    expect(canonical).toContain('完成一次約定的');
    // 而 Function 端沒有任何地方在組這個句子（它只在 prompt 裡當範例）。
    expect(LOGIC).not.toContain('`完成一次約定的');
  });
});

describe('Function 端重用既有基礎設施，沒有另外做一套', () => {
  it('幣值走既有的 rewardEligibility + coinPolicy', () => {
    expect(HANDLER).toContain("from './rewardEligibility.ts'");
    expect(HANDLER).toContain("from './coinPolicy.ts'");
    expect(HANDLER).toContain('runEligibilityGate');
    expect(HANDLER).toContain('calcCoins');
  });

  it('模型走既有的 gemini transport，不是新的 client', () => {
    expect(HANDLER).toContain("from './gemini.ts'");
    expect(HANDLER).not.toContain('generativelanguage.googleapis.com');
    expect(HANDLER).not.toContain('GEMINI_API_KEY');
  });

  it('沒有第二套 coin engine —— handler 裡沒有任何算幣的算式', () => {
    const code = HANDLER
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      })
      .join('\n');
    for (const forbidden of ['Math.round(', 'bandBaseCoins', 'difficultyDelta']) {
      expect({ forbidden, present: code.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });
});

describe('App 端不認識 Gemini', () => {
  it.each([
    'types.ts',
    'planDraftClient.ts',
    'validatePlanDraftResult.ts',
    'generatePlanDraft.ts',
    'toPlanVersionCommand.ts',
    'buildPlanDraftInput.ts',
  ])('%s 沒有任何模型細節', (file) => {
    const source = readFileSync(
      join(process.cwd(), 'src', 'lib', 'childProposal', 'planDraft', file),
      'utf8',
    );
    const code = source
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      })
      .join('\n');

    for (const forbidden of ['GEMINI', 'googleapis', 'responseSchema', 'candidates']) {
      expect({ file, forbidden, present: code.includes(forbidden) })
        .toEqual({ file, forbidden, present: false });
    }
  });
});
