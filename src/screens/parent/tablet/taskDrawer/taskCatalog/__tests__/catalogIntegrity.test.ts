// 第五階段 B — catalog 資料完整性
//
// TypeScript 只保證欄位型別對，保證不了「defaultVariantId 指向的版本真的存在」
// 或「家庭參與沒有偷偷多一個可發幣的版本」。這一支就是補那一段。
//
// 這些規則若被破壞，畫面上不會 crash，只會安靜地做錯事 —— 所以要在測試層擋。

import {
  AFTER_MEAL_TIDY,
  ALL_FAMILIES,
  CARE_ROLE_KIND,
  CREATION_KIND,
  EXPLORE_METHOD,
  FAMILY_ROLE_KIND,
  HOMEWORK_METHOD,
  HOUSEHOLD_SUPPLY,
  LAUNDRY_SORT,
  PERFORMANCE_KIND,
  PLANT_PET_CARE,
  READING_METHOD,
  RECYCLING_KIND,
  REVIEW_KIND,
  SCHOOL_SUBJECT,
  SHARED_AREA,
  SPORT_KIND,
  SUBJECT_SCOPE,
  TABLE_SETUP,
  defaultVariantOf,
  selectPresetFamilies,
  type TaskPresetFamily,
  type TaskPresetVariant,
} from '..';
import { createTaskDraft, resolveEditorKind } from '../../taskDraft';
import type { DraftChildContext, TaskEditorKind } from '../../taskDraft';

const CHILD: DraftChildContext = {
  nickname: '承恩',
  birthDate: '2018-03-05',
  familyId: 'family-1',
};

/** 目前有正式 editor 的 editorKind。新增一種就要同時補上 editor 與這個清單。 */
const IMPLEMENTED_EDITOR_KINDS: TaskEditorKind[] = [
  'growth_plan',
  'short_support',
  'recurring',
  'family_role',
  'one_time',
];

const ALL_VARIANTS: Array<{ family: TaskPresetFamily; variant: TaskPresetVariant }> =
  ALL_FAMILIES.flatMap(family => family.variants.map(variant => ({ family, variant })));

// ---------------------------------------------------------------------------
// 識別碼與結構
// ---------------------------------------------------------------------------

describe('識別碼', () => {
  it('1. family id 全域唯一', () => {
    const ids = ALL_FAMILIES.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('2. variant id 全域唯一', () => {
    const ids = ALL_VARIANTS.map(({ variant }) => variant.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('3. defaultVariantId 指向真實存在的版本', () => {
    for (const family of ALL_FAMILIES) {
      const found = family.variants.some(v => v.id === family.defaultVariantId);
      expect({ family: family.id, found }).toEqual({ family: family.id, found: true });
      expect(defaultVariantOf(family).id).toBe(family.defaultVariantId);
    }
  });

  it('4. 每個 family 至少一個版本', () => {
    for (const family of ALL_FAMILIES) {
      expect({ family: family.id, count: family.variants.length > 0 })
        .toEqual({ family: family.id, count: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 回饋方式
// ---------------------------------------------------------------------------

describe('回饋方式', () => {
  it('5. defaultRewardPolicy 一定在 allowedRewardPolicies 之中', () => {
    for (const { variant } of ALL_VARIANTS) {
      expect({
        variant: variant.id,
        ok: variant.allowedRewardPolicies.includes(variant.defaultRewardPolicy),
      }).toEqual({ variant: variant.id, ok: true });
    }
  });

  it('6. 所有家庭參與的預設回饋都是家庭貢獻', () => {
    for (const { variant } of ALL_VARIANTS) {
      if (variant.purposeCategory !== 'family_participation') continue;
      expect({ variant: variant.id, policy: variant.defaultRewardPolicy })
        .toEqual({ variant: variant.id, policy: 'family_contribution' });
    }
  });

  it('7. 家庭參與只允許家庭貢獻，不含幣、時間儲蓄或一般留下紀錄', () => {
    for (const { variant } of ALL_VARIANTS) {
      if (variant.purposeCategory !== 'family_participation') continue;
      expect({ variant: variant.id, allowed: variant.allowedRewardPolicies })
        .toEqual({ variant: variant.id, allowed: ['family_contribution'] });
    }
  });

  it('8. 短期支援一律只記進度與肯定', () => {
    for (const { variant } of ALL_VARIANTS) {
      if (variant.planMode !== 'short_support') continue;
      expect({ variant: variant.id, policy: variant.defaultRewardPolicy })
        .toEqual({ variant: variant.id, policy: 'progress_only' });
    }
  });

  it('10. 家庭角色一律家庭貢獻', () => {
    for (const { variant } of ALL_VARIANTS) {
      if (variant.planMode !== 'family_role') continue;
      expect({ variant: variant.id, policy: variant.defaultRewardPolicy })
        .toEqual({ variant: variant.id, policy: 'family_contribution' });
    }
  });
});

// ---------------------------------------------------------------------------
// 結束方式
// ---------------------------------------------------------------------------

describe('結束方式', () => {
  it('9. 短期支援一律穩定後結束', () => {
    for (const { variant } of ALL_VARIANTS) {
      if (variant.planMode !== 'short_support') continue;
      expect({ variant: variant.id, policy: variant.completionPolicy })
        .toEqual({ variant: variant.id, policy: 'stabilize_and_exit' });
    }
  });

  it('11. 家庭角色一律期滿回顧後再決定', () => {
    for (const { variant } of ALL_VARIANTS) {
      if (variant.planMode !== 'family_role') continue;
      expect({ variant: variant.id, policy: variant.completionPolicy })
        .toEqual({ variant: variant.id, policy: 'review_and_continue' });
    }
  });

  it('12. 單次任務一律完成一次即結束', () => {
    const oneTime = ALL_VARIANTS.filter(({ variant }) => variant.durationType === 'one_time');
    expect(oneTime.length).toBeGreaterThan(0);
    for (const { variant } of oneTime) {
      expect({ variant: variant.id, policy: variant.completionPolicy })
        .toEqual({ variant: variant.id, policy: 'complete_once' });
    }
  });
});

// ---------------------------------------------------------------------------
// 期間與選項
// ---------------------------------------------------------------------------

describe('期間與選項', () => {
  it('13. 預設期間一定落在可選期間之中', () => {
    for (const { variant } of ALL_VARIANTS) {
      const { durationDays, durationDayChoices } = variant.defaultDraft;
      if (durationDays === undefined || durationDayChoices === undefined) continue;
      expect({ variant: variant.id, ok: durationDayChoices.includes(durationDays) })
        .toEqual({ variant: variant.id, ok: true });
    }
  });

  it('14. 可選期間沒有重複，且都是正整數', () => {
    for (const { variant } of ALL_VARIANTS) {
      const choices = variant.defaultDraft.durationDayChoices;
      if (!choices) continue;
      expect({ variant: variant.id, unique: new Set(choices).size === choices.length })
        .toEqual({ variant: variant.id, unique: true });
      for (const days of choices) {
        expect({ variant: variant.id, days, ok: Number.isInteger(days) && days > 0 })
          .toEqual({ variant: variant.id, days, ok: true });
      }
    }
  });

  it('15. required 的選項組必須真的有選項可選', () => {
    for (const { variant } of ALL_VARIANTS) {
      for (const group of variant.optionGroups) {
        if (!group.required) continue;
        expect({ group: group.id, count: group.options.length > 0 })
          .toEqual({ group: group.id, count: true });
      }
    }
  });

  it('16. defaultOptionId 若有設定，必須存在於該組選項中', () => {
    for (const { variant } of ALL_VARIANTS) {
      for (const group of variant.optionGroups) {
        if (group.defaultOptionId === undefined) continue;
        expect({
          group: group.id,
          ok: group.options.some(o => o.id === group.defaultOptionId),
        }).toEqual({ group: group.id, ok: true });
      }
    }
  });

  it('選項組內的 option id 不重複', () => {
    for (const { variant } of ALL_VARIANTS) {
      for (const group of variant.optionGroups) {
        const ids = group.options.map(o => o.id);
        expect({ group: group.id, unique: new Set(ids).size === ids.length })
          .toEqual({ group: group.id, unique: true });
      }
    }
  });

  it('allowCustom 的選項組一定有一個 other 選項可以觸發自填', () => {
    for (const { variant } of ALL_VARIANTS) {
      for (const group of variant.optionGroups) {
        if (!group.allowCustom) continue;
        expect({ group: group.id, hasOther: group.options.some(o => o.id === 'other') })
          .toEqual({ group: group.id, hasOther: true });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// required 選項組（第六階段 B）
//
// 「required 標錯」不會 crash，只會讓家長帶著空白內容進到預覽 ——
// 這正是閱讀計畫可以不選閱讀方式就按下預覽的原因，所以在這裡固定住。
// ---------------------------------------------------------------------------

describe('required 選項組', () => {
  /**
   * 缺了就不成立的群組。
   * 刻意不是「全部 optionGroup 都 required」：餐桌準備、餐後整理、衣物分類、
   * 回收類別、家庭用品這五組只是把已經說清楚的動作再收窄，空著任務仍然成立。
   */
  const MUST_BE_REQUIRED = [
    READING_METHOD,
    HOMEWORK_METHOD,
    PERFORMANCE_KIND,
    SPORT_KIND,
    CREATION_KIND,
    EXPLORE_METHOD,
    REVIEW_KIND,
    SCHOOL_SUBJECT,
    SUBJECT_SCOPE,
    FAMILY_ROLE_KIND,
    CARE_ROLE_KIND,
    SHARED_AREA,
    PLANT_PET_CARE,
  ];

  const MUST_STAY_OPTIONAL = [
    TABLE_SETUP,
    AFTER_MEAL_TIDY,
    LAUNDRY_SORT,
    RECYCLING_KIND,
    HOUSEHOLD_SUPPLY,
  ];

  it('21. 指定的選項組全部 required', () => {
    for (const group of MUST_BE_REQUIRED) {
      expect({ group: group.id, required: group.required === true })
        .toEqual({ group: group.id, required: true });
    }
  });

  it('22. 只是收窄範圍的選項組維持非必填', () => {
    for (const group of MUST_STAY_OPTIONAL) {
      expect({ group: group.id, required: group.required === true })
        .toEqual({ group: group.id, required: false });
    }
  });

  it('23. required 的選項組一定有選項可選', () => {
    for (const { variant } of ALL_VARIANTS) {
      for (const group of variant.optionGroups) {
        if (!group.required) continue;
        expect({ group: group.id, count: group.options.length })
          .toEqual({ group: group.id, count: group.options.length });
        expect(group.options.length).toBeGreaterThan(0);
      }
    }
  });

  it('24. required 的 single 群組不會被初始化成不存在的值', () => {
    for (const { family, variant } of ALL_VARIANTS) {
      const draft = createTaskDraft(family, variant, CHILD);
      for (const group of variant.optionGroups) {
        if (group.selection !== 'single' || !group.required) continue;
        const selected = draft.selectedOptions[group.id] ?? [];
        // 允許空（家長自己選），但只要有值就必須是真的存在的 option。
        expect({
          variant: variant.id,
          group: group.id,
          ok: selected.every(id => group.options.some(o => o.id === id)),
        }).toEqual({ variant: variant.id, group: group.id, ok: true });
        expect(selected.length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('25. allowCustom 的群組有 other 選項，且沒有 allowCustom 的群組不放 other', () => {
    for (const { variant } of ALL_VARIANTS) {
      for (const group of variant.optionGroups) {
        const hasOther = group.options.some(o => o.id === 'other');
        expect({ group: group.id, allowCustom: !!group.allowCustom, hasOther })
          .toEqual({ group: group.id, allowCustom: hasOther, hasOther });
      }
    }
  });

  it('26. 每個 required 群組都真的被某個 variant 用到', () => {
    const used = new Set(
      ALL_VARIANTS.flatMap(({ variant }) => variant.optionGroups.map(g => g.id)),
    );
    for (const group of MUST_BE_REQUIRED) {
      expect({ group: group.id, used: used.has(group.id) })
        .toEqual({ group: group.id, used: true });
    }
  });
});

// ---------------------------------------------------------------------------
// editor 覆蓋率
// ---------------------------------------------------------------------------

describe('editor 覆蓋率', () => {
  it('目前是 26 個 family / 36 個 variant', () => {
    expect(ALL_FAMILIES.length).toBe(26);
    expect(ALL_VARIANTS.length).toBe(36);
  });

  it('17. 每個 variant 都 resolve 得出 editorKind，且與語意一致', () => {
    for (const { variant } of ALL_VARIANTS) {
      const kind = resolveEditorKind(variant);

      if (variant.planMode === 'family_role') {
        // 家庭角色即使帶 recurrenceDays，也不能掉進固定任務。
        expect({ variant: variant.id, kind }).toEqual({ variant: variant.id, kind: 'family_role' });
      } else if (variant.planMode === 'short_support') {
        expect({ variant: variant.id, kind })
          .toEqual({ variant: variant.id, kind: 'short_support' });
      } else if (variant.planMode === 'growth_plan') {
        expect({ variant: variant.id, kind })
          .toEqual({ variant: variant.id, kind: 'growth_plan' });
      } else if (variant.durationType === 'recurring') {
        expect({ variant: variant.id, kind }).toEqual({ variant: variant.id, kind: 'recurring' });
      } else {
        expect({ variant: variant.id, kind }).toEqual({ variant: variant.id, kind: 'one_time' });
      }
    }
  });

  it('18. 所有出現過的 editorKind 都有正式 editor，沒有 placeholder', () => {
    const kinds = new Set(ALL_VARIANTS.map(({ variant }) => resolveEditorKind(variant)));
    for (const kind of kinds) {
      expect({ kind, implemented: IMPLEMENTED_EDITOR_KINDS.includes(kind) })
        .toEqual({ kind, implemented: true });
    }
    // 五種形式在 catalog 裡都真的用得到，沒有寫了卻沒人走的 editor。
    expect([...kinds].sort()).toEqual([...IMPLEMENTED_EDITOR_KINDS].sort());
  });

  it('每個 variant 都建得出對應形式的草稿', () => {
    for (const { family, variant } of ALL_VARIANTS) {
      const draft = createTaskDraft(family, variant, CHILD);
      expect({ variant: variant.id, kind: draft.editorKind })
        .toEqual({ variant: variant.id, kind: resolveEditorKind(variant) });
      expect({ variant: variant.id, titled: draft.title.trim().length > 0 })
        .toEqual({ variant: variant.id, titled: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 對外文案
// ---------------------------------------------------------------------------

describe('對外文案', () => {
  it('19. catalog 的顯示文字不出現 A／B／C／D 類的內部代號', () => {
    // 「3C」不算 —— 只抓「X 類」與「Task-X」這兩種代號寫法。
    const CODE = /(^|[^0-9A-Za-z])[ABCD]\s?類|Task-[ABCD]/;

    for (const family of ALL_FAMILIES) {
      const texts = [
        family.title,
        family.description,
        ...family.domainTags,
        ...family.searchKeywords,
      ];
      for (const { variant } of ALL_VARIANTS.filter(v => v.family.id === family.id)) {
        texts.push(variant.label);
        if (variant.feedbackHint) texts.push(variant.feedbackHint);
        texts.push(...(variant.safetyNotes ?? []));
        texts.push(...(variant.policyFlags ?? []));
        for (const group of variant.optionGroups) {
          texts.push(group.label);
          texts.push(...group.options.map(o => o.label));
        }
      }
      for (const text of texts) {
        expect({ family: family.id, text, hasCode: CODE.test(text) })
          .toEqual({ family: family.id, text, hasCode: false });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 搜尋
// ---------------------------------------------------------------------------

describe('搜尋', () => {
  it('20. 選項 label 能命中所屬 family', () => {
    // 每一組 [關鍵字, 只有選項 label 有這個詞的 family]
    const cases: Array<[string, string]> = [
      ['藝術', 'learn-school-assignment'],
      ['餐墊', 'fam-set-table'],
      ['跳繩', 'learn-sport'],
      ['植物照顧員', 'fam-care'],
    ];
    for (const [query, familyId] of cases) {
      const hits = selectPresetFamilies(null, 'recommended', query).map(f => f.id);
      expect({ query, hit: hits.includes(familyId) }).toEqual({ query, hit: true });
    }
  });
});
