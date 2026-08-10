// Shadow Wallet · Parent Tablet — 自主挑戰（C 類）任務家族
//
// 這裡刻意只有一個家族。運動、創作、探索三個主題已經透過 browseCategories
// 同時出現在自主挑戰底下（見 learningAndSkills.ts），不再複製第二套卡片 ——
// 複製會造成同一主題兩張卡、設定各走各的。
//
// 硬規則：C 類來源必須是孩子提出或親子協商。家長單方指派會失去「自主」的產品意義。

import type { TaskPresetFamily } from './types';

export const AUTONOMOUS_CHALLENGE_FAMILIES: TaskPresetFamily[] = [
  {
    id: 'own-challenge',
    title: '我的自主挑戰',
    description: '由孩子提出一件想持續嘗試的事，再和家長一起確認合理範圍。',
    iconKey: 'spark',
    browseCategories: ['autonomous_challenge'],
    domainTags: ['自主', '挑戰', '孩子提案', '目標'],
    searchKeywords: ['自主', '挑戰', '孩子提出', '自己想做', '目標', '提案'],
    minAge: 6,
    maxAge: 12,
    visibility: 'core',
    recommendedRank: 15,
    defaultVariantId: 'own-challenge-plan',
    variants: [
      {
        id: 'own-challenge-plan',
        label: '30 天自主挑戰',
        purposeCategory: 'autonomous_challenge',
        allowedPurposeCategories: ['autonomous_challenge'],
        durationType: 'long_term',
        planMode: 'growth_plan',
        suggestedSource: 'child',
        allowedSources: ['child', 'co_created'],
        requiresChildChoice: true,
        defaultRewardPolicy: 'coin_eligible',
        allowedRewardPolicies: ['coin_eligible', 'time_saving_eligible', 'progress_only'],
        completionPolicy: 'plan_complete',
        defaultDraft: { durationDays: 30, durationDayChoices: [14, 30, 60], firstReviewDays: 7 },
        optionGroups: [],
        milestoneTemplate: { kind: 'weekly_review', note: '每週一起看一次，需要就調整目標' },
        feedbackHint: '內容由孩子提出，家長確認後成立',
        policyFlags: [
          '不可把一般家庭分工包裝成自主挑戰',
          '不可以成績、名次、體重或比賽結果作目標',
        ],
      },
    ],
  },
];
