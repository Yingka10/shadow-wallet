// 第六階段 B — TaskDraft → CreateParentTaskCommand
//
// 這一支的重點不是「欄位有沒有搬過去」，是「有沒有東西被靜靜丟掉」。
// 所以除了逐項斷言，還有一個掃過 36 個 variant 的完整性測試。

import {
  ALL_FAMILIES,
  defaultVariantOf,
  type TaskPresetFamily,
  type TaskPresetVariant,
} from '../../taskCatalog';
import {
  applyRoleSelection,
  createTaskDraft,
  hasErrors,
  isFamilyRoleDraft,
  isOneTimeDraft,
  isRecurringDraft,
  isShortSupportDraft,
  syncSupportSteps,
  focusChoicesFor,
  validateTaskDraft,
  type DraftChildContext,
  type TaskDraft,
} from '../../taskDraft';
import { mapTaskDraftToCommand } from '../mapTaskDraftToCommand';
import { TASK_COMMAND_SCHEMA_VERSION, type CommandChildContext } from '../types';

const DRAFT_CHILD: DraftChildContext = {
  nickname: '承恩',
  birthDate: '2018-03-05',
  familyId: 'family-1',
};

const CHILD: CommandChildContext = {
  id: 'child-1',
  familyId: 'family-1',
  ageGroup: '6-9',
};

const POLICY_VERSION = '2026-07-01';

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

/**
 * 產生一份「已通過驗證」的草稿。
 * 映射的前提就是草稿有效，所以測資也要有效，否則測到的是不可能出現的狀態。
 */
function readyDraft(family: TaskPresetFamily, variant: TaskPresetVariant): TaskDraft {
  let draft = createTaskDraft(family, variant, DRAFT_CHILD);

  const selectedOptions = { ...draft.selectedOptions };
  for (const group of variant.optionGroups) {
    if (group.required) selectedOptions[group.id] = [group.options[0].id];
  }
  draft = { ...draft, selectedOptions };

  if (isFamilyRoleDraft(draft)) {
    const roleGroup = variant.optionGroups[0];
    draft = applyRoleSelection(
      draft,
      roleGroup ? roleGroup.options[0].id : 'table_helper',
      roleGroup?.id ?? null,
    );
  }

  if (isShortSupportDraft(draft)) {
    const choices = focusChoicesFor(family, variant);
    const focusIds = choices.slice(0, 2).map(c => c.id);
    draft = {
      ...draft,
      focusOptionIds: focusIds,
      supportSteps: syncSupportSteps([], focusIds, choices),
      ...(variant.optionGroups[0]
        ? {
            selectedOptions: {
              ...draft.selectedOptions,
              [variant.optionGroups[0].id]: focusIds,
            },
          }
        : null),
    };
  }

  if (isOneTimeDraft(draft)) {
    draft = { ...draft, taskDetails: '完成數學習作第 24–25 頁' };
  }

  return draft;
}

function commandFor(familyId: string, variantId?: string) {
  const family = familyById(familyId);
  const variant = variantId ? variantById(family, variantId) : defaultVariantOf(family);
  const draft = readyDraft(family, variant);
  return {
    draft,
    variant,
    command: mapTaskDraftToCommand({
      draft,
      family,
      variant,
      child: CHILD,
      taskPolicyVersion: POLICY_VERSION,
    }),
  };
}

// ---------------------------------------------------------------------------
// 共通欄位
// ---------------------------------------------------------------------------

describe('共通欄位', () => {
  it('schemaVersion 與四種版本都被記下來', () => {
    const { command } = commandFor('learn-reading', 'learn-reading-plan');
    expect(command.schemaVersion).toBe(TASK_COMMAND_SCHEMA_VERSION);
    expect(command.metadata.taskPolicyVersion).toBe(POLICY_VERSION);
    expect(command.metadata.ageGroup).toBe('6-9');
    expect(command.metadata.createdFromPreset).toBe(true);
  });

  it('familyId 一律取自這個孩子，不會用別的來源', () => {
    const family = familyById('learn-reading');
    const variant = defaultVariantOf(family);
    const draft = readyDraft(family, variant);
    // 刻意讓草稿裡的家族 id 和孩子的家庭 id 長得完全不一樣。
    const command = mapTaskDraftToCommand({
      draft,
      family,
      variant,
      child: { id: 'child-9', familyId: 'family-of-child-9', ageGroup: '9-12' },
      taskPolicyVersion: POLICY_VERSION,
    });
    expect(command.familyId).toBe('family-of-child-9');
    expect(command.childId).toBe('child-9');
    // preset.familyId 是 catalog 的家族，不是家庭 —— 兩者不可互相污染。
    expect(command.preset.familyId).toBe('learn-reading');
  });

  it('preset 溯源保留家族與版本', () => {
    const { command } = commandFor('learn-reading', 'learn-reading-plan');
    expect(command.preset).toEqual({
      familyId: 'learn-reading',
      variantId: 'learn-reading-plan',
    });
  });

  it('原始期待與選項答案完整帶過去', () => {
    const { draft, command } = commandFor('learn-reading', 'learn-reading-plan');
    expect(command.task.originalExpectation).toBe(draft.originalExpectation);
    expect(command.content.selectedOptions).toEqual(draft.selectedOptions);
    expect(command.content.customOptionValues).toEqual(draft.customOptionValues);
  });

  it('回饋方式與結束方式都保留，結束方式來自 catalog', () => {
    const { variant, command } = commandFor('fam-set-table');
    expect(command.task.rewardPolicy).toBe('family_contribution');
    expect(command.task.completionPolicy).toBe(variant.completionPolicy);
  });

  it('日期一律維持 YYYY-MM-DD', () => {
    const { command } = commandFor('learn-reading', 'learn-reading-plan');
    const dates = [
      command.schedule.startDate,
      command.schedule.endDate,
      command.review?.firstReviewDate,
    ].filter((v): v is string => typeof v === 'string');
    expect(dates.length).toBeGreaterThan(0);
    for (const date of dates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('editorKind 會被帶進 metadata，且與草稿一致', () => {
    for (const familyId of ['learn-reading', 'learn-homework-method', 'fam-role']) {
      const { draft, command } = commandFor(familyId);
      expect(command.metadata.editorKind).toBe(draft.editorKind);
    }
  });
});

// ---------------------------------------------------------------------------
// 五種形式
// ---------------------------------------------------------------------------

describe('成長計畫', () => {
  it('期間、里程碑、回顧都映射過去', () => {
    const { draft, command } = commandFor('learn-reading', 'learn-reading-plan');
    if (draft.editorKind !== 'growth_plan') throw new Error('expected growth plan');

    expect(command.schedule.mode).toBe('fixed_days');
    expect(command.schedule.recurrenceDays).toEqual(draft.recurrenceDays);
    expect(command.schedule.durationDays).toBe(draft.durationDays);
    expect(command.plan?.durationDays).toBe(draft.durationDays);
    expect(command.plan?.milestones).toHaveLength(draft.milestones.length);
    expect(command.plan?.milestones[0]).toEqual({
      id: draft.milestones[0].id,
      title: draft.milestones[0].title,
      targetDay: draft.milestones[0].targetDay,
    });
    expect(command.review?.firstReviewAfterDays).toBe(draft.firstReviewAfterDays);
    expect(command.review?.weekendReviewEnabled).toBe(true);
  });

  it('關掉的里程碑不會被寫下去', () => {
    const family = familyById('learn-reading');
    const variant = variantById(family, 'learn-reading-plan');
    const base = readyDraft(family, variant);
    if (base.editorKind !== 'growth_plan') throw new Error('expected growth plan');

    const draft = {
      ...base,
      milestones: base.milestones.map((m, i) => (i === 0 ? { ...m, enabled: false } : m)),
    };
    const command = mapTaskDraftToCommand({
      draft, family, variant, child: CHILD, taskPolicyVersion: POLICY_VERSION,
    });

    expect(command.plan?.milestones).toHaveLength(base.milestones.length - 1);
    expect(command.plan?.milestones.map(m => m.id)).not.toContain(base.milestones[0].id);
  });

  it('endDate 是開始日 + 期間 - 1（第一天就是開始日）', () => {
    const family = familyById('learn-reading');
    const variant = variantById(family, 'learn-reading-plan');
    const base = readyDraft(family, variant);
    const draft = { ...base, startDate: '2026-07-28' } as TaskDraft;
    const command = mapTaskDraftToCommand({
      draft, family, variant, child: CHILD, taskPolicyVersion: POLICY_VERSION,
    });
    // 28 天計畫：7/28 起算的第 28 天是 8/24。
    expect(command.schedule.durationDays).toBe(28);
    expect(command.schedule.endDate).toBe('2026-08-24');
  });
});

describe('短期支援', () => {
  it('焦點與支援步驟都保留，成功描述放進 completionDescription', () => {
    const { draft, command } = commandFor('learn-homework-method');
    if (draft.editorKind !== 'short_support') throw new Error('expected short support');

    expect(command.plan?.focusOptionIds).toEqual(draft.focusOptionIds);
    expect(command.plan?.supportSteps).toHaveLength(draft.supportSteps.length);
    expect(command.plan?.supportSteps[0].text).toBe(draft.supportSteps[0].text);
    expect(command.task.completionDescription).toBe(draft.successDescription);
    expect(command.task.rewardPolicy).toBe('progress_only');
  });

  it('關掉的支援步驟不會被寫下去', () => {
    const family = familyById('learn-homework-method');
    const variant = defaultVariantOf(family);
    const base = readyDraft(family, variant);
    if (base.editorKind !== 'short_support') throw new Error('expected short support');

    const draft = {
      ...base,
      supportSteps: base.supportSteps.map((s, i) => (i === 0 ? { ...s, enabled: false } : s)),
    };
    const command = mapTaskDraftToCommand({
      draft, family, variant, child: CHILD, taskPolicyVersion: POLICY_VERSION,
    });
    expect(command.plan?.supportSteps).toHaveLength(base.supportSteps.length - 1);
  });
});

describe('固定任務', () => {
  it('fixed_days 帶星期，且沿用 0 = 週日', () => {
    const { draft, command } = commandFor('fam-set-table');
    if (!isRecurringDraft(draft)) throw new Error('expected recurring');

    expect(command.schedule.mode).toBe('fixed_days');
    expect(command.schedule.recurrenceDays).toEqual(draft.recurrenceDays);
    // 家庭參與的預設是每天，包含 0（週日）。
    expect(command.schedule.recurrenceDays).toContain(0);
    expect(command.schedule.weeklyFrequency).toBeUndefined();
  });

  it('weekly_frequency 不會被靜靜丟掉', () => {
    const family = familyById('learn-sport');
    const variant = variantById(family, 'learn-sport-recurring');
    const base = readyDraft(family, variant);
    const draft = {
      ...base,
      scheduleMode: 'weekly_frequency' as const,
      recurrenceDays: [],
      weeklyFrequency: 3,
    } as TaskDraft;

    // 先確認這份草稿真的是合法的，避免測到不可能出現的狀態。
    expect(hasErrors(validateTaskDraft(draft, variant))).toBe(false);

    const command = mapTaskDraftToCommand({
      draft, family, variant, child: CHILD, taskPolicyVersion: POLICY_VERSION,
    });
    expect(command.schedule.mode).toBe('weekly_frequency');
    expect(command.schedule.weeklyFrequency).toBe(3);
  });

  it('自訂時段的文字跟著走', () => {
    const { command } = commandFor('fam-set-table');
    expect(command.schedule.preferredTime).toBe('custom');
    expect(command.schedule.preferredTimeCustom).toBe('用餐前');
  });

  it('定期回顧映射到 review，不產生 plan', () => {
    const { draft, command } = commandFor('learn-reading', 'learn-reading-recurring');
    if (!isRecurringDraft(draft)) throw new Error('expected recurring');
    expect(command.review).toEqual({
      reviewEnabled: true,
      reviewAfterDays: draft.reviewAfterDays,
    });
    expect(command.plan).toBeUndefined();
  });
});

describe('家庭角色', () => {
  it('角色、負責內容、範圍、例外、貢獻都保留', () => {
    const { draft, command } = commandFor('fam-role');
    if (!isFamilyRoleDraft(draft)) throw new Error('expected family role');

    expect(command.role?.optionId).toBe(draft.roleOptionId);
    expect(command.role?.responsibilities).toHaveLength(draft.responsibilityItems.length);
    expect(command.role?.responsibilities[0]).toEqual({
      id: draft.responsibilityItems[0].id,
      text: draft.responsibilityItems[0].text,
      isCustom: false,
    });
    expect(command.role?.scopeDescription).toBe(draft.scopeDescription);
    expect(command.role?.exceptionDescription).toBe(draft.exceptionDescription);
    expect(command.role?.contributionDescription).toBe(draft.contributionDescription);
    expect(command.support?.level).toBe(draft.supportLevel);
    expect(command.task.rewardPolicy).toBe('family_contribution');
    expect(command.task.completionPolicy).toBe('review_and_continue');
  });

  it('關掉的負責內容不會被寫下去，自訂項目保留 isCustom', () => {
    const family = familyById('fam-role');
    const variant = defaultVariantOf(family);
    const base = readyDraft(family, variant);
    if (!isFamilyRoleDraft(base)) throw new Error('expected family role');

    const draft = {
      ...base,
      responsibilityItems: [
        { ...base.responsibilityItems[0], enabled: false },
        ...base.responsibilityItems.slice(1),
        { id: 'resp-custom-1', text: '自己加的一項', enabled: true, isCustom: true },
      ],
    };
    const command = mapTaskDraftToCommand({
      draft, family, variant, child: CHILD, taskPolicyVersion: POLICY_VERSION,
    });

    const ids = command.role?.responsibilities.map(r => r.id) ?? [];
    expect(ids).not.toContain(base.responsibilityItems[0].id);
    expect(ids).toContain('resp-custom-1');
    expect(command.role?.responsibilities.find(r => r.id === 'resp-custom-1')?.isCustom)
      .toBe(true);
  });

  it('選「其他」時自訂角色名稱跟著走', () => {
    const family = familyById('fam-role');
    const variant = defaultVariantOf(family);
    const base = readyDraft(family, variant);
    if (!isFamilyRoleDraft(base)) throw new Error('expected family role');

    const draft = { ...base, roleOptionId: 'other', customRoleValue: '澆花大隊長' };
    const command = mapTaskDraftToCommand({
      draft, family, variant, child: CHILD, taskPolicyVersion: POLICY_VERSION,
    });
    expect(command.role?.optionId).toBe('other');
    expect(command.role?.customValue).toBe('澆花大隊長');
  });
});

describe('單次任務', () => {
  it('安排日期、內容、協助方式都映射過去', () => {
    const { draft, command } = commandFor('learn-school-assignment');
    if (!isOneTimeDraft(draft)) throw new Error('expected one time');

    expect(command.schedule.mode).toBe('one_time');
    expect(command.schedule.scheduledDate).toBe(draft.scheduledDate);
    expect(command.schedule.recurrenceDays).toBeUndefined();
    expect(command.content.taskDetails).toBe('完成數學習作第 24–25 頁');
    expect(command.support?.level).toBe(draft.supportLevel);
    expect(command.task.completionPolicy).toBe('complete_once');
  });

  it('沒填補充說明就不帶 notes，而不是帶一個空字串', () => {
    const { command } = commandFor('learn-school-assignment');
    expect(command.task.notes).toBeUndefined();
    expect('notes' in command.task).toBe(false);
  });

  it('填了補充說明就保留', () => {
    const family = familyById('learn-school-assignment');
    const variant = defaultVariantOf(family);
    const base = readyDraft(family, variant);
    if (!isOneTimeDraft(base)) throw new Error('expected one time');

    const command = mapTaskDraftToCommand({
      draft: { ...base, notes: '要帶尺與量角器' },
      family,
      variant,
      child: CHILD,
      taskPolicyVersion: POLICY_VERSION,
    });
    expect(command.task.notes).toBe('要帶尺與量角器');
  });

  it('學校作業維持只留紀錄，不會變成幣源', () => {
    const { command } = commandFor('learn-school-assignment');
    expect(command.task.rewardPolicy).toBe('record_only');
  });
});

// ---------------------------------------------------------------------------
// 全 catalog：不遺失資訊
// ---------------------------------------------------------------------------

describe('36 個 variant 都映射得出完整命令', () => {
  const ALL = ALL_FAMILIES.flatMap(family =>
    family.variants.map(variant => ({ family, variant })),
  );

  it('掃描範圍就是 36 個 variant', () => {
    expect(ALL).toHaveLength(36);
  });

  it('每一個 variant 的草稿都有效，且映射出必要欄位', () => {
    for (const { family, variant } of ALL) {
      const draft = readyDraft(family, variant);
      expect({ variant: variant.id, valid: !hasErrors(validateTaskDraft(draft, variant)) })
        .toEqual({ variant: variant.id, valid: true });

      const command = mapTaskDraftToCommand({
        draft, family, variant, child: CHILD, taskPolicyVersion: POLICY_VERSION,
      });

      expect({ variant: variant.id, title: command.task.title.length > 0 })
        .toEqual({ variant: variant.id, title: true });
      expect({ variant: variant.id, family: command.familyId })
        .toEqual({ variant: variant.id, family: 'family-1' });
      expect({ variant: variant.id, preset: command.preset.variantId })
        .toEqual({ variant: variant.id, preset: variant.id });
      expect({ variant: variant.id, kind: command.metadata.editorKind })
        .toEqual({ variant: variant.id, kind: draft.editorKind });
      expect({ variant: variant.id, done: command.task.completionDescription.length > 0 })
        .toEqual({ variant: variant.id, done: true });
    }
  });

  it('草稿上的每一段文字都在命令裡找得到（不靜靜丟掉東西）', () => {
    /**
     * 純畫面／流程欄位，本來就不該進入持久化命令：
     * familyId / variantId 改放在 preset，editorKind 放在 metadata，
     * createdFromPreset 是布林旗標。
     */
    const NOT_PERSISTED = new Set(['editorKind', 'createdFromPreset', 'familyId', 'variantId']);
    /** enabled 是編輯狀態，不是內容 —— 命令只輸出留下來的項目。 */
    const EDITING_STATE = new Set(['enabled', 'isEditable']);

    /** 走到底，收集所有非空白字串（真正會「消失不見」的就是這些）。 */
    function stringLeaves(value: unknown, out: string[]): void {
      if (typeof value === 'string') {
        if (value.trim().length > 0) out.push(value.trim());
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value) stringLeaves(item, out);
        return;
      }
      if (value && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
          if (EDITING_STATE.has(key)) continue;
          stringLeaves(inner, out);
        }
      }
    }

    for (const { family, variant } of ALL) {
      const draft = readyDraft(family, variant);
      const command = mapTaskDraftToCommand({
        draft, family, variant, child: CHILD, taskPolicyVersion: POLICY_VERSION,
      });
      const serialized = JSON.stringify(command);

      for (const [key, value] of Object.entries(draft)) {
        if (NOT_PERSISTED.has(key)) continue;
        const leaves: string[] = [];
        stringLeaves(value, leaves);

        for (const leaf of leaves) {
          // 用 JSON 逃逸後的形式比對，才不會被引號或換行騙過去。
          const needle = JSON.stringify(leaf).slice(1, -1);
          expect({ variant: variant.id, key, leaf, found: serialized.includes(needle) })
            .toEqual({ variant: variant.id, key, leaf, found: true });
        }
      }
    }
  });

  it('數值欄位也沒有遺漏：期間、分鐘、每週次數、回顧天數', () => {
    for (const { family, variant } of ALL) {
      const draft = readyDraft(family, variant);
      const command = mapTaskDraftToCommand({
        draft, family, variant, child: CHILD, taskPolicyVersion: POLICY_VERSION,
      });

      if ('durationDays' in draft) {
        expect({ variant: variant.id, days: command.schedule.durationDays })
          .toEqual({ variant: variant.id, days: draft.durationDays });
      }
      if ('minutesPerSession' in draft) {
        expect({ variant: variant.id, m: command.schedule.estimatedMinutes })
          .toEqual({ variant: variant.id, m: draft.minutesPerSession });
      }
      if ('estimatedMinutes' in draft) {
        expect({ variant: variant.id, m: command.schedule.estimatedMinutes })
          .toEqual({ variant: variant.id, m: draft.estimatedMinutes });
      }
      if ('weeklyFrequency' in draft && draft.weeklyFrequency !== undefined) {
        expect({ variant: variant.id, f: command.schedule.weeklyFrequency })
          .toEqual({ variant: variant.id, f: draft.weeklyFrequency });
      }
      if ('firstReviewAfterDays' in draft) {
        expect({ variant: variant.id, d: command.review?.firstReviewAfterDays })
          .toEqual({ variant: variant.id, d: draft.firstReviewAfterDays });
      }
      if ('reviewAfterDays' in draft && draft.reviewAfterDays !== undefined) {
        expect({ variant: variant.id, d: command.review?.reviewAfterDays })
          .toEqual({ variant: variant.id, d: draft.reviewAfterDays });
      }
      if ('recurrenceDays' in draft) {
        expect({ variant: variant.id, days: command.schedule.recurrenceDays })
          .toEqual({ variant: variant.id, days: draft.recurrenceDays });
      }
    }
  });
});
