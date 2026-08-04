// Shadow Wallet · Parent Tablet — 目的 × 期間 → editor 路由
//
// ─────────────────────────────────────────────────────────────────────────
// 家長回答兩個生活化的問題，系統決定要開哪一支 editor。
//
// **這件事不交給 Gemini。**
//
// 理由不是「AI 會做錯」，是這個決定會直接改變任務的政策後果：
// 選到 family_role 就會要求責任清單與期滿回顧，選到 short_support 就會
// 鎖成 progress_only 並要求穩定退場。一個會幻覺的東西不該有這種權力，
// 而且家長沒有辦法檢查它為什麼這樣選 —— 純函式可以，它每次都一樣，
// 而且 rationaleCode 說得出理由。
//
// 這張表是**預設路由，不是哲學真理**。needs_confirmation 的存在就是為了
// 這件事：系統有意見，但家長知道自己家的情況，最後由家長決定。
// ─────────────────────────────────────────────────────────────────────────

import type { PurposeCategory } from '../taskCatalog';
import type { TaskEditorKind } from '../taskDraft';
import type { CustomTaskDurationChoice } from './customTaskContract';

/**
 * 為什麼是這個 editor。
 *
 * 用代碼而不是句子：同一個理由在確認畫面、log 與測試裡各需要不同的呈現，
 * 而句子改一個字就會讓測試斷言失效。文案在 ROUTING_RATIONALE_COPY。
 */
export type RoutingRationaleCode =
  | 'ONE_TIME_ALWAYS_ONE_TIME'
  | 'ROUTINE_SHOULD_NOT_BE_PERMANENT'
  | 'ROUTINE_TIME_BOXED_SUPPORT'
  | 'FAMILY_REPEATING_IS_RECURRING'
  | 'FAMILY_SUSTAINED_IS_ROLE'
  | 'SUSTAINED_EFFORT_IS_GROWTH_PLAN'
  | 'REPEATING_PRACTICE_IS_RECURRING';

export type CustomTaskEditorResolution =
  | {
      status: 'resolved';
      editorKind: TaskEditorKind;
      rationaleCode: RoutingRationaleCode;
    }
  | {
      status: 'needs_confirmation';
      suggestedEditorKind: TaskEditorKind;
      rationaleCode: RoutingRationaleCode;
    }
  | {
      status: 'unsupported';
      reasonCode: string;
    };

export type ResolveCustomTaskEditorInput = {
  purposeCategory: PurposeCategory;
  durationChoice: CustomTaskDurationChoice;
};

/**
 * 目的 × 期間 → 要開哪一支 editor。
 *
 * 純函式。不呼叫 AI、不讀 catalog、不需要 preset id、不碰網路。
 */
export function resolveCustomTaskEditor(
  input: ResolveCustomTaskEditorInput,
): CustomTaskEditorResolution {
  const { purposeCategory, durationChoice } = input;

  // 單次永遠是單次。四種目的都一樣 —— 「這次做完就結束」在政策上
  // 沒有任何分歧，不需要為它多開四個分支。
  if (durationChoice === 'once') {
    return {
      status: 'resolved',
      editorKind: 'one_time',
      rationaleCode: 'ONE_TIME_ALWAYS_ONE_TIME',
    };
  }

  switch (purposeCategory) {
    // ── A 生活常規 ────────────────────────────────────────────────────────
    //
    // 這一格是整張表唯一需要家長確認的地方，而且是刻意的。
    //
    // 家長想建立「每天鋪床」這種永久性的生活常規任務時，系統的立場是：
    // 生活自理的目標是變成不用管理的事，不是變成一個永遠掛在清單上的項目。
    // 所以建議改成有結束日的短期支援 —— 練起來之後就退場。
    //
    // 但這只是建議。有些家庭就是需要一段長時間的結構，
    // 而 needs_confirmation 讓家長看完理由後仍然可以自己決定。
    case 'life_routine':
      if (durationChoice === 'repeating') {
        return {
          status: 'needs_confirmation',
          suggestedEditorKind: 'short_support',
          rationaleCode: 'ROUTINE_SHOULD_NOT_BE_PERMANENT',
        };
      }
      return {
        status: 'resolved',
        editorKind: 'short_support',
        rationaleCode: 'ROUTINE_TIME_BOXED_SUPPORT',
      };

    // ── B 家庭參與 ────────────────────────────────────────────────────────
    //
    // 「持續一段時間」的家庭參與就是家庭角色：孩子在一段期間內
    // 承擔一個清楚的角色，期滿一起回顧再決定。
    case 'family_participation':
      if (durationChoice === 'repeating') {
        return {
          status: 'resolved',
          editorKind: 'recurring',
          rationaleCode: 'FAMILY_REPEATING_IS_RECURRING',
        };
      }
      return {
        status: 'resolved',
        editorKind: 'family_role',
        rationaleCode: 'FAMILY_SUSTAINED_IS_ROLE',
      };

    // ── C 自主挑戰 / D 學習與技能 ─────────────────────────────────────────
    //
    // 這兩類的路由完全相同：持續投入才會進步的事需要里程碑與中途回顧，
    // 那是成長計畫。合併成一個分支而不是複製兩份 —— 兩者若哪天要分開，
    // 分開的理由應該寫在這裡，而不是靠兩段長得一樣的程式碼各自演化。
    case 'autonomous_challenge':
    case 'learning_skill':
      if (durationChoice === 'repeating') {
        return {
          status: 'resolved',
          editorKind: 'recurring',
          rationaleCode: 'REPEATING_PRACTICE_IS_RECURRING',
        };
      }
      return {
        status: 'resolved',
        editorKind: 'growth_plan',
        rationaleCode: 'SUSTAINED_EFFORT_IS_GROWTH_PLAN',
      };
  }
}

/**
 * 給家長看的理由。
 *
 * 只有 needs_confirmation 真的會顯示；其餘留著是為了 log 與
 * 「為什麼是這個編輯器」這種說明區塊，不必為它再寫一份對照表。
 */
export const ROUTING_RATIONALE_COPY: Record<RoutingRationaleCode, string> = {
  ONE_TIME_ALWAYS_ONE_TIME: '這次做完就結束，安排一個日期就好。',
  ROUTINE_SHOULD_NOT_BE_PERMANENT:
    '生活自理的目標是變成不用提醒的事。建議先設一段期間，練起來之後就結束，'
    + '而不是讓它一直留在任務清單上。',
  ROUTINE_TIME_BOXED_SUPPORT: '設一段期間集中練習，穩定之後就結束。',
  FAMILY_REPEATING_IS_RECURRING: '固定重複的家庭參與，用週期任務安排。',
  FAMILY_SUSTAINED_IS_ROLE:
    '持續一段時間的家庭參與，是孩子在家裡承擔的一個角色。期滿會一起回顧再決定。',
  SUSTAINED_EFFORT_IS_GROWTH_PLAN: '需要持續投入的事，用成長計畫安排里程碑與回顧。',
  REPEATING_PRACTICE_IS_RECURRING: '固定重複的練習，用週期任務安排。',
};

/**
 * 這個 editor 的完成方式。
 *
 * 預設任務的 completionPolicy 來自 catalog 的 variant；自訂任務沒有 variant，
 * 所以要從 editorKind 推。**這些值不是自由選的** ——
 * `create_parent_task_v1` 的政策 guard 會逐一核對（家庭角色必須
 * review_and_continue、短期支援必須 stabilize_and_exit、單次必須 complete_once）。
 * 推錯的話會在 RPC 被擋下，而不是安靜地存進去。
 */
export function completionPolicyForEditor(
  editorKind: TaskEditorKind,
): 'complete_once' | 'ongoing' | 'plan_complete' | 'review_and_continue' | 'stabilize_and_exit' {
  switch (editorKind) {
    case 'one_time':
      return 'complete_once';
    case 'recurring':
      return 'ongoing';
    case 'growth_plan':
      return 'plan_complete';
    case 'family_role':
      return 'review_and_continue';
    case 'short_support':
      return 'stabilize_and_exit';
  }
}

/** editorKind → durationType。長期不是新分類，是第三種執行形式。 */
export function durationTypeForEditor(
  editorKind: TaskEditorKind,
): 'one_time' | 'recurring' | 'long_term' {
  switch (editorKind) {
    case 'one_time':
      return 'one_time';
    case 'recurring':
      return 'recurring';
    case 'growth_plan':
    case 'family_role':
    case 'short_support':
      return 'long_term';
  }
}

/** editorKind → planMode。只有長期形式有值。 */
export function planModeForEditor(
  editorKind: TaskEditorKind,
): 'growth_plan' | 'family_role' | 'short_support' | undefined {
  switch (editorKind) {
    case 'growth_plan':
      return 'growth_plan';
    case 'family_role':
      return 'family_role';
    case 'short_support':
      return 'short_support';
    case 'one_time':
    case 'recurring':
      return undefined;
  }
}
