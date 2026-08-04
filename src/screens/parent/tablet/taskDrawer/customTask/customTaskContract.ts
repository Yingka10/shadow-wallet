// Shadow Wallet · Parent Tablet — 自訂任務的 domain 契約
//
// ─────────────────────────────────────────────────────────────────────────
// 這個模組回答一個問題：**「自己建立任務」在型別上是什麼？**
//
// 答案是：它是一個**入口**，不是一種任務。
//
// 預設抽屜解決的是「從常用任務開始」。但 26 個家族 36 個版本不可能涵蓋
// 每個家庭的情境 —— 有人想讓孩子練習照顧倉鼠，有人家裡在準備搬家。
// 那些任務必須進得來，而且進來之後要和預設任務**完全一樣**：
// 同一份 TaskDraft、同五種 editor、同一套規則檢查、同一個建立命令。
//
// 所以這裡沒有 CustomTaskDraft，也沒有 CustomTaskEditor。
// 有的只是「怎麼從零走到一份合法的 TaskDraft」。
//
// ⚠️ 本輪只有 domain 與純函式。沒有畫面、沒有 Supabase、沒有 AI 呼叫。
// ─────────────────────────────────────────────────────────────────────────

import type { PurposeCategory } from '../taskCatalog';
import type { TaskDraftOrigin } from '../taskDraft';

// ---------------------------------------------------------------------------
// 建立來源
// ---------------------------------------------------------------------------
//
// **與 TaskSource 是兩件不同的事，不可混用。**
//
//   TaskSource（既有）         = 這件事**是誰提出的**：parent / child / co_created / system
//   TaskCreationSource（這裡） = 家長**從哪個入口**建立的：preset / parent_custom
//
// 一個 parent_custom 建立的任務，TaskSource 完全可以是 co_created ——
// 家長打開自訂入口，但內容是親子討論出來的。把兩者合成一欄會讓
// 「誰的主意」與「從哪個按鈕進來」永遠分不開，而 C 類任務的政策
// （來源須為孩子提出或親子協商）正好依賴前者。

/** 第一版真的做的兩個入口。 */
export type EnabledTaskCreationSource = 'preset' | 'parent_custom';

/**
 * 已經想好、但這一輪**不實作**的入口。
 *
 * 寫下來不是為了先蓋房子，是為了讓 `TaskCreationSource` 的形狀從一開始
 * 就容得下它們 —— 一個只有兩個值的 union 之後要擴充，
 * 會連帶動到每一個 switch，而那時候它們已經散在十幾個檔案裡。
 */
export type PlannedTaskCreationSource =
  | 'child_proposal'
  | 'co_created'
  | 'wish_plan'
  | 'copied_task'
  | 'system_suggestion';

export type TaskCreationSource = EnabledTaskCreationSource | PlannedTaskCreationSource;

export const ENABLED_TASK_CREATION_SOURCES: readonly EnabledTaskCreationSource[] = [
  'preset',
  'parent_custom',
] as const;

export const PLANNED_TASK_CREATION_SOURCES: readonly PlannedTaskCreationSource[] = [
  'child_proposal',
  'co_created',
  'wish_plan',
  'copied_task',
  'system_suggestion',
] as const;

export function isEnabledTaskCreationSource(
  source: TaskCreationSource,
): source is EnabledTaskCreationSource {
  return (ENABLED_TASK_CREATION_SOURCES as readonly string[]).includes(source);
}

/** 草稿來源 → 建立來源。 */
export function creationSourceOf(origin: TaskDraftOrigin): EnabledTaskCreationSource {
  return origin.kind === 'preset' ? 'preset' : 'parent_custom';
}

// ---------------------------------------------------------------------------
// Step 2：這件事主要是為了什麼
// ---------------------------------------------------------------------------
//
// **畫面上永遠不出現 A／B／C／D。**
//
// 那四個代號是我們內部的分類語言，對家長沒有意義，而且會誘導出
// 「A 是不是比較低階」這種完全不存在的階序。家長只需要回答一個
// 生活化的問題，對應由這張表做。

export type CustomTaskPurposeChoice =
  | 'take_care_of_self'
  | 'join_family_life'
  | 'own_challenge'
  | 'learn_or_practise';

export type PurposeChoiceDescriptor = {
  choice: CustomTaskPurposeChoice;
  /** 家長看到的字。 */
  label: string;
  /** 一句話說明，避免家長只憑四個字猜。 */
  description: string;
  /** 內部分類。**不顯示。** */
  purposeCategory: PurposeCategory;
};

export const CUSTOM_TASK_PURPOSE_CHOICES: readonly PurposeChoiceDescriptor[] = [
  {
    choice: 'take_care_of_self',
    label: '練習照顧自己',
    description: '起床、盥洗、整理自己的東西這類自我照顧的事。',
    purposeCategory: 'life_routine',
  },
  {
    choice: 'join_family_life',
    label: '參與家庭生活',
    description: '一起維持這個家的運作，讓孩子成為家裡的一份子。',
    purposeCategory: 'family_participation',
  },
  {
    choice: 'own_challenge',
    label: '孩子自己選的挑戰',
    description: '孩子自己想試試看、或你們一起討論後決定的事。',
    purposeCategory: 'autonomous_challenge',
  },
  {
    choice: 'learn_or_practise',
    label: '學習或技能練習',
    description: '需要持續投入才會進步的事，例如樂器、運動、閱讀。',
    purposeCategory: 'learning_skill',
  },
] as const;

export function purposeCategoryOf(choice: CustomTaskPurposeChoice): PurposeCategory {
  const found = CUSTOM_TASK_PURPOSE_CHOICES.find((c) => c.choice === choice);
  // union 已經窮舉，找不到代表上面那張表漏了一列 —— 那是寫錯，不是執行期狀況。
  if (!found) throw new Error(`未定義的任務目的選項：${choice}`);
  return found.purposeCategory;
}

// ---------------------------------------------------------------------------
// Step 3：預計怎麼進行
// ---------------------------------------------------------------------------
//
// 同樣不顯示 durationType 的內部值。「持續一段時間」對家長來說是一句話，
// 對系統來說是 long_term ＋ 三種 planMode 之一 —— 而選哪一種
// **不該由家長決定**，那是政策問題（見 customTaskRouting.ts）。

export type CustomTaskDurationChoice = 'once' | 'repeating' | 'for_a_while';

export type DurationChoiceDescriptor = {
  choice: CustomTaskDurationChoice;
  label: string;
  description: string;
};

export const CUSTOM_TASK_DURATION_CHOICES: readonly DurationChoiceDescriptor[] = [
  {
    choice: 'once',
    label: '做一次就完成',
    description: '這次做完就結束，不會再出現。',
  },
  {
    choice: 'repeating',
    label: '固定重複',
    description: '每週固定進行，沒有預定的結束日。',
  },
  {
    choice: 'for_a_while',
    label: '持續一段時間',
    description: '有明確的期間，中間會一起回顧、期滿再決定要不要繼續。',
  },
] as const;

// ---------------------------------------------------------------------------
// 回饋支持意圖
// ---------------------------------------------------------------------------
//
// 這是這一輪產品政策修訂的核心。
//
// 舊規則：家庭參與 ＋ 成長幣 = 非法，硬擋。
// 新規則：家庭參與**預設**不以成長幣標價，但兩種情況例外 ——
//         孩子在起步階段需要外在支持，或這個家庭本來就有明確的有償約定。
//
// 為什麼要一個明確的 intent 欄位，而不是「選了 coin_eligible 就算了」：
//
//   一筆「家庭參與 ＋ 成長幣」的任務，半年後回頭看會有兩種完全不同的讀法。
//   一種是「當時孩子需要一點外在動力，我們說好三週後再看」；
//   另一種是「我們家的家事本來就有零用錢」。
//   前者應該被提醒回顧，後者不該 —— 對後者跳出「要不要降低外在獎勵」
//   是在指導一個家庭怎麼過日子，而那不是 GrowBook 的位置。
//
//   沒有這個欄位的話，兩者在資料上長得一模一樣，系統只能猜。

export type RewardSupportIntent =
  /** 預設：不使用成長幣，以貢獻紀錄與週報被看見。 */
  | 'default'
  /** 孩子目前需要外在回饋協助開始或建立節奏。應有回顧時間。 */
  | 'temporary_startup_support'
  /** 這個家庭本來就有零用錢／有償工作制度。GrowBook 只是記錄。 */
  | 'family_defined_agreement';

export type RewardSupportIntentDescriptor = {
  intent: RewardSupportIntent;
  label: string;
  description: string;
  /** 要不要問「多久之後一起看看」。 */
  requiresReviewTiming: boolean;
  /**
   * 之後要不要提醒「可以考慮降低或退出」。
   *
   * ⚠️ 只有暫時性支持為 true。家庭自訂約定**不提醒退場** ——
   * 提醒它等於在說那個制度是需要被修正的，而那是家庭自己的決定。
   */
  suggestsStepDown: boolean;
};

export const REWARD_SUPPORT_INTENTS: readonly RewardSupportIntentDescriptor[] = [
  {
    intent: 'default',
    label: '不使用成長幣',
    description: '以家庭貢獻紀錄與週報被看見。',
    requiresReviewTiming: false,
    suggestsStepDown: false,
  },
  {
    intent: 'temporary_startup_support',
    label: '暫時的起步支持',
    description:
      '孩子現在需要一點外在動力來開始。設一個回顧時間，到時候再一起看要不要調整。',
    requiresReviewTiming: true,
    // 「提醒可以降低」不等於「一定要取消」。家長看完仍然可以維持原樣。
    suggestsStepDown: true,
  },
  {
    intent: 'family_defined_agreement',
    label: '我們家本來就有的約定',
    description:
      '你們家已經有零用錢或有償工作的做法。GrowBook 會照實記錄，不會把它當成建議做法。',
    requiresReviewTiming: false,
    suggestsStepDown: false,
  },
] as const;

export function rewardSupportIntentDescriptor(
  intent: RewardSupportIntent,
): RewardSupportIntentDescriptor {
  const found = REWARD_SUPPORT_INTENTS.find((i) => i.intent === intent);
  if (!found) throw new Error(`未定義的支持意圖：${intent}`);
  return found;
}

// ---------------------------------------------------------------------------
// Step 1：想做什麼
// ---------------------------------------------------------------------------

export type CustomTaskIntake = {
  /** 任務暫定名稱。之後可以在 editor 改。 */
  title: string;
  /**
   * 家長原始期待。
   *
   * 和預設任務一樣，這一段**任何後續建議都不得覆蓋** ——
   * AI 可以建議完成標準怎麼寫得更清楚，但不可以改寫家長想要什麼。
   */
  originalExpectation: string;
  purposeChoice: CustomTaskPurposeChoice;
  durationChoice: CustomTaskDurationChoice;
};

// ---------------------------------------------------------------------------
// 尚未接上 production path 的部分
// ---------------------------------------------------------------------------

/**
 * 第九階段 A 記錄的命令缺口 —— **第九階段 B 已經補上**。
 *
 * 當時卡住的四件事：
 *   1. command.preset 必填                        → 改為 optional
 *   2. metadata.createdFromPreset 的型別是字面量 true → 放寬成 boolean
 *   3. create_parent_task_v1 寫死 created_from_preset  → 由 creationSource 推導
 *   4. 稽核事件的 event_type 寫死                    → 依來源選 event_type
 *
 * 保留這個常數而不是刪掉：它是「這件事已經處理過」的落點。
 * 下一個看到 A 階段文件的人會來這裡確認現況，
 * 而一個空無一物的檔案回答不了「後來呢」。
 *
 * ⚠️ 補上的是**持久化**，不是 UI。自訂入口的畫面仍然沒有做（第九階段 C）。
 */
export const CUSTOM_TASK_COMMAND_GAP = {
  blocked: false,
  resolvedIn: '20260804000000_parent_custom_task_persistence',
  resolved: [
    'CreateParentTaskCommandBase.preset 改為 optional',
    'metadata.createdFromPreset 放寬成 boolean，且由 RPC 依來源推導',
    'create_parent_task_v1 寫入 creation_source 並推導 created_from_preset',
    "自訂任務的稽核事件使用 created_parent_custom",
  ],
  /** 仍然沒有做的事。 */
  remaining: ['自訂入口的 UI 與 Step 表單（第九階段 C）'],
} as const;
