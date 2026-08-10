// Shadow Wallet · Parent Tablet — CreateParentTaskCommand 的持久化落差
//
// 這是 docs/TASK_DRAWER_PERSISTENCE_PLAN.md 的機器可讀版本，用途只有一個：
// 讓下一階段寫 migration 時有**單一來源**，不必再從文件抄一次欄位清單。
//
// 不顯示給家長、不進任何畫面、不放進 UI 路徑（有測試把關）。
//
// 對照基準：
//   supabase/migrations/*（tasks / child_tasks / long_term_goals 的實際欄位）
//   src/types/database.ts
//   src/screens/parent/ParentTaskCreateScreen.tsx（現行建立流程）
//   src/lib/taskActions.ts（現行長期任務建立流程）

export type PersistenceSupport =
  /** 現有欄位就能直接存，語義也對得上。 */
  | 'supported'
  /** 現有欄位存得下，但需要轉換或語義有落差，轉換規則要寫死在 service。 */
  | 'transform_required'
  /** 現有 schema 沒地方放，需要新欄位／新表。 */
  | 'schema_required'
  /** 這一輪不打算持久化（功能本身還不存在）。 */
  | 'not_planned';

export type TaskPersistenceGap = {
  /** CreateParentTaskCommand 上的路徑。 */
  field: string;
  support: PersistenceSupport;
  /** 目前 schema 上最接近的位置；沒有就不帶。 */
  currentTarget?: string;
  /** 建議寫到哪裡。 */
  proposedTarget?: string;
  reason: string;
};

const GAPS: TaskPersistenceGap[] = [
  // ── 身分 ───────────────────────────────────────────────────────────────
  {
    field: 'childId',
    support: 'supported',
    currentTarget: 'child_tasks.child_id',
    reason: '既有流程已經一對一寫入 child_tasks。',
  },
  {
    field: 'familyId',
    support: 'transform_required',
    currentTarget: 'tasks.family_id',
    proposedTarget: 'tasks.family_id（改由 children.family_id 取得）',
    reason:
      '欄位本身沒問題，取值方式有問題：ParentTaskCreateScreen 目前用 '
      + "parents.select('family_id').limit(1) 拿任意一筆家庭，雙家長或多家庭帳號會寫錯家。",
  },
  {
    field: 'schemaVersion',
    support: 'schema_required',
    proposedTarget: 'tasks.preset_schema_version smallint',
    reason: '之後改變命令語義時要能分辨舊資料是用哪一版契約建立的。',
  },

  // ── preset 溯源 ─────────────────────────────────────────────────────────
  {
    field: 'preset.familyId',
    support: 'schema_required',
    proposedTarget: 'tasks.preset_family_id text',
    reason:
      '沒有 preset 溯源就無法回答「哪些 preset 真的被家長採用」，'
      + 'catalog 改版時也無從得知既有任務是從哪一版長出來的。',
  },
  {
    field: 'preset.variantId',
    support: 'schema_required',
    proposedTarget: 'tasks.preset_variant_id text',
    reason: '同上；版本比家族更能說明家長選的是哪一種執行形式。',
  },

  // ── 任務本體 ───────────────────────────────────────────────────────────
  {
    field: 'task.title',
    support: 'supported',
    currentTarget: 'tasks.name',
    reason: '直接對應。',
  },
  {
    field: 'task.purposeCategory',
    support: 'transform_required',
    currentTarget: 'tasks.category',
    proposedTarget: 'tasks.purpose_category text（保留 category 供既有 RPC 過渡）',
    reason:
      'life_routine/family_participation/autonomous_challenge/learning_skill 目前要壓成 '
      + 'A/B/C/D 一個字母。fn_complete_task 仍讀 category，不能直接換掉，'
      + '但長期要把語義欄位獨立出來（DELTA §4）。',
  },
  {
    field: 'task.durationType',
    support: 'transform_required',
    currentTarget: 'tasks.day_type / tasks.is_long_term',
    proposedTarget: 'tasks.duration_type text',
    reason:
      'one_time → day_type=once、recurring → day_type=custom、long_term → is_long_term=true，'
      + '轉得過去但反推不回來（day_type=custom 也可能是長期）。',
  },
  {
    field: 'task.planMode',
    support: 'schema_required',
    currentTarget: 'long_term_goals.goal_type',
    proposedTarget: 'long_term_goals.plan_mode text',
    reason:
      'goal_type 的四個值（habit/skill/family/challenge）與 growth_plan/short_support/'
      + 'family_role 不是同一套切法，硬塞會讓兩邊語義互相污染。',
  },
  {
    field: 'task.source',
    support: 'schema_required',
    proposedTarget: 'tasks.task_source text',
    reason:
      '自主挑戰的硬規則是「來源須為孩子提出或親子協商」，沒有這欄就無法在完成時檢查，'
      + '規則只停留在建立當下的畫面上（DELTA §4）。',
  },
  {
    field: 'task.rewardPolicy',
    support: 'schema_required',
    currentTarget: '（目前由 category 隱含）',
    proposedTarget: 'tasks.reward_policy text',
    reason:
      '同一個 category 現在可能對應不同回饋方式（學習與技能可以是幣、進度或純紀錄）。'
      + '用 category 隱含會讓「家庭參與不發幣」這條規則沒有資料層依據。',
  },
  {
    field: 'task.completionPolicy',
    support: 'schema_required',
    proposedTarget: 'tasks.completion_policy text',
    reason:
      '單次任務完成後要停止出現、短期支援穩定後要退場、家庭角色期滿要回顧 —— '
      + '這三件事都需要排程端讀得到結束方式。',
  },
  {
    field: 'task.originalExpectation',
    support: 'schema_required',
    currentTarget: 'long_term_goals.motivation_note（僅長期任務）',
    proposedTarget: 'tasks.original_expectation text',
    reason:
      '家長原始期待對單次與固定任務同樣存在，而且它是「不得被建議覆蓋」的內容，'
      + '必須獨立保存才能在之後比對 AI 建議前後的差異。',
  },
  {
    field: 'task.completionDescription',
    support: 'schema_required',
    proposedTarget: 'tasks.completion_description text',
    reason: '「怎樣算完成」是孩子端與家長端判斷的依據，目前完全沒有存放位置。',
  },
  {
    field: 'task.notes',
    support: 'schema_required',
    proposedTarget: 'tasks.notes text',
    reason: '單次任務的老師要求、要帶的東西、安全提醒；沒有欄位就整段消失。',
  },

  // ── 排程 ───────────────────────────────────────────────────────────────
  {
    field: 'schedule.mode',
    support: 'transform_required',
    currentTarget: 'tasks.day_type',
    reason: 'one_time → once、fixed_days → custom；weekly_frequency 沒有對應值。',
  },
  {
    field: 'schedule.startDate',
    support: 'transform_required',
    currentTarget: 'long_term_goals.started_at（僅長期任務）',
    proposedTarget: 'tasks.start_date date',
    reason:
      '固定任務與單次任務沒有開始日欄位，建立後一律「即刻生效」，'
      + '家長選的「明天開始」現在會被忽略。',
  },
  {
    field: 'schedule.scheduledDate',
    support: 'transform_required',
    currentTarget: 'tasks.due_date',
    reason:
      'due_date 的語義是「過了就隱藏」，抽屜的 scheduledDate 是「安排在這一天」。'
      + '值可以放進去，但排程與提醒要知道它是安排日而不是截止日。',
  },
  {
    field: 'schedule.recurrenceDays',
    support: 'supported',
    currentTarget: 'tasks.recurrence_days',
    reason: '同為 integer[]，且同樣以 0 代表週日，定義一致。',
  },
  {
    field: 'schedule.weeklyFrequency',
    support: 'schema_required',
    proposedTarget: 'tasks.weekly_frequency smallint',
    reason:
      '「每週三次、不指定星期」在現有 schema 完全表達不出來。'
      + '不可退化成隨便挑三天寫進 recurrence_days —— 那會變成家長沒答應過的安排。',
  },
  {
    field: 'schedule.preferredTime',
    support: 'schema_required',
    currentTarget: 'long_term_goals.preferred_time_window（只有兩個值）',
    proposedTarget: 'tasks.preferred_time text',
    reason:
      'preferred_time_window 只允許 after_dinner / before_bed，抽屜有七個時段，'
      + '且只有長期任務有這欄。',
  },
  {
    field: 'schedule.preferredTimeCustom',
    support: 'schema_required',
    proposedTarget: 'tasks.preferred_time_custom text',
    reason: '「用餐前」這種自訂時段是家庭參與的常態，不是例外。',
  },
  {
    field: 'schedule.estimatedMinutes',
    support: 'transform_required',
    currentTarget: 'tasks.base_time_min',
    proposedTarget: 'tasks.estimated_minutes（與幣值基礎分開）',
    reason:
      'base_time_min 同時是幣值計算的乘數基礎。把家長估的投入時間直接寫進去，'
      + '等於偷偷改了幣值；兩件事應該分成兩欄。',
  },
  {
    field: 'schedule.reminderMode',
    support: 'not_planned',
    reason:
      '通知排程本身還不存在。先存一個沒有人讀的欄位只會製造「看起來會提醒但不會」的假象，'
      + '等通知功能有了再一起加。',
  },
  {
    field: 'schedule.durationDays',
    support: 'supported',
    currentTarget: 'long_term_goals.total_days',
    reason: '長期形式直接對應；單次與固定任務本來就沒有期間。',
  },
  {
    field: 'schedule.endDate',
    support: 'transform_required',
    currentTarget: '（可由 started_at + total_days 推得）',
    reason: '不必新增欄位，但排程查詢若要走索引，之後可考慮存成 generated column。',
  },

  // ── 回顧 ───────────────────────────────────────────────────────────────
  {
    field: 'review.firstReviewAfterDays',
    support: 'transform_required',
    currentTarget: 'long_term_goals.next_review_at',
    reason: 'next_review_at 存的是時間點，天數要由 started_at 反推；重排回顧時容易算錯。',
  },
  {
    field: 'review.reviewAfterDays',
    support: 'schema_required',
    proposedTarget: 'tasks.review_after_days smallint',
    reason:
      '固定任務的「N 天後一起看看」沒有 long_term_goals 可以掛，目前無處可放。',
  },
  {
    field: 'review.weekendReviewEnabled',
    support: 'schema_required',
    proposedTarget: 'tasks.weekend_review_enabled boolean',
    reason: '週報與週末回顧提示要讀得到這個旗標。',
  },

  // ── 內容 ───────────────────────────────────────────────────────────────
  {
    field: 'content.selectedOptions',
    support: 'schema_required',
    proposedTarget: 'task_preset_selections（子表：task_id, group_id, option_id）',
    reason:
      '這是唯一能回答「多少家庭讓孩子自己閱讀」的資料。存成 JSONB 雖然快，'
      + '但選項是要拿來做週報與長期分析的維度，子表才查得動。',
  },
  {
    field: 'content.customOptionValues',
    support: 'schema_required',
    proposedTarget: 'task_preset_selections.custom_value text',
    reason: '「其他」的自填內容與選項是一組，放在同一張子表。',
  },
  {
    field: 'content.taskDetails',
    support: 'schema_required',
    proposedTarget: 'tasks.task_details text',
    reason: '單次任務的「這次具體要完成什麼」是必填，也是孩子端要看到的主要內容。',
  },

  // ── 計畫 ───────────────────────────────────────────────────────────────
  {
    field: 'plan.milestones',
    support: 'schema_required',
    currentTarget: 'long_term_goals.level_definitions / checkpoint_rewards',
    proposedTarget: 'task_plan_milestones（子表：goal_id, seq, title, target_day）',
    reason:
      'level_definitions 的形狀綁著幣值（name + coin），checkpoint_rewards 是 day→coin。'
      + '成長計畫的里程碑刻意沒有幣值，塞進去會把「回饋投入」變回「回饋達標」。',
  },
  {
    field: 'plan.supportSteps',
    support: 'schema_required',
    proposedTarget: 'task_plan_support_steps（子表：goal_id, seq, text）',
    reason: '短期支援的步驟是孩子端要照著做的清單，需要順序與逐項狀態。',
  },
  {
    field: 'plan.focusOptionIds',
    support: 'schema_required',
    proposedTarget: 'task_preset_selections（與 selectedOptions 同一張表）',
    reason: '焦點就是短期支援那一組選項的答案，不該另開第二個儲存位置。',
  },

  // ── 家庭角色 ───────────────────────────────────────────────────────────
  {
    field: 'role.optionId',
    support: 'transform_required',
    currentTarget: 'long_term_goals.role_title',
    proposedTarget: 'long_term_goals.role_option_id text（role_title 留給顯示名稱）',
    reason: 'role_title 是自由文字，存 id 進去之後就分不出「餐桌小幫手」是選的還是打的。',
  },
  {
    field: 'role.customValue',
    support: 'supported',
    currentTarget: 'long_term_goals.role_title',
    reason: '自訂角色名稱正好就是 role_title 的原意。',
  },
  {
    field: 'role.responsibilities',
    support: 'schema_required',
    proposedTarget: 'task_role_responsibilities（子表：goal_id, seq, text, is_custom）',
    reason:
      '負責內容要逐項顯示給孩子，也要在期滿回顧時逐項討論；'
      + '壓成一段文字就沒辦法「只調整其中一項」。',
  },
  {
    field: 'role.scopeDescription',
    support: 'schema_required',
    proposedTarget: 'long_term_goals.scope_description text',
    reason: '負責範圍是家庭角色的核心約定，沒有欄位就只能靠家長記得。',
  },
  {
    field: 'role.exceptionDescription',
    support: 'schema_required',
    proposedTarget: 'long_term_goals.exception_description text',
    reason: '「什麼情況可以跳過」是這個產品刻意設計的退路，不能在建立時就遺失。',
  },
  {
    field: 'role.contributionDescription',
    support: 'schema_required',
    proposedTarget: 'long_term_goals.contribution_description text',
    reason: '家庭參與不發幣，貢獻紀錄說明就是它唯一的回饋依據。',
  },
  {
    field: 'support.level',
    support: 'schema_required',
    proposedTarget: 'tasks.support_level text',
    reason:
      '家長一開始怎麼協助會影響孩子端的呈現（一起做 vs 完成後確認），'
      + '也是回顧時「是否可以放手了」的比較基準。',
  },

  // ── metadata ───────────────────────────────────────────────────────────
  {
    field: 'metadata.ageGroup',
    support: 'supported',
    currentTarget: 'children.age_group',
    reason: '已經存在孩子身上，不需要在任務上再存一份（會過期）。',
  },
  {
    field: 'metadata.createdFromPreset',
    support: 'schema_required',
    proposedTarget: 'tasks.created_from_preset boolean',
    reason: '要能分辨預設任務與家長全手動建立的任務，否則無法評估抽屜有沒有用。',
  },
  {
    field: 'metadata.taskPolicyVersion',
    support: 'schema_required',
    proposedTarget: 'tasks.task_policy_version text',
    reason:
      '幣值與資格規則是版本化的（coin-policy.json）。沒有記下建立當時的版本，'
      + '日後就無法解釋「為什麼同一種任務去年給的幣不一樣」。',
  },
  {
    field: 'metadata.editorKind',
    support: 'schema_required',
    proposedTarget: '（與 task.planMode / duration_type 合併，不另開欄位）',
    reason:
      'editorKind 可由 durationType + planMode 完整還原，另存一欄只會多一個可能不同步的來源。',
  },
];

/** 下一階段 migration 的單一來源。回傳複本，呼叫端改不到內部資料。 */
export function getTaskPersistenceGaps(): TaskPersistenceGap[] {
  return GAPS.map(gap => ({ ...gap }));
}

/** 依支援程度分組，方便產出 migration 清單。 */
export function groupGapsBySupport(): Record<PersistenceSupport, TaskPersistenceGap[]> {
  const out: Record<PersistenceSupport, TaskPersistenceGap[]> = {
    supported: [],
    transform_required: [],
    schema_required: [],
    not_planned: [],
  };
  for (const gap of getTaskPersistenceGaps()) out[gap.support].push(gap);
  return out;
}
