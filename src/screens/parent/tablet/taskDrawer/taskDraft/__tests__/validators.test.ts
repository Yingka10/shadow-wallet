import { createTaskDraft, type DraftChildContext } from '../createTaskDraft';
import {
  hasErrors,
  validateGrowthPlanDraft,
  validateShortSupportDraft,
  validateTaskDraft,
} from '../validators';
import { isFamilyRoleDraft, isGrowthPlanDraft, isShortSupportDraft } from '../types';
import type { GrowthPlanDraft, ShortSupportDraft, TaskDraft } from '../types';
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

function readingDraft(): { draft: GrowthPlanDraft; variant: TaskPresetVariant } {
  const family = familyById('learn-reading');
  const variant = variantById(family, 'learn-reading-plan');
  const draft = createTaskDraft(family, variant, CHILD);
  if (!isGrowthPlanDraft(draft)) throw new Error('expected growth plan draft');
  return { draft, variant };
}

function homeworkDraft(): { draft: ShortSupportDraft; variant: TaskPresetVariant } {
  const family = familyById('learn-homework-method');
  const variant = variantById(family, 'learn-homework-method-plan');
  const draft = createTaskDraft(family, variant, CHILD);
  if (!isShortSupportDraft(draft)) throw new Error('expected short support draft');
  return { draft, variant };
}

// ---------------------------------------------------------------------------
// 成長計畫
// ---------------------------------------------------------------------------

/** 把所有 required 選項組各選第一項，讓草稿只剩「真的要測的那個欄位」有問題。 */
function withRequiredOptions<T extends GrowthPlanDraft>(
  draft: T,
  variant: TaskPresetVariant,
): T {
  const selectedOptions = { ...draft.selectedOptions };
  for (const group of variant.optionGroups) {
    if (group.required) selectedOptions[group.id] = [group.options[0].id];
  }
  return { ...draft, selectedOptions };
}

describe('validateGrowthPlanDraft', () => {
  it('剛建立的閱讀計畫只缺 required 的閱讀方式', () => {
    const { draft, variant } = readingDraft();
    const errors = validateGrowthPlanDraft(draft, variant);
    // 閱讀方式是 required：沒選就不該讓家長進到預覽。
    expect(errors).toEqual({ 'option:reading_method': expect.any(String) });
  });

  it('選好閱讀方式之後就完全合法', () => {
    const { draft, variant } = readingDraft();
    expect(validateGrowthPlanDraft(withRequiredOptions(draft, variant), variant)).toEqual({});
  });

  it('title 空白會回報 title 錯誤', () => {
    const { draft, variant } = readingDraft();
    const errors = validateGrowthPlanDraft({ ...draft, title: '   ' }, variant);
    expect(errors.title).toBeDefined();
  });

  it('沒有選執行日會回報 recurrenceDays', () => {
    const { draft, variant } = readingDraft();
    const errors = validateGrowthPlanDraft({ ...draft, recurrenceDays: [] }, variant);
    expect(errors.recurrenceDays).toBeDefined();
  });

  it('startDate 格式錯誤會回報 startDate', () => {
    const { draft, variant } = readingDraft();
    expect(validateGrowthPlanDraft({ ...draft, startDate: '2026/7/27' }, variant).startDate)
      .toBeDefined();
    expect(validateGrowthPlanDraft({ ...draft, startDate: '2026-02-31' }, variant).startDate)
      .toBeDefined();
  });

  it('minutesPerSession 必須是合理正整數，undefined 則放行', () => {
    const { draft, variant } = readingDraft();
    expect(validateGrowthPlanDraft({ ...draft, minutesPerSession: 0 }, variant).minutesPerSession)
      .toBeDefined();
    expect(validateGrowthPlanDraft({ ...draft, minutesPerSession: 999 }, variant).minutesPerSession)
      .toBeDefined();
    expect(
      validateGrowthPlanDraft({ ...draft, minutesPerSession: Number.NaN }, variant)
        .minutesPerSession,
    ).toBeDefined();
    expect(
      validateGrowthPlanDraft({ ...draft, minutesPerSession: undefined }, variant)
        .minutesPerSession,
    ).toBeUndefined();
  });

  it('durationDays 超出合理範圍會回報', () => {
    const { draft, variant } = readingDraft();
    expect(validateGrowthPlanDraft({ ...draft, durationDays: 1 }, variant).durationDays)
      .toBeDefined();
    expect(validateGrowthPlanDraft({ ...draft, durationDays: 400 }, variant).durationDays)
      .toBeDefined();
  });

  it('里程碑全部關閉或標題空白會回報 milestones', () => {
    const { draft, variant } = readingDraft();
    const allOff = draft.milestones.map(m => ({ ...m, enabled: false }));
    expect(validateGrowthPlanDraft({ ...draft, milestones: allOff }, variant).milestones)
      .toBeDefined();

    const blank = draft.milestones.map((m, i) => (i === 0 ? { ...m, title: '  ' } : m));
    expect(validateGrowthPlanDraft({ ...draft, milestones: blank }, variant).milestones)
      .toBeDefined();
  });

  it('completionDescription 空白會回報', () => {
    const { draft, variant } = readingDraft();
    expect(
      validateGrowthPlanDraft({ ...draft, completionDescription: '' }, variant)
        .completionDescription,
    ).toBeDefined();
  });

  it('自訂時段選了但沒填內容會回報', () => {
    const { draft, variant } = readingDraft();
    const errors = validateGrowthPlanDraft(
      { ...draft, preferredTime: 'custom', preferredTimeCustom: '' },
      variant,
    );
    expect(errors.preferredTimeCustom).toBeDefined();
  });

  it('required 選項組未選時，錯誤帶著該組 id', () => {
    // 「四週小範圍補強」帶 SUBJECT_SCOPE，required: true。
    const family = familyById('learn-review');
    const variant = variantById(family, 'learn-review-plan');
    const draft = createTaskDraft(family, variant, CHILD);
    if (!isGrowthPlanDraft(draft)) throw new Error('expected growth plan draft');

    const errors = validateGrowthPlanDraft(draft, variant);
    expect(errors['option:subject_scope']).toBeDefined();
  });

  it('選了「其他」但沒補充說明會回報 customOption', () => {
    const { draft, variant } = readingDraft();
    const errors = validateGrowthPlanDraft(
      {
        ...draft,
        selectedOptions: { ...draft.selectedOptions, reading_method: ['other'] },
        customOptionValues: { ...draft.customOptionValues, reading_method: '  ' },
      },
      variant,
    );
    expect(errors['customOption:reading_method']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 短期支援
// ---------------------------------------------------------------------------

describe('validateShortSupportDraft', () => {
  it('剛建立的草稿缺焦點與支援步驟', () => {
    const { draft, variant } = homeworkDraft();
    const errors = validateShortSupportDraft(draft, variant);
    expect(errors.focusOptionIds).toBeDefined();
    expect(errors.supportSteps).toBeDefined();
  });

  it('選好焦點與步驟後即合法', () => {
    const { draft, variant } = homeworkDraft();
    const ready: ShortSupportDraft = {
      ...draft,
      focusOptionIds: ['order', 'check'],
      selectedOptions: { ...draft.selectedOptions, homework_method: ['order', 'check'] },
      supportSteps: [
        { id: 'order', text: '先看一遍今天的功課', enabled: true },
        { id: 'check', text: '寫完後檢查一次', enabled: true },
      ],
    };
    expect(validateShortSupportDraft(ready, variant)).toEqual({});
  });

  it('支援步驟全部關閉或內容空白會回報', () => {
    const { draft, variant } = homeworkDraft();
    const base: ShortSupportDraft = {
      ...draft,
      focusOptionIds: ['order'],
      selectedOptions: { ...draft.selectedOptions, homework_method: ['order'] },
    };

    expect(
      validateShortSupportDraft(
        { ...base, supportSteps: [{ id: 'order', text: '有內容', enabled: false }] },
        variant,
      ).supportSteps,
    ).toBeDefined();

    expect(
      validateShortSupportDraft(
        { ...base, supportSteps: [{ id: 'order', text: '   ', enabled: true }] },
        variant,
      ).supportSteps,
    ).toBeDefined();
  });

  it('successDescription 空白會回報', () => {
    const { draft, variant } = homeworkDraft();
    const errors = validateShortSupportDraft(
      {
        ...draft,
        focusOptionIds: ['order'],
        selectedOptions: { ...draft.selectedOptions, homework_method: ['order'] },
        supportSteps: [{ id: 'order', text: '步驟', enabled: true }],
        successDescription: '',
      },
      variant,
    );
    expect(errors.successDescription).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 分派
// ---------------------------------------------------------------------------

describe('validateTaskDraft', () => {
  it('依 editorKind 分派', () => {
    const { draft, variant } = readingDraft();
    expect(validateTaskDraft(withRequiredOptions(draft, variant), variant)).toEqual({});
  });

  it('沒有 required 選項組的固定任務，一建立就是合法的', () => {
    const family = familyById('fam-set-table');
    const variant = defaultVariantOf(family);
    const draft = createTaskDraft(family, variant, CHILD);
    expect(validateTaskDraft(draft, variant)).toEqual({});
  });
});

describe('hasErrors', () => {
  it('空物件為 false，有任一鍵為 true', () => {
    expect(hasErrors({})).toBe(false);
    expect(hasErrors({ title: '請填寫名稱' })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// required 選項組全掃描（第六階段 B）
//
// 逐一走過 26 family / 36 variant 的每一組 required 選項：空著一定被擋、
// 選了合法值一定放行。用掃描而不是逐案列舉，之後 catalog 新增家族會自動納入。
// ---------------------------------------------------------------------------

/** 家庭角色的答案存在 roleOptionId，不在 selectedOptions —— 兩邊都要動。 */
function fillRequiredGroups(draft: TaskDraft, variant: TaskPresetVariant): TaskDraft {
  const selectedOptions = { ...draft.selectedOptions };
  for (const group of variant.optionGroups) {
    if (group.required) selectedOptions[group.id] = [group.options[0].id];
  }
  if (isFamilyRoleDraft(draft)) {
    const roleGroup = variant.optionGroups[0];
    return {
      ...draft,
      selectedOptions,
      roleOptionId: roleGroup ? roleGroup.options[0].id : draft.roleOptionId,
    };
  }
  if (isShortSupportDraft(draft)) {
    // 焦點與選項是同一件事的兩個欄位（見 ShortSupportEditor.toggleFocus）。
    const focusGroup = variant.optionGroups[0];
    if (focusGroup) {
      return {
        ...draft,
        selectedOptions,
        focusOptionIds: [focusGroup.options[0].id],
      };
    }
  }
  return { ...draft, selectedOptions };
}

function clearGroup(draft: TaskDraft, groupId: string, isRoleGroup: boolean): TaskDraft {
  const cleared = { ...draft, selectedOptions: { ...draft.selectedOptions, [groupId]: [] } };
  if (isRoleGroup && isFamilyRoleDraft(cleared)) return { ...cleared, roleOptionId: '' };
  if (isShortSupportDraft(cleared)) return { ...cleared, focusOptionIds: [] };
  return cleared;
}

describe('required 選項組 — 全 catalog 掃描', () => {
  const REQUIRED_CASES = ALL_FAMILIES.flatMap(family =>
    family.variants.flatMap(variant =>
      variant.optionGroups
        .filter(group => group.required)
        .map(group => ({ family, variant, group })),
    ),
  );

  it('掃描範圍不是空的', () => {
    expect(REQUIRED_CASES.length).toBeGreaterThan(0);
  });

  it('每一組 required 選項空著時，validator 一定擋下', () => {
    for (const { family, variant, group } of REQUIRED_CASES) {
      const base = fillRequiredGroups(createTaskDraft(family, variant, CHILD), variant);
      const isRoleGroup = variant.optionGroups[0]?.id === group.id;
      const blanked = clearGroup(base, group.id, isRoleGroup);

      expect({
        variant: variant.id,
        group: group.id,
        blocked: hasErrors(validateTaskDraft(blanked, variant)),
      }).toEqual({ variant: variant.id, group: group.id, blocked: true });
    }
  });

  it('每一組 required 選項填了合法值之後，該組就不再回報錯誤', () => {
    for (const { family, variant, group } of REQUIRED_CASES) {
      const filled = fillRequiredGroups(createTaskDraft(family, variant, CHILD), variant);
      const errors = validateTaskDraft(filled, variant) as Record<string, string | undefined>;

      expect({ variant: variant.id, group: group.id, error: errors[`option:${group.id}`] })
        .toEqual({ variant: variant.id, group: group.id, error: undefined });
      expect({ variant: variant.id, group: group.id, error: errors.roleOptionId })
        .toEqual({ variant: variant.id, group: group.id, error: undefined });
    }
  });

  it('選到「其他」但沒補說明時，錯誤帶著該組 id', () => {
    const withCustom = REQUIRED_CASES.filter(({ group }) => group.allowCustom);
    expect(withCustom.length).toBeGreaterThan(0);

    for (const { family, variant, group } of withCustom) {
      // 家庭角色的自填值走 customRoleValue，有自己的測試（見 recurringAndRole）。
      if (variant.optionGroups[0]?.id === group.id && variant.planMode === 'family_role') continue;

      const base = fillRequiredGroups(createTaskDraft(family, variant, CHILD), variant);
      const draft: TaskDraft = {
        ...base,
        selectedOptions: { ...base.selectedOptions, [group.id]: ['other'] },
        customOptionValues: { ...base.customOptionValues, [group.id]: '   ' },
      };
      const errors = validateTaskDraft(draft, variant) as Record<string, string | undefined>;
      expect({ group: group.id, error: !!errors[`customOption:${group.id}`] })
        .toEqual({ group: group.id, error: true });
    }
  });
});
