// Shadow Wallet · Parent Tablet — 自訂任務流程的正式文案
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支只有字串與對照表，沒有邏輯。
//
// 為什麼集中：同一句話會同時出現在畫面、摘要卡與測試斷言裡。散在三個
// component 各寫一份的話，改文案要改三次，而漏掉的那一次沒有人會發現 ——
// 直到有人截圖回報「這裡跟那裡寫的不一樣」。
//
// **畫面上永遠不出現 A／B／C／D、purposeCategory、editorKind、
// durationChoice 或任何 reason code。** 那些是內部語言。
// 已由測試釘住（customFlowCopy.test.ts）。
// ─────────────────────────────────────────────────────────────────────────

import type { IconKey, PurposeCategory, RewardPolicy } from '../taskCatalog';
import type { TaskEditorKind } from '../taskDraft';
import type { CustomTaskDurationChoice, CustomTaskPurposeChoice } from './customTaskContract';
import type { RewardOptionPresentation } from './customTaskRewardOptions';

// ---------------------------------------------------------------------------
// 起點頁
// ---------------------------------------------------------------------------

export const ENTRY_COPY = {
  title: '新增任務',
  subtitle: '選擇一個開始方式，之後都可以再調整。',
  preset: {
    label: '從常用任務開始',
    description: '選擇整理好的常見情境，再依家庭需要調整。',
    iconKey: 'shelf' as IconKey,
  },
  parentCustom: {
    label: '自己建立任務',
    description: '寫下你希望孩子投入的事情，再一起整理安排與回饋。',
    iconKey: 'pencil' as IconKey,
  },
} as const;

// ---------------------------------------------------------------------------
// 三個基本設定步驟
// ---------------------------------------------------------------------------

/** 三頁共用的標題。副標各自不同，因為它們問的是不同的事。 */
export const CUSTOM_HEADER_TITLE = '建立自訂任務';

/** 進入 editor 之後的階段文字。刻意不接續成「步驟 4／7」—— 見 CUSTOM_TASK_UI_FLOW.md。 */
export const CUSTOM_EDITOR_STAGE_LABEL = '詳細設定';

export const BASICS_TOTAL_STEPS = 3;

export const STEP1_COPY = {
  subtitle: '先寫下你想安排的內容，再決定怎麼進行。',
  progress: '基本設定 1／3｜想做什麼',
  sectionTitle: '這次想安排什麼？',
  titleLabel: '任務名稱',
  titlePlaceholder: '例如：每天閱讀、餐後整理書桌',
  titleHelper: '先用容易辨認的名稱即可，之後還可以調整。',
  titleRequiredError: '請填寫任務名稱',
  expectationSectionTitle: '你希望孩子慢慢做到什麼？',
  expectationLabel: '你的期待（選填）',
  expectationHelper:
    '先寫下真正希望改善、開始或持續的事情；系統不會直接覆蓋這段話。',
  /**
   * 三個方向的短提示。
   *
   * 不是可以點的範例句 —— 那會變成「幫家長寫好」，而這一欄的整個用途
   * 就是保留家長自己的說法。
   */
  expectationHints: [
    '開始：孩子現在還沒有做，但希望慢慢開始',
    '改善：目前會做，但常卡住或需要提醒',
    '持續：已經開始，希望慢慢穩定下來',
  ],
} as const;

export const STEP2_COPY = {
  subtitle: '先確認這件事主要想培養什麼，再決定後續怎麼安排。',
  progress: '基本設定 2／3｜這件事主要是為了什麼？',
  summaryTitle: '這次想建立的內容',
  summaryTitleLabel: '任務名稱',
  summaryExpectationLabel: '你的期待',
  question: '這件事主要是為了什麼？',
  helper: '選擇你最希望孩子從這件事中慢慢學會的部分，之後仍可以返回調整。',
  /** 沒選的時候，下一步為什麼不能按。 */
  unselectedHint: '請先選一個方向',
} as const;

export type PurposeOptionCopy = {
  choice: CustomTaskPurposeChoice;
  label: string;
  description: string;
  /** 三個生活化例子，用頓號串成一行。 */
  examples: string;
  /** 只有選中時才顯示的提醒；沒有就不顯示。 */
  selectedNote?: string;
};

/**
 * 四個目的選項。
 *
 * 順序刻意與 CUSTOM_TASK_PURPOSE_CHOICES 一致，但**文案以這裡為準** ——
 * contract 那一份是 domain 的說明，這一份是家長真的會讀到的字。
 */
export const PURPOSE_OPTIONS: readonly PurposeOptionCopy[] = [
  {
    choice: 'take_care_of_self',
    label: '練習照顧自己',
    description: '建立生活習慣、自理能力或生活節奏。',
    examples: '例如：整理書包、睡前準備、收好自己的物品',
  },
  {
    choice: 'join_family_life',
    label: '參與家庭生活',
    description: '一起分擔、完成家庭約定或負責一項角色。',
    examples: '例如：餐後整理、澆花、整理共同空間',
  },
  {
    choice: 'own_challenge',
    label: '孩子自己想挑戰',
    description: '孩子願意主動嘗試的興趣、作品或個人目標。',
    examples: '例如：晨跑、畫漫畫、完成自己的小作品',
    // 這一句只在選中時出現。永遠顯示的話它會變成畫面裝飾，
    // 而它要說的是一件家長現在就該去確認的事。
    selectedNote: '這類任務最好先和孩子確認，是他自己願意投入的挑戰。',
  },
  {
    choice: 'learn_or_practise',
    label: '學習或練習技能',
    description: '持續投入閱讀、運動、樂器或學校學習。',
    examples: '例如：閱讀、練琴、英文、運球練習',
  },
] as const;

export const STEP3_COPY = {
  subtitle: '選擇這件事要進行多久，系統會帶你進入合適的設定方式。',
  progress: '基本設定 3／3｜預計怎麼進行？',
  question: '預計怎麼進行？',
  unselectedHint: '請先選一種安排方式',
} as const;

export type DurationOptionCopy = {
  choice: CustomTaskDurationChoice;
  label: string;
  description: string;
  examples: string;
};

export const DURATION_OPTIONS: readonly DurationOptionCopy[] = [
  {
    choice: 'once',
    label: '做一次就完成',
    description: '完成這一次後，任務就結束。',
    examples: '例如：今天整理作品、完成一份報告、幫忙拿一次包裹',
  },
  {
    choice: 'repeating',
    label: '固定重複',
    description: '每天或每週固定出現，適合持續進行的安排。',
    examples: '例如：每週一、三、五閱讀、每天餐後整理',
  },
  {
    choice: 'for_a_while',
    label: '持續一段時間',
    description: '設定期間、回顧與階段，適合一段時間的養成或成長計畫。',
    examples: '例如：14 天整理書包、四週閱讀計畫、四週餐桌小幫手',
  },
] as const;

// ---------------------------------------------------------------------------
// 生活習慣 ＋ 固定重複的確認
// ---------------------------------------------------------------------------
//
// 這是整張路由表唯一需要家長回答的地方。文案裡沒有 short_support、
// 沒有 needs_confirmation、也沒有 rationaleCode —— 家長要判斷的是
// 「這件事適不適合一直留在每天的任務裡」，不是我們的分類。

export const ROUTINE_CONFIRMATION_COPY = {
  title: '要不要先設成一段時間的生活小計畫？',
  body:
    '生活習慣通常適合先練習一段時間，穩定後就能自然結束，'
    + '不必一直留在每天的任務中。',
  accept: '改成一段時間',
  keep: '仍使用固定重複',
} as const;

// ---------------------------------------------------------------------------
// 摘要卡
// ---------------------------------------------------------------------------

export const CUSTOM_TASK_BADGE = '自訂任務';

export const SUMMARY_COPY = {
  /** Step 3 與 editor 上方的摘要標籤。Step 2 用 STEP2_COPY.summaryTitle。 */
  title: '這次想安排的內容',
  purposeLabel: '主要方向',
  arrangementLabel: '執行安排',
  expectationLabel: '你的期待',
} as const;

/** 目的 → 家長看得懂的名稱。畫面上要顯示目的時一律走這裡，不印 purposeCategory。 */
export const PURPOSE_DISPLAY_LABEL: Record<PurposeCategory, string> = {
  life_routine: '練習照顧自己',
  family_participation: '參與家庭生活',
  autonomous_challenge: '孩子自己想挑戰',
  learning_skill: '學習或練習技能',
};

/**
 * 自訂任務的圖示。
 *
 * 全部取自既有 icon 套件（drawerIcons 的 GLYPHS），**沒有新增任何 dependency**。
 * 用目的分而不是一律同一個：預覽與成功畫面上，圖示是家長唯一能一眼分辨
 * 「這是哪一類」的線索，而自訂任務沒有 preset 的家族圖示可用。
 */
export const CUSTOM_TASK_ICON_KEY: Record<PurposeCategory, IconKey> = {
  life_routine: 'selfcare',
  family_participation: 'role',
  autonomous_challenge: 'compass',
  learning_skill: 'book',
};

// ---------------------------------------------------------------------------
// 回饋區塊
// ---------------------------------------------------------------------------

export const REWARD_SECTION_COPY = {
  title: '怎麼被看見',
  helper: '不同方式代表不同的家庭用意，之後仍可以再調整。',
  recommendedBadge: '建議',
  /** available_with_confirmation 選中前要先確認。 */
  confirmTitle: '選這一項之前',
  confirmAccept: '確定使用',
  confirmCancel: '先不要',
} as const;

/** 四種回饋方式的正式文案。internal value 不出現在畫面上。 */
export const REWARD_OPTION_COPY: Record<RewardPolicy, { title: string; description: string }> = {
  record_only: {
    title: '一般紀錄',
    description: '留下完成紀錄，方便之後回顧。',
  },
  progress_only: {
    title: '進度與肯定',
    description: '記錄持續、投入與慢慢進步的過程。',
  },
  family_contribution: {
    title: '家庭參與',
    description: '放進本週家庭參與，讓孩子的投入被看見。',
  },
  coin_eligible: {
    title: '成長幣回饋',
    description: '使用可兌換的回饋，協助開始或持續。',
  },
  time_saving_eligible: {
    title: '時間儲蓄',
    description: '累積可以兌換的時間。',
  },
};

/**
 * 選不了的原因，寫成家長讀得懂的話。
 *
 * **只在 development 顯示**（一般使用模式直接不列出不可選的項目）。
 * 這裡沒有任何 reason code 會被印出來 —— 家長看到
 * `B_COIN_POLICY_NOT_CONFIGURED` 除了嚇人之外沒有任何用處。
 */
export function rewardUnavailableCopy(option: RewardOptionPresentation): string {
  if (option.rewardPolicy === 'time_saving_eligible') return '時間儲蓄尚未開放。';

  if (option.rewardPolicy === 'coin_eligible') {
    switch (option.reasonCode) {
      case 'COIN_POLICY_MISSING_FOR_CATEGORY':
        // 這是 B 類目前的狀態。措辭是「尚未有」而不是「不可以」——
        // 產品概念上已經允許，缺的是幣值政策的數字。
        return '這類任務目前尚未有適用的成長幣規則。';
      case 'COIN_POLICY_NEEDS_ESTIMATED_MINUTES':
        return '要先設定每次大約做多久，才算得出金額。';
      case 'ROUTINE_NOT_A_COIN_SOURCE':
        return '照顧自己的事不作為固定的賺幣來源。';
      default:
        return '目前的設定算不出成長幣。';
    }
  }

  return '這個組合目前不能使用。';
}

// ---------------------------------------------------------------------------
// 進入 editor 之後
// ---------------------------------------------------------------------------

/**
 * 自訂任務的期間選項。
 *
 * preset 的來源是 `variant.defaultDraft.durationDayChoices`；自訂任務沒有
 * variant。這三組**直接取自 catalog 裡最常用的那幾組**，不是新發明的數字：
 *   成長計畫／家庭角色 [14, 28, 42]（learningAndSkills、familyParticipation）
 *   短期小計畫        [7, 14, 21]（lifePlans）
 */
export const CUSTOM_DURATION_DAY_CHOICES: Record<TaskEditorKind, number[]> = {
  growth_plan: [14, 28, 42],
  short_support: [7, 14, 21],
  family_role: [14, 28, 42],
  recurring: [],
  one_time: [],
};

export const CUSTOM_ROLE_NAME_LABEL = '角色名稱';
export const CUSTOM_ROLE_NAME_PLACEHOLDER = '例如：餐桌小幫手';
export const CUSTOM_ROLE_EMPTY_RESPONSIBILITIES_HELPER =
  '自訂角色沒有預設的負責內容，請至少寫下一項。';

// ---------------------------------------------------------------------------
// 成功畫面
// ---------------------------------------------------------------------------

export const CUSTOM_SUCCESS_TITLE = '任務已建立';

/** 成功畫面副標。孩子暱稱由呼叫端帶入，不在這裡猜。 */
export function customSuccessSubtitle(childName: string): string {
  return `已加入${childName}的任務清單`;
}
