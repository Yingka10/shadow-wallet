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
