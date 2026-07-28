// Shadow Wallet · Parent Tablet — catalog 查詢
//
// Step 1 的唯一資料入口。所有「哪些卡該出現、什麼順序」的規則都收在這裡，
// 畫面不自己過濾，避免規則散在元件裡。

import { FAMILY_PARTICIPATION_FAMILIES } from './familyParticipation';
import { LEARNING_SKILL_FAMILIES } from './learningAndSkills';
import { AUTONOMOUS_CHALLENGE_FAMILIES } from './autonomousChallenge';
import { LIFE_PLAN_FAMILIES } from './lifePlans';
import type { BrowseCategory, TaskPresetFamily } from './types';

/**
 * 全部家族。刻意用 id 去重：家族同時掛多個 browseCategories 是常態
 * （運動／創作／探索同時是學習與技能和自主挑戰），若哪天有人把同一個家族
 * 也寫進第二個檔案，這裡會擋掉，Step 1 不會出現兩張一樣的卡。
 */
export const ALL_FAMILIES: TaskPresetFamily[] = dedupeById([
  ...FAMILY_PARTICIPATION_FAMILIES,
  ...LEARNING_SKILL_FAMILIES,
  ...AUTONOMOUS_CHALLENGE_FAMILIES,
  ...LIFE_PLAN_FAMILIES,
]);

function dedupeById(families: TaskPresetFamily[]): TaskPresetFamily[] {
  const seen = new Set<string>();
  const out: TaskPresetFamily[] = [];
  for (const family of families) {
    if (seen.has(family.id)) continue;
    seen.add(family.id);
    out.push(family);
  }
  return out;
}

/**
 * 推薦視圖最多顯示幾張。
 *
 * 有 recommendedRank 的家族其實有 15 個，全部排出來就只是一份長清單，
 * 「推薦」兩個字會失去意義。取前五名讓家長一眼看完，其餘走分類或搜尋。
 * 搜尋時不套用這個上限 —— 那時家長是在找特定東西，截斷會像壞掉。
 */
export const RECOMMENDED_LIMIT = 5;

/** Step 1 的 chips。'recommended' 不是分類，是推薦視圖。 */
export type BrowseFilter = 'recommended' | BrowseCategory;

export const BROWSE_FILTERS: Array<{ id: BrowseFilter; label: string }> = [
  { id: 'recommended', label: '推薦' },
  { id: 'family_participation', label: '家庭參與' },
  { id: 'autonomous_challenge', label: '自主挑戰' },
  { id: 'learning_skill', label: '學習與技能' },
  { id: 'life_routine', label: '生活小計畫' },
];

/**
 * 搜尋比對範圍：家族標題／說明／關鍵字／領域標籤，
 * 再加上每個版本的 label 與所有選項的 label
 * （例如搜「跳繩」要能命中「運動與身體技能」，即使家族標題沒有這兩個字）。
 */
function matchesQuery(family: TaskPresetFamily, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const parts: string[] = [
    family.title,
    family.description,
    ...family.searchKeywords,
    ...family.domainTags,
  ];

  for (const variant of family.variants) {
    parts.push(variant.label);
    for (const group of variant.optionGroups) {
      parts.push(group.label);
      for (const option of group.options) parts.push(option.label);
    }
  }

  return parts.join(' ').toLowerCase().includes(needle);
}

function isAgeAppropriate(family: TaskPresetFamily, age: number | null): boolean {
  if (age === null) return true; // 孩子資料未載入時不做年齡過濾
  return age >= family.minAge && age <= family.maxAge;
}

function byRecommendedRank(a: TaskPresetFamily, b: TaskPresetFamily): number {
  const ra = a.recommendedRank ?? Number.MAX_SAFE_INTEGER;
  const rb = b.recommendedRank ?? Number.MAX_SAFE_INTEGER;
  return ra - rb;
}

/**
 * 挑出 Step 1 要顯示的家族。
 *
 * 推薦（未搜尋時）：
 *   - visibility === 'core' 且有 recommendedRank
 *   - 排除生活小計畫（A 類 6 歲以上預設退場，不主動推銷）
 *   - 依 recommendedRank 排序
 *
 * 分類：該分類底下、非 search_only 的家族。
 * 搜尋：忽略 visibility（search_only 也會浮出來），仍受年齡與目前分類限制。
 *
 * @param age 孩子實足年齡；null 代表資料未載入
 * @param filter 目前選中的 chip
 * @param query 搜尋字串
 */
export function selectPresetFamilies(
  age: number | null,
  filter: BrowseFilter,
  query: string,
): TaskPresetFamily[] {
  const searching = query.trim().length > 0;

  const pool = ALL_FAMILIES.filter(
    family => isAgeAppropriate(family, age) && matchesQuery(family, query),
  );

  if (filter === 'recommended') {
    // 搜尋時的「推薦」= 全部命中結果（推薦優先排序），否則搜尋看起來像壞掉。
    if (searching) return [...pool].sort(byRecommendedRank);

    return pool
      .filter(
        family =>
          family.visibility === 'core' &&
          typeof family.recommendedRank === 'number' &&
          !family.browseCategories.includes('life_routine'),
      )
      .sort(byRecommendedRank)
      .slice(0, RECOMMENDED_LIMIT);
  }

  return pool
    .filter(family => family.browseCategories.includes(filter))
    .filter(family => (searching ? true : family.visibility !== 'search_only'))
    .sort(byRecommendedRank);
}
