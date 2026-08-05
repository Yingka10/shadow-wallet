// Shadow Wallet · Parent Tablet — 送給 AI 的 input
//
// 這一層的工作是**把東西拿掉**。
//
// 草稿與 variant 上有很多欄位，其中大部分對「這個任務寫得清不清楚」
// 毫無幫助，但對「這是誰家的哪個孩子」很有幫助。孩子的暱稱、family id、
// child id、錢包餘額 —— 一項都不需要送出去，所以一項都不送。
//
// 年齡只送分級（`6-9`）而不是生日：判斷「20 分鐘對這個年紀會不會太長」
// 需要的是級距，不是出生年月日。
//
// 這個檔案是白名單式的：input 的每一個欄位都在下面被明確寫出來一次。
// 不用 spread、不用 pick(draft, [...])，因為那些寫法會在草稿新增欄位時
// 默默把新欄位一起送出去。

import {
  draftEstimatedMinutes,
  isFamilyRoleDraft,
  isGrowthPlanDraft,
  isOneTimeDraft,
  isRecurringDraft,
  isShortSupportDraft,
  WEEKDAYS,
  type TaskDraft,
} from '../taskDraft';
import type { TaskPresetVariant } from '../taskCatalog';
// 只取一支純函式（editorKind → completionPolicy）。刻意不從 customTask/index
// 進來 —— 那會連帶拉進畫面元件，而這一層不需要認識 React。
import { completionPolicyForEditor } from '../customTask/customTaskRouting';
import { IMMUTABLE_FIELDS, type TaskAiRecommendationInput } from './types';

export type BuildTaskAiInputArgs = {
  draft: TaskDraft;
  /**
   * preset 的版本。**自訂任務沒有版本，這裡是 undefined。**
   *
   * 它只被用來取 completionPolicy；自訂任務改由 editorKind 推導，
   * 與 mapTaskDraftToCommand 走同一支函式。
   * 為了補這一個欄位而捏一個假的 variant 出來，等於把 preset 的
   * 選項組、安全提示與 catalog 版本一起送進模型 —— 那些都不該出去。
   */
  variant?: TaskPresetVariant;
  /** 分級字串，例如 `6-9`。**不要傳生日。** */
  ageGroup: string;
  /**
   * 孩子的暱稱 —— **傳進來是為了把它拿掉**，不是為了送出去。
   *
   * `createTaskDraft` 的預設標題與期待句會帶上名字（「承恩的餐桌任務」），
   * 所以名字會跟著 title 一起流出去。這裡把它換成「孩子」：
   * AI 仍然讀得懂那句話，但它不會知道是誰。
   *
   * 省略時不做遮蔽 —— 呼叫端沒有名字可給的情況（例如測試）也應該能用。
   */
  childNickname?: string;
};

export function buildTaskAiInput({
  draft,
  variant,
  ageGroup,
  childNickname,
}: BuildTaskAiInputArgs): TaskAiRecommendationInput {
  const clean = (text: string): string => redactName(text, childNickname);
  const cleanList = (items: string[] | undefined): string[] | undefined =>
    items?.map(clean);

  return {
    schemaVersion: 1,

    childContext: {
      ageGroup,
    },

    taskContext: {
      editorKind: draft.editorKind,
      purposeCategory: draft.purposeCategory,
      durationType: draft.durationType,
      source: draft.source,
      rewardPolicy: draft.rewardPolicy,
      completionPolicy: variant?.completionPolicy ?? completionPolicyForEditor(draft.editorKind),
    },

    parentIntent: {
      // 送出去是為了讓建議對得上家長想要什麼，**不是**讓 AI 改寫它。
      // originalExpectation 在 IMMUTABLE_FIELDS 裡。
      originalExpectation: clean(draft.originalExpectation),
    },

    currentDraft: {
      title: clean(draft.title),
      completionDescription: clean(completionDescriptionOf(draft)),
      ...optionalNumber('estimatedMinutes', draftEstimatedMinutes(draft)),
      scheduleSummary: scheduleSummaryOf(draft),
      ...optionalNumber('durationDays', durationDaysOf(draft)),
      ...optionalNumber('reviewAfterDays', reviewAfterDaysOf(draft)),
      selectedOptions: draft.selectedOptions,
      ...optionalList('supportSteps', cleanList(supportStepsOf(draft))),
      ...optionalList('milestones', cleanList(milestonesOf(draft))),
      ...optionalList('responsibilities', cleanList(responsibilitiesOf(draft))),
    },

    immutablePolicies: {
      purposeCategory: draft.purposeCategory,
      rewardPolicy: draft.rewardPolicy,
      blockedFields: [...IMMUTABLE_FIELDS],
    },
  };
}

/**
 * 把孩子的名字從自由文字裡拿掉。
 *
 * 這不是象徵性的：預設標題就長成「承恩的餐桌任務」，不遮的話名字會
 * 跟著每一次請求送出去。換成「孩子」而不是刪掉，是為了讓句子仍然讀得通 ——
 * 「的餐桌任務」會讓 AI 以為標題殘缺，然後建議把它「補完整」。
 */
function redactName(text: string, nickname?: string): string {
  const name = nickname?.trim();
  if (!name) return text;
  return text.split(name).join('孩子');
}

// ---------------------------------------------------------------------------
// 每一種 editor 把同一件事叫成不同名字，這裡統一
// ---------------------------------------------------------------------------

function completionDescriptionOf(draft: TaskDraft): string {
  if (isGrowthPlanDraft(draft)) return draft.completionDescription;
  if (isShortSupportDraft(draft)) return draft.successDescription;
  if (isRecurringDraft(draft)) return draft.completionDescription;
  if (isFamilyRoleDraft(draft)) return draft.contributionDescription;
  if (isOneTimeDraft(draft)) return draft.completionDescription;
  return '';
}

function durationDaysOf(draft: TaskDraft): number | undefined {
  if (isGrowthPlanDraft(draft) || isShortSupportDraft(draft) || isFamilyRoleDraft(draft)) {
    return draft.durationDays;
  }
  return undefined;
}

function reviewAfterDaysOf(draft: TaskDraft): number | undefined {
  if (isGrowthPlanDraft(draft) || isShortSupportDraft(draft) || isFamilyRoleDraft(draft)) {
    return draft.firstReviewAfterDays;
  }
  if (isRecurringDraft(draft)) {
    return draft.reviewEnabled ? draft.reviewAfterDays : undefined;
  }
  return undefined;
}

function supportStepsOf(draft: TaskDraft): string[] | undefined {
  if (!isShortSupportDraft(draft)) return undefined;
  return draft.supportSteps.filter(s => s.enabled).map(s => s.text).filter(t => t.length > 0);
}

function milestonesOf(draft: TaskDraft): string[] | undefined {
  if (!isGrowthPlanDraft(draft)) return undefined;
  return draft.milestones.map(m => m.title).filter(t => t.length > 0);
}

function responsibilitiesOf(draft: TaskDraft): string[] | undefined {
  if (!isFamilyRoleDraft(draft)) return undefined;
  return draft.responsibilityItems.map(r => r.text).filter(t => t.length > 0);
}

/**
 * 排程摘要 —— 一句人話，而不是把 recurrenceDays 陣列丟出去。
 *
 * AI 需要知道的是「一週三天、放學後」這種節奏，不是 `[1,3,5]`。
 * 給它原始陣列只會讓它猜 0 是週日還是週一。
 */
function scheduleSummaryOf(draft: TaskDraft): string {
  if (isOneTimeDraft(draft)) return '單次，完成一次就結束';

  if (isRecurringDraft(draft)) {
    if (draft.scheduleMode === 'weekly_frequency') {
      return draft.weeklyFrequency ? `每週 ${draft.weeklyFrequency} 次，日期彈性` : '每週固定次數';
    }
    return `固定在${weekdayText(draft.recurrenceDays)}`;
  }

  if (isGrowthPlanDraft(draft) || isShortSupportDraft(draft) || isFamilyRoleDraft(draft)) {
    return `${draft.durationDays} 天期間內，固定在${weekdayText(draft.recurrenceDays)}`;
  }
  return '';
}

function weekdayText(days: readonly number[]): string {
  if (days.length === 0) return '尚未選定的日子';
  if (days.length === 7) return '每天';
  return WEEKDAYS.filter(d => days.includes(d.value)).map(d => `週${d.label}`).join('、');
}

// ---------------------------------------------------------------------------
// 可選欄位：沒有值就整個不出現，而不是送一個 undefined
// ---------------------------------------------------------------------------

function optionalNumber<K extends string>(
  key: K,
  value: number | undefined,
): Record<K, number> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, number>);
}

function optionalList<K extends string>(
  key: K,
  value: string[] | undefined,
): Record<K, string[]> | Record<string, never> {
  return value === undefined || value.length === 0 ? {} : ({ [key]: value } as Record<K, string[]>);
}
