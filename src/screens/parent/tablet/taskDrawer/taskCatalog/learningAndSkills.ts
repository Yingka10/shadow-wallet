// Shadow Wallet · Parent Tablet — 學習與技能（D 類）任務家族
//
// 硬規則：回饋對象是練習、訂正、持續與進步，不是一次考高分。
// 任何以考試分數、排名或「一次全對」作完成條件的設定都要被擋下（見 policyFlags）。
//
// 「運動與身體技能」「創作與製作」「探索一個好奇主題」同時掛在自主挑戰底下
// （browseCategories），不另外複製一份卡片。

import type { TaskPresetFamily, TaskPresetVariant } from './types';
import {
  CREATION_KIND,
  EXPLORE_METHOD,
  HOMEWORK_METHOD,
  PERFORMANCE_KIND,
  READING_METHOD,
  REVIEW_KIND,
  SCHOOL_SUBJECT,
  SPORT_KIND,
  SUBJECT_SCOPE,
} from './presetOptions';

const NO_SCORE_FLAG = '不可用考試分數、排名或一次全對作完成條件';

/** 學習與技能共用骨架：可發幣或記時間，來源多為親子協商。 */
function learningBase(): Pick<
  TaskPresetVariant,
  | 'purposeCategory'
  | 'allowedPurposeCategories'
  | 'suggestedSource'
  | 'allowedSources'
  | 'requiresChildChoice'
  | 'defaultRewardPolicy'
  | 'allowedRewardPolicies'
  | 'milestoneTemplate'
> {
  return {
    purposeCategory: 'learning_skill',
    allowedPurposeCategories: ['learning_skill'],
    suggestedSource: 'co_created',
    allowedSources: ['co_created', 'parent', 'child'],
    requiresChildChoice: false,
    defaultRewardPolicy: 'coin_eligible',
    allowedRewardPolicies: ['coin_eligible', 'time_saving_eligible', 'progress_only', 'record_only'],
    milestoneTemplate: { kind: 'none' },
  };
}

/** 同時可當自主挑戰的家族（運動／創作／探索）：目的可二選一，內容由孩子決定。 */
function learningOrChallengeBase(): ReturnType<typeof learningBase> {
  return {
    ...learningBase(),
    allowedPurposeCategories: ['learning_skill', 'autonomous_challenge'],
    suggestedSource: 'child',
    allowedSources: ['child', 'co_created'],
    requiresChildChoice: true,
  };
}

export const LEARNING_SKILL_FAMILIES: TaskPresetFamily[] = [
  {
    id: 'learn-reading',
    title: '閱讀與共讀',
    description: '依孩子目前的閱讀狀況，選擇適合的方式與節奏，每週再一起調整。',
    iconKey: 'book',
    browseCategories: ['learning_skill'],
    domainTags: ['閱讀', '語文', '共讀', '自主學習'],
    searchKeywords: ['閱讀', '讀書', '看書', '繪本', '故事', '書', '共讀', '朗讀'],
    minAge: 5,
    maxAge: 12,
    visibility: 'core',
    recommendedRank: 1,
    defaultVariantId: 'learn-reading-recurring',
    variants: [
      {
        ...learningBase(),
        id: 'learn-reading-recurring',
        label: '固定閱讀練習',
        durationType: 'recurring',
        completionPolicy: 'ongoing',
        defaultDraft: { recurrenceDays: [0, 1, 2, 3, 4, 5, 6], estimatedMinutes: 20 },
        optionGroups: [READING_METHOD],
        feedbackHint: '以投入時間與持續度回饋，不比較讀完幾本',
      },
      {
        ...learningBase(),
        id: 'learn-reading-plan',
        label: '四週閱讀成長計畫',
        durationType: 'long_term',
        planMode: 'growth_plan',
        requiresChildChoice: true,
        completionPolicy: 'plan_complete',
        defaultDraft: { durationDays: 28, durationDayChoices: [14, 28, 42], firstReviewDays: 7, estimatedMinutes: 20 },
        optionGroups: [READING_METHOD],
        milestoneTemplate: { kind: 'weekly_review', note: '每週一起看一次節奏，需要就調整' },
        feedbackHint: '回饋持續投入與每週的小進展',
      },
    ],
  },

  {
    id: 'learn-school-assignment',
    title: '完成一項學校作業',
    description: '把老師指定的作業完成，並在做完後留下紀錄。',
    iconKey: 'notebook',
    browseCategories: ['learning_skill'],
    domainTags: ['學校', '作業', '功課'],
    searchKeywords: ['作業', '功課', '學校', '習作', '聯絡簿'],
    minAge: 6,
    maxAge: 12,
    // 學校作業是本來就該做的事，不放進推薦，避免變成主要賺幣來源。
    visibility: 'category_only',
    defaultVariantId: 'learn-school-assignment-once',
    variants: [
      {
        ...learningBase(),
        id: 'learn-school-assignment-once',
        label: '完成一次作業',
        durationType: 'one_time',
        suggestedSource: 'parent',
        allowedSources: ['parent', 'co_created'],
        completionPolicy: 'complete_once',
        defaultRewardPolicy: 'record_only',
        allowedRewardPolicies: ['record_only', 'progress_only'],
        defaultDraft: { estimatedMinutes: 30 },
        optionGroups: [SCHOOL_SUBJECT],
        feedbackHint: '只留下完成紀錄，不另外發成長幣',
        policyFlags: [NO_SCORE_FLAG, '學校作業屬本來就該完成的事，不作為賺幣來源'],
      },
    ],
  },

  {
    id: 'learn-review',
    title: '訂正與複習',
    description: '挑出寫錯或不熟的部分，重做一次並說明原本卡在哪。',
    iconKey: 'pencil',
    browseCategories: ['learning_skill'],
    domainTags: ['訂正', '複習', '學習'],
    searchKeywords: ['訂正', '錯題', '複習', '考卷', '重做', '檢討'],
    minAge: 6,
    maxAge: 12,
    visibility: 'core',
    recommendedRank: 12,
    defaultVariantId: 'learn-review-recurring',
    variants: [
      {
        ...learningBase(),
        id: 'learn-review-once',
        label: '完成一次訂正',
        durationType: 'one_time',
        suggestedSource: 'parent',
        allowedSources: ['parent', 'co_created'],
        completionPolicy: 'complete_once',
        defaultDraft: { estimatedMinutes: 20 },
        optionGroups: [REVIEW_KIND],
        feedbackHint: '回饋訂正這件事本身，不看原本考幾分',
        policyFlags: [NO_SCORE_FLAG],
      },
      {
        ...learningBase(),
        id: 'learn-review-recurring',
        label: '固定複習',
        durationType: 'recurring',
        completionPolicy: 'ongoing',
        defaultDraft: { recurrenceDays: [1, 3, 5], estimatedMinutes: 20 },
        optionGroups: [REVIEW_KIND],
        feedbackHint: '以次數與持續度回饋',
        policyFlags: [NO_SCORE_FLAG],
      },
      {
        ...learningBase(),
        id: 'learn-review-plan',
        label: '四週小範圍補強',
        durationType: 'long_term',
        planMode: 'growth_plan',
        completionPolicy: 'plan_complete',
        defaultDraft: { durationDays: 28, durationDayChoices: [14, 28, 42], firstReviewDays: 7, estimatedMinutes: 20 },
        optionGroups: [SUBJECT_SCOPE],
        milestoneTemplate: { kind: 'weekly_review', note: '每週回顧一次哪裡變順了' },
        feedbackHint: '回饋練習與進步的過程',
        policyFlags: [NO_SCORE_FLAG],
      },
    ],
  },

  {
    id: 'learn-homework-method',
    title: '建立功課管理方法',
    description: '練習開始、安排順序、拆小或完成後檢查，找到適合自己的做法。',
    iconKey: 'clipboard',
    browseCategories: ['learning_skill'],
    domainTags: ['功課', '自我管理', '流程'],
    searchKeywords: ['功課', '作業', '安排', '順序', '管理', '拖延', '習慣'],
    minAge: 6,
    maxAge: 12,
    visibility: 'core',
    recommendedRank: 14,
    defaultVariantId: 'learn-homework-method-plan',
    variants: [
      {
        ...learningBase(),
        id: 'learn-homework-method-plan',
        label: '兩週功課方法支援',
        durationType: 'long_term',
        planMode: 'short_support',
        completionPolicy: 'stabilize_and_exit',
        defaultRewardPolicy: 'progress_only',
        allowedRewardPolicies: ['progress_only', 'record_only'],
        defaultDraft: { durationDays: 14, durationDayChoices: [7, 14, 21], firstReviewDays: 7 },
        optionGroups: [HOMEWORK_METHOD],
        milestoneTemplate: { kind: 'weekly_review', note: '一週後看一次哪個做法有效' },
        feedbackHint: '以進度與肯定回饋，穩定後結束',
      },
    ],
  },

  {
    id: 'learn-performance',
    title: '才藝與表演',
    description: '選擇樂器、舞蹈、朗讀或其他技能，分段練習一個想完成的內容。',
    iconKey: 'music',
    browseCategories: ['learning_skill'],
    domainTags: ['才藝', '音樂', '表演', '練習'],
    searchKeywords: ['才藝', '樂器', '練琴', '鋼琴', '小提琴', '舞蹈', '朗讀', '表演', '戲劇'],
    minAge: 5,
    maxAge: 12,
    visibility: 'core',
    recommendedRank: 13,
    defaultVariantId: 'learn-performance-recurring',
    variants: [
      {
        ...learningBase(),
        id: 'learn-performance-recurring',
        label: '固定練習',
        durationType: 'recurring',
        completionPolicy: 'ongoing',
        defaultDraft: { recurrenceDays: [1, 2, 3, 4, 5], estimatedMinutes: 30 },
        optionGroups: [PERFORMANCE_KIND],
        feedbackHint: '以練習時間與持續度回饋',
      },
      {
        ...learningBase(),
        id: 'learn-performance-plan',
        label: '六週成長計畫',
        durationType: 'long_term',
        planMode: 'growth_plan',
        requiresChildChoice: true,
        completionPolicy: 'plan_complete',
        defaultDraft: { durationDays: 42, durationDayChoices: [28, 42, 56], firstReviewDays: 7, estimatedMinutes: 30 },
        optionGroups: [PERFORMANCE_KIND],
        milestoneTemplate: { kind: 'checkpoint', checkpointDays: [14, 28, 42], note: '分段練習，每段完成即回饋' },
        feedbackHint: '回饋每個段落的完成，不等整首會了才算數',
      },
    ],
  },

  {
    id: 'learn-sport',
    title: '運動與身體技能',
    description: '由孩子選擇想練習的運動內容，從目前程度開始慢慢累積。',
    iconKey: 'run',
    browseCategories: ['learning_skill', 'autonomous_challenge'],
    domainTags: ['運動', '體能', '身體技能', '興趣'],
    searchKeywords: ['運動', '跑步', '球', '跳繩', '游泳', '腳踏車', '體能', '平衡'],
    minAge: 5,
    maxAge: 12,
    visibility: 'core',
    recommendedRank: 2,
    defaultVariantId: 'learn-sport-recurring',
    variants: [
      {
        ...learningOrChallengeBase(),
        id: 'learn-sport-recurring',
        label: '固定練習',
        durationType: 'recurring',
        completionPolicy: 'ongoing',
        defaultDraft: { recurrenceDays: [1, 3, 5], estimatedMinutes: 30 },
        optionGroups: [SPORT_KIND],
        feedbackHint: '孩子自己選內容，家長協助確認合理範圍',
        policyFlags: ['不可以比賽名次或體重作為目標'],
      },
      {
        ...learningOrChallengeBase(),
        id: 'learn-sport-plan',
        label: '六週成長計畫',
        durationType: 'long_term',
        planMode: 'growth_plan',
        completionPolicy: 'plan_complete',
        defaultDraft: { durationDays: 42, durationDayChoices: [28, 42, 56], firstReviewDays: 7, estimatedMinutes: 30 },
        optionGroups: [SPORT_KIND],
        milestoneTemplate: { kind: 'checkpoint', checkpointDays: [14, 28, 42], note: '每兩週看一次進展' },
        feedbackHint: '回饋持續練習與自己的進步幅度',
        policyFlags: ['不可以比賽名次或體重作為目標'],
      },
    ],
  },

  {
    id: 'learn-creation',
    title: '創作與製作',
    description: '選擇想做的作品，拆成幾個可以慢慢完成的小步驟。',
    iconKey: 'palette',
    browseCategories: ['learning_skill', 'autonomous_challenge'],
    domainTags: ['創作', '美術', '手作', '製作'],
    searchKeywords: ['創作', '畫畫', '美術', '手作', '作品', '勞作', '積木', '模型', '漫畫'],
    minAge: 5,
    maxAge: 12,
    visibility: 'core',
    recommendedRank: 3,
    defaultVariantId: 'learn-creation-plan',
    variants: [
      {
        ...learningOrChallengeBase(),
        id: 'learn-creation-once',
        label: '完成一次小作品',
        durationType: 'one_time',
        completionPolicy: 'complete_once',
        defaultDraft: { estimatedMinutes: 45 },
        optionGroups: [CREATION_KIND],
        feedbackHint: '回饋完成這件作品的投入',
      },
      {
        ...learningOrChallengeBase(),
        id: 'learn-creation-plan',
        label: '六週創作計畫',
        durationType: 'long_term',
        planMode: 'growth_plan',
        completionPolicy: 'plan_complete',
        defaultDraft: { durationDays: 42, durationDayChoices: [28, 42, 56], firstReviewDays: 7, estimatedMinutes: 30 },
        optionGroups: [CREATION_KIND],
        milestoneTemplate: { kind: 'checkpoint', checkpointDays: [14, 28, 42], note: '每個小步驟完成就回饋' },
        feedbackHint: '回饋每個完成的小步驟，不等作品全部做完',
      },
    ],
  },

  {
    id: 'learn-explore',
    title: '探索一個好奇主題',
    description: '從一個想知道的問題開始，用閱讀、觀察或詢問完成自己的小發現。',
    iconKey: 'compass',
    browseCategories: ['learning_skill', 'autonomous_challenge'],
    domainTags: ['探索', '好奇', '科學', '觀察', '專題'],
    searchKeywords: ['探索', '好奇', '科學', '觀察', '主題', '研究', '自然', '專題', '實驗'],
    minAge: 5,
    maxAge: 12,
    visibility: 'core',
    recommendedRank: 5,
    defaultVariantId: 'learn-explore-plan',
    variants: [
      {
        ...learningOrChallengeBase(),
        id: 'learn-explore-once',
        label: '完成一次探索',
        durationType: 'one_time',
        completionPolicy: 'complete_once',
        defaultDraft: { estimatedMinutes: 40 },
        optionGroups: [EXPLORE_METHOD],
        feedbackHint: '重視觀察與提問的過程，不要求標準答案',
      },
      {
        ...learningOrChallengeBase(),
        id: 'learn-explore-plan',
        label: '四週小專題',
        durationType: 'long_term',
        planMode: 'growth_plan',
        completionPolicy: 'plan_complete',
        defaultDraft: { durationDays: 28, durationDayChoices: [14, 28, 42], firstReviewDays: 7, estimatedMinutes: 25 },
        optionGroups: [EXPLORE_METHOD],
        milestoneTemplate: { kind: 'weekly_review', note: '每週說一個新發現' },
        feedbackHint: '回饋持續探究的過程與自己的發現',
      },
    ],
  },

  {
    id: 'learn-catchup',
    title: '加強一個目前較困難的學習內容',
    description: '選擇一個具體的小範圍，以短時間練習、訂正與回顧慢慢進步。',
    iconKey: 'target',
    browseCategories: ['learning_skill'],
    domainTags: ['學習', '補強', '練習', '困難'],
    searchKeywords: ['加強', '補強', '困難', '不會', '數學', '國語', '英文', '跟不上'],
    minAge: 6,
    maxAge: 12,
    // 針對特定困難才開，不進一般推薦，避免變成常態壓力來源。
    visibility: 'category_only',
    defaultVariantId: 'learn-catchup-plan',
    variants: [
      {
        ...learningBase(),
        id: 'learn-catchup-plan',
        label: '四週補強計畫',
        durationType: 'long_term',
        planMode: 'growth_plan',
        completionPolicy: 'plan_complete',
        defaultDraft: { durationDays: 28, durationDayChoices: [14, 28, 42], firstReviewDays: 7, estimatedMinutes: 20 },
        optionGroups: [SUBJECT_SCOPE],
        milestoneTemplate: { kind: 'weekly_review', note: '每週回顧一次哪裡變順了' },
        feedbackHint: '回饋練習、訂正與回顧的投入',
        policyFlags: [NO_SCORE_FLAG],
      },
    ],
  },
];
