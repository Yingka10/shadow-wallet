// Shadow Wallet · Parent Tablet — 生活小計畫（A 類）任務家族
//
// 硬規則（SPEC §3.1）：6 歲以上的生活常規預設從日常首頁退場，
// 只有遇到實際困難時才短期開啟，且**不作為固定賺幣來源**。
// 所以這裡每一個家族都是：short_support ／ progress_only ／ stabilize_and_exit，
// 且 allowedRewardPolicies 只有 progress_only —— 家長在下一階段也改不出成長幣。
//
// 這些家族不進推薦（selector 會排除 life_routine），只在選到「生活小計畫」或搜尋時出現。

import type { IconKey, TaskPresetFamily, TaskPresetVariant, Visibility } from './types';

const FIRST_REVIEW_DAYS = 7;

/**
 * 生活小計畫共用版本：只記進度與肯定，穩定後結束。
 *
 * 期間一律由呼叫端明確指定 —— helper 內不依 id 或 title 判斷特殊值，
 * 否則「哪個 family 幾天」會藏在 helper 裡，之後改資料要先讀邏輯。
 */
function lifeVariant(args: {
  id: string;
  label: string;
  durationDays: number;
  durationDayChoices: number[];
  firstReviewDays?: number;
}): TaskPresetVariant {
  return {
    id: args.id,
    label: args.label,
    purposeCategory: 'life_routine',
    allowedPurposeCategories: ['life_routine'],
    durationType: 'long_term',
    planMode: 'short_support',
    suggestedSource: 'parent',
    allowedSources: ['parent', 'co_created'],
    requiresChildChoice: false,
    defaultRewardPolicy: 'progress_only',
    // 生活常規不發成長幣，這條在下一階段表單也不開放改。
    allowedRewardPolicies: ['progress_only'],
    completionPolicy: 'stabilize_and_exit',
    defaultDraft: {
      durationDays: args.durationDays,
      durationDayChoices: args.durationDayChoices,
      firstReviewDays: args.firstReviewDays ?? FIRST_REVIEW_DAYS,
    },
    optionGroups: [],
    milestoneTemplate: { kind: 'weekly_review', note: '一週後看一次，順了就可以提前結束' },
    feedbackHint: '以進度與肯定回饋，不發成長幣',
    safetyNotes: ['穩定後結束，不作固定賺幣來源'],
  };
}

function lifeFamily(args: {
  id: string;
  title: string;
  description: string;
  iconKey: IconKey;
  searchKeywords: string[];
  domainTags: string[];
  variantLabel: string;
  /** 期間必填，且必須落在 durationDayChoices 之中（有測試把關）。 */
  durationDays: number;
  durationDayChoices: number[];
  firstReviewDays?: number;
  visibility?: Visibility;
}): TaskPresetFamily {
  const variantId = `${args.id}-plan`;
  return {
    id: args.id,
    title: args.title,
    description: args.description,
    iconKey: args.iconKey,
    browseCategories: ['life_routine'],
    domainTags: args.domainTags,
    searchKeywords: args.searchKeywords,
    minAge: 6,
    maxAge: 12,
    visibility: args.visibility ?? 'core',
    defaultVariantId: variantId,
    variants: [
      lifeVariant({
        id: variantId,
        label: args.variantLabel,
        durationDays: args.durationDays,
        durationDayChoices: args.durationDayChoices,
        ...(args.firstReviewDays !== undefined
          ? { firstReviewDays: args.firstReviewDays }
          : null),
      }),
    ],
  };
}

export const LIFE_PLAN_FAMILIES: TaskPresetFamily[] = [
  lifeFamily({
    id: 'life-morning',
    title: '建立上學前準備流程',
    description: '把出門前要做的幾件事排成固定順序，短期練習到不用提醒。',
    iconKey: 'sunrise',
    domainTags: ['生活常規', '上學', '流程'],
    searchKeywords: ['上學', '出門', '早上', '準備', '遲到', '流程'],
    variantLabel: '兩週上學前流程',
    durationDays: 14,
    durationDayChoices: [7, 14, 21],
  }),

  lifeFamily({
    id: 'life-after-school',
    title: '建立放學後物品歸位流程',
    description: '回家後把書包、外套與水壺放回固定位置，減少東西到處放。',
    iconKey: 'doorway',
    domainTags: ['生活常規', '放學', '歸位'],
    searchKeywords: ['放學', '回家', '歸位', '書包', '外套', '水壺', '亂放'],
    variantLabel: '兩週放學歸位流程',
    durationDays: 14,
    durationDayChoices: [7, 14, 21],
  }),

  lifeFamily({
    id: 'life-schoolbag',
    title: '練習整理書包與隔日用品',
    description: '前一晚對照隔天的課表，把需要的東西準備好。',
    iconKey: 'backpack',
    domainTags: ['生活常規', '書包', '準備'],
    searchKeywords: ['書包', '整理', '隔天', '課表', '忘東西', '準備'],
    variantLabel: '兩週書包準備計畫',
    durationDays: 14,
    durationDayChoices: [7, 14, 21],
  }),

  lifeFamily({
    id: 'life-bedtime',
    title: '建立睡前收尾流程',
    description: '把睡前要做的事排成固定順序，讓晚上的節奏穩定下來。',
    iconKey: 'moon',
    domainTags: ['生活常規', '睡前', '流程'],
    searchKeywords: ['睡前', '睡覺', '晚上', '刷牙', '收尾', '流程'],
    variantLabel: '兩週睡前流程',
    durationDays: 14,
    durationDayChoices: [14, 21],
  }),

  lifeFamily({
    id: 'life-own-space',
    title: '維持一個自己的小空間',
    description: '選一個屬於自己的小範圍，練習維持在自己能接受的狀態。',
    iconKey: 'shelf',
    domainTags: ['生活常規', '整理', '個人空間'],
    searchKeywords: ['房間', '桌面', '書桌', '空間', '整理', '維持'],
    variantLabel: '三週小空間計畫',
    durationDays: 21,
    durationDayChoices: [14, 21, 28],
  }),

  lifeFamily({
    id: 'life-screen-time',
    title: '練習按約定結束 3C',
    description: '約好時間到了就自己收起來，短期練習到不需要一直提醒。',
    iconKey: 'screen',
    domainTags: ['生活常規', '3C', '約定'],
    searchKeywords: ['3C', '手機', '平板', '螢幕', '遊戲', '結束', '約定', '時間到'],
    variantLabel: '3C 結束練習',
    durationDays: 14,
    durationDayChoices: [7, 14],
  }),

  lifeFamily({
    id: 'life-transition',
    title: '練習從一件事切換到下一件事',
    description: '在兩件事之間練習收尾與開始，減少卡在中間的時間。',
    iconKey: 'switchTask',
    domainTags: ['生活常規', '轉換', '節奏'],
    searchKeywords: ['切換', '轉換', '拖拖拉拉', '開始', '收尾', '銜接'],
    variantLabel: '兩週切換練習',
    durationDays: 14,
    durationDayChoices: [7, 14],
    visibility: 'category_only',
  }),

  lifeFamily({
    id: 'life-selfcare',
    title: '練習一項正在卡住的自我照顧流程',
    description: '針對目前特別不順的一項自理步驟，短期陪著練到穩定。',
    iconKey: 'selfcare',
    domainTags: ['生活常規', '自理', '照顧自己'],
    searchKeywords: ['自理', '刷牙', '洗澡', '穿衣', '照顧自己', '卡住'],
    variantLabel: '兩週自我照顧支援',
    durationDays: 14,
    durationDayChoices: [7, 14, 21],
    visibility: 'category_only',
  }),
];
