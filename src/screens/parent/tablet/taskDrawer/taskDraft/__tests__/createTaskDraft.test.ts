import {
  createTaskDraft,
  dateStringPlusDays,
  focusChoicesFor,
  isValidLocalDateString,
  localDateWithOffset,
  resolveEditorKind,
  spreadMilestoneDays,
  syncSupportSteps,
  toLocalDateString,
  type DraftChildContext,
} from '../createTaskDraft';
import { isGrowthPlanDraft, isShortSupportDraft } from '../types';
import { ALL_FAMILIES, defaultVariantOf } from '../../taskCatalog';
import type { TaskPresetFamily, TaskPresetVariant } from '../../taskCatalog';

const CHILD: DraftChildContext = {
  nickname: '承恩',
  birthDate: '2018-03-05',
  familyId: 'family-1',
};

function familyById(id: string): TaskPresetFamily {
  const found = ALL_FAMILIES.find(f => f.id === id);
  if (!found) throw new Error(`family not found: ${id}`);
  return found;
}

function variantById(family: TaskPresetFamily, id: string): TaskPresetVariant {
  const found = family.variants.find(v => v.id === id);
  if (!found) throw new Error(`variant not found: ${id}`);
  return found;
}

// ---------------------------------------------------------------------------
// 日期
// ---------------------------------------------------------------------------

describe('本地日期', () => {
  it('toLocalDateString 使用本地日期，不因時區推前一天', () => {
    // 台北時間凌晨 00:30 —— 用 toISOString() 會變成前一天的 16:30Z。
    const midnight = new Date(2026, 6, 27, 0, 30, 0);
    expect(toLocalDateString(midnight)).toBe('2026-07-27');
  });

  it('localDateWithOffset 跨月正確', () => {
    const base = new Date(2026, 0, 31);
    expect(localDateWithOffset(1, base)).toBe('2026-02-01');
  });

  it('isValidLocalDateString 擋掉格式錯與不存在的日期', () => {
    expect(isValidLocalDateString('2026-07-27')).toBe(true);
    expect(isValidLocalDateString('2026-2-3')).toBe(false);
    expect(isValidLocalDateString('2026-02-31')).toBe(false);
    expect(isValidLocalDateString('明天')).toBe(false);
    expect(isValidLocalDateString('')).toBe(false);
  });

  it('dateStringPlusDays 回傳本地日期，日期不合法時回 null', () => {
    expect(dateStringPlusDays('2026-07-27', 7)).toBe('2026-08-03');
    expect(dateStringPlusDays('not-a-date', 7)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// editorKind mapping
// ---------------------------------------------------------------------------

describe('resolveEditorKind', () => {
  it('long_term + growth_plan → growth_plan', () => {
    const family = familyById('learn-reading');
    expect(resolveEditorKind(variantById(family, 'learn-reading-plan'))).toBe('growth_plan');
  });

  it('long_term + short_support → short_support', () => {
    const family = familyById('learn-homework-method');
    expect(resolveEditorKind(variantById(family, 'learn-homework-method-plan')))
      .toBe('short_support');
  });

  it('long_term + family_role → family_role（本輪未實作 editor）', () => {
    const family = familyById('fam-role');
    expect(resolveEditorKind(variantById(family, 'fam-role-plan'))).toBe('family_role');
  });

  it('recurring 與 one_time 不會被誤判成 growth_plan', () => {
    const reading = familyById('learn-reading');
    expect(resolveEditorKind(variantById(reading, 'learn-reading-recurring'))).toBe('recurring');

    const review = familyById('learn-review');
    expect(resolveEditorKind(variantById(review, 'learn-review-once'))).toBe('one_time');
  });

  it('catalog 的每個 variant 都能對應到一種 editorKind', () => {
    const kinds = new Set<string>();
    for (const family of ALL_FAMILIES) {
      for (const variant of family.variants) kinds.add(resolveEditorKind(variant));
    }
    for (const kind of kinds) {
      expect(['growth_plan', 'short_support', 'recurring', 'family_role', 'one_time'])
        .toContain(kind);
    }
  });
});

// ---------------------------------------------------------------------------
// 里程碑天數
// ---------------------------------------------------------------------------

describe('spreadMilestoneDays', () => {
  it('第一個里程碑壓在前三天內，最後一個等於期末', () => {
    const days = spreadMilestoneDays(5, 28);
    expect(days).toHaveLength(5);
    expect(days[0]).toBeLessThanOrEqual(3);
    expect(days[4]).toBe(28);
  });

  it('天數遞增不重複', () => {
    const days = spreadMilestoneDays(5, 42);
    for (let i = 1; i < days.length; i++) {
      expect(days[i]).toBeGreaterThan(days[i - 1]);
    }
  });

  it('數量為 0 時回空陣列', () => {
    expect(spreadMilestoneDays(0, 28)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createTaskDraft
// ---------------------------------------------------------------------------

describe('createTaskDraft — 成長計畫', () => {
  const family = familyById('learn-reading');
  const variant = variantById(family, 'learn-reading-plan');

  it('從 catalog 帶出期間、回顧日與每次分鐘', () => {
    const draft = createTaskDraft(family, variant, CHILD);
    if (!isGrowthPlanDraft(draft)) throw new Error('expected growth plan draft');

    expect(draft.editorKind).toBe('growth_plan');
    expect(draft.durationDays).toBe(28);
    expect(draft.firstReviewAfterDays).toBe(7);
    expect(draft.minutesPerSession).toBe(20);
    expect(draft.purposeCategory).toBe('learning_skill');
    expect(draft.planMode).toBe('growth_plan');
    expect(draft.createdFromPreset).toBe(true);
  });

  it('標題與期待文字帶入孩子暱稱，且不同 family 不共用同一段', () => {
    const readingDraft = createTaskDraft(family, variant, CHILD);
    const sportFamily = familyById('learn-sport');
    const sportDraft = createTaskDraft(
      sportFamily,
      variantById(sportFamily, 'learn-sport-plan'),
      CHILD,
    );

    expect(readingDraft.title).toContain('承恩');
    expect(readingDraft.originalExpectation).toContain('承恩');
    expect(sportDraft.originalExpectation).toContain('承恩');
    expect(sportDraft.originalExpectation).not.toBe(readingDraft.originalExpectation);
  });

  it('里程碑初始化為 3–5 個且都啟用', () => {
    const draft = createTaskDraft(family, variant, CHILD);
    if (!isGrowthPlanDraft(draft)) throw new Error('expected growth plan draft');

    expect(draft.milestones.length).toBeGreaterThanOrEqual(3);
    expect(draft.milestones.length).toBeLessThanOrEqual(5);
    expect(draft.milestones.every(m => m.enabled)).toBe(true);
    expect(draft.milestones.every(m => m.title.trim().length > 0)).toBe(true);
  });

  it('optionGroups 初始為空選取，allowCustom 才有 custom 欄位', () => {
    const draft = createTaskDraft(family, variant, CHILD);
    expect(draft.selectedOptions.reading_method).toEqual([]);
    expect(draft.customOptionValues.reading_method).toBe('');
  });

  it('startDate 預設為今天的本地日期', () => {
    const draft = createTaskDraft(family, variant, CHILD);
    expect(draft.startDate).toBe(localDateWithOffset(0));
  });

  it('四個先支援的成長計畫 family 都能產出可用草稿', () => {
    const targets: Array<[string, string]> = [
      ['learn-reading', 'learn-reading-plan'],
      ['learn-sport', 'learn-sport-plan'],
      ['learn-creation', 'learn-creation-plan'],
      ['learn-explore', 'learn-explore-plan'],
    ];

    for (const [familyId, variantId] of targets) {
      const f = familyById(familyId);
      const v = variantById(f, variantId);
      const draft = createTaskDraft(f, v, CHILD);

      if (!isGrowthPlanDraft(draft)) throw new Error(`${familyId} 應為成長計畫`);
      expect(draft.title.trim().length).toBeGreaterThan(0);
      expect(draft.completionDescription.trim().length).toBeGreaterThan(0);
      expect(draft.recurrenceDays.length).toBeGreaterThan(0);
      expect(draft.durationDays).toBe(v.defaultDraft.durationDays);
      expect(v.defaultDraft.durationDayChoices).toContain(draft.durationDays);
    }
  });
});

describe('createTaskDraft — 短期支援', () => {
  it('回饋固定 progress_only，焦點與步驟初始為空', () => {
    const family = familyById('learn-homework-method');
    const variant = variantById(family, 'learn-homework-method-plan');
    const draft = createTaskDraft(family, variant, CHILD);

    if (!isShortSupportDraft(draft)) throw new Error('expected short support draft');
    expect(draft.rewardPolicy).toBe('progress_only');
    expect(draft.durationDays).toBe(14);
    expect(draft.focusOptionIds).toEqual([]);
    expect(draft.supportSteps).toEqual([]);
    expect(draft.successDescription.trim().length).toBeGreaterThan(0);
  });

  it('四個先支援的短期支援 family 都有自己的觀察文字', () => {
    const targets = [
      'learn-homework-method',
      'life-schoolbag',
      'life-bedtime',
      'life-screen-time',
    ];
    const seen = new Set<string>();

    for (const familyId of targets) {
      const family = familyById(familyId);
      const variant = defaultVariantOf(family);
      const draft = createTaskDraft(family, variant, CHILD);

      if (!isShortSupportDraft(draft)) throw new Error(`${familyId} 應為短期支援`);
      expect(draft.originalExpectation).toContain('承恩');
      seen.add(draft.originalExpectation);
    }

    // 四個 family 的文字互不相同，沒有全部套用同一段。
    expect(seen.size).toBe(targets.length);
  });

  it('3C 的期間選項為 7 或 14 天', () => {
    const family = familyById('life-screen-time');
    const variant = defaultVariantOf(family);
    expect(variant.defaultDraft.durationDayChoices).toEqual([7, 14]);
  });

  it('維持自己的小空間預設 21 天', () => {
    const family = familyById('life-own-space');
    const variant = defaultVariantOf(family);
    expect(variant.defaultDraft.durationDays).toBe(21);
  });
});

describe('createTaskDraft — 尚未實作 editor 的形式', () => {
  it('recurring 產生 unsupported 草稿而不是硬套成長計畫', () => {
    const family = familyById('fam-set-table');
    const draft = createTaskDraft(family, defaultVariantOf(family), CHILD);
    expect(draft.editorKind).toBe('recurring');
    expect(isGrowthPlanDraft(draft)).toBe(false);
    expect(isShortSupportDraft(draft)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 焦點與支援步驟
// ---------------------------------------------------------------------------

describe('focusChoicesFor', () => {
  it('catalog 有 optionGroups 時走 catalog', () => {
    const family = familyById('learn-homework-method');
    const choices = focusChoicesFor(family, defaultVariantOf(family));
    expect(choices.map(c => c.id)).toEqual(['start', 'order', 'split', 'check', 'stuck']);
    expect(choices.every(c => c.step.trim().length > 0)).toBe(true);
  });

  it('catalog 沒有 optionGroups 時走 family 專屬清單', () => {
    const family = familyById('life-schoolbag');
    const choices = focusChoicesFor(family, defaultVariantOf(family));
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.map(c => c.label)).toContain('聯絡簿');
  });
});

describe('syncSupportSteps', () => {
  const choices = [
    { id: 'a', step: 'A 的步驟' },
    { id: 'b', step: 'B 的步驟' },
  ];

  it('新增選取的焦點會帶入預設步驟文字', () => {
    const steps = syncSupportSteps([], ['a'], choices);
    expect(steps).toEqual([{ id: 'a', text: 'A 的步驟', enabled: true }]);
  });

  it('保留家長已改過的文字與關閉狀態', () => {
    const existing = [{ id: 'a', text: '改過的文字', enabled: false }];
    const steps = syncSupportSteps(existing, ['a', 'b'], choices);
    expect(steps[0]).toEqual({ id: 'a', text: '改過的文字', enabled: false });
    expect(steps[1].id).toBe('b');
  });

  it('取消選取會移除對應步驟', () => {
    const existing = [
      { id: 'a', text: 'A 的步驟', enabled: true },
      { id: 'b', text: 'B 的步驟', enabled: true },
    ];
    expect(syncSupportSteps(existing, ['b'], choices).map(s => s.id)).toEqual(['b']);
  });

  it('自訂步驟不會因為焦點改變而消失', () => {
    const existing = [
      { id: 'a', text: 'A 的步驟', enabled: true },
      { id: 'custom-1', text: '自己加的', enabled: true },
    ];
    const steps = syncSupportSteps(existing, [], choices);
    expect(steps.map(s => s.id)).toEqual(['custom-1']);
  });
});
