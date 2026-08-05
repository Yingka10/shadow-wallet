// Shadow Wallet · Parent Tablet — 套用單一則 AI 建議
//
// 三條硬規則，都是型別與結構層面的，不靠自律：
//
//   1. **不用任意 path setter**（lodash.set 之類）。那種寫法讓
//      `fieldPath` 從 allowlist 退化成「任意字串」——validator 擋掉的東西，
//      setter 又幫忙塞回去。這裡是 exhaustive switch，編譯器會盯著。
//
//   2. **不改原 draft**。每次回一份新的，undo 才有意義，
//      React 的重新渲染也才會發生。
//
//   3. **一則建議只改一個欄位**。批次套用一次改三個欄位的話，
//      家長對「我到底同意了什麼」就沒有把握，undo 也還原不乾淨。
//
// AI 講的是語意名稱（completionDescription），五種 editor 各自叫不同名字
// （completionDescription / successDescription / contributionDescription）。
// 對應關係只在這個檔案裡解一次。

import {
  isFamilyRoleDraft,
  isGrowthPlanDraft,
  isOneTimeDraft,
  isRecurringDraft,
  isShortSupportDraft,
  type TaskDraft,
} from '../taskDraft';
import type { AllowedAiFieldPath, TaskAiSuggestion } from './types';

export type AiFieldValue = string | number | string[] | null;

/** 套用失敗的原因。失敗不是錯誤 —— 建議本來就可能對不上這份草稿。 */
export type ApplyFailureReason =
  /** 這份草稿沒有這個欄位（例如對單次任務建議 durationDays）。 */
  | 'PATH_NOT_APPLICABLE'
  /** 值的型別與欄位不符。validator 應該先擋掉，這是第二道。 */
  | 'VALUE_TYPE_MISMATCH';

export type ApplyTaskAiSuggestionResult =
  | {
      applied: true;
      draft: TaskDraft;
      /** undo 用：套用前那個欄位的值。 */
      record: AppliedSuggestionRecord;
      /**
       * 這次改動會不會影響幣值。
       * true 時呼叫端必須重新跑 evaluateTaskReward ——
       * 分鐘數變了而幣值沒跟著變，家長看到的金額就是錯的。
       */
      affectsRewardDecision: boolean;
    }
  | { applied: false; draft: TaskDraft; reason: ApplyFailureReason };

export type AppliedSuggestionRecord = {
  suggestionId: string;
  fieldPath: AllowedAiFieldPath;
  previousValue: AiFieldValue;
};

/** 只有這兩個路徑會改變幣值的輸入。 */
const REWARD_AFFECTING_PATHS: readonly AllowedAiFieldPath[] = ['sessionMinutes', 'durationDays'];

// ---------------------------------------------------------------------------
// 讀
// ---------------------------------------------------------------------------

export function readAiField(draft: TaskDraft, path: AllowedAiFieldPath): AiFieldValue {
  switch (path) {
    case 'title':
      return draft.title;

    case 'completionDescription':
      if (isGrowthPlanDraft(draft)) return draft.completionDescription;
      if (isShortSupportDraft(draft)) return draft.successDescription;
      if (isRecurringDraft(draft)) return draft.completionDescription;
      if (isFamilyRoleDraft(draft)) return draft.contributionDescription;
      if (isOneTimeDraft(draft)) return draft.completionDescription;
      return null;

    case 'taskDetails':
      return isOneTimeDraft(draft) ? draft.taskDetails : null;

    case 'scopeDescription':
      return isFamilyRoleDraft(draft) ? draft.scopeDescription : null;

    case 'notes':
      return isOneTimeDraft(draft) ? draft.notes : null;

    case 'sessionMinutes':
      if (isGrowthPlanDraft(draft) || isRecurringDraft(draft)) return draft.minutesPerSession ?? null;
      if (isOneTimeDraft(draft)) return draft.estimatedMinutes ?? null;
      return null;

    case 'durationDays':
      if (isGrowthPlanDraft(draft) || isShortSupportDraft(draft) || isFamilyRoleDraft(draft)) {
        return draft.durationDays;
      }
      return null;

    case 'weeklyFrequency':
      return isRecurringDraft(draft) ? draft.weeklyFrequency ?? null : null;

    case 'reviewAfterDays':
      if (isGrowthPlanDraft(draft) || isShortSupportDraft(draft) || isFamilyRoleDraft(draft)) {
        return draft.firstReviewAfterDays;
      }
      if (isRecurringDraft(draft)) return draft.reviewAfterDays ?? null;
      return null;

    case 'supportSteps':
      return isShortSupportDraft(draft) ? draft.supportSteps.map(s => s.text) : null;

    case 'milestones':
      return isGrowthPlanDraft(draft) ? draft.milestones.map(m => m.title) : null;

    case 'responsibilityItems':
      return isFamilyRoleDraft(draft) ? draft.responsibilityItems.map(r => r.text) : null;
  }
}

// ---------------------------------------------------------------------------
// 寫
// ---------------------------------------------------------------------------

/**
 * 把清單文字寫回結構化項目。
 *
 * **依位置沿用既有項目的 id 與旗標**：家長可能已經關掉第二項，
 * 直接重建一批全新 id 會讓那個決定消失。長度變了的部分才建新項。
 */
function mergeList<T extends { id: string; enabled: boolean }>(
  existing: readonly T[],
  texts: readonly string[],
  make: (text: string, index: number) => T,
  setText: (item: T, text: string) => T,
): T[] {
  return texts.map((text, index) => {
    const prior = existing[index];
    return prior ? setText(prior, text) : make(text, index);
  });
}

function writeAiField(
  draft: TaskDraft,
  path: AllowedAiFieldPath,
  value: string | number | string[],
): TaskDraft | null {
  const str = typeof value === 'string' ? value : null;
  const num = typeof value === 'number' ? value : null;
  const list = Array.isArray(value) ? value : null;

  switch (path) {
    case 'title':
      return str === null ? null : { ...draft, title: str };

    case 'completionDescription':
      if (str === null) return null;
      if (isGrowthPlanDraft(draft)) return { ...draft, completionDescription: str };
      if (isShortSupportDraft(draft)) return { ...draft, successDescription: str };
      if (isRecurringDraft(draft)) return { ...draft, completionDescription: str };
      if (isFamilyRoleDraft(draft)) return { ...draft, contributionDescription: str };
      if (isOneTimeDraft(draft)) return { ...draft, completionDescription: str };
      return null;

    case 'taskDetails':
      return str !== null && isOneTimeDraft(draft) ? { ...draft, taskDetails: str } : null;

    case 'scopeDescription':
      return str !== null && isFamilyRoleDraft(draft) ? { ...draft, scopeDescription: str } : null;

    case 'notes':
      return str !== null && isOneTimeDraft(draft) ? { ...draft, notes: str } : null;

    case 'sessionMinutes':
      if (num === null) return null;
      if (isGrowthPlanDraft(draft) || isRecurringDraft(draft)) {
        return { ...draft, minutesPerSession: num };
      }
      if (isOneTimeDraft(draft)) return { ...draft, estimatedMinutes: num };
      return null;

    case 'durationDays':
      if (num === null) return null;
      if (isGrowthPlanDraft(draft) || isShortSupportDraft(draft) || isFamilyRoleDraft(draft)) {
        return { ...draft, durationDays: num };
      }
      return null;

    case 'weeklyFrequency':
      if (num === null || !isRecurringDraft(draft)) return null;
      // 只有「每週次數」模式才有這個欄位；固定日期模式改它沒有意義。
      if (draft.scheduleMode !== 'weekly_frequency') return null;
      return { ...draft, weeklyFrequency: num };

    case 'reviewAfterDays':
      if (num === null) return null;
      if (isGrowthPlanDraft(draft) || isShortSupportDraft(draft) || isFamilyRoleDraft(draft)) {
        return { ...draft, firstReviewAfterDays: num };
      }
      if (isRecurringDraft(draft)) {
        // 回顧本來關著就一併打開 —— 否則家長採用了卻看不到任何變化。
        return { ...draft, reviewEnabled: true, reviewAfterDays: num };
      }
      return null;

    case 'supportSteps':
      if (list === null || !isShortSupportDraft(draft)) return null;
      return {
        ...draft,
        supportSteps: mergeList(
          draft.supportSteps,
          list,
          (text, index) => ({ id: `ai-step-${index}-${text.slice(0, 8)}`, text, enabled: true }),
          (item, text) => ({ ...item, text }),
        ),
      };

    case 'milestones':
      if (list === null || !isGrowthPlanDraft(draft)) return null;
      return {
        ...draft,
        milestones: mergeList(
          draft.milestones,
          list,
          (title, index) => ({
            id: `ai-milestone-${index}-${title.slice(0, 8)}`,
            title,
            isEditable: true,
            enabled: true,
          }),
          (item, title) => ({ ...item, title }),
        ),
      };

    case 'responsibilityItems':
      if (list === null || !isFamilyRoleDraft(draft)) return null;
      return {
        ...draft,
        responsibilityItems: mergeList(
          draft.responsibilityItems,
          list,
          (text, index) => ({
            id: `ai-duty-${index}-${text.slice(0, 8)}`,
            text,
            enabled: true,
            isCustom: true,
          }),
          (item, text) => ({ ...item, text }),
        ),
      };
  }
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function applyTaskAiSuggestion({
  draft,
  suggestion,
}: {
  draft: TaskDraft;
  suggestion: TaskAiSuggestion;
}): ApplyTaskAiSuggestionResult {
  const previousValue = readAiField(draft, suggestion.fieldPath);

  // 這份草稿根本沒有這個欄位 —— 例如對單次任務建議 durationDays。
  // 不是錯誤，只是這則建議用不上。
  if (previousValue === null && !pathExistsOn(draft, suggestion.fieldPath)) {
    return { applied: false, draft, reason: 'PATH_NOT_APPLICABLE' };
  }

  const next = writeAiField(draft, suggestion.fieldPath, suggestion.suggestedValue);
  if (next === null) {
    return {
      applied: false,
      draft,
      reason: pathExistsOn(draft, suggestion.fieldPath)
        ? 'VALUE_TYPE_MISMATCH'
        : 'PATH_NOT_APPLICABLE',
    };
  }

  return {
    applied: true,
    draft: next,
    record: {
      suggestionId: suggestion.id,
      fieldPath: suggestion.fieldPath,
      previousValue,
    },
    affectsRewardDecision: REWARD_AFFECTING_PATHS.includes(suggestion.fieldPath),
  };
}

/**
 * 還原單一則建議。
 *
 * 還原的是**那一個欄位**，不是整份草稿的快照 —— 家長採用三項之後
 * 想收回中間那一項時，另外兩項不該跟著消失。
 */
export function undoTaskAiSuggestion({
  draft,
  record,
}: {
  draft: TaskDraft;
  record: AppliedSuggestionRecord;
}): TaskDraft {
  if (record.previousValue === null) {
    // 原本沒有值的欄位（例如沒設分鐘數）。清回未設定。
    return clearAiField(draft, record.fieldPath);
  }
  return writeAiField(draft, record.fieldPath, record.previousValue) ?? draft;
}

function clearAiField(draft: TaskDraft, path: AllowedAiFieldPath): TaskDraft {
  if (path === 'sessionMinutes') {
    if (isGrowthPlanDraft(draft) || isRecurringDraft(draft)) {
      return { ...draft, minutesPerSession: undefined };
    }
    if (isOneTimeDraft(draft)) return { ...draft, estimatedMinutes: undefined };
  }
  if (path === 'weeklyFrequency' && isRecurringDraft(draft)) {
    return { ...draft, weeklyFrequency: undefined };
  }
  if (path === 'reviewAfterDays' && isRecurringDraft(draft)) {
    return { ...draft, reviewEnabled: false, reviewAfterDays: undefined };
  }
  return draft;
}

/** 這份草稿有沒有這個語意欄位。用來分辨「值是 null」與「欄位不存在」。 */
function pathExistsOn(draft: TaskDraft, path: AllowedAiFieldPath): boolean {
  switch (path) {
    case 'title':
    case 'completionDescription':
      return true;
    case 'taskDetails':
    case 'notes':
      return isOneTimeDraft(draft);
    case 'scopeDescription':
    case 'responsibilityItems':
      return isFamilyRoleDraft(draft);
    case 'sessionMinutes':
      return isGrowthPlanDraft(draft) || isRecurringDraft(draft) || isOneTimeDraft(draft);
    case 'durationDays':
      return isGrowthPlanDraft(draft) || isShortSupportDraft(draft) || isFamilyRoleDraft(draft);
    case 'weeklyFrequency':
      return isRecurringDraft(draft) && draft.scheduleMode === 'weekly_frequency';
    case 'reviewAfterDays':
      return (
        isGrowthPlanDraft(draft) ||
        isShortSupportDraft(draft) ||
        isFamilyRoleDraft(draft) ||
        isRecurringDraft(draft)
      );
    case 'supportSteps':
      return isShortSupportDraft(draft);
    case 'milestones':
      return isGrowthPlanDraft(draft);
  }
}
