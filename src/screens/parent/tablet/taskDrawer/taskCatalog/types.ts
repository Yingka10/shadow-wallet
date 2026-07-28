// Shadow Wallet · Parent Tablet — 任務 catalog 型別
//
// 正規化結構：TaskPresetFamily（主題）└── TaskPresetVariant[]（執行版本）
//
// 為什麼要家族／版本兩層：同一個主題（例如「閱讀與共讀」）可以是固定重複，
// 也可以是四週成長計畫。攤平成兩張卡會讓 Step 1 出現大量重複主題、且後續無法維護。
// 長期不是另一套分類 —— 它只是 durationType 的第三個值。
//
// 對應 docs/SPEC_task-taxonomy-2026-07.md。

// ---------------------------------------------------------------------------
// 列舉
// ---------------------------------------------------------------------------

/**
 * catalog 的版本標記。
 *
 * catalog 是 TypeScript 常數不是 DB master table，所以 preset id 不設外鍵；
 * 改為把「產生這筆資料時 catalog 長什麼樣」記在任務上，
 * 之後 family 或 variant 改定義時，才分得出舊任務是依哪一版建立的。
 *
 * 改動 26 family / 36 variant 的定義時要一起進版。
 */
export const PRESET_CATALOG_VERSION = '2026-07-28';

/**
 * 任務政策的版本。
 *
 * 與 [PRESET_CATALOG_VERSION] 是兩件事，不可混用：
 *   catalog 版本 = 「抽屜裡有哪 26 個家族、36 個版本、各自的預設值」——**內容**
 *   policy 版本  = 「任務目的怎麼分、來源要求什麼、哪些回饋方式合法、
 *                   怎麼算結束與退場」——**規則**
 *
 * 加一個新家族只動 catalog；改「家庭參與不得發幣」這種規則才動 policy。
 * 兩者的變更頻率與影響範圍差很多，共用一個版本號會讓稽核失去意義。
 *
 * 來源：docs/SPEC_task-taxonomy-2026-07.md（「2026-07 定稿」）。
 * 那份文件是純文字沒有機器可讀的版本，所以在這裡建立常數對應它 ——
 * 改動 SPEC 的規則時要一起進版。
 *
 * 也不可與幣值政策混用：幣值是 coin-policy.json 的 policyVersion
 * （見 taskReward/rewardPolicyVersion.ts），改幣值數字不該讓分類版本跟著動。
 */
export const TASK_POLICY_VERSION = 'task-taxonomy-2026-07';

/**
 * 任務目的。對應 SPEC 的 A/B/C/D：
 *   life_routine         = A 生活常規（6 歲以上只做短期支援）
 *   family_participation = B 家庭參與（不發成長幣）
 *   autonomous_challenge = C 自主挑戰（需孩子選擇或親子協商）
 *   learning_skill       = D 學習與技能（重視投入、持續與進步）
 */
export type PurposeCategory =
  | 'life_routine'
  | 'family_participation'
  | 'autonomous_challenge'
  | 'learning_skill';

/**
 * 瀏覽分類（Step 1 的 chips）。與 PurposeCategory 同名但語義不同：
 * 一個家族可以同時掛在多個瀏覽分類下（例如「運動與身體技能」同時是學習與技能、自主挑戰），
 * 但它建立出來的任務只會有一個 purposeCategory。
 */
export type BrowseCategory =
  | 'family_participation'
  | 'autonomous_challenge'
  | 'learning_skill'
  | 'life_routine';

/** 執行期間。長期不是新分類，是第三種執行形式。 */
export type DurationType = 'one_time' | 'recurring' | 'long_term';

/** 計畫型態。只有 durationType === 'long_term' 才會有值。 */
export type PlanMode = 'growth_plan' | 'family_role' | 'short_support';

/** 任務來源。C 類不應該是純 parent。 */
export type TaskSource = 'parent' | 'child' | 'co_created' | 'system';

/**
 * 回饋方式。
 *   record_only          = 只留下完成紀錄，不額外回饋（例：學校作業）
 *   family_contribution  = 家庭葉片／貢獻紀錄／週報被看見，不發幣
 *   progress_only        = 只記進度與肯定（生活常規短期支援）
 *   coin_eligible        = 可發成長幣
 *   time_saving_eligible = 可記時間儲蓄
 */
export type RewardPolicy =
  | 'record_only'
  | 'family_contribution'
  | 'progress_only'
  | 'coin_eligible'
  | 'time_saving_eligible';

/**
 * 這個版本怎麼算結束。
 *   complete_once       = 做完一次就結束，不會自動重複出現（單次任務固定為此）
 *   ongoing             = 持續重複，沒有終止日
 *   plan_complete       = 計畫期滿即完成
 *   review_and_continue = 期滿後一起回顧，再決定是否延續（家庭角色）
 *   stabilize_and_exit  = 穩定後結束，不作固定賺幣來源（生活常規短期支援）
 */
export type CompletionPolicy =
  | 'complete_once'
  | 'ongoing'
  | 'plan_complete'
  | 'review_and_continue'
  | 'stabilize_and_exit';

/**
 * 家族在 Step 1 的曝光程度。
 *   core          = 可進推薦，也出現在所屬分類
 *   category_only = 不進推薦，只在選到分類或搜尋命中時出現
 *   search_only   = 只有搜尋命中才出現
 */
export type Visibility = 'core' | 'category_only' | 'search_only';

/** 卡片圖示鍵；實際 SVG 在 ../drawerIcons.tsx。 */
export type IconKey =
  | 'book'
  | 'run'
  | 'palette'
  | 'music'
  | 'compass'
  | 'target'
  | 'clipboard'
  | 'spark'
  | 'role'
  | 'sprout'
  | 'backpack'
  | 'plate'
  | 'dishes'
  | 'laundry'
  | 'broom'
  | 'recycle'
  | 'box'
  | 'pencil'
  | 'notebook'
  | 'sunrise'
  | 'doorway'
  | 'moon'
  | 'shelf'
  | 'screen'
  | 'switchTask'
  | 'selfcare';

// ---------------------------------------------------------------------------
// 選項（下一階段表單用，本輪只儲存與搜尋）
// ---------------------------------------------------------------------------

export type PresetOption = {
  id: string;
  label: string;
};

export type OptionGroup = {
  id: string;
  /** 表單上這一組的提問，例如「用什麼方式進行？」 */
  label: string;
  selection: 'single' | 'multiple';
  options: PresetOption[];
  /** true = 這組允許家長或孩子自填「其他」。 */
  allowCustom?: boolean;
  /** true = 下一階段表單必須選一項才能送出。 */
  required?: boolean;
  /** single 選擇組的預設選項；沒有就讓家長自己選（例如家庭角色刻意不預設）。 */
  defaultOptionId?: string;
};

// ---------------------------------------------------------------------------
// 草稿預設值 / 里程碑（下一階段表單的起始值）
// ---------------------------------------------------------------------------

export type TaskDraftDefaults = {
  /** 長期任務的建議天數。 */
  durationDays?: number;
  /** 家長可選的天數（例：按約定結束 3C 可選 7 或 14）。 */
  durationDayChoices?: number[];
  /** 第一次回顧的天數。 */
  firstReviewDays?: number;
  /** 週期任務的預設執行日（0 = 週日）。 */
  recurrenceDays?: number[];
  /**
   * 預設「每週幾次」。只有 scheduleMode 走 weekly_frequency 時才用得到；
   * DB 目前只有 recurrence_days，這個值本輪僅存在本地草稿。
   */
  weeklyFrequency?: number;
  /** 估計投入分鐘數，之後餵給規則引擎算幣。 */
  estimatedMinutes?: number;
  /** 若這個版本的任務名稱與家族標題不同，用這個。 */
  titleOverride?: string;
};

export type MilestoneTemplate = {
  kind: 'none' | 'weekly_review' | 'checkpoint';
  /** kind === 'checkpoint' 時的檢查點天數。 */
  checkpointDays?: number[];
  note?: string;
};

// ---------------------------------------------------------------------------
// 家族 / 版本
// ---------------------------------------------------------------------------

export type TaskPresetVariant = {
  id: string;
  /** Step 2「選擇執行方式」上顯示的名稱，例如「四週閱讀成長計畫」。 */
  label: string;

  purposeCategory: PurposeCategory;
  /** 家長在下一階段可以改成哪些目的；至少包含 purposeCategory 自己。 */
  allowedPurposeCategories: PurposeCategory[];

  durationType: DurationType;
  /** 只有 durationType === 'long_term' 才有值。 */
  planMode?: PlanMode;

  suggestedSource: TaskSource;
  allowedSources: TaskSource[];
  requiresChildChoice: boolean;

  defaultRewardPolicy: RewardPolicy;
  /** 規則引擎之外的第一道界線：家庭參與永遠不含 coin_eligible。 */
  allowedRewardPolicies: RewardPolicy[];

  completionPolicy: CompletionPolicy;

  defaultDraft: TaskDraftDefaults;
  optionGroups: OptionGroup[];
  milestoneTemplate: MilestoneTemplate;

  /** 一行回饋說明，顯示在 Step 2。 */
  feedbackHint?: string;
  /** 安全或執行上的提醒。 */
  safetyNotes?: string[];
  /** 政策界線，之後餵給規則引擎與家長確認畫面。 */
  policyFlags?: string[];
};

export type TaskPresetFamily = {
  id: string;
  title: string;
  description: string;
  iconKey: IconKey;

  /** 出現在哪些 chips 底下；可多個。 */
  browseCategories: BrowseCategory[];
  domainTags: string[];
  searchKeywords: string[];

  minAge: number;
  maxAge: number;

  visibility: Visibility;
  /** 有值且 visibility === 'core' 才進推薦；數字越小越前面。 */
  recommendedRank?: number;

  defaultVariantId: string;
  variants: TaskPresetVariant[];
};

// ---------------------------------------------------------------------------
// 顯示用標籤
// ---------------------------------------------------------------------------

export const PURPOSE_LABEL: Record<PurposeCategory, string> = {
  life_routine: '生活小計畫',
  family_participation: '家庭參與',
  autonomous_challenge: '自主挑戰',
  learning_skill: '學習與技能',
};

export const BROWSE_LABEL: Record<BrowseCategory, string> = {
  family_participation: '家庭參與',
  autonomous_challenge: '自主挑戰',
  learning_skill: '學習與技能',
  life_routine: '生活小計畫',
};

export const REWARD_LABEL: Record<RewardPolicy, string> = {
  record_only: '只留下完成紀錄',
  family_contribution: '記錄家庭參與，不發成長幣',
  progress_only: '以進度與肯定回饋',
  coin_eligible: '可獲得成長幣',
  time_saving_eligible: '可累積時間儲蓄',
};

export const COMPLETION_LABEL: Record<CompletionPolicy, string> = {
  complete_once: '完成這次後即結束，不會自動重複出現',
  ongoing: '持續重複，沒有終止日',
  plan_complete: '計畫期滿即完成',
  review_and_continue: '期滿一起回顧，再決定是否延續',
  stabilize_and_exit: '穩定後結束，不作固定賺幣來源',
};

/** 年齡段顯示字串（與 lib/onboarding.ts 的 AgeGroup 對齊）。 */
export const AGE_GROUP_LABEL: Record<string, string> = {
  '2-4': '2–4 歲',
  '4-6': '4–6 歲',
  '6-9': '6–9 歲',
  '9-12': '9–12 歲',
};

/** 單一版本的形式標籤：長期顯示的是計畫型態，不是「長期」兩個字。 */
export function variantFormLabel(variant: TaskPresetVariant): string {
  if (variant.durationType === 'one_time') return '單次';
  if (variant.durationType === 'recurring') return '固定重複';
  if (variant.planMode === 'family_role') return '家庭角色';
  if (variant.planMode === 'short_support') return '短期小計畫';
  return '成長計畫';
}

/**
 * 家族在 Step 1 卡片上的形式摘要。
 * 只有一個版本 → 直接顯示它的形式；多個版本 → 短摘要，不把所有標籤塞上去。
 */
export function familyFormSummary(family: TaskPresetFamily): string {
  if (family.variants.length === 1) return variantFormLabel(family.variants[0]);

  const kinds: string[] = [];
  for (const v of family.variants) {
    const kind = v.durationType === 'one_time' ? '單次' : v.durationType === 'recurring' ? '固定' : '計畫';
    if (!kinds.includes(kind)) kinds.push(kind);
  }
  if (kinds.length === 1) return kinds[0];
  return `可選${kinds.join('／')}`;
}

/** 取家族的預設版本；defaultVariantId 找不到時退回第一個。 */
export function defaultVariantOf(family: TaskPresetFamily): TaskPresetVariant {
  return family.variants.find(v => v.id === family.defaultVariantId) ?? family.variants[0];
}
