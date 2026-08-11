// P0-3 Final — 四個 canonical 結構化欄位
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支存在的理由，是 P0-5 Preflight 的那句結論：
//
//   **audit snapshot 不能當成 canonical task 的權威來源。**
//
// 所以這四個值必須有自己的規則，而且其中兩個根本不經過模型的自由文字。
// 這裡逐條釘住那些規則。
// ─────────────────────────────────────────────────────────────────────────

import {
  canonicalCompletionDescription,
  canonicalNextStep,
  canonicalPlanFields,
  canonicalProgressModel,
  canonicalPurposeCategory,
  validateNextStep,
} from '../canonicalPlanFields';
import type { ChildProposalPlanDraft } from '../types';

function draft(overrides: Partial<ChildProposalPlanDraft> = {}): ChildProposalPlanDraft {
  return {
    schemaVersion: 1,
    planTitle: '兩週閱讀挑戰',
    planSummary: '先用一週 4 次的節奏開始。',
    completionDescription: '模型自己寫的完成說明',
    activityKind: 'reading',
    nextStepSuggestion: '選一本想看的書，閱讀約 15 分鐘',
    cadence: { mode: 'weekly_frequency', weeklyFrequency: 4 },
    cadenceSource: 'child',
    estimatedMinutes: 15,
    durationType: 'long_term',
    durationDays: 14,
    category: 'D',
    categoryReason: '練習閱讀',
    difficulty: 'standard',
    rewardPolicy: 'coin_eligible',
    rewardEligibility: 'allowed',
    rewardPolicyVersion: 'coin-policy-1.0.0',
    pricingStatus: 'priced',
    aiSuggestedCoinAmount: 10,
    blockingIssues: [],
    requiresConfirmation: [],
    warnings: [],
    clarificationQuestion: null,
    model: 'gemini-flash-latest',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Demo golden path
// ---------------------------------------------------------------------------

describe('Demo：兩週閱讀、一週 4 次', () => {
  it('四個欄位一次到位', () => {
    expect(canonicalPlanFields(draft())).toEqual({
      purposeCategory: 'D',
      completionDescription: '完成一次約定的閱讀時段',
      progressModel: 'weekly_rhythm',
      nextStep: '選一本想看的書，閱讀約 15 分鐘',
    });
  });
});

// ---------------------------------------------------------------------------
// purpose_category
// ---------------------------------------------------------------------------

describe('purpose_category', () => {
  it.each(['A', 'B', 'C', 'D'] as const)('%s 原樣成為結構化欄位', (category) => {
    expect(canonicalPurposeCategory(draft({ category }))).toBe(category);
  });

  it('長期不是第五類 —— 期間長短不影響「為什麼做」', () => {
    expect(canonicalPurposeCategory(draft({ durationType: 'long_term' }))).toBe('D');
    expect(canonicalPurposeCategory(draft({ durationType: 'one_time' }))).toBe('D');
  });
});

// ---------------------------------------------------------------------------
// completion_description
// ---------------------------------------------------------------------------

describe('completion_description 是固定句型，不是模型的文字', () => {
  it('Demo 得到規格拍板的那一句', () => {
    expect(canonicalCompletionDescription(draft())).toBe('完成一次約定的閱讀時段');
  });

  it('模型寫什麼都不影響結果', () => {
    const wild = draft({ completionDescription: '兩週後把整本書讀完才算完成' });
    expect(canonicalCompletionDescription(wild)).toBe('完成一次約定的閱讀時段');
  });

  it.each([
    ['reading', '完成一次約定的閱讀時段'],
    ['practice', '完成一次約定的練習時段'],
    ['exercise', '完成一次約定的運動時段'],
    ['creating', '完成一次約定的創作時段'],
    ['learning', '完成一次約定的學習時段'],
    ['helping', '完成一次約定的幫忙時段'],
    ['other', '完成一次說好的步驟'],
  ] as const)('%s → %s', (activityKind, expected) => {
    expect(canonicalCompletionDescription(draft({ activityKind }))).toBe(expected);
  });

  it('一次性的計畫講「這一次」', () => {
    expect(
      canonicalCompletionDescription(
        draft({ durationType: 'one_time', cadence: { mode: 'one_time' }, durationDays: null }),
      ),
    ).toBe('完成這一次約定的閱讀');
  });

  it('**沒有任何組合**會產生結果導向的完成標準', () => {
    const kinds = [
      'reading', 'practice', 'exercise', 'creating', 'learning', 'helping', 'other',
    ] as const;
    const durations = ['one_time', 'recurring', 'long_term'] as const;

    for (const activityKind of kinds) {
      for (const durationType of durations) {
        const value = canonicalCompletionDescription(draft({ activityKind, durationType }));
        // 每一句都必須在講「一次」的投入。
        expect({ activityKind, durationType, hasOnce: value.includes('一次') })
          .toEqual({ activityKind, durationType, hasOnce: true });

        for (const outcome of ['讀完', '整本', '全部', '學會', '分數', '達成']) {
          expect({ activityKind, durationType, outcome, present: value.includes(outcome) })
            .toEqual({ activityKind, durationType, outcome, present: false });
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// progress_model
// ---------------------------------------------------------------------------

describe('progress_model 由結構化事實推導，不問模型', () => {
  it('D ＋ long_term ＋ 一週幾次 → weekly_rhythm', () => {
    expect(canonicalProgressModel(draft())).toBe('weekly_rhythm');
  });

  it('D ＋ long_term ＋ 固定哪幾天 → 一樣是 weekly_rhythm', () => {
    expect(
      canonicalProgressModel(draft({ cadence: { mode: 'fixed_days', days: [2, 4] } })),
    ).toBe('weekly_rhythm');
  });

  it.each([
    ['不是 D 類', draft({ category: 'C' })],
    ['不是長期', draft({ durationType: 'recurring' })],
    ['沒有節奏', draft({ cadence: null, cadenceSource: 'none' })],
    ['只做一次', draft({ cadence: { mode: 'one_time' }, durationType: 'one_time' })],
  ])('%s → null，不猜', (_label, value) => {
    expect(canonicalProgressModel(value)).toBeNull();
  });

  it('不再靠任務名稱有沒有「閱讀」兩個字判斷', () => {
    // 標題完全沒提閱讀，但結構化事實齊全 → 仍然是 weekly_rhythm。
    expect(canonicalProgressModel(draft({ planTitle: '每天練直笛' }))).toBe('weekly_rhythm');
    // 標題有「閱讀」，但只做一次 → 仍然是 null。
    expect(
      canonicalProgressModel(
        draft({ planTitle: '閱讀計畫', durationType: 'one_time', cadence: { mode: 'one_time' } }),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// next_step
// ---------------------------------------------------------------------------

describe('next_step 是通過驗證的建議，不是照收', () => {
  it('Demo 的那一句通過', () => {
    expect(validateNextStep('選一本想看的書，閱讀約 15 分鐘'))
      .toEqual({ ok: true, value: '選一本想看的書，閱讀約 15 分鐘' });
  });

  it('沒有建議就是 null', () => {
    expect(canonicalNextStep(draft({ nextStepSuggestion: null }))).toBeNull();
    expect(validateNextStep(null)).toEqual({ ok: false, reason: 'absent' });
    expect(validateNextStep('   ')).toEqual({ ok: false, reason: 'absent' });
  });

  it.each([
    '讀完整本書',
    '這禮拜全部看完',
    '學會這個技巧',
    '考到 90 分',
    '一定要每天做',
  ])('結果導向的「%s」不採用 —— 那不是今天做得到的一步', (suggestion) => {
    expect(validateNextStep(suggestion)).toEqual({ ok: false, reason: 'outcome_based' });
  });

  it.each(['打開 AI 幫你安排', '等系統審核', '完成這個任務'])(
    '不是孩子的語言：「%s」',
    (suggestion) => {
      expect(validateNextStep(suggestion)).toEqual({ ok: false, reason: 'not_child_language' });
    },
  );

  it('太長不採用 —— 下一步要一眼看得完', () => {
    expect(validateNextStep('選'.repeat(41))).toEqual({ ok: false, reason: 'too_long' });
  });

  it('不合格時**不修剪也不改寫** —— 補完出來的是沒有人決定過的內容', () => {
    expect(canonicalNextStep(draft({ nextStepSuggestion: '讀完整本書' }))).toBeNull();
  });

  it('前後空白會被去掉，但內容一個字都不動', () => {
    expect(validateNextStep('  先翻開第一頁  ')).toEqual({ ok: true, value: '先翻開第一頁' });
  });
});
