// P1-A1 — App 端與 Edge Function 端的契約沒有漂移
//
// ─────────────────────────────────────────────────────────────────────────
// 防的是與 P0-3 同一個很安靜的失敗：Function 端加了一個欄位、App 端沒加，
// 結果 server 放行、client 拒收 —— 而兩邊的 log 都顯示自己運作正常。
//
// 做法沿用 planDraftContractParity：兩邊各有一份實作，由測試釘住一致。
// 這裡比對的是**原始碼裡的字面值**，因為那正是會各自漂移的東西。
//
// 這一支還多釘兩件 P1-A1 專屬的事：
//   · Function 端**沒有**第二份關鍵字規則（§12 的要求）
//   · P0-3 的 Plan Draft 契約沒有被這一包碰到
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join } from 'path';

import { NEXT_STEP_MAX_LENGTH } from '../../childProposal/planDraft/canonicalPlanFields';
import { CHILD_GOAL_PLANNING_TIMEOUT_MS } from '../childGoalPlanningClient';
import { validateChildGoalPlanningResult } from '../validateChildGoalPlanningResult';
import {
  CHILD_GOAL_PLANNING_LIMITS,
  CHILD_GOAL_PLANNING_REQUEST_TYPE,
  CHILD_GOAL_PLANNING_SCHEMA_VERSION,
  CHILD_PLANNING_CONTRIBUTIONS,
  CHILD_PLANNING_RESPONSE_TYPES,
  CHILD_PLAN_CLARIFICATION_KINDS,
  CHILD_PLAN_FIELD_SOURCES,
  CHILD_PLAN_GOAL_CONTROL_TYPES,
  CHILD_PLAN_PROGRESSION_KINDS,
  EVIDENCE_PRIORITY,
  type ChildGoalPlanningInput,
} from '../types';

const FUNCTION_DIR = join(process.cwd(), 'supabase', 'functions', 'ai-proxy');
const APP_DIR = join(process.cwd(), 'src', 'lib', 'childPlanning');

function readFunction(...parts: string[]): string {
  return readFileSync(join(FUNCTION_DIR, ...parts), 'utf8').split(/\r\n/).join('\n');
}

function readApp(...parts: string[]): string {
  return readFileSync(join(APP_DIR, ...parts), 'utf8').split(/\r\n/).join('\n');
}

/**
 * 只留下程式碼。
 *
 * 「不存在」的斷言必須跳過註解 —— 這幾個檔案的註解本來就在解釋
 * 「為什麼這裡不做那件事」，句子裡一定會出現那個詞。用整份原始碼去斷言
 * 的話，寫得越清楚的註解越容易讓測試變紅。
 */
function codeOnly(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

const LOGIC = readFunction('childGoalPlanningLogic.ts');
const HANDLER = readFunction('childGoalPlanning.ts');
const INDEX = readFunction('index.ts');
const PLAN_DRAFT_LOGIC = readFunction('childProposalPlanDraftLogic.ts');

const INPUT: ChildGoalPlanningInput = {
  schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION,
  ageGroup: '6-9',
  childOriginalGoal: '我想變厲害',
  childOriginalMotivation: null,
  childApproach: null,
  cadence: null,
  preferredTime: null,
  planningSupportPreference: null,
  responses: [],
};

describe('request type 兩邊一致', () => {
  it('ai-proxy 的 switch 認得 App 送出的那個字串', () => {
    expect(INDEX).toContain(`case '${CHILD_GOAL_PLANNING_REQUEST_TYPE}':`);
  });

  it('App 打的是既有的 ai-proxy，不是另外一支 Function', () => {
    expect(readApp('childGoalPlanningClient.ts')).toContain("AI_PROXY_FUNCTION_NAME = 'ai-proxy'");
  });

  it('schema 版本兩邊都是 1', () => {
    expect(CHILD_GOAL_PLANNING_SCHEMA_VERSION).toBe(1);
    expect(LOGIC).toContain('CHILD_GOAL_PLANNING_SCHEMA_VERSION = 1');
  });
});

describe('上限兩邊一致', () => {
  it.each(Object.entries(CHILD_GOAL_PLANNING_LIMITS))('%s = %s', (key, value) => {
    expect(LOGIC).toMatch(new RegExp(`${key}:\\s*${value}\\b`));
  });

  it('下一步的長度上限與既有的 next_step 同值 —— 同一種東西不該有兩個上限', () => {
    expect(CHILD_GOAL_PLANNING_LIMITS.maxActionLength).toBe(NEXT_STEP_MAX_LENGTH);
  });
});

describe('列舉兩邊一致', () => {
  it.each([
    ['goal control type', CHILD_PLAN_GOAL_CONTROL_TYPES],
    ['progression kind', CHILD_PLAN_PROGRESSION_KINDS],
    ['clarification kind', CHILD_PLAN_CLARIFICATION_KINDS],
    ['provenance 來源', CHILD_PLAN_FIELD_SOURCES],
    ['planning contribution', CHILD_PLANNING_CONTRIBUTIONS],
    ['四態', ['needs_clarification', 'needs_choice', 'ready', 'unavailable']],
    ['review point', ['after_days', 'after_sessions', 'after_phase']],
    ['session size', ['minutes', 'count']],
    ['cadence mode', ['one_time', 'weekly_frequency', 'fixed_days']],
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
        validateChildGoalPlanningResult({ status: 'unavailable', schemaVersion: 1, reason }, INPUT),
      ).toEqual({ status: 'unavailable', schemaVersion: 1, reason });
    }
  });
});

describe('兩個維度是正交的，沒有被合回同一個 enum', () => {
  it('outcome_to_action 不再是任何一邊的 progression', () => {
    for (const source of [codeOnly(LOGIC), codeOnly(readApp('types.ts'))]) {
      expect(source).not.toContain('outcome_to_action');
    }
    expect(CHILD_PLAN_PROGRESSION_KINDS).toEqual(['rhythm', 'staged', 'accumulation']);
  });

  it('可控行動掛在 goalControlType 上，不是掛在 progression 上', () => {
    // external_outcome 一定要附可控行動；三種 progression 都可以搭配它。
    expect(LOGIC).toContain('controllableActions');
    expect(LOGIC).toContain("goalControlType === 'external_outcome'");
  });
});

// ---------------------------------------------------------------------------
// P1-A2：多輪對話
// ---------------------------------------------------------------------------

describe('多輪對話的形狀兩邊一致', () => {
  it('三種回應兩邊都認得', () => {
    for (const type of CHILD_PLANNING_RESPONSE_TYPES) {
      expect({ type, inFunction: LOGIC.includes(`'${type}'`) })
        .toEqual({ type, inFunction: true });
    }
  });

  it('「目前有效的方法」兩邊是同一支規則，不是各判各的', () => {
    // 這一支決定「孩子到底決定了沒有」，而它同時被
    // informationIsSufficient（要不要再問）與 compose（provenance 怎麼標）用。
    // 兩邊分岔的話，Function 會覺得他還沒決定、App 會覺得他決定了。
    expect(LOGIC).toContain('export function effectiveChildApproach');
    expect(codeOnly(readApp('types.ts'))).toContain('export function effectiveChildApproach');
    for (const source of [codeOnly(LOGIC), codeOnly(readApp('types.ts'))]) {
      expect(source).toContain("origin: 'child_chose_option'");
      expect(source).toContain("origin: 'child_typed'");
    }
  });

  it('挑走的選項與孩子自己打的字，兩邊都分開存', () => {
    for (const source of [LOGIC, readApp('types.ts')]) {
      expect(source).toContain('childChosenOption');
      expect(source).toContain('childStatedApproach');
    }
  });

  it('對話裡的答案沒有任何一條路徑寫得回孩子的原話', () => {
    // 這是整個 P1-A2 契約最不能破的一條。同一行裡同時出現「原話」與
    // 「答案／選項」就是可疑 —— 合法的程式碼沒有理由那樣寫。
    const suspicious = /childOriginal(Goal|Motivation)[^\n]*\b(answer|optionText|response)\b/;
    for (const source of [
      codeOnly(LOGIC),
      codeOnly(readApp('buildChildGoalPlanningInput.ts')),
      codeOnly(readApp('types.ts')),
    ]) {
      expect(source).not.toMatch(suspicious);
    }
  });
});

describe('孩子永遠可以說「我自己想」', () => {
  it('allowCustomAnswer 兩邊都是字面量 true，不是從模型讀來的', () => {
    expect(LOGIC).toContain('allowCustomAnswer: true');
    expect(codeOnly(readApp('types.ts'))).toContain('allowCustomAnswer: true');
    // App 端 validator 拒收任何不是 true 的值。
    expect(codeOnly(readApp('validateChildGoalPlanningResult.ts')))
      .toContain('value.allowCustomAnswer !== true');
  });
});

describe('證據優先序', () => {
  it('順序是「孩子講的 > 從孩子推導 > GrowBook 規則 > AI 建議 > 沒人決定」', () => {
    const ordered = Object.entries(EVIDENCE_PRIORITY)
      .sort((a, b) => a[1] - b[1])
      .map(([key]) => key);
    expect(ordered).toEqual([
      'child_stated',
      'derived_from_child',
      'deterministic_policy',
      'ai_suggested',
      'undecided',
    ]);
  });

  it('derived_from_child 與 deterministic_policy 是兩個不同的等級', () => {
    // 早期版本共用一個 derived，於是「從孩子的話推出來的」與
    // 「GrowBook 政策決定的」在資料上分不出來，而它們差一級。
    expect(EVIDENCE_PRIORITY.derived_from_child).toBeLessThan(
      EVIDENCE_PRIORITY.deterministic_policy,
    );
  });
});

describe('兩端的 timeout 預算對得上', () => {
  const budget = Number(
    /CHILD_GOAL_PLANNING_GEMINI_TIMEOUT_MS = ([\d_]+)/.exec(LOGIC)?.[1]?.replace(/_/g, ''),
  );

  it('Function 端有自己的預算，沒有沿用 8 秒預設', () => {
    expect(budget).toBeGreaterThan(8000);
  });

  it('而且比 App 端放棄的時間短 —— 否則拿不到結構化的 reason', () => {
    expect(budget).toBeLessThan(CHILD_GOAL_PLANNING_TIMEOUT_MS);
  });

  it('Function 端真的把預算傳進 callGeminiWithModel', () => {
    expect(HANDLER).toContain('CHILD_GOAL_PLANNING_GEMINI_TIMEOUT_MS');
  });
});

describe('關鍵字規則只有一份，而且是既有的那一份', () => {
  it('App 端的 guard 重用 validateNextStep，沒有自己抄一份結果導向清單', () => {
    const guards = readApp('planGuards.ts');
    expect(guards).toContain("from '../childProposal/planDraft/canonicalPlanFields'");
    expect(guards).toContain('validateNextStep');
    // 既有清單裡的字眼一個都不該在這裡重新出現。
    const code = codeOnly(guards);
    for (const marker of ['讀完', '整本', '滿分', '第一名']) {
      expect({ marker, copied: code.includes(marker) }).toEqual({ marker, copied: false });
    }
  });

  it('Function 端完全沒有掃關鍵字的機制', () => {
    // prompt 裡出現「讀完整本書」是**給模型看的反例**，那是文案；
    // 這裡擋的是「Function 端自己長出第二套判斷程式」。
    const code = codeOnly(LOGIC);
    for (const forbidden of [
      'OUTCOME_MARKERS',
      'MENTAL_STATE_MARKERS',
      'DOMAIN_AUTHORITY_MARKERS',
      'NON_CHILD_MARKERS',
      'validateNextStep',
      'containsMentalStateDiagnosis',
      'containsDomainAuthorityClaim',
    ]) {
      expect({ forbidden, present: code.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });

  it('領域權威清單也只有一份，住在 App 端', () => {
    expect(readApp('planGuards.ts')).toContain('DOMAIN_AUTHORITY_MARKERS');
    // prompt 要講給模型聽，但判斷不在那裡。
    expect(LOGIC).toContain('你是規劃夥伴，不是教練或老師');
  });

  it('「該不該再問一題」兩端是同一條結構條件，不是關鍵字', () => {
    expect(LOGIC).toContain('informationIsSufficient');
    expect(readApp('planGuards.ts')).toContain('informationSufficiency');
    // 兩邊的條件都是「有節奏 ＋ 有自己的方法」。
    for (const source of [LOGIC, readApp('planGuards.ts')]) {
      expect(source).toContain('hasCadence');
      expect(source).toContain('hasApproach');
    }
  });
});

describe('這一包沒有碰到 P0-3 的 Plan Draft 契約', () => {
  it('Plan Draft 的 schema 版本仍然是 2', () => {
    expect(PLAN_DRAFT_LOGIC).toContain('CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION = 2');
  });

  it('新的 planning 邏輯與 Plan Draft 沒有任何依賴關係', () => {
    expect(codeOnly(LOGIC)).not.toContain('childProposalPlanDraft');
    expect(codeOnly(PLAN_DRAFT_LOGIC)).not.toContain('childGoalPlanning');
  });

  it('這條鏈不碰幣值 —— 連規則引擎都沒 import', () => {
    const logic = codeOnly(LOGIC);
    const handler = codeOnly(HANDLER);
    for (const forbidden of [
      'rewardEligibility',
      'coinPolicy',
      'calcCoins',
      'aiSuggestedCoinAmount',
      'sessionCoinReference',
      'payoutType',
    ]) {
      expect({ forbidden, inLogic: logic.includes(forbidden) })
        .toEqual({ forbidden, inLogic: false });
      expect({ forbidden, inHandler: handler.includes(forbidden) })
        .toEqual({ forbidden, inHandler: false });
    }
  });

  it('progressionKind 沒有被塞進既有的 progress_model', () => {
    // weekly_rhythm 是 P0 的正式欄位，Direct Confirm 依賴它。
    // 這四個新值任何一個出現在那個 enum 附近，都代表兩個維度被混在一起了。
    for (const source of [codeOnly(LOGIC), codeOnly(readApp('types.ts'))]) {
      expect(source).not.toContain('weekly_rhythm');
      expect(source).not.toContain('progress_model');
      expect(source).not.toContain('progressModel');
    }
  });
});

describe('App 端不認識 Gemini', () => {
  it.each([
    'types.ts',
    'planGuards.ts',
    'validateChildGoalPlanningResult.ts',
    'buildChildGoalPlanningInput.ts',
    'childGoalPlanningClient.ts',
    'generateChildGoalPlan.ts',
  ])('%s 沒有任何模型細節', (file) => {
    const code = readApp(file)
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

describe('這一輪沒有接上正式流程，也沒有動資料庫', () => {
  it('沒有被掛進 Child Proposal 的背景草稿工作', () => {
    const planDraftGenerator = codeOnly(
      readFileSync(
        join(process.cwd(), 'src', 'lib', 'childProposal', 'planDraft', 'generatePlanDraft.ts'),
        'utf8',
      ),
    );
    expect(planDraftGenerator).not.toContain('childPlanning');
    expect(planDraftGenerator).not.toContain('childGoalPlanning');
  });

  it('generator 不碰任何資料庫存取', () => {
    const generator = codeOnly(readApp('generateChildGoalPlan.ts'));
    for (const forbidden of ['supabase', 'from(', 'rpc(', 'insert', 'plan_version']) {
      expect({ forbidden, present: generator.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });
});
