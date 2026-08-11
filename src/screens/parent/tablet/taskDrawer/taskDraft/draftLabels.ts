// Shadow Wallet · Parent Tablet — 草稿文案與 family-specific fallback
//
// 這裡放的是「產品固定文案」，不是 AI 輸出，畫面上也不得標示 AI。
// 集中在這一支，避免同樣一句話散在三、四個 component 裡各寫一份。
//
// catalog 有的東西（optionGroups / defaultDraft / milestoneTemplate / policyFlags）
// 一律從 catalog 讀，這裡只補 catalog 沒有、且屬於「畫面說法」的部分。

import type {
  FamilyRoleSupportLevel,
  GrowthPlanPreferredTime,
  OneTimeSupportLevel,
  RecurringPreferredTime,
  ReminderMode,
  ResponsibilityItem,
  ShortSupportTime,
} from './types';

// ---------------------------------------------------------------------------
// 集中的 fallback 常數 —— 不要在 UI 裡到處寫 ?? 14
// ---------------------------------------------------------------------------

export const DRAFT_FALLBACKS = {
  growthPlanDurationDays: 28,
  shortSupportDurationDays: 14,
  firstReviewDays: 7,
  /** 沒有 defaultDraft.recurrenceDays 時的預設執行日：週一到週五。 */
  recurrenceDays: [1, 2, 3, 4, 5] as number[],
  minMinutes: 5,
  maxMinutes: 180,
  minDurationDays: 3,
  maxDurationDays: 120,
  maxSupportSteps: 5,
  /** 家長自己新增里程碑的上限，太多的話回顧起來反而失去重點。 */
  maxMilestones: 8,
  /** 選超過這個數量就提示範圍可能太大（不禁止）。 */
  focusSoftLimit: 4,

  // ── 固定任務 ──
  /** 家庭參與的固定任務預設多久回顧一次。 */
  familyRecurringReviewDays: 28,
  /** 學習與技能的固定練習預設多久回顧一次。 */
  learningRecurringReviewDays: 14,
  recurringReviewChoices: [14, 28] as number[],
  weeklyFrequencyChoices: [1, 2, 3, 4, 5] as number[],
  minWeeklyFrequency: 1,
  maxWeeklyFrequency: 7,
  /** 具體內容選超過這個數量就提示範圍可能太大（不禁止）。 */
  recurringOptionSoftLimit: 3,

  // ── 家庭角色 ──
  familyRoleDurationDays: 28,
  familyRoleFirstReviewDays: 7,
  minResponsibilityItems: 1,
  maxResponsibilityItems: 5,
  /** 建議啟用數量上限，超過只提示不擋。 */
  responsibilitySoftLimit: 4,

  // ── 單次任務 ──
  /** 補充說明的建議字數上限，超過只提示不擋。 */
  notesSoftLimit: 200,
} as const;

export const MINUTE_CHOICES = [10, 15, 20, 30];

/** 單次任務的預估投入時間。比週期任務多一個 45 分鐘（作品、探索常需要一段完整時間）。 */
export const ONE_TIME_MINUTE_CHOICES = [10, 15, 20, 30, 45];

// ---------------------------------------------------------------------------
// 共用選項標籤
// ---------------------------------------------------------------------------

export const PREFERRED_TIME_OPTIONS: Array<{
  id: GrowthPlanPreferredTime;
  label: string;
}> = [
  { id: 'after_school', label: '放學後' },
  { id: 'after_dinner', label: '晚餐後' },
  { id: 'before_bed', label: '睡前' },
  { id: 'weekend', label: '週末' },
  { id: 'custom', label: '自訂' },
];

export const SUPPORT_TIME_OPTIONS: Array<{ id: ShortSupportTime; label: string }> = [
  { id: 'morning', label: '早上出門前' },
  { id: 'after_school', label: '放學後' },
  { id: 'after_homework', label: '寫完功課後' },
  { id: 'after_dinner', label: '晚餐後' },
  { id: 'before_bed', label: '睡前' },
  { id: 'custom', label: '自訂' },
];

export const RECURRING_TIME_OPTIONS: Array<{
  id: RecurringPreferredTime;
  label: string;
}> = [
  { id: 'before_school', label: '上學前' },
  { id: 'after_school', label: '放學後' },
  { id: 'after_dinner', label: '晚餐後' },
  { id: 'before_bed', label: '睡前' },
  { id: 'weekend', label: '週末' },
  { id: 'when_needed', label: '需要時' },
  { id: 'custom', label: '自訂' },
];

export const SUPPORT_LEVEL_OPTIONS: Array<{
  id: FamilyRoleSupportLevel;
  label: string;
  description: string;
}> = [
  {
    id: 'together_first',
    label: '第一週一起做',
    description: '先示範與陪著做，讓孩子熟悉步驟',
  },
  {
    id: 'remind_then_check',
    label: '提醒後由孩子完成，家長最後確認',
    description: '提醒一次就交給孩子，完成後一起看一下',
  },
  {
    id: 'independent_with_help',
    label: '孩子自己完成，需要時再請求協助',
    description: '孩子主導，遇到困難隨時可以找家長',
  },
];

export const ONE_TIME_SUPPORT_OPTIONS: Array<{
  id: OneTimeSupportLevel;
  label: string;
  description: string;
}> = [
  {
    id: 'independent',
    label: '自己完成，需要時再問',
    description: '孩子自己安排，遇到卡住隨時可以找家長',
  },
  {
    id: 'check_after',
    label: '完成後一起確認',
    description: '孩子先做，完成後一起看一下結果',
  },
  {
    id: 'do_together',
    label: '這次先一起完成',
    description: '第一次或內容較新時，先陪著一起做一遍',
  },
];

export const REMINDER_OPTIONS: Array<{ id: ReminderMode; label: string }> = [
  { id: 'none', label: '不提醒' },
  { id: 'on_task_day', label: '執行日提醒' },
  { id: 'before_start', label: '開始前提醒' },
];

/** 週一到週日；value 沿用專案 0 = 週日的資料定義，UI 從週一排起。 */
export const WEEKDAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 0, label: '日' },
];

/**
 * 回饋方式的正式名稱。**這是唯一一份**——選項、預覽、成功摘要都讀這裡。
 *
 * 先前同一個政策在不同畫面上有不同說法（選項上叫「可建議成長幣」、
 * 預覽卡叫「可獲得成長幣」、分區叫「成長幣任務」），家長會以為是三件事。
 *
 * 「可建議成長幣」另外還有一個問題：它在講系統的動作（系統建議），
 * 不是在講孩子會得到什麼。家長要判斷的是後者。
 */
export const REWARD_POLICY_SHORT_LABEL: Record<string, string> = {
  record_only: '一般紀錄',
  family_contribution: '家庭參與',
  progress_only: '進度與肯定',
  coin_eligible: '成長幣回饋',
  time_saving_eligible: '可記錄時間投入',
};

export const REWARD_POLICY_NOTE =
  '回饋的是投入、持續與進步，不以一次成績或作品結果作為條件。';

// 期間與回顧的說法統一在 lib/durationCopy —— 抽屜的預覽與任務列表的長期任務卡
// 講的是同一件事，先前各寫一次的結果是同一個 28 天有兩種說法。
export { reviewCycleText } from '../../../../../lib/durationCopy';

// ---------------------------------------------------------------------------
// 「只存在本地草稿」提示
//
// 全部集中在這裡、全部走同一種琥珀樣式（editors 的 LocalOnlyNotice），
// 避免有的欄位用灰色 helper、有的用警示框，家長分不出哪些真的還沒接上。
// ---------------------------------------------------------------------------

export const LOCAL_ONLY_REMINDER =
  '通知尚未接上，提醒方式目前只保存在這份草稿裡。';

// 以下三句只在 development 模式顯示（見 LocalOnlyNotice）。
// 規則：哪一個 PR 讓敘述變真，就在同一個 PR 改掉這裡的字。

export const LOCAL_ONLY_WEEKLY_FREQUENCY =
  '「每週次數」會寫進 tasks.weekly_frequency，但孩子端的每日清單尚未依它排程。';

export const LOCAL_ONLY_SCHEDULED_DATE =
  '安排日期會寫進 tasks.scheduled_date；它與 due_date 不同，過期不會自動隱藏。';

/**
 * 第七階段 C 之前掛在「確認建立」旁邊的說明。
 *
 * 建立已經串上真的 RPC，所以這句話**不再顯示在任何地方** ——
 * 留著常數是為了讓 drawerFlow 的測試能守住「它沒有跑回來」。
 */
export const LOCAL_ONLY_CREATE =
  '建立流程將於後續階段串接，目前尚未寫入資料庫。';

/**
 * 按了預覽卻還有必填沒完成時，footer 上的一行說明。
 * 刻意不列出欄位名稱 —— 錯誤已經標在各欄位旁邊，這裡再列一次會變成兩份清單要維護。
 */
export const PREVIEW_BLOCKED_NOTE = '還有必填欄位沒完成，已在上方標出需要補的地方。';

export const CHILD_PROPOSAL_HINT =
  '這項內容也可以由孩子主動提出。若主要是孩子自己想挑戰，建議一起確認內容與難度。';

export const SHORT_SUPPORT_POLICY_NOTE =
  '這是一項短期支援計畫。建議一次先處理一個具體困難，穩定後就結束，不作為固定賺幣來源。';

// ---------------------------------------------------------------------------
// 成長計畫：family-specific 文案
// ---------------------------------------------------------------------------

export type GrowthPlanCopy = {
  /** 家長原始期待的預設文字（依家族不同，不共用同一段）。 */
  expectation: (childName: string) => string;
  /** 「適齡起點」卡的建議名稱。 */
  suggestionName: string;
  /** 「適齡起點」卡的建議安排。一段話講完，不再另外補一段試行說明。 */
  suggestionArrangement: (childName: string) => string;
  /**
   * 卡片下方的理由條列，最多兩條。
   * 原本第三條講的是「第一週可以調整」，那件事已經是下方的 metadata chip，
   * 同一件事不要用長句和標籤各講一次。
   */
  suggestionReasons: string[];
  /** 計畫名稱的預設值。 */
  titleTemplate: (childName: string) => string;
  /** 完成描述的預設值。 */
  completion: string;
  /** 是否顯示「每次時間」。創作／探索屬階段型投入，可不設固定分鐘。 */
  showMinutes: boolean;
  /** 是否允許「不設定固定分鐘」。 */
  allowNoMinutes: boolean;
  /** 里程碑預設標題（3–5 個）。 */
  milestones: string[];
};

const GENERIC_GROWTH_COPY: GrowthPlanCopy = {
  expectation: name => `希望${name}能持續投入這件事，慢慢找到適合自己的節奏。`,
  suggestionName: '成長計畫',
  suggestionArrangement: name => `每週選擇幾天，由${name}和家長一起決定內容與適合時段。`,
  suggestionReasons: ['保留孩子選擇內容的空間', '先從短時間開始'],
  titleTemplate: name => `${name}的成長計畫`,
  completion: '能依約定的節奏持續投入，並在過程中看見自己的進步。',
  showMinutes: true,
  allowNoMinutes: true,
  milestones: ['選擇想進行的內容', '第一週試行', '找到較合適的做法', '中途一起調整', '回顧是否繼續'],
};

export const GROWTH_PLAN_COPY: Record<string, GrowthPlanCopy> = {
  'learn-reading': {
    expectation: name => `希望${name}每天多看書，慢慢找到自己願意持續的閱讀習慣。`,
    suggestionName: '自主閱讀計畫',
    suggestionArrangement: name => `每週選擇幾天，由${name}自己決定閱讀內容與適合時段。`,
    suggestionReasons: ['保留孩子選擇內容的空間', '先從短時間開始'],
    titleTemplate: name => `${name}的閱讀計畫`,
    completion: '能在約定的日子持續閱讀，並找到自己願意繼續的內容與時段。',
    showMinutes: true,
    allowNoMinutes: false,
    milestones: [
      '選擇想看的內容',
      '第一週試行',
      '找到較合適的時段',
      '中途一起調整',
      '回顧是否繼續',
    ],
  },

  'learn-sport': {
    expectation: name => `希望${name}找到一項喜歡的運動，願意持續練習。`,
    suggestionName: '身體技能練習計畫',
    suggestionArrangement: name => `每週選擇幾天，由${name}自己決定想練的項目與強度。`,
    suggestionReasons: ['由孩子選擇項目', '從目前程度開始'],
    titleTemplate: name => `${name}的運動練習計畫`,
    completion: '能持續練習選定的項目，並看見自己比一開始更熟練。',
    showMinutes: true,
    allowNoMinutes: false,
    milestones: [
      '選擇想練習的內容',
      '記下目前程度',
      '練習一個基本步驟',
      '中途調整難度',
      '回顧看見的進步',
    ],
  },

  'learn-creation': {
    expectation: name => `希望${name}能把自己想做的作品慢慢完成。`,
    suggestionName: '個人創作計畫',
    suggestionArrangement: name => `把作品拆成幾個小步驟，由${name}決定先做哪一個。`,
    suggestionReasons: ['由孩子選擇作品類型', '拆成可完成的小步驟'],
    titleTemplate: name => `${name}的創作計畫`,
    completion: '能一步一步把作品推進，並完成當初想做的主要部分。',
    showMinutes: true,
    allowNoMinutes: true,
    milestones: [
      '選擇作品類型',
      '決定第一個小步驟',
      '完成主要部分',
      '處理一個卡住的地方',
      '完成或決定下一階段',
    ],
  },

  'learn-explore': {
    expectation: name => `希望${name}能從一個好奇的問題開始，完成自己的小發現。`,
    suggestionName: '好奇主題小專題',
    suggestionArrangement: name => `由${name}提出想知道的問題，再一起決定用什麼方式找答案。`,
    suggestionReasons: ['從孩子的問題出發', '方法可以混搭'],
    titleTemplate: name => `${name}的探索小專題`,
    completion: '能說出自己找到的幾項發現，並用適合的方式留下紀錄。',
    showMinutes: true,
    allowNoMinutes: true,
    milestones: [
      '選擇好奇問題',
      '決定探索方法',
      '留下幾項發現',
      '整理成圖、文字、照片或語音',
      '選擇是否分享',
    ],
  },
};

export function growthPlanCopy(familyId: string | undefined): GrowthPlanCopy {
  // undefined = 自訂任務（沒有 preset 家族）。走通用文案，與「查不到這個 id」同一條路。
  return (familyId ? GROWTH_PLAN_COPY[familyId] : undefined) ?? GENERIC_GROWTH_COPY;
}

// ---------------------------------------------------------------------------
// 短期支援：family-specific 文案與焦點選項
// ---------------------------------------------------------------------------

export type ShortSupportFocusChoice = {
  id: string;
  label: string;
  /** 選中後產生的支援步驟文字。 */
  step: string;
};

export type ShortSupportCopy = {
  /** Step 2 標題（功課管理顯示「調整學習小計畫」）。 */
  headerTitle: string;
  observation: (childName: string) => string;
  titleTemplate: (childName: string) => string;
  success: string;
  /** 焦點選項；catalog 有 optionGroups 時優先用 catalog（見 createTaskDraft）。 */
  focusChoices: ShortSupportFocusChoice[];
};

const GENERIC_SHORT_SUPPORT_COPY: ShortSupportCopy = {
  headerTitle: '調整生活小計畫',
  observation: name => `希望${name}在這件事上能少一點卡住，慢慢自己完成。`,
  titleTemplate: name => `${name}的生活小計畫`,
  success: '能在較少提醒下完成約定的步驟。',
  focusChoices: [],
};

/** 功課管理的焦點文字對應 catalog HOMEWORK_METHOD 的 option id。 */
const HOMEWORK_STEPS: Record<string, string> = {
  start: '在約定時間先打開課本，開始第一題',
  order: '先看一遍今天的功課，決定先後順序',
  split: '把比較大的功課拆成兩到三個小段',
  check: '寫完後對照聯絡簿檢查一次',
  stuck: '遇到不會的先跳過並做記號，最後再一起看',
};

export const SHORT_SUPPORT_COPY: Record<string, ShortSupportCopy> = {
  'learn-homework-method': {
    headerTitle: '調整學習小計畫',
    observation: name => `希望${name}能比較順利開始功課，減少每次都要重複提醒。`,
    titleTemplate: name => `${name}的功課方法小計畫`,
    success: '能在較少協助下完成選定的功課流程。',
    focusChoices: [], // 走 catalog 的 HOMEWORK_METHOD
  },

  'life-schoolbag': {
    headerTitle: '調整生活小計畫',
    observation: name => `${name}有時會忘記把完成的作業或隔日用品放進書包。`,
    titleTemplate: name => `${name}的書包準備小計畫`,
    success: '多數時候能依清單整理好約定的物品。',
    focusChoices: [
      { id: 'contact_book', label: '聯絡簿', step: '把聯絡簿放進書包' },
      { id: 'homework', label: '完成的作業', step: '把寫完的作業放回書包' },
      { id: 'textbook', label: '課本與習作', step: '對照課表放入明天要用的課本與習作' },
      { id: 'stationery', label: '文具', step: '檢查鉛筆盒裡的文具是否齊全' },
      { id: 'bottle', label: '水壺', step: '把洗好的水壺放進書包' },
      { id: 'special', label: '特別課程用品', step: '確認明天有沒有需要特別帶的東西' },
      { id: 'other', label: '其他', step: '確認今天約定的其他物品' },
    ],
  },

  'life-bedtime': {
    headerTitle: '調整生活小計畫',
    observation: name => `希望${name}能按約定完成睡前準備，不需要一直臨時催促。`,
    titleTemplate: name => `${name}的睡前收尾小計畫`,
    success: '能依提示完成約定的睡前收尾步驟。',
    focusChoices: [
      { id: 'device', label: '3C 裝置歸位', step: '把 3C 裝置放回約定的位置' },
      { id: 'wash', label: '刷牙或盥洗', step: '完成刷牙與盥洗' },
      { id: 'pajamas', label: '換睡衣', step: '換好睡衣' },
      { id: 'prepare', label: '整理隔日用品', step: '把明天要用的東西先放好' },
      { id: 'reading', label: '睡前閱讀', step: '看一小段睡前讀物' },
      { id: 'other', label: '其他', step: '完成今天約定的其他步驟' },
    ],
  },

  'life-screen-time': {
    headerTitle: '調整生活小計畫',
    observation: name => `希望${name}在約定時間到時，能完成收尾並切換到下一件事。`,
    titleTemplate: name => `${name}的 3C 收尾小計畫`,
    success: '能完成約定的收尾與切換流程；有特殊情況時能提出調整。',
    focusChoices: [
      { id: 'pre_notice', label: '收到事前提醒', step: '在結束前先收到一次提醒' },
      { id: 'finish_section', label: '完成目前的小段落', step: '把目前這一段先告一段落' },
      { id: 'save', label: '儲存或結束內容', step: '存檔或正常結束目前的內容' },
      { id: 'put_back', label: '裝置放回位置', step: '把裝置放回約定的位置' },
      { id: 'next', label: '選擇下一項活動', step: '決定接下來要做的事' },
      { id: 'renegotiate', label: '特殊情況提出重新協商', step: '有特殊情況時說出來一起討論' },
    ],
  },
};

export function shortSupportCopy(familyId: string | undefined): ShortSupportCopy {
  return (familyId ? SHORT_SUPPORT_COPY[familyId] : undefined) ?? GENERIC_SHORT_SUPPORT_COPY;
}

/** catalog 的 option id → 支援步驟文字（目前只有功課管理需要）。 */
export function stepTextForCatalogOption(
  familyId: string | undefined,
  optionId: string,
): string | null {
  if (familyId === 'learn-homework-method') return HOMEWORK_STEPS[optionId] ?? null;
  return null;
}

// ---------------------------------------------------------------------------
// 固定任務：family-specific 文案
// ---------------------------------------------------------------------------

export type RecurringCopy = {
  expectation: (childName: string) => string;
  titleTemplate: (childName: string) => string;
  completion: string;
  /** 是否顯示「每次時間」。家庭參與多半不顯示，除非 catalog 有 estimatedMinutes 且這裡開啟。 */
  showMinutes: boolean;
  preferredTime: RecurringPreferredTime;
  /** preferredTime === 'custom' 時的預設文字。 */
  preferredTimeCustom?: string;
};

const GENERIC_FAMILY_RECURRING_COPY: RecurringCopy = {
  expectation: name => `希望${name}能固定參與這項家庭分工，知道自己負責的一小部分。`,
  titleTemplate: name => `${name}的家庭分工`,
  completion: '完成約定範圍內的內容，並把東西放回指定位置。',
  showMinutes: false,
  preferredTime: 'when_needed',
};

const GENERIC_LEARNING_RECURRING_COPY: RecurringCopy = {
  expectation: name => `希望${name}能找到可以持續的練習方式與節奏。`,
  titleTemplate: name => `${name}的固定練習`,
  completion: '完成約定的練習內容，不以一次的成果作為條件。',
  showMinutes: true,
  preferredTime: 'after_school',
};

export const RECURRING_COPY: Record<string, RecurringCopy> = {
  'fam-set-table': {
    expectation: name => `希望${name}能固定參與餐前準備，知道自己在家庭中負責的一小部分。`,
    titleTemplate: name => `${name}的餐前準備`,
    completion: '將約定的餐具或餐墊放到指定位置。',
    showMinutes: false,
    preferredTime: 'custom',
    preferredTimeCustom: '用餐前',
  },
  'fam-clear-table': {
    expectation: name => `希望${name}用餐後能先照顧好自己的位置，再協助一項共同整理。`,
    titleTemplate: name => `${name}的餐後整理`,
    completion: '完成自己餐具歸位，再完成一項約定整理。',
    showMinutes: false,
    preferredTime: 'custom',
    preferredTimeCustom: '用餐後',
  },
  'fam-laundry': {
    expectation: name => `希望${name}每週協助完成一項清楚、安全的衣物分工。`,
    titleTemplate: name => `${name}的衣物分工`,
    completion: '完成約定範圍的衣物分類，並放回家人的區域。',
    showMinutes: false,
    preferredTime: 'when_needed',
  },
  'fam-tidy-area': {
    expectation: name => `希望${name}固定照顧一個共用的小區域，讓大家都好用。`,
    titleTemplate: name => `${name}的共用區域整理`,
    completion: '把約定區域內的東西歸回原位。',
    showMinutes: false,
    preferredTime: 'weekend',
  },
  'fam-recycling': {
    expectation: name => `希望${name}能固定協助家裡的回收分類，並注意安全範圍。`,
    titleTemplate: name => `${name}的回收整理`,
    completion: '把約定類別的回收物分好並放到指定位置。',
    showMinutes: false,
    preferredTime: 'when_needed',
  },
  'fam-restock': {
    expectation: name => `希望${name}能固定檢查家中常用品，發現快用完時提出來。`,
    titleTemplate: name => `${name}的家庭用品檢查`,
    completion: '檢查約定的用品並補到定位，不足時告訴家長。',
    showMinutes: false,
    preferredTime: 'weekend',
  },
  'fam-care': {
    expectation: name => `希望${name}能固定完成一個安全、明確的照顧步驟。`,
    titleTemplate: name => `${name}的照顧工作`,
    completion: '完成約定的照顧步驟，發現異常時告訴家長。',
    showMinutes: false,
    preferredTime: 'when_needed',
  },

  'learn-reading': {
    expectation: name => `希望${name}找到可以持續的閱讀方式與節奏。`,
    titleTemplate: name => `${name}的固定閱讀`,
    completion: '完成約定時間的閱讀，不以讀完頁數或本數作唯一標準。',
    showMinutes: true,
    preferredTime: 'before_bed',
  },
  'learn-review': {
    expectation: name => `希望${name}能固定回頭看不熟的部分，把卡住的地方弄懂。`,
    titleTemplate: name => `${name}的固定複習`,
    completion: '完成約定範圍的訂正與再試一次。',
    showMinutes: true,
    preferredTime: 'after_school',
  },
  'learn-performance': {
    expectation: name => `希望${name}能固定練習自己正在學的內容。`,
    titleTemplate: name => `${name}的固定練習`,
    completion: '完成約定的練習內容，不以一次表現作為條件。',
    showMinutes: true,
    preferredTime: 'after_dinner',
  },
  'learn-sport': {
    expectation: name => `希望${name}能固定練習自己選擇的運動內容。`,
    titleTemplate: name => `${name}的運動練習`,
    completion: '完成約定的練習內容，不以一次達到特定成績作為條件。',
    showMinutes: true,
    preferredTime: 'after_school',
  },
};

export function recurringCopy(
  familyId: string | undefined,
  isFamilyParticipation: boolean,
): RecurringCopy {
  return (
    (familyId ? RECURRING_COPY[familyId] : undefined)
    ?? (isFamilyParticipation
      ? GENERIC_FAMILY_RECURRING_COPY
      : GENERIC_LEARNING_RECURRING_COPY)
  );
}

export const RECURRING_FAMILY_SCOPE_HINT =
  '一次先約定少量、清楚的範圍，避免把整個家務區域交給孩子。';

export const RECURRING_REVIEW_HINT =
  '回顧是為了確認安排是否合適，不是將固定任務轉成連續挑戰。';

export const FAMILY_PARTICIPATION_POLICY_TITLE = '家庭參與如何被記錄';

export const FAMILY_PARTICIPATION_POLICY_BODY =
  '這項任務會記錄孩子對共同生活的投入，預設不發成長幣。\n\n'
  + '請把範圍與完成標準說清楚；若內容其實是孩子主動提出、明顯超出原有責任的額外協助，'
  + '應在後續政策確認階段重新判斷任務性質，而不是直接替家庭分工加幣。';

// ---------------------------------------------------------------------------
// 家庭角色：文案與責任範本
// ---------------------------------------------------------------------------

export type FamilyRoleCopy = {
  expectation: (childName: string) => string;
  titleTemplate: (childName: string) => string;
  scopeFallback: string;
};

const GENERIC_FAMILY_ROLE_COPY: FamilyRoleCopy = {
  expectation: name =>
    `希望${name}能在一段期間內試著負責一項清楚的家庭分工，感受到自己也是家庭的一分子。`,
  titleTemplate: name => `${name}的家庭角色`,
  scopeFallback: '',
};

export const FAMILY_ROLE_COPY: Record<string, FamilyRoleCopy> = {
  'fam-role': {
    expectation: name =>
      `希望${name}能在四週內試著負責一項清楚的家庭分工，感受到自己也是家庭的一分子。`,
    titleTemplate: name => `${name}的家庭小角色`,
    scopeFallback: '',
  },
  'fam-care': {
    expectation: name =>
      `希望${name}能持續完成一個安全、明確的照顧步驟，並留意過程中的變化。`,
    titleTemplate: name => `${name}的四週照顧角色`,
    scopeFallback: '',
  },
};

export function familyRoleCopy(familyId: string | undefined): FamilyRoleCopy {
  return (familyId ? FAMILY_ROLE_COPY[familyId] : undefined) ?? GENERIC_FAMILY_ROLE_COPY;
}

export const FAMILY_ROLE_EXCEPTION_DEFAULT =
  '遇到生病、外出或家庭作息改變時，可以先跳過或重新討論安排。';

export const FAMILY_ROLE_CONTRIBUTION_DEFAULT = '完成後記錄本週的家庭參與與貢獻。';

export const FAMILY_ROLE_CONTRIBUTION_ITEMS = [
  '本週家庭參與紀錄',
  '週報中的具體肯定',
  '四週後一起決定繼續、換角色或結束',
];

export const FAMILY_ROLE_ENDING_OPTIONS = [
  '繼續原角色',
  '調整負責範圍',
  '換一個角色',
  '結束並回到日常生活',
];

/**
 * 唯讀清單的開頭。
 * 「可以一起決定」是刻意的語氣 —— 這四項不是現在要選的欄位，是期滿回顧時的可能性。
 */
export const FAMILY_ROLE_ENDING_INTRO = '期間結束後，可以一起決定：';

/**
 * 清單旁的產品說明。
 * 原本這句還帶了「期間結束後，家長與孩子可以一起選擇下一步」，
 * 那件事現在由 FAMILY_ROLE_ENDING_INTRO 與下方清單本身說完了，不再講第二次。
 */
export const FAMILY_ROLE_ENDING_NOTE = '這項角色不是靠連續打卡「過關」。';

export const FAMILY_ROLE_SAFETY_TITLE = '安全原則';

/** 收合時顯示的一句話。完整規則在 FAMILY_ROLE_SAFETY_POLICY，一個字都沒少。 */
export const FAMILY_ROLE_SAFETY_SUMMARY =
  '不包含明火、利器、清潔劑、重物或危險動物照顧。';

export const FAMILY_ROLE_SAFETY_EXPAND_LABEL = '查看完整安全範圍';

export const FAMILY_ROLE_SAFETY_POLICY =
  '家庭角色應符合孩子年齡與安全條件。不應包含明火、利器、清潔劑、搬重物、'
  + '單獨處理玻璃或尖銳物、餵藥、清理危險排泄物，或單獨照顧具攻擊性、有特殊需求的動物。';

/**
 * 角色 option id → 建議責任（2–4 項）與預設負責範圍。
 * 純資料 + 純函式，不放在 component 裡，切換角色時由 buildResponsibilityItems 產生。
 */
const ROLE_RESPONSIBILITY_TEMPLATES: Record<
  string,
  { items: string[]; scope: string }
> = {
  table_helper: {
    items: [
      '用餐前放好約定餐具',
      '用餐後將自己的用品歸位',
      '遇到餐具不足時告訴家長',
    ],
    scope: '負責擺放家中指定的不易碎餐具與餐墊。',
  },
  laundry_sorter: {
    items: [
      '把乾淨衣物依家人分成幾疊',
      '摺好約定的毛巾或襪子',
      '遇到分不出來的衣物先放到一邊並詢問',
    ],
    scope: '負責客廳籃子裡的乾淨毛巾與襪子分類。',
  },
  recycling_keeper: {
    items: [
      '將安全回收物放到指定位置',
      '依家庭方式完成分類',
      '不處理玻璃、尖銳或不明物品',
    ],
    scope: '負責廚房旁回收籃中的紙類與安全塑膠容器。',
  },
  supply_restocker: {
    items: [
      '檢查約定用品還剩多少',
      '把備品補到固定位置',
      '快用完時提前告訴家長',
    ],
    scope: '負責檢查衛生紙與餐巾紙的存量並補到定位。',
  },
  space_tidier: {
    items: [
      '把約定區域的東西歸回原位',
      '整理結束後看一次是否好走動',
      '發現壞掉或不屬於這裡的東西時告訴家長',
    ],
    scope: '只負責客廳玩具籃與旁邊的一小塊區域。',
  },
  plant_caretaker: {
    items: [
      '在約定日期澆水',
      '觀察土壤或葉片變化',
      '發現異常時告訴家長',
    ],
    scope: '負責客廳窗邊兩盆植物的澆水與簡單觀察。',
  },
  pet_water_helper: {
    items: [
      '在約定時間檢查飲水是否足夠',
      '換上乾淨的水',
      '發現寵物食慾或活動異常時告訴家長',
    ],
    scope: '負責寵物飲水盆的檢查與換水。',
  },
  pet_supply_keeper: {
    items: [
      '把寵物用品收回固定位置',
      '檢查用品是否需要補充',
      '不處理清潔劑或藥品',
    ],
    scope: '負責寵物玩具與安全用品的收納。',
  },
};

/** 角色的建議責任項目；未知角色（含「其他」）回傳空陣列，由家長自己填。 */
export function responsibilityTemplateFor(roleOptionId: string): string[] {
  return ROLE_RESPONSIBILITY_TEMPLATES[roleOptionId]?.items ?? [];
}

/** 角色的預設負責範圍；未知角色回傳空字串。 */
export function roleScopeFallback(roleOptionId: string): string {
  return ROLE_RESPONSIBILITY_TEMPLATES[roleOptionId]?.scope ?? '';
}

/** 由角色產生 responsibilityItems。純函式，切換角色時重跑。 */
export function buildResponsibilityItems(roleOptionId: string): ResponsibilityItem[] {
  return responsibilityTemplateFor(roleOptionId).map((text, index) => ({
    id: `resp-${roleOptionId}-${index + 1}`,
    text,
    enabled: true,
    isCustom: false,
  }));
}

// ---------------------------------------------------------------------------
// 單次任務：family-specific 文案
// ---------------------------------------------------------------------------

export type OneTimeCopy = {
  expectation: (childName: string) => string;
  titleTemplate: (childName: string) => string;
  /** 「這次具體要完成什麼」的舉例。刻意只當 helper，不預填進欄位 —— 例子是假的內容。 */
  detailsHint: string;
  completion: string;
  preferredTime: RecurringPreferredTime;
  /** 家庭參與與有安全提示的任務會被 createTaskDraft 覆寫為 check_after。 */
  supportLevel: OneTimeSupportLevel;
  /** 是否顯示「預估投入時間」。家庭參與不顯示，也不預填分鐘。 */
  showMinutes: boolean;
};

const GENERIC_ONE_TIME_COPY: OneTimeCopy = {
  expectation: name => `希望${name}能完成這次約定的內容，並在做完後留下紀錄。`,
  titleTemplate: name => `${name}的單次任務`,
  detailsHint: '寫下這次要完成的具體範圍，例如做哪一部分、做到哪裡就算結束。',
  completion: '完成約定範圍的內容，並放回或整理到約定的位置。',
  preferredTime: 'after_school',
  supportLevel: 'check_after',
  showMinutes: true,
};

export const ONE_TIME_COPY: Record<string, OneTimeCopy> = {
  'learn-school-assignment': {
    expectation: name => `希望${name}能把老師指定的這項作業完成並留下紀錄。`,
    titleTemplate: name => `${name}的學校作業`,
    detailsHint: '例如「完成數學習作第 24–25 頁」。',
    completion: '完成老師指定的內容並放到約定位置。',
    preferredTime: 'after_school',
    supportLevel: 'independent',
    showMinutes: true,
  },

  'learn-review': {
    expectation: name => `希望${name}完成一小段訂正，並再試一次原本較不熟悉的內容。`,
    titleTemplate: name => `${name}的一次訂正`,
    detailsHint: '例如「訂正今天考卷中標記的三題，再各試一次」。',
    completion: '完成約定範圍的訂正，並再試一次。',
    preferredTime: 'after_school',
    supportLevel: 'independent',
    showMinutes: true,
  },

  'fam-tidy-area': {
    expectation: name => `希望${name}協助整理一個說清楚範圍的共同區域。`,
    titleTemplate: name => `${name}的區域整理`,
    detailsHint: '例如「整理客廳玩具籃與旁邊的小區域」。',
    completion: '將約定範圍內的物品放回指定位置。',
    preferredTime: 'when_needed',
    supportLevel: 'check_after',
    showMinutes: false,
  },

  'fam-restock': {
    expectation: name => `希望${name}協助完成一項安全、明確的用品收納。`,
    titleTemplate: name => `${name}的用品收納`,
    detailsHint: '例如「把新買的衛生紙放到一樓與二樓指定位置」。',
    completion: '將約定的安全用品放到指定位置。',
    preferredTime: 'when_needed',
    supportLevel: 'check_after',
    showMinutes: false,
  },

  'learn-creation': {
    expectation: name => `希望${name}完成一個自己選擇的小作品。`,
    titleTemplate: name => `${name}的小作品`,
    detailsHint: '例如「完成一張以海洋為主題的小作品」。',
    completion: '完成這次約定的小作品範圍，不以作品是否漂亮作為條件。',
    preferredTime: 'after_school',
    supportLevel: 'independent',
    showMinutes: true,
  },

  'learn-explore': {
    expectation: name => `希望${name}從一個好奇問題開始，完成一次小探索。`,
    titleTemplate: name => `${name}的小探索`,
    detailsHint: '例如「觀察三種葉子的形狀，留下一張照片或一段說明」。',
    completion: '完成約定的探索方法，並留下一項發現或紀錄。',
    preferredTime: 'weekend',
    supportLevel: 'check_after',
    showMinutes: true,
  },
};

export function oneTimeCopy(familyId: string | undefined): OneTimeCopy {
  return (familyId ? ONE_TIME_COPY[familyId] : undefined) ?? GENERIC_ONE_TIME_COPY;
}

/** 「這次安排的期待」的欄位標題，依任務目的換說法。 */
export const ONE_TIME_EXPECTATION_LABEL: Record<string, string> = {
  family_participation: '希望孩子參與的這次家庭事項',
  learning_skill: '希望孩子完成或練習的內容',
  autonomous_challenge: '孩子這次想完成的事情',
  life_routine: '希望孩子這次完成的內容',
};

export const ONE_TIME_EXPECTATION_HINT =
  '描述這次安排的目的，避免只寫「要認真」「不要拖延」等模糊要求。';

export const ONE_TIME_DETAILS_LABEL = '這次具體要完成什麼';

export const ONE_TIME_NOTES_HINT =
  '老師的特別要求、家庭例外、需要攜帶的物品或安全提醒都可以寫在這裡。';

/** 完成標準不可以寫成結果型條件 —— 顯示在「怎樣算完成」下方。 */
export const ONE_TIME_COMPLETION_HINT =
  '描述做到哪裡就算完成，不要寫成「考到幾分」「全部答對」「比別人好」'
  + '「作品被選上」「一次做到完美」或「家長覺得夠漂亮」。';

export const ONE_TIME_ENDING_NOTE = '完成這次後即結束，不會自動重複出現。';

export const SCHOOL_ASSIGNMENT_POLICY_TITLE = '學校作業怎麼回饋';

export const SCHOOL_ASSIGNMENT_POLICY_BODY =
  '老師原本指定的作業可以留下紀錄，但不建議成為固定賺幣來源。\n\n'
  + '若要回饋額外的訂正、練習或持續投入，請改用「訂正與複習」或成長計畫。';
