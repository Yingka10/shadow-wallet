// Shadow Wallet · Parent Tablet — deterministic 規則檢查
//
// 這裡產生的東西 **AI 一律不得產生**。
//
// 理由很具體：blocking finding 會擋住家長建立任務。如果一個會幻覺的東西
// 能產生 blocking，某天它心情不好就會擋住一個完全正常的任務，
// 而家長沒有任何辦法繞過去（blocking 依定義不可略過）。
//
// 反過來也一樣重要：如果規則能被當成建議略過，「家庭參與不發成長幣」
// 就不再是政策，只是一個提示。那句話是對孩子的承諾。

import {
  isFamilyRoleDraft,
  isGrowthPlanDraft,
  isOneTimeDraft,
  isRecurringDraft,
  isShortSupportDraft,
  draftEstimatedMinutes,
  type TaskDraft,
} from '../taskDraft';
import type { TaskRuleFinding } from './types';

/** 每次約多久算「偏長」。超過只是提醒，不擋建立。 */
const LONG_SESSION_MINUTES = 60;
/** 第一次回顧最晚幾天。太晚等於試行期結束才第一次談。 */
const LATE_REVIEW_DAYS = 28;

function finding(
  f: Omit<TaskRuleFinding, 'id'> & { id?: string },
): TaskRuleFinding {
  return { id: f.id ?? `${f.source}:${f.code}`, ...f };
}

/**
 * 對一份草稿跑完所有政策檢查。
 *
 * 純函式：同樣的草稿一定得到同樣的結果，沒有網路、沒有隨機、沒有時間依賴。
 * 這是它能被信任到「可以擋住建立」的唯一理由。
 */
export function collectTaskRuleFindings(draft: TaskDraft): TaskRuleFinding[] {
  const findings: TaskRuleFinding[] = [];

  // ── 回饋政策 ──────────────────────────────────────────────────────────
  if (draft.purposeCategory === 'family_participation' && draft.rewardPolicy === 'coin_eligible') {
    findings.push(finding({
      severity: 'blocking',
      code: 'FAMILY_PARTICIPATION_NOT_COIN_ELIGIBLE',
      fieldPath: 'rewardPolicy',
      source: 'reward_policy',
      message: '家庭參與的任務不發成長幣。換一種回饋方式，或把這件事改成其他類型的任務。',
    }));
  }

  if (draft.rewardPolicy === 'time_saving_eligible') {
    findings.push(finding({
      severity: 'blocking',
      code: 'TIME_SAVING_NOT_ENABLED',
      fieldPath: 'rewardPolicy',
      source: 'reward_policy',
      message: '時間儲蓄的建立與完成流程尚未啟用，目前無法選這一種回饋方式。',
    }));
  }

  // ── 各 editor 的必要內容 ───────────────────────────────────────────────
  if (isFamilyRoleDraft(draft)) {
    const filled = draft.responsibilityItems.filter(item => item.text.trim().length > 0);
    if (filled.length === 0) {
      findings.push(finding({
        severity: 'blocking',
        code: 'FAMILY_ROLE_NEEDS_RESPONSIBILITIES',
        fieldPath: 'responsibilityItems',
        source: 'task_policy',
        message: '家庭角色需要至少一項負責內容 —— 沒有寫下來，孩子無從知道自己要做什麼。',
      }));
    }
  }

  // ── 提醒（可以建立，但要說清楚）────────────────────────────────────────
  const minutes = draftEstimatedMinutes(draft);
  if (minutes !== undefined && minutes > LONG_SESSION_MINUTES) {
    findings.push(finding({
      severity: 'warning',
      code: 'LONG_SESSION',
      fieldPath: 'sessionMinutes',
      source: 'task_policy',
      message: `每次約 ${minutes} 分鐘，對這個年齡段偏長，容易變成撐完而不是做完。`,
    }));
  }

  const reviewDays = firstReviewDaysOf(draft);
  if (reviewDays !== undefined && reviewDays > LATE_REVIEW_DAYS) {
    findings.push(finding({
      severity: 'warning',
      code: 'LATE_FIRST_REVIEW',
      fieldPath: 'reviewAfterDays',
      source: 'task_policy',
      message: `第一次回顧排在第 ${reviewDays} 天，中間如果不順就沒有調整的機會。`,
    }));
  }

  return findings;
}

function firstReviewDaysOf(draft: TaskDraft): number | undefined {
  if (isGrowthPlanDraft(draft) || isShortSupportDraft(draft) || isFamilyRoleDraft(draft)) {
    return draft.firstReviewAfterDays;
  }
  if (isRecurringDraft(draft)) {
    return draft.reviewEnabled ? draft.reviewAfterDays : undefined;
  }
  if (isOneTimeDraft(draft)) return undefined;
  return undefined;
}

/** 有沒有東西擋著建立。只看 blocking —— warning 不擋。 */
export function hasBlockingFinding(findings: readonly TaskRuleFinding[]): boolean {
  return findings.some(f => f.severity === 'blocking');
}

export function blockingFindings(findings: readonly TaskRuleFinding[]): TaskRuleFinding[] {
  return findings.filter(f => f.severity === 'blocking');
}

export function warningFindings(findings: readonly TaskRuleFinding[]): TaskRuleFinding[] {
  return findings.filter(f => f.severity === 'warning');
}
