// 第五階段 B — 單次任務草稿、驗證與 dirty 比對
//
// 重點不是「欄位有沒有被填」，而是三條產品硬規則在資料層真的擋得住：
//   1. 家庭參與的單次協助不發幣
//   2. 學校作業不得成為固定幣源
//   3. 單次任務一定是完成一次就結束

import {
  createTaskDraft,
  localDateWithOffset,
  resolveEditorKind,
  type DraftChildContext,
} from '../createTaskDraft';
import { isDraftDirty } from '../dirty';
import { validateOneTimeDraft, validateTaskDraft } from '../validators';
import { isOneTimeDraft, type OneTimeTaskDraft, type TaskDraft } from '../types';
import { ALL_FAMILIES, selectPresetFamilies } from '../../taskCatalog';
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

function oneTimeDraft(familyId: string, variantId: string): OneTimeTaskDraft {
  const family = familyById(familyId);
  const draft = createTaskDraft(family, variantById(family, variantId), CHILD);
  if (!isOneTimeDraft(draft)) throw new Error(`${variantId} 不是單次任務草稿`);
  return draft;
}

/** 補齊必填欄位，讓驗證應該乾淨通過。 */
function completedDraft(familyId: string, variantId: string): OneTimeTaskDraft {
  const family = familyById(familyId);
  const variant = variantById(family, variantId);
  const draft = oneTimeDraft(familyId, variantId);

  const selectedOptions = { ...draft.selectedOptions };
  for (const group of variant.optionGroups) {
    if (group.required) selectedOptions[group.id] = [group.options[0].id];
  }

  return { ...draft, taskDetails: '完成數學習作第 24–25 頁', selectedOptions };
}

/** catalog 目前所有的單次版本。 */
const ONE_TIME_PAIRS: Array<[string, string]> = [];
for (const family of ALL_FAMILIES) {
  for (const variant of family.variants) {
    if (variant.durationType === 'one_time') ONE_TIME_PAIRS.push([family.id, variant.id]);
  }
}

// ---------------------------------------------------------------------------
// editorKind
// ---------------------------------------------------------------------------

describe('單次任務走 one_time editor', () => {
  it('catalog 六個單次版本都 resolve 成 one_time', () => {
    expect(ONE_TIME_PAIRS.map(([, variantId]) => variantId).sort()).toEqual([
      'fam-restock-once',
      'fam-tidy-area-once',
      'learn-creation-once',
      'learn-explore-once',
      'learn-review-once',
      'learn-school-assignment-once',
    ]);

    for (const [familyId, variantId] of ONE_TIME_PAIRS) {
      const variant = variantById(familyById(familyId), variantId);
      expect(resolveEditorKind(variant)).toBe('one_time');
    }
  });

  it('每個單次版本都產得出帶完整欄位的草稿，不是只有 base 的殼', () => {
    for (const [familyId, variantId] of ONE_TIME_PAIRS) {
      const draft = oneTimeDraft(familyId, variantId);
      expect(typeof draft.taskDetails).toBe('string');
      expect(typeof draft.notes).toBe('string');
      expect(draft.completionDescription.length).toBeGreaterThan(0);
      expect(draft.scheduledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// createTaskDraft
// ---------------------------------------------------------------------------

describe('createTaskDraft：單次任務初始值', () => {
  it('學校作業：帶孩子暱稱、放學後、自己完成、只留下紀錄', () => {
    const draft = oneTimeDraft('learn-school-assignment', 'learn-school-assignment-once');

    expect(draft.title).toContain('承恩');
    expect(draft.originalExpectation).toContain('承恩');
    expect(draft.preferredTime).toBe('after_school');
    expect(draft.supportLevel).toBe('independent');
    expect(draft.rewardPolicy).toBe('record_only');
    expect(draft.estimatedMinutes).toBe(30);
    expect(draft.notes).toBe('');
  });

  it('taskDetails 預設留空，由家長補；validator 會要求', () => {
    const draft = oneTimeDraft('learn-school-assignment', 'learn-school-assignment-once');
    expect(draft.taskDetails).toBe('');

    const variant = variantById(
      familyById('learn-school-assignment'),
      'learn-school-assignment-once',
    );
    expect(validateOneTimeDraft(draft, variant).taskDetails).toBeDefined();
  });

  it('安排日期為本地今天，且與 base 的 startDate 一致', () => {
    const draft = oneTimeDraft('learn-review', 'learn-review-once');
    expect(draft.scheduledDate).toBe(localDateWithOffset(0));
    expect(draft.startDate).toBe(draft.scheduledDate);
  });

  it('一次訂正：放學後、自己完成，完成標準含「再試一次」', () => {
    const draft = oneTimeDraft('learn-review', 'learn-review-once');
    expect(draft.preferredTime).toBe('after_school');
    expect(draft.supportLevel).toBe('independent');
    expect(draft.completionDescription).toContain('再試一次');
  });

  it('創作：完成標準不評美醜', () => {
    const draft = oneTimeDraft('learn-creation', 'learn-creation-once');
    expect(draft.supportLevel).toBe('independent');
    expect(draft.completionDescription).toContain('不以作品是否漂亮');
    expect(draft.estimatedMinutes).toBe(45);
  });

  it('探索：週末、完成後一起確認，完成標準是留下一項發現', () => {
    const draft = oneTimeDraft('learn-explore', 'learn-explore-once');
    expect(draft.preferredTime).toBe('weekend');
    expect(draft.supportLevel).toBe('check_after');
    expect(draft.completionDescription).toContain('發現');
  });

  it('家庭參與的單次版本：需要時、完成後一起確認、不預填分鐘', () => {
    for (const variantId of ['fam-tidy-area-once', 'fam-restock-once']) {
      const familyId = variantId.startsWith('fam-tidy') ? 'fam-tidy-area' : 'fam-restock';
      const draft = oneTimeDraft(familyId, variantId);

      expect(draft.preferredTime).toBe('when_needed');
      expect(draft.supportLevel).toBe('check_after');
      // catalog 有 estimatedMinutes，但家庭參與不顯示這一區，所以也不預填。
      expect(draft.estimatedMinutes).toBeUndefined();
    }
  });

  it('家庭參與的單次版本一律家庭貢獻，不吃 defaultRewardPolicy 以外的值', () => {
    for (const [familyId, variantId] of ONE_TIME_PAIRS) {
      const draft = oneTimeDraft(familyId, variantId);
      if (draft.purposeCategory !== 'family_participation') continue;
      expect(draft.rewardPolicy).toBe('family_contribution');
    }
  });
});

// ---------------------------------------------------------------------------
// validator
// ---------------------------------------------------------------------------

describe('validateOneTimeDraft', () => {
  const family = familyById('learn-school-assignment');
  const variant = variantById(family, 'learn-school-assignment-once');

  it('補齊必填後沒有錯誤', () => {
    const draft = completedDraft('learn-school-assignment', 'learn-school-assignment-once');
    expect(validateOneTimeDraft(draft, variant)).toEqual({});
  });

  it('名稱空白時報錯', () => {
    const draft = completedDraft('learn-school-assignment', 'learn-school-assignment-once');
    expect(validateOneTimeDraft({ ...draft, title: '  ' }, variant).title).toBeDefined();
  });

  it('required 選項組沒選時報在該組上', () => {
    const draft = completedDraft('learn-school-assignment', 'learn-school-assignment-once');
    const errors = validateOneTimeDraft(
      { ...draft, selectedOptions: { ...draft.selectedOptions, school_subject: [] } },
      variant,
    );
    expect(errors['option:school_subject']).toBeDefined();
  });

  it('選「其他」但沒補充內容時報錯', () => {
    const draft = completedDraft('learn-school-assignment', 'learn-school-assignment-once');
    const errors = validateOneTimeDraft(
      {
        ...draft,
        selectedOptions: { ...draft.selectedOptions, school_subject: ['other'] },
        customOptionValues: { ...draft.customOptionValues, school_subject: '   ' },
      },
      variant,
    );
    expect(errors['customOption:school_subject']).toBeDefined();
  });

  it('這次要完成什麼不可空白', () => {
    const draft = completedDraft('learn-school-assignment', 'learn-school-assignment-once');
    expect(validateOneTimeDraft({ ...draft, taskDetails: '' }, variant).taskDetails)
      .toBeDefined();
  });

  it('安排日期必須是真實日期', () => {
    const draft = completedDraft('learn-school-assignment', 'learn-school-assignment-once');
    expect(validateOneTimeDraft({ ...draft, scheduledDate: '2026-02-31' }, variant).scheduledDate)
      .toBeDefined();
    expect(validateOneTimeDraft({ ...draft, scheduledDate: '明天' }, variant).scheduledDate)
      .toBeDefined();
    expect(validateOneTimeDraft({ ...draft, scheduledDate: '2026-08-03' }, variant).scheduledDate)
      .toBeUndefined();
  });

  it('自訂時段沒填文字時報錯', () => {
    const draft = completedDraft('learn-school-assignment', 'learn-school-assignment-once');
    const errors = validateOneTimeDraft(
      { ...draft, preferredTime: 'custom', preferredTimeCustom: '' },
      variant,
    );
    expect(errors.preferredTimeCustom).toBeDefined();
  });

  it('預估時間須落在既有分鐘上下限內', () => {
    const draft = completedDraft('learn-school-assignment', 'learn-school-assignment-once');
    expect(validateOneTimeDraft({ ...draft, estimatedMinutes: 2 }, variant).estimatedMinutes)
      .toBeDefined();
    expect(validateOneTimeDraft({ ...draft, estimatedMinutes: 400 }, variant).estimatedMinutes)
      .toBeDefined();
    expect(validateOneTimeDraft({ ...draft, estimatedMinutes: 12.5 }, variant).estimatedMinutes)
      .toBeDefined();
    expect(validateOneTimeDraft({ ...draft, estimatedMinutes: 20 }, variant).estimatedMinutes)
      .toBeUndefined();
    // 不設定固定分鐘是合法的。
    expect(
      validateOneTimeDraft({ ...draft, estimatedMinutes: undefined }, variant).estimatedMinutes,
    ).toBeUndefined();
  });

  it('協助方式不合法時報錯', () => {
    const draft = completedDraft('learn-school-assignment', 'learn-school-assignment-once');
    const broken = { ...draft, supportLevel: 'watch_over' as unknown as typeof draft.supportLevel };
    expect(validateOneTimeDraft(broken, variant).supportLevel).toBeDefined();
  });

  it('怎樣算完成不可空白', () => {
    const draft = completedDraft('learn-school-assignment', 'learn-school-assignment-once');
    expect(
      validateOneTimeDraft({ ...draft, completionDescription: ' ' }, variant)
        .completionDescription,
    ).toBeDefined();
  });

  it('補充說明留空不會報錯', () => {
    const draft = completedDraft('learn-school-assignment', 'learn-school-assignment-once');
    expect(validateOneTimeDraft({ ...draft, notes: '' }, variant).notes).toBeUndefined();
  });

  it('回饋方式必須在這個版本允許的範圍內', () => {
    const draft = completedDraft('learn-review', 'learn-review-once');
    const reviewVariant = variantById(familyById('learn-review'), 'learn-review-once');
    const errors = validateOneTimeDraft(
      { ...draft, rewardPolicy: 'family_contribution' },
      reviewVariant,
    );
    expect(errors.rewardPolicy).toBeDefined();
  });

  it('單次任務的結束方式必須是完成一次即結束', () => {
    const draft = completedDraft('learn-school-assignment', 'learn-school-assignment-once');
    const corrupted: TaskPresetVariant = { ...variant, completionPolicy: 'ongoing' };
    expect(validateOneTimeDraft(draft, corrupted).completionPolicy).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 兩層發幣防線
// ---------------------------------------------------------------------------

describe('學校作業不得成為固定幣源', () => {
  const family = familyById('learn-school-assignment');
  const variant = variantById(family, 'learn-school-assignment-once');

  it('catalog 只允許留下紀錄與進度肯定', () => {
    expect(variant.allowedRewardPolicies.sort()).toEqual(['progress_only', 'record_only']);
    expect(variant.defaultRewardPolicy).toBe('record_only');
  });

  it('進度與肯定是合法的', () => {
    const draft = completedDraft('learn-school-assignment', 'learn-school-assignment-once');
    expect(validateOneTimeDraft({ ...draft, rewardPolicy: 'progress_only' }, variant).rewardPolicy)
      .toBeUndefined();
  });

  it('即使 catalog 被改壞成允許成長幣，validator 仍然擋下', () => {
    const draft = completedDraft('learn-school-assignment', 'learn-school-assignment-once');
    const corrupted: TaskPresetVariant = {
      ...variant,
      allowedRewardPolicies: ['record_only', 'progress_only', 'coin_eligible'],
    };
    const errors = validateOneTimeDraft({ ...draft, rewardPolicy: 'coin_eligible' }, corrupted);
    expect(errors.rewardPolicy).toBeDefined();
  });

  it('時間儲蓄同樣被擋下', () => {
    const draft = completedDraft('learn-school-assignment', 'learn-school-assignment-once');
    const corrupted: TaskPresetVariant = {
      ...variant,
      allowedRewardPolicies: ['record_only', 'time_saving_eligible'],
    };
    const errors = validateOneTimeDraft(
      { ...draft, rewardPolicy: 'time_saving_eligible' },
      corrupted,
    );
    expect(errors.rewardPolicy).toBeDefined();
  });
});

describe('單次家庭參與不發幣', () => {
  const family = familyById('fam-tidy-area');
  const variant = variantById(family, 'fam-tidy-area-once');

  it('catalog 只允許家庭貢獻', () => {
    expect(variant.allowedRewardPolicies).toEqual(['family_contribution']);
  });

  it('補齊必填後家庭貢獻不會報錯', () => {
    const draft = completedDraft('fam-tidy-area', 'fam-tidy-area-once');
    expect(validateOneTimeDraft(draft, variant).rewardPolicy).toBeUndefined();
  });

  it('即使 catalog 被改壞成允許成長幣，validator 仍然擋下', () => {
    const draft = completedDraft('fam-tidy-area', 'fam-tidy-area-once');
    const corrupted: TaskPresetVariant = {
      ...variant,
      allowedRewardPolicies: ['family_contribution', 'coin_eligible'],
    };
    const errors = validateOneTimeDraft({ ...draft, rewardPolicy: 'coin_eligible' }, corrupted);
    expect(errors.rewardPolicy).toBeDefined();
  });

  /*
    這一條在第九階段 C 反過來了。

    舊規則：家庭參與只能是 family_contribution，連「只留下紀錄」都擋。
    新規則：只擋成長幣與時間儲蓄。

    改的理由不是放寬比較好，是**資料庫已經先改了**：第九階段 B 把
    create_parent_task_v1 的 guard 從「B 只能 family_contribution」改成
    只擋成長幣。App 這一層還停在舊說法的話，家長會遇到
    「App 說不行、資料庫其實可以」——而那種不一致沒有人解釋得了。

    家庭貢獻仍然是**建議**做法（evaluateCustomTaskRewardOptions 的 recommended），
    只是不再是唯一合法的選擇。
  */
  it('家庭參與可以只留下紀錄 —— 與資料庫的 guard 一致', () => {
    const draft = completedDraft('fam-restock', 'fam-restock-once');
    const restockVariant = variantById(familyById('fam-restock'), 'fam-restock-once');
    const relaxed: TaskPresetVariant = {
      ...restockVariant,
      allowedRewardPolicies: ['family_contribution', 'record_only'],
    };
    const errors = validateOneTimeDraft({ ...draft, rewardPolicy: 'record_only' }, relaxed);
    expect(errors.rewardPolicy).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 分派
// ---------------------------------------------------------------------------

describe('validateTaskDraft 分派到單次驗證', () => {
  it('one_time 不再回傳空錯誤', () => {
    const family = familyById('learn-explore');
    const variant = variantById(family, 'learn-explore-once');
    const draft = oneTimeDraft('learn-explore', 'learn-explore-once');

    // taskDetails 預設空白，分派正確的話一定會有錯誤。
    expect(validateTaskDraft(draft, variant).taskDetails).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// dirty
// ---------------------------------------------------------------------------

describe('dirty 比對涵蓋單次任務的新欄位', () => {
  const base = () => oneTimeDraft('learn-creation', 'learn-creation-once');

  const cases: Array<[string, (d: OneTimeTaskDraft) => OneTimeTaskDraft]> = [
    ['taskDetails', d => ({ ...d, taskDetails: '完成一張海洋主題的畫' })],
    ['scheduledDate', d => ({ ...d, scheduledDate: '2026-09-01' })],
    ['preferredTime', d => ({ ...d, preferredTime: 'weekend' })],
    ['preferredTimeCustom', d => ({ ...d, preferredTime: 'custom', preferredTimeCustom: '午睡後' })],
    ['estimatedMinutes', d => ({ ...d, estimatedMinutes: 15 })],
    ['supportLevel', d => ({ ...d, supportLevel: 'do_together' })],
    ['completionDescription', d => ({ ...d, completionDescription: '畫完主要部分就算完成' })],
    ['notes', d => ({ ...d, notes: '需要準備水彩' })],
    ['rewardPolicy', d => ({ ...d, rewardPolicy: 'progress_only' })],
    ['reminderMode', d => ({ ...d, reminderMode: 'on_task_day' })],
    ['selectedOptions', d => ({
      ...d,
      selectedOptions: { ...d.selectedOptions, creation_kind: ['drawing'] },
    })],
    ['customOptionValues', d => ({
      ...d,
      customOptionValues: { ...d.customOptionValues, creation_kind: '拼貼' },
    })],
  ];

  it.each(cases)('改動 %s 會被視為 dirty', (_name, mutate) => {
    const initial = base();
    expect(isDraftDirty(initial, mutate(initial))).toBe(true);
  });

  it('改回原值會恢復未修改狀態', () => {
    const initial = base();
    const changed: TaskDraft = { ...initial, taskDetails: '完成一張海洋主題的畫' };
    expect(isDraftDirty(initial, changed)).toBe(true);
    expect(isDraftDirty(initial, { ...changed, taskDetails: initial.taskDetails })).toBe(false);
  });

  it('沒改任何東西時不算 dirty', () => {
    const initial = base();
    expect(isDraftDirty(initial, { ...initial })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 搜尋
// ---------------------------------------------------------------------------

describe('新增的選項 label 會參與搜尋', () => {
  it('搜「藝術」命中完成一項學校作業（只有科目選項有這兩個字）', () => {
    const hits = selectPresetFamilies(8, 'learning_skill', '藝術');
    expect(hits.map(f => f.id)).toContain('learn-school-assignment');
  });

  it('搜「作業」也命中', () => {
    const hits = selectPresetFamilies(8, 'recommended', '作業');
    expect(hits.map(f => f.id)).toContain('learn-school-assignment');
  });
});
