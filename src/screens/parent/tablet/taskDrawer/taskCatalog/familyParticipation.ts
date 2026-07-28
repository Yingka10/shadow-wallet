// Shadow Wallet · Parent Tablet — 家庭參與（B 類）任務家族
//
// 硬規則：家庭參與的任何版本一律只有 family_contribution 一種回饋。
//
// 不是「不發幣就好」——「一般留下紀錄」也不適用：家庭參與有自己一套被看見的方式
// （家庭葉片／貢獻紀錄／週報肯定），和單純留痕不同，所以 allowedRewardPolicies
// 只留一個值，畫面上也就沒有可選的餘地（有 catalogIntegrity 測試把關）。
//
// 孩子主動承接、明顯超出原本責任的額外協助 → 在下一步改判為自主挑戰，不是替 B 類加幣。

import type { TaskPresetFamily, TaskPresetVariant } from './types';
import {
  AFTER_MEAL_TIDY,
  CARE_ROLE_KIND,
  FAMILY_ROLE_KIND,
  HOUSEHOLD_SUPPLY,
  LAUNDRY_SORT,
  PLANT_PET_CARE,
  RECYCLING_KIND,
  SHARED_AREA,
  TABLE_SETUP,
} from './presetOptions';

/** 家庭參與共用的版本骨架：來源家長提出、回饋固定為家庭貢獻。 */
function familyBase(): Pick<
  TaskPresetVariant,
  | 'purposeCategory'
  | 'allowedPurposeCategories'
  | 'suggestedSource'
  | 'allowedSources'
  | 'requiresChildChoice'
  | 'defaultRewardPolicy'
  | 'allowedRewardPolicies'
  | 'milestoneTemplate'
  | 'feedbackHint'
> {
  return {
    purposeCategory: 'family_participation',
    // 允許改判為自主挑戰：孩子主動承接、明顯超出本分時。
    allowedPurposeCategories: ['family_participation', 'autonomous_challenge'],
    suggestedSource: 'parent',
    allowedSources: ['parent', 'co_created'],
    requiresChildChoice: false,
    defaultRewardPolicy: 'family_contribution',
    // 只有一個值：家庭參與不是「一般留下紀錄」，也不得出現幣或時間儲蓄。
    allowedRewardPolicies: ['family_contribution'],
    milestoneTemplate: { kind: 'none' },
    feedbackHint: '記錄家庭參與，不發成長幣',
  };
}

export const FAMILY_PARTICIPATION_FAMILIES: TaskPresetFamily[] = [
  {
    id: 'fam-set-table',
    title: '用餐前準備餐桌',
    description: '在開飯前把需要的餐具與物品放到桌上。',
    iconKey: 'plate',
    browseCategories: ['family_participation'],
    domainTags: ['家庭參與', '餐桌', '家務'],
    searchKeywords: ['餐桌', '擺碗', '碗筷', '吃飯', '餐具', '開飯', '家務'],
    minAge: 4,
    maxAge: 12,
    visibility: 'core',
    recommendedRank: 4,
    defaultVariantId: 'fam-set-table-recurring',
    variants: [
      {
        ...familyBase(),
        id: 'fam-set-table-recurring',
        label: '固定在用餐前準備',
        durationType: 'recurring',
        completionPolicy: 'ongoing',
        defaultDraft: { recurrenceDays: [0, 1, 2, 3, 4, 5, 6], estimatedMinutes: 5 },
        optionGroups: [TABLE_SETUP],
      },
    ],
  },

  {
    id: 'fam-clear-table',
    title: '用餐後協助整理',
    description: '把自己的碗盤收走，並幫忙把桌面擦乾淨。',
    iconKey: 'dishes',
    browseCategories: ['family_participation'],
    domainTags: ['家庭參與', '餐後', '家務'],
    searchKeywords: ['收碗', '洗碗', '餐後', '擦桌', '整理', '廚房', '家務'],
    minAge: 4,
    maxAge: 12,
    visibility: 'core',
    recommendedRank: 6,
    defaultVariantId: 'fam-clear-table-recurring',
    variants: [
      {
        ...familyBase(),
        id: 'fam-clear-table-recurring',
        label: '固定在用餐後整理',
        durationType: 'recurring',
        completionPolicy: 'ongoing',
        defaultDraft: { recurrenceDays: [0, 1, 2, 3, 4, 5, 6], estimatedMinutes: 8 },
        optionGroups: [AFTER_MEAL_TIDY],
      },
    ],
  },

  {
    id: 'fam-laundry',
    title: '協助整理乾淨衣物',
    description: '把洗好的衣物依家人或種類分類、摺好並放回原位。',
    iconKey: 'laundry',
    browseCategories: ['family_participation'],
    domainTags: ['家庭參與', '衣物', '家務'],
    searchKeywords: ['衣服', '摺衣服', '洗衣', '分類', '收衣服', '家務'],
    minAge: 5,
    maxAge: 12,
    visibility: 'core',
    recommendedRank: 7,
    defaultVariantId: 'fam-laundry-recurring',
    variants: [
      {
        ...familyBase(),
        id: 'fam-laundry-recurring',
        label: '固定協助整理衣物',
        durationType: 'recurring',
        completionPolicy: 'ongoing',
        defaultDraft: { recurrenceDays: [0, 3], estimatedMinutes: 15 },
        optionGroups: [LAUNDRY_SORT],
      },
    ],
  },

  {
    id: 'fam-tidy-area',
    title: '整理共同使用的小區域',
    description: '選一個大家都會用到的地方，把東西歸回原位。',
    iconKey: 'broom',
    browseCategories: ['family_participation'],
    domainTags: ['家庭參與', '整理', '公共空間'],
    searchKeywords: ['整理', '收拾', '客廳', '空間', '區域', '歸位', '打掃'],
    minAge: 4,
    maxAge: 12,
    visibility: 'core',
    recommendedRank: 8,
    defaultVariantId: 'fam-tidy-area-recurring',
    variants: [
      {
        ...familyBase(),
        id: 'fam-tidy-area-once',
        label: '整理一次',
        durationType: 'one_time',
        completionPolicy: 'complete_once',
        defaultDraft: { estimatedMinutes: 20 },
        optionGroups: [SHARED_AREA],
      },
      {
        ...familyBase(),
        id: 'fam-tidy-area-recurring',
        label: '固定整理',
        durationType: 'recurring',
        completionPolicy: 'ongoing',
        defaultDraft: { recurrenceDays: [6], estimatedMinutes: 15 },
        optionGroups: [SHARED_AREA],
      },
    ],
  },

  {
    id: 'fam-recycling',
    title: '分類家中的回收物',
    description: '把回收物依類別分好，再一起拿到定點。',
    iconKey: 'recycle',
    browseCategories: ['family_participation'],
    domainTags: ['家庭參與', '回收', '家務'],
    searchKeywords: ['回收', '分類', '垃圾', '資源回收', '紙類', '家務'],
    minAge: 5,
    maxAge: 12,
    visibility: 'core',
    recommendedRank: 9,
    defaultVariantId: 'fam-recycling-recurring',
    variants: [
      {
        ...familyBase(),
        id: 'fam-recycling-recurring',
        label: '固定分類回收物',
        durationType: 'recurring',
        completionPolicy: 'ongoing',
        defaultDraft: { recurrenceDays: [2, 5], estimatedMinutes: 10 },
        optionGroups: [RECYCLING_KIND],
        safetyNotes: ['不處理玻璃、尖銳或不明物品'],
      },
    ],
  },

  {
    id: 'fam-restock',
    title: '收納或補充家庭用品',
    description: '檢查家裡常用的東西還夠不夠，並把它們放回固定位置。',
    iconKey: 'box',
    browseCategories: ['family_participation'],
    domainTags: ['家庭參與', '收納', '補貨'],
    searchKeywords: ['收納', '補充', '用品', '整理', '庫存', '衛生紙', '家務'],
    minAge: 5,
    maxAge: 12,
    visibility: 'core',
    recommendedRank: 10,
    defaultVariantId: 'fam-restock-recurring',
    variants: [
      {
        ...familyBase(),
        id: 'fam-restock-once',
        label: '整理一次',
        durationType: 'one_time',
        completionPolicy: 'complete_once',
        defaultDraft: { estimatedMinutes: 20 },
        optionGroups: [HOUSEHOLD_SUPPLY],
        safetyNotes: ['不搬重物、玻璃或清潔用品'],
      },
      {
        ...familyBase(),
        id: 'fam-restock-recurring',
        label: '固定檢查與補充',
        durationType: 'recurring',
        completionPolicy: 'ongoing',
        defaultDraft: { recurrenceDays: [0], estimatedMinutes: 15 },
        optionGroups: [HOUSEHOLD_SUPPLY],
        safetyNotes: ['不搬重物、玻璃或清潔用品'],
      },
    ],
  },

  {
    id: 'fam-role',
    title: '擔任一個家庭小角色',
    description: '選擇一項共同生活中的小分工，先試行四週，再一起決定是否繼續。',
    iconKey: 'role',
    browseCategories: ['family_participation'],
    domainTags: ['家庭參與', '角色', '分工', '承諾'],
    searchKeywords: ['家庭', '角色', '分工', '責任', '幫忙', '承諾'],
    minAge: 5,
    maxAge: 12,
    visibility: 'core',
    recommendedRank: 11,
    defaultVariantId: 'fam-role-plan',
    variants: [
      {
        ...familyBase(),
        id: 'fam-role-plan',
        label: '四週家庭角色',
        durationType: 'long_term',
        planMode: 'family_role',
        // 角色內容要一起談，孩子有選擇權。
        suggestedSource: 'co_created',
        allowedSources: ['co_created', 'parent', 'child'],
        requiresChildChoice: true,
        completionPolicy: 'review_and_continue',
        defaultDraft: { durationDays: 28, durationDayChoices: [14, 28, 42], firstReviewDays: 7 },
        optionGroups: [FAMILY_ROLE_KIND],
        milestoneTemplate: { kind: 'weekly_review', note: '每週一起看一次，期滿再決定是否延續' },
      },
    ],
  },

  {
    id: 'fam-care',
    title: '照顧家中的植物或動物',
    description: '選擇一個安全、明確的照顧步驟，持續留下觀察。',
    iconKey: 'sprout',
    browseCategories: ['family_participation'],
    domainTags: ['家庭參與', '照顧', '植物', '寵物'],
    searchKeywords: ['植物', '澆水', '澆花', '寵物', '飼料', '照顧', '動物', '餵食', '盆栽'],
    minAge: 4,
    maxAge: 12,
    // 只有家裡真的有植物或動物才適用 —— 不進推薦，選分類或搜尋才出現。
    visibility: 'category_only',
    defaultVariantId: 'fam-care-recurring',
    variants: [
      {
        ...familyBase(),
        id: 'fam-care-recurring',
        label: '固定照顧',
        durationType: 'recurring',
        completionPolicy: 'ongoing',
        defaultDraft: { recurrenceDays: [0, 1, 2, 3, 4, 5, 6], estimatedMinutes: 5 },
        optionGroups: [PLANT_PET_CARE],
        safetyNotes: ['請先確認照顧步驟對孩子是安全的'],
      },
      {
        ...familyBase(),
        id: 'fam-care-plan',
        label: '四週照顧角色',
        durationType: 'long_term',
        planMode: 'family_role',
        suggestedSource: 'co_created',
        allowedSources: ['co_created', 'parent', 'child'],
        requiresChildChoice: true,
        completionPolicy: 'review_and_continue',
        defaultDraft: { durationDays: 28, durationDayChoices: [14, 28, 42], firstReviewDays: 7 },
        optionGroups: [CARE_ROLE_KIND],
        milestoneTemplate: { kind: 'weekly_review', note: '每週一起看一次觀察紀錄' },
        safetyNotes: ['請先確認照顧步驟對孩子是安全的'],
      },
    ],
  },
];
