// CHILD-REVIEW-V2 — 回顧模型層。
//
// 這裡驗的核心是 §9：**進度不推導 adjustment**。
// 完成 2 次 / 約定 3 次不會讓任何函式回傳「建議改成 2 次」。

import type { GoalPresentation } from '../../../screens/child/longTermGoalPresentation';
import {
  buildAlternativeApproaches,
  buildFewerPerWeekDiff,
  buildLighterDimensions,
  buildPrimaryCta,
  buildReviewEvidence,
  buildSharedTermNotice,
  buildTimeWindowDiff,
  classifyAdjustment,
  needsFamilyConfirmation,
  NO_ADJUSTMENT_CAPABILITIES,
  REVIEW_DIRECTION_OPTIONS,
  REVIEW_EXPERIENCE_OPTIONS,
  type ReviewAdjustmentCapabilities,
} from '../togetherReviewModel';

const ALL_CAPABILITIES: ReviewAdjustmentCapabilities = {
  cadence: true,
  sessionLength: true,
  preferredTime: true,
  freeform: true,
};

function makePresentation(
  overrides: Partial<GoalPresentation> = {},
): GoalPresentation {
  return {
    progression: 'rhythm',
    weekTarget: 3,
    weekCompletedActual: 2,
    sessionMinutes: 15,
    sessionEvidence: { checkedInToday: false, weekSessionCount: 2 },
    agreedTime: { value: 'after_dinner', label: '晚餐後' },
    supportsTimeWindow: true,
    ...overrides,
  } as unknown as GoalPresentation;
}

describe('Evidence（§3：只呈現事實，不評分）', () => {
  it('用完成次數說一句中性的話，不出現任務專屬動詞', () => {
    const evidence = buildReviewEvidence(makePresentation());

    expect(evidence.contextSentence).toBe('這週已經完成 2 次，一起看看這段怎麼樣。');
    expect(evidence.agreedFact).toBe('原本約定每週 3 次');
  });

  it('沒有紀錄的一週不說「你沒有完成」，也不算達成率', () => {
    const evidence = buildReviewEvidence(makePresentation({
      sessionEvidence: { checkedInToday: false, weekSessionCount: 0 },
    }));

    expect(evidence.contextSentence)
      .toBe('這週還沒有留下紀錄，也可以一起看看現在的安排。');
    expect(evidence.contextSentence).not.toMatch(/沒有完成|還差|%|達成/);
  });

  it('沒有每週次數的計畫不會憑空長出一個「約定」', () => {
    const evidence = buildReviewEvidence(makePresentation({
      progression: 'staged',
      weekTarget: 0,
    }));

    expect(evidence.agreedFact).toBeNull();
  });

  it('evidence 完全不含百分比、達成率、streak 這類評分語彙', () => {
    const evidence = buildReviewEvidence(makePresentation());
    const text = `${evidence.contextSentence} ${evidence.agreedFact ?? ''}`;

    expect(text).not.toMatch(/%|達成率|連續|streak|加油|可惜/);
  });
});

describe('Step 1 / Step 2 選項（§4：孩子描述經驗，不是系統診斷）', () => {
  it('四個體驗選項都是感受詞，沒有一個是把孩子當問題的判定', () => {
    const labels = REVIEW_EXPERIENCE_OPTIONS.map(o => o.label);

    expect(labels).toEqual([
      '現在這樣滿順的',
      '有時候不太好開始',
      '做起來有點太多／太久',
      '我有別的想法',
    ]);
    labels.forEach(label => {
      expect(label).not.toMatch(/缺乏|不好|失敗|沒有毅力|管理不好|太懶/);
    });
  });

  it('四個方向選項固定，不隨 progression 改變', () => {
    expect(REVIEW_DIRECTION_OPTIONS.map(o => o.value))
      .toEqual(['keep', 'lighter', 'different_way', 'own_idea']);
  });
});

describe('Branch B 的維度（§6：由這份計畫真的可調的東西產生）', () => {
  it('通道全開時，節奏型的閱讀計畫可以少一次、可以短一點', () => {
    const options = buildLighterDimensions(makePresentation(), ALL_CAPABILITIES);

    expect(options.map(o => o.value))
      .toEqual(['shorter_session', 'fewer_per_week', 'own_words']);
  });

  it('沒有每次多久的計畫就沒有「每次短一點」', () => {
    const options = buildLighterDimensions(
      makePresentation({ sessionMinutes: null }),
      ALL_CAPABILITIES,
    );

    expect(options.map(o => o.value)).not.toContain('shorter_session');
  });

  it('階段型計畫沒有每週次數可以少', () => {
    const options = buildLighterDimensions(
      makePresentation({ progression: 'staged', weekTarget: 0 }),
      ALL_CAPABILITIES,
    );

    expect(options.map(o => o.value)).not.toContain('fewer_per_week');
  });

  it('每週只有 1 次時不給「一週少一次」—— 再少就是暫停，不是調整', () => {
    const options = buildLighterDimensions(
      makePresentation({ weekTarget: 1 }),
      ALL_CAPABILITIES,
    );

    expect(options.map(o => o.value)).not.toContain('fewer_per_week');
  });

  it('通道沒開就完全不給那個選項 —— 不做按下去沒有下一步的選單', () => {
    const options = buildLighterDimensions(
      makePresentation(),
      NO_ADJUSTMENT_CAPABILITIES,
    );

    expect(options).toEqual([]);
  });
});

describe('Branch C 的替代做法', () => {
  it('候選是「另一個時段」，不含孩子現在已經在用的那個', () => {
    const options = buildAlternativeApproaches(makePresentation(), ALL_CAPABILITIES);

    expect(options.map(o => o.timeWindow)).toEqual(['before_bed', null]);
  });

  it('時段記不下來的計畫就沒有換時段這個做法', () => {
    const options = buildAlternativeApproaches(
      makePresentation({ supportsTimeWindow: false }),
      ALL_CAPABILITIES,
    );

    expect(options.map(o => o.timeWindow)).toEqual([null]);
  });

  it('差異描述的起點是目前談定的時段', () => {
    expect(buildTimeWindowDiff(makePresentation(), 'before_bed')).toEqual({
      fromLabel: '晚餐後',
      toLabel: '睡前',
      toValue: 'before_bed',
    });
  });
});

describe('§9：數字只是 evidence，不是 adjustment 的來源', () => {
  it('「一週少一次」的起點是約定的 3 次，不是這週實際完成的 2 次', () => {
    const diff = buildFewerPerWeekDiff(makePresentation({
      weekTarget: 3,
      sessionEvidence: { checkedInToday: false, weekSessionCount: 2 },
    }));

    expect(diff).toEqual({
      fromValue: 3,
      toValue: 2,
      fromLabel: '每週 3 次',
      toLabel: '每週 2 次',
    });
  });

  it('這週只完成 1 次也不會讓建議變成 1 次 —— 永遠是少一次', () => {
    const diff = buildFewerPerWeekDiff(makePresentation({
      weekTarget: 5,
      weekCompletedActual: 1,
      sessionEvidence: { checkedInToday: false, weekSessionCount: 1 },
    }));

    expect(diff?.toValue).toBe(4);
  });

  it('每週只有 1 次就沒有可以少的東西', () => {
    expect(buildFewerPerWeekDiff(makePresentation({ weekTarget: 1 }))).toBeNull();
  });
});

describe('§7：Child-owned vs Shared-term', () => {
  it('每週次數與每次多久都是共同條件，要重新找家長確認', () => {
    expect(classifyAdjustment('lighter', 'fewer_per_week'))
      .toEqual({ kind: 'shared_term', dimension: 'fewer_per_week' });
    expect(classifyAdjustment('lighter', 'shorter_session'))
      .toEqual({ kind: 'shared_term', dimension: 'shorter_session' });
  });

  it('分不出來的自由描述當共同條件 —— 分類錯的代價是不對稱的', () => {
    expect(classifyAdjustment('lighter', 'own_words').kind).toBe('shared_term');
  });

  it('「就照現在這樣」不是一個 adjustment，不需要任何確認', () => {
    expect(classifyAdjustment('keep', null)).toEqual({ kind: 'none' });
    expect(needsFamilyConfirmation(classifyAdjustment('keep', null))).toBe(false);
  });

  it('還沒選到維度之前不會顯示共同確認提示', () => {
    expect(needsFamilyConfirmation(classifyAdjustment('lighter', null))).toBe(false);
    expect(needsFamilyConfirmation(classifyAdjustment(null, null))).toBe(false);
  });

  it('稱謂用傳進來的 canonical 名字，沒有才退回中性集合稱呼', () => {
    expect(buildSharedTermNotice('媽媽').cta).toBe('和媽媽一起調整 →');
    expect(buildSharedTermNotice().cta).toBe('和爸媽一起調整 →');
    expect(buildSharedTermNotice().message).toBe('這會改到你們原本說好的安排。');
  });

  /*
    §7：Review V2 **不可以**讓孩子學到「任何跟時間有關的個人調整都要家長同意」。
    換時段談的只是「這一份計畫當初一起說好的那個時段」，說法要比 cadence 窄。
  */
  it('換時段用比較窄的說法，不宣稱所有時間安排都要家長同意', () => {
    const timeNotice = buildSharedTermNotice('媽媽', 'agreed_time');

    expect(timeNotice.message).toBe('這個時段是當初一起說好的，改之前先一起確認。');
    expect(timeNotice.message)
      .not.toBe(buildSharedTermNotice('媽媽', 'shared_term').message);
  });
});

describe('§13：CTA 跟著 state 走', () => {
  it('Step 1 還沒選就沒有 CTA', () => {
    expect(buildPrimaryCta(null, null)).toBeNull();
  });

  it('Step 2 還沒選也還不出現 —— 先讓孩子看見第二題', () => {
    expect(buildPrimaryCta('hard_to_start', null)).toBeNull();
  });

  it('四個方向各有自己的 CTA，不是一句話硬套', () => {
    expect(buildPrimaryCta('hard_to_start', 'keep')).toBe('繼續這樣走');
    expect(buildPrimaryCta('hard_to_start', 'lighter')).toBe('看看可以怎麼調整');
    expect(buildPrimaryCta('hard_to_start', 'different_way')).toBe('看看其他方式');
    expect(buildPrimaryCta('hard_to_start', 'own_idea')).toBe('說說我的想法');
  });
});
