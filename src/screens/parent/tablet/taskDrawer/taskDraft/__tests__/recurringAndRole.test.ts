import {
  applyRoleSelection,
  createTaskDraft,
  resolveEditorKind,
  responsibilitiesTouched,
  type DraftChildContext,
} from '../createTaskDraft';
import {
  buildResponsibilityItems,
  responsibilityTemplateFor,
  roleScopeFallback,
} from '../draftLabels';
import { isFamilyRoleDraft, isRecurringDraft } from '../types';
import type { FamilyRoleDraft, RecurringTaskDraft } from '../types';
import { validateFamilyRoleDraft, validateRecurringTaskDraft } from '../validators';
import { isDraftDirty } from '../dirty';
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

function recurringDraft(
  familyId: string,
  variantId: string,
): { draft: RecurringTaskDraft; variant: TaskPresetVariant } {
  const family = familyById(familyId);
  const variant = variantById(family, variantId);
  const draft = createTaskDraft(family, variant, CHILD);
  if (!isRecurringDraft(draft)) throw new Error(`${familyId} 應為固定任務`);
  return { draft, variant };
}

function roleDraft(
  familyId: string,
  variantId: string,
): { draft: FamilyRoleDraft; variant: TaskPresetVariant } {
  const family = familyById(familyId);
  const variant = variantById(family, variantId);
  const draft = createTaskDraft(family, variant, CHILD);
  if (!isFamilyRoleDraft(draft)) throw new Error(`${familyId} 應為家庭角色`);
  return { draft, variant };
}

// ---------------------------------------------------------------------------
// 一、生活小計畫的期間選項
// ---------------------------------------------------------------------------

describe('catalog — short_support 期間選項', () => {
  const shortSupportVariants = ALL_FAMILIES.flatMap(f =>
    f.variants
      .filter(v => v.planMode === 'short_support')
      .map(v => [f.id, v] as const),
  );

  it('每個 short_support variant 都至少有一個期間選項', () => {
    expect(shortSupportVariants.length).toBeGreaterThan(0);
    for (const [familyId, variant] of shortSupportVariants) {
      const choices = variant.defaultDraft.durationDayChoices;
      expect(choices).toBeDefined();
      expect(choices!.length).toBeGreaterThan(0);
    }
  });

  it('預設期間一定存在於選項中', () => {
    for (const [familyId, variant] of shortSupportVariants) {
      const { durationDays, durationDayChoices } = variant.defaultDraft;
      expect(durationDayChoices).toContain(durationDays);
    }
  });

  it('選項無重複、皆為合理正整數', () => {
    for (const [familyId, variant] of shortSupportVariants) {
      const choices = variant.defaultDraft.durationDayChoices ?? [];
      expect(new Set(choices).size).toBe(choices.length);
      for (const days of choices) {
        expect(Number.isInteger(days)).toBe(true);
        expect(days).toBeGreaterThan(0);
      }
    }
  });

  it('short_support 一律 progress_only + stabilize_and_exit + 首次回顧 7 天', () => {
    for (const [familyId, variant] of shortSupportVariants) {
      expect(variant.defaultRewardPolicy).toBe('progress_only');
      expect(variant.completionPolicy).toBe('stabilize_and_exit');
      expect(variant.defaultDraft.firstReviewDays).toBe(7);
    }
  });

  it('指定的八個生活小計畫期間與選項正確', () => {
    const expected: Record<string, { days: number; choices: number[] }> = {
      'life-morning': { days: 14, choices: [7, 14, 21] },
      'life-after-school': { days: 14, choices: [7, 14, 21] },
      'life-schoolbag': { days: 14, choices: [7, 14, 21] },
      'life-bedtime': { days: 14, choices: [14, 21] },
      'life-own-space': { days: 21, choices: [14, 21, 28] },
      'life-screen-time': { days: 14, choices: [7, 14] },
      'life-transition': { days: 14, choices: [7, 14] },
      'life-selfcare': { days: 14, choices: [7, 14, 21] },
    };

    for (const [familyId, want] of Object.entries(expected)) {
      const variant = defaultVariantOf(familyById(familyId));
      expect(variant.defaultDraft.durationDays).toBe(want.days);
      expect(variant.defaultDraft.durationDayChoices).toEqual(want.choices);
    }
  });
});

// ---------------------------------------------------------------------------
// 二、editorKind：family_role 優先於 recurring
// ---------------------------------------------------------------------------

describe('resolveEditorKind — family_role 優先於 recurring', () => {
  it('家庭角色即使帶 recurrenceDays 也走 family_role', () => {
    const family = familyById('fam-role');
    const variant = variantById(family, 'fam-role-plan');
    // 模擬一個同時有 recurrenceDays 的家庭角色 variant。
    const withDays: TaskPresetVariant = {
      ...variant,
      durationType: 'recurring',
      defaultDraft: { ...variant.defaultDraft, recurrenceDays: [1, 3, 5] },
    };
    expect(resolveEditorKind(withDays)).toBe('family_role');
  });

  it('照顧植物的角色版本走 family_role，固定版本走 recurring', () => {
    const family = familyById('fam-care');
    expect(resolveEditorKind(variantById(family, 'fam-care-plan'))).toBe('family_role');
    expect(resolveEditorKind(variantById(family, 'fam-care-recurring'))).toBe('recurring');
  });

  it('catalog 每個 variant 都對應到唯一且有效的 editorKind', () => {
    const valid = ['growth_plan', 'short_support', 'recurring', 'family_role', 'one_time'];
    for (const family of ALL_FAMILIES) {
      for (const variant of family.variants) {
        const kind = resolveEditorKind(variant);
        expect(valid).toContain(kind);
        if (variant.planMode === 'family_role') expect(kind).toBe('family_role');
        if (variant.planMode === 'growth_plan') expect(kind).toBe('growth_plan');
        if (variant.planMode === 'short_support') expect(kind).toBe('short_support');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 三、createTaskDraft — recurring
// ---------------------------------------------------------------------------

describe('createTaskDraft — 固定任務', () => {
  it('家庭參與帶入家庭貢獻、不預填分鐘、回顧預設 28 天', () => {
    const { draft } = recurringDraft('fam-set-table', 'fam-set-table-recurring');
    expect(draft.rewardPolicy).toBe('family_contribution');
    expect(draft.minutesPerSession).toBeUndefined();
    expect(draft.reviewEnabled).toBe(true);
    expect(draft.reviewAfterDays).toBe(28);
    expect(draft.scheduleMode).toBe('fixed_days');
    expect(draft.recurrenceDays.length).toBeGreaterThan(0);
  });

  it('餐桌類的預設時段是自訂「用餐前」，不為單一 family 加特殊 enum', () => {
    const { draft } = recurringDraft('fam-set-table', 'fam-set-table-recurring');
    expect(draft.preferredTime).toBe('custom');
    expect(draft.preferredTimeCustom).toBe('用餐前');
  });

  it('學習類帶入 catalog 估時、回顧預設 14 天', () => {
    const { draft } = recurringDraft('learn-reading', 'learn-reading-recurring');
    expect(draft.rewardPolicy).toBe('coin_eligible');
    expect(draft.minutesPerSession).toBe(20);
    expect(draft.reviewAfterDays).toBe(14);
  });

  it('本輪指定的 11 個 recurring variant 都能產出可用草稿且完成描述不同', () => {
    const targets: Array<[string, string]> = [
      ['fam-set-table', 'fam-set-table-recurring'],
      ['fam-clear-table', 'fam-clear-table-recurring'],
      ['fam-laundry', 'fam-laundry-recurring'],
      ['fam-tidy-area', 'fam-tidy-area-recurring'],
      ['fam-recycling', 'fam-recycling-recurring'],
      ['fam-restock', 'fam-restock-recurring'],
      ['fam-care', 'fam-care-recurring'],
      ['learn-reading', 'learn-reading-recurring'],
      ['learn-review', 'learn-review-recurring'],
      ['learn-performance', 'learn-performance-recurring'],
      ['learn-sport', 'learn-sport-recurring'],
    ];

    const completions = new Set<string>();
    for (const [familyId, variantId] of targets) {
      const { draft } = recurringDraft(familyId, variantId);
      expect(draft.title.trim().length).toBeGreaterThan(0);
      expect(draft.completionDescription.trim().length).toBeGreaterThan(0);
      expect(draft.originalExpectation).toContain('承恩');
      completions.add(draft.completionDescription);
    }
    // 完成描述不是全部套同一句。
    expect(completions.size).toBe(targets.length);
  });

  it('運動的完成描述不使用「幾下才算成功」這類結果條件', () => {
    const { draft } = recurringDraft('learn-sport', 'learn-sport-recurring');
    expect(draft.completionDescription).toContain('不以一次達到特定成績');
  });
});

// ---------------------------------------------------------------------------
// 四、createTaskDraft — family role
// ---------------------------------------------------------------------------

describe('createTaskDraft — 家庭角色', () => {
  it('回饋固定家庭貢獻、期間 28 天、首次回顧 7 天、預設一起做', () => {
    const { draft } = roleDraft('fam-role', 'fam-role-plan');
    expect(draft.rewardPolicy).toBe('family_contribution');
    expect(draft.purposeCategory).toBe('family_participation');
    expect(draft.durationDays).toBe(28);
    expect(draft.firstReviewAfterDays).toBe(7);
    expect(draft.supportLevel).toBe('together_first');
    expect(draft.weekendReviewEnabled).toBe(true);
  });

  it('catalog 沒給角色預設值時，roleOptionId 為空、責任項目為空', () => {
    const { draft } = roleDraft('fam-role', 'fam-role-plan');
    expect(draft.roleOptionId).toBe('');
    expect(draft.responsibilityItems).toEqual([]);
  });

  it('例外與貢獻說明使用集中管理的預設文字', () => {
    const { draft } = roleDraft('fam-care', 'fam-care-plan');
    expect(draft.exceptionDescription).toContain('生病、外出或家庭作息改變');
    expect(draft.contributionDescription).toContain('家庭參與與貢獻');
  });

  it('角色期間可選 14／28／42 天', () => {
    const { variant } = roleDraft('fam-role', 'fam-role-plan');
    expect(variant.defaultDraft.durationDayChoices).toEqual([14, 28, 42]);
  });
});

// ---------------------------------------------------------------------------
// 五、責任範本
// ---------------------------------------------------------------------------

describe('責任範本', () => {
  it('每個具體角色都有 2–4 項建議責任', () => {
    const roleIds = [
      'table_helper', 'laundry_sorter', 'recycling_keeper', 'supply_restocker',
      'space_tidier', 'plant_caretaker', 'pet_water_helper', 'pet_supply_keeper',
    ];
    for (const roleId of roleIds) {
      const items = responsibilityTemplateFor(roleId);
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items.length).toBeLessThanOrEqual(4);
      expect(roleScopeFallback(roleId).trim().length).toBeGreaterThan(0);
    }
  });

  it('餐桌小幫手與植物照顧員的內容符合規格', () => {
    expect(responsibilityTemplateFor('table_helper')).toContain('用餐前放好約定餐具');
    expect(responsibilityTemplateFor('plant_caretaker')).toContain('在約定日期澆水');
    expect(responsibilityTemplateFor('recycling_keeper')).toContain(
      '不處理玻璃、尖銳或不明物品',
    );
  });

  it('未知角色（含「其他」）回空陣列，由家長自己填', () => {
    expect(responsibilityTemplateFor('other')).toEqual([]);
    expect(buildResponsibilityItems('other')).toEqual([]);
  });

  it('buildResponsibilityItems 產生啟用、非自訂的項目', () => {
    const items = buildResponsibilityItems('table_helper');
    expect(items.every(i => i.enabled)).toBe(true);
    expect(items.every(i => !i.isCustom)).toBe(true);
    expect(new Set(items.map(i => i.id)).size).toBe(items.length);
  });
});

describe('applyRoleSelection', () => {
  it('切換角色會重建責任與範圍，並寫回 selectedOptions', () => {
    const { draft, variant } = roleDraft('fam-role', 'fam-role-plan');
    const groupId = variant.optionGroups[0].id;

    const next = applyRoleSelection(draft, 'table_helper', groupId);
    expect(next.roleOptionId).toBe('table_helper');
    expect(next.responsibilityItems.length).toBeGreaterThan(0);
    expect(next.scopeDescription).toContain('餐具');
    expect(next.selectedOptions[groupId]).toEqual(['table_helper']);
  });

  it('切到非「其他」時清掉自訂角色名稱', () => {
    const { draft, variant } = roleDraft('fam-role', 'fam-role-plan');
    const groupId = variant.optionGroups[0].id;
    const withCustom: FamilyRoleDraft = {
      ...draft,
      roleOptionId: 'other',
      customRoleValue: '澆花大隊長',
    };
    const next = applyRoleSelection(withCustom, 'table_helper', groupId);
    expect(next.customRoleValue).toBeUndefined();
  });
});

describe('responsibilitiesTouched', () => {
  it('未修改時為 false', () => {
    const { draft, variant } = roleDraft('fam-role', 'fam-role-plan');
    const withRole = applyRoleSelection(draft, 'table_helper', variant.optionGroups[0].id);
    expect(responsibilitiesTouched(withRole, withRole)).toBe(false);
  });

  it('改文字、關閉、增刪都算已修改', () => {
    const { draft, variant } = roleDraft('fam-role', 'fam-role-plan');
    const base = applyRoleSelection(draft, 'table_helper', variant.optionGroups[0].id);

    const edited = {
      ...base,
      responsibilityItems: base.responsibilityItems.map((item, i) =>
        i === 0 ? { ...item, text: '改過的內容' } : item,
      ),
    };
    expect(responsibilitiesTouched(edited, base)).toBe(true);

    const disabled = {
      ...base,
      responsibilityItems: base.responsibilityItems.map((item, i) =>
        i === 0 ? { ...item, enabled: false } : item,
      ),
    };
    expect(responsibilitiesTouched(disabled, base)).toBe(true);

    const added = {
      ...base,
      responsibilityItems: [
        ...base.responsibilityItems,
        { id: 'resp-custom-1', text: '自己加的', enabled: true, isCustom: true },
      ],
    };
    expect(responsibilitiesTouched(added, base)).toBe(true);
  });

  it('baseline 為 null 時視為未修改', () => {
    const { draft } = roleDraft('fam-role', 'fam-role-plan');
    expect(responsibilitiesTouched(draft, null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 六、validator — recurring
// ---------------------------------------------------------------------------

describe('validateRecurringTaskDraft', () => {
  it('剛建立的家庭參與固定任務即合法', () => {
    const { draft, variant } = recurringDraft('fam-set-table', 'fam-set-table-recurring');
    expect(validateRecurringTaskDraft(draft, variant)).toEqual({});
  });

  it('fixed_days 沒選日子會回報 recurrenceDays', () => {
    const { draft, variant } = recurringDraft('learn-reading', 'learn-reading-recurring');
    const errors = validateRecurringTaskDraft({ ...draft, recurrenceDays: [] }, variant);
    expect(errors.recurrenceDays).toBeDefined();
  });

  it('weekly_frequency 模式改驗 weeklyFrequency，不再要求星期', () => {
    const { draft, variant } = recurringDraft('learn-sport', 'learn-sport-recurring');
    const base: RecurringTaskDraft = {
      ...draft,
      scheduleMode: 'weekly_frequency',
      recurrenceDays: [],
      // sport_kind 是 required；這個案例要單獨看排程欄位，先把它補齊。
      selectedOptions: { ...draft.selectedOptions, sport_kind: ['jump_rope'] },
    };

    expect(validateRecurringTaskDraft(base, variant).weeklyFrequency).toBeDefined();
    expect(validateRecurringTaskDraft(base, variant).recurrenceDays).toBeUndefined();

    const ok = { ...base, weeklyFrequency: 3 };
    expect(validateRecurringTaskDraft(ok, variant)).toEqual({});

    expect(
      validateRecurringTaskDraft({ ...base, weeklyFrequency: 0 }, variant).weeklyFrequency,
    ).toBeDefined();
    expect(
      validateRecurringTaskDraft({ ...base, weeklyFrequency: 8 }, variant).weeklyFrequency,
    ).toBeDefined();
    expect(
      validateRecurringTaskDraft({ ...base, weeklyFrequency: 2.5 }, variant).weeklyFrequency,
    ).toBeDefined();
  });

  it('分鐘、自訂時段、完成描述、回顧天數各自回報到對應欄位', () => {
    const { draft, variant } = recurringDraft('learn-reading', 'learn-reading-recurring');

    expect(
      validateRecurringTaskDraft({ ...draft, minutesPerSession: 0 }, variant).minutesPerSession,
    ).toBeDefined();
    expect(
      validateRecurringTaskDraft(
        { ...draft, preferredTime: 'custom', preferredTimeCustom: ' ' },
        variant,
      ).preferredTimeCustom,
    ).toBeDefined();
    expect(
      validateRecurringTaskDraft({ ...draft, completionDescription: '' }, variant)
        .completionDescription,
    ).toBeDefined();
    expect(
      validateRecurringTaskDraft(
        { ...draft, reviewEnabled: true, reviewAfterDays: 0 },
        variant,
      ).reviewAfterDays,
    ).toBeDefined();
  });

  it('reviewEnabled 為 false 時不驗回顧天數', () => {
    const { draft, variant } = recurringDraft('learn-reading', 'learn-reading-recurring');
    const errors = validateRecurringTaskDraft(
      { ...draft, reviewEnabled: false, reviewAfterDays: 0 },
      variant,
    );
    expect(errors.reviewAfterDays).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 七、家庭參與的發幣防線
// ---------------------------------------------------------------------------

describe('家庭參與不得發幣', () => {
  it('catalog 層：所有家庭參與 variant 的 allowedRewardPolicies 都不含幣類', () => {
    for (const family of ALL_FAMILIES) {
      for (const variant of family.variants) {
        if (variant.purposeCategory !== 'family_participation') continue;
        expect(variant.allowedRewardPolicies)
          .not.toContain('coin_eligible');
        expect(variant.allowedRewardPolicies)
          .not.toContain('time_saving_eligible');
      }
    }
  });

  it('validator 層：即使草稿被改成幣類也會被擋下', () => {
    const { draft, variant } = recurringDraft('fam-set-table', 'fam-set-table-recurring');

    const coin = validateRecurringTaskDraft({ ...draft, rewardPolicy: 'coin_eligible' }, variant);
    expect(coin.rewardPolicy).toBeDefined();

    const time = validateRecurringTaskDraft(
      { ...draft, rewardPolicy: 'time_saving_eligible' },
      variant,
    );
    expect(time.rewardPolicy).toBeDefined();
  });

  it('validator 層：即使 catalog 錯誤地允許成長幣，仍然擋下', () => {
    const { draft, variant } = recurringDraft('fam-set-table', 'fam-set-table-recurring');
    const brokenVariant: TaskPresetVariant = {
      ...variant,
      allowedRewardPolicies: [...variant.allowedRewardPolicies, 'coin_eligible'],
    };
    const errors = validateRecurringTaskDraft(
      { ...draft, rewardPolicy: 'coin_eligible' },
      brokenVariant,
    );
    expect(errors.rewardPolicy).toBeDefined();
  });

  /*
    第九階段 C 反轉的一條：家庭參與不再被限制成只能 family_contribution。

    第九階段 B 已經把 create_parent_task_v1 的 guard 改成只擋成長幣
    （B ＋ record_only／progress_only 可以建立）。App 這一層跟著對齊 ——
    兩邊說法不同的話，家長會遇到「App 說不行、資料庫其實可以」。

    成長幣仍然擋（上一條測試），家庭角色也仍然固定家庭貢獻（見下方 family role 段）。
  */
  it('家庭參與可以只留下紀錄 —— 與資料庫的 guard 一致', () => {
    const { draft, variant } = recurringDraft('fam-laundry', 'fam-laundry-recurring');
    const errors = validateRecurringTaskDraft({ ...draft, rewardPolicy: 'record_only' }, variant);
    expect(errors.rewardPolicy).toBeUndefined();
  });

  it('學習類不受此限制', () => {
    const { draft, variant } = recurringDraft('learn-reading', 'learn-reading-recurring');
    const errors = validateRecurringTaskDraft({ ...draft, rewardPolicy: 'coin_eligible' }, variant);
    expect(errors.rewardPolicy).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 八、validator — family role
// ---------------------------------------------------------------------------

describe('validateFamilyRoleDraft', () => {
  function readyRole(): { draft: FamilyRoleDraft; variant: TaskPresetVariant } {
    const { draft, variant } = roleDraft('fam-role', 'fam-role-plan');
    const withRole = applyRoleSelection(draft, 'table_helper', variant.optionGroups[0].id);
    return { draft: { ...withRole, recurrenceDays: [1, 3, 5] }, variant };
  }

  it('選好角色與執行日後即合法', () => {
    const { draft, variant } = readyRole();
    expect(validateFamilyRoleDraft(draft, variant)).toEqual({});
  });

  it('沒選角色會回報 roleOptionId', () => {
    const { draft, variant } = roleDraft('fam-role', 'fam-role-plan');
    expect(validateFamilyRoleDraft(draft, variant).roleOptionId).toBeDefined();
  });

  it('選「其他」但沒填名稱會回報 customRoleValue', () => {
    const { draft, variant } = readyRole();
    const errors = validateFamilyRoleDraft(
      { ...draft, roleOptionId: 'other', customRoleValue: '  ' },
      variant,
    );
    expect(errors.customRoleValue).toBeDefined();
  });

  it('期間必須落在 catalog 的選項內', () => {
    const { draft, variant } = readyRole();
    expect(validateFamilyRoleDraft({ ...draft, durationDays: 28 }, variant).durationDays)
      .toBeUndefined();
    expect(validateFamilyRoleDraft({ ...draft, durationDays: 35 }, variant).durationDays)
      .toBeDefined();
  });

  it('責任項目：全關、空白、超過五項都會回報', () => {
    const { draft, variant } = readyRole();

    const allOff = {
      ...draft,
      responsibilityItems: draft.responsibilityItems.map(i => ({ ...i, enabled: false })),
    };
    expect(validateFamilyRoleDraft(allOff, variant).responsibilityItems).toBeDefined();

    const blank = {
      ...draft,
      responsibilityItems: draft.responsibilityItems.map((i, idx) =>
        idx === 0 ? { ...i, text: '  ' } : i,
      ),
    };
    expect(validateFamilyRoleDraft(blank, variant).responsibilityItems).toBeDefined();

    const tooMany = {
      ...draft,
      responsibilityItems: Array.from({ length: 6 }, (_, i) => ({
        id: `r${i}`,
        text: `項目 ${i}`,
        enabled: true,
        isCustom: false,
      })),
    };
    expect(validateFamilyRoleDraft(tooMany, variant).responsibilityItems).toBeDefined();
  });

  it('範圍、例外、貢獻說明空白都會各自回報', () => {
    const { draft, variant } = readyRole();
    expect(validateFamilyRoleDraft({ ...draft, scopeDescription: '' }, variant).scopeDescription)
      .toBeDefined();
    expect(
      validateFamilyRoleDraft({ ...draft, exceptionDescription: '' }, variant)
        .exceptionDescription,
    ).toBeDefined();
    expect(
      validateFamilyRoleDraft({ ...draft, contributionDescription: '' }, variant)
        .contributionDescription,
    ).toBeDefined();
  });

  it('第一次回顧必須落在角色期間之內', () => {
    const { draft, variant } = readyRole();
    expect(
      validateFamilyRoleDraft({ ...draft, firstReviewAfterDays: 0 }, variant)
        .firstReviewAfterDays,
    ).toBeDefined();
    expect(
      validateFamilyRoleDraft({ ...draft, firstReviewAfterDays: 99 }, variant)
        .firstReviewAfterDays,
    ).toBeDefined();
  });

  it('回饋方式與目的分類被鎖在家庭貢獻／家庭參與', () => {
    const { draft, variant } = readyRole();
    expect(
      validateFamilyRoleDraft({ ...draft, rewardPolicy: 'coin_eligible' }, variant).rewardPolicy,
    ).toBeDefined();
    expect(
      validateFamilyRoleDraft({ ...draft, purposeCategory: 'learning_skill' }, variant)
        .purposeCategory,
    ).toBeDefined();
  });

  it('completionPolicy 由 catalog 固定為 review_and_continue', () => {
    const { variant } = readyRole();
    expect(variant.completionPolicy).toBe('review_and_continue');
  });
});

// ---------------------------------------------------------------------------
// 九、dirty 涵蓋新欄位
// ---------------------------------------------------------------------------

describe('dirty comparison — 新增欄位', () => {
  it('固定任務的每個新欄位都會被偵測到', () => {
    const { draft } = recurringDraft('learn-reading', 'learn-reading-recurring');

    const changes: Array<Partial<RecurringTaskDraft>> = [
      { scheduleMode: 'weekly_frequency' },
      { recurrenceDays: [2] },
      { weeklyFrequency: 3 },
      { minutesPerSession: 30 },
      { preferredTime: 'weekend' },
      { preferredTimeCustom: '晚一點' },
      { completionDescription: '換一句' },
      { reviewEnabled: false },
      { reviewAfterDays: 28 },
    ];

    for (const change of changes) {
      expect(isDraftDirty(draft, { ...draft, ...change })).toBe(true);
    }
  });

  it('家庭角色的每個新欄位都會被偵測到', () => {
    const { draft, variant } = roleDraft('fam-role', 'fam-role-plan');
    const base = applyRoleSelection(draft, 'table_helper', variant.optionGroups[0].id);

    const changes: Array<Partial<FamilyRoleDraft>> = [
      { roleOptionId: 'space_tidier' },
      { customRoleValue: '洗碗長' },
      { scopeDescription: '換個範圍' },
      { supportLevel: 'remind_then_check' },
      { exceptionDescription: '換個說法' },
      { durationDays: 42 },
      { recurrenceDays: [1] },
      { firstReviewAfterDays: 14 },
      { weekendReviewEnabled: false },
      { contributionDescription: '換個紀錄方式' },
    ];

    for (const change of changes) {
      expect(isDraftDirty(base, { ...base, ...change })).toBe(true);
    }

    const items = base.responsibilityItems.map((item, i) =>
      i === 0 ? { ...item, text: '改過' } : item,
    );
    expect(isDraftDirty(base, { ...base, responsibilityItems: items })).toBe(true);
  });

  it('改回原值後不再 dirty', () => {
    const { draft } = recurringDraft('learn-reading', 'learn-reading-recurring');
    const changed = { ...draft, completionDescription: '換一句' };
    expect(isDraftDirty(draft, changed)).toBe(true);
    expect(isDraftDirty(draft, { ...changed, completionDescription: draft.completionDescription }))
      .toBe(false);
  });
});
