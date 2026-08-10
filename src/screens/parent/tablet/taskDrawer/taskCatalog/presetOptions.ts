// Shadow Wallet · Parent Tablet — 任務選項組
//
// 抽出來共用，避免同一組選項在多個家族裡各寫一份、日後改字改不乾淨。
//
// ── required 的判準 ────────────────────────────────────────────────────────
// 不是每一組都該 required。標準只有一條：
//   **缺了這一組，這個任務就沒有具體內容可以成立。**
//
// required（13 組）：
//   閱讀／功課／才藝／運動／創作／探索／複習方式、學校科目、補強範圍、
//   兩種角色，以及「哪一個小區域」「哪些照顧步驟」——
//   前者是任務要練的東西本身，後者是任務的對象本身，空著就只剩一句標題。
//
// 非 required（5 組）：
//   餐桌準備、餐後整理、衣物分類、回收類別、家庭用品。
//   這些家族的標題已經同時說出對象與動作（「用餐前準備餐桌」），
//   選項只是把範圍收窄；不選也還有「怎樣算完成」這個必填欄位撐著。

import type { OptionGroup } from './types';

export const READING_METHOD: OptionGroup = {
  id: 'reading_method',
  label: '用什麼方式進行？',
  selection: 'single',
  allowCustom: true,
  required: true,
  options: [
    { id: 'self', label: '自己閱讀' },
    { id: 'with_family', label: '和家人共讀' },
    { id: 'take_turns', label: '輪流朗讀' },
    { id: 'other', label: '其他方式' },
  ],
};

export const HOMEWORK_METHOD: OptionGroup = {
  id: 'homework_method',
  label: '這次想練習哪個部分？',
  selection: 'multiple',
  required: true,
  options: [
    { id: 'start', label: '練習開始' },
    { id: 'order', label: '安排順序' },
    { id: 'split', label: '將功課拆小' },
    { id: 'check', label: '完成後檢查' },
    { id: 'stuck', label: '處理不會的題目' },
  ],
};

export const PERFORMANCE_KIND: OptionGroup = {
  id: 'performance_kind',
  label: '練習哪一項？',
  selection: 'single',
  allowCustom: true,
  required: true,
  options: [
    { id: 'instrument', label: '樂器' },
    { id: 'dance', label: '舞蹈' },
    { id: 'recitation', label: '朗讀' },
    { id: 'speaking', label: '口語分享' },
    { id: 'drama', label: '戲劇' },
    { id: 'other', label: '其他' },
  ],
};

export const SPORT_KIND: OptionGroup = {
  id: 'sport_kind',
  label: '想練習哪一項？',
  selection: 'single',
  allowCustom: true,
  required: true,
  options: [
    { id: 'jump_rope', label: '跳繩' },
    { id: 'ball', label: '球類' },
    { id: 'cycling', label: '騎腳踏車' },
    { id: 'swimming', label: '游泳' },
    { id: 'dance', label: '舞蹈' },
    { id: 'balance', label: '平衡與協調' },
    { id: 'other', label: '其他' },
  ],
};

export const CREATION_KIND: OptionGroup = {
  id: 'creation_kind',
  label: '想做哪一種作品？',
  selection: 'single',
  allowCustom: true,
  required: true,
  options: [
    { id: 'drawing', label: '畫畫' },
    { id: 'handcraft', label: '手作' },
    { id: 'story', label: '故事或漫畫' },
    { id: 'model', label: '模型或積木' },
    { id: 'science', label: '科學小作品' },
    { id: 'digital', label: '數位作品' },
    { id: 'other', label: '其他' },
  ],
};

export const EXPLORE_METHOD: OptionGroup = {
  id: 'explore_method',
  label: '打算怎麼找答案？',
  selection: 'multiple',
  required: true,
  options: [
    { id: 'reading', label: '閱讀' },
    { id: 'observation', label: '觀察' },
    { id: 'asking', label: '詢問' },
    { id: 'experiment', label: '簡單實驗' },
    { id: 'mixed', label: '混合方式' },
  ],
};

/**
 * 學校作業的科目。
 * 刻意不為每一科開一個 family —— 「完成一項學校作業」只該有一張卡，
 * 科目是家長在 Step 2 選的細節。
 */
export const SCHOOL_SUBJECT: OptionGroup = {
  id: 'school_subject',
  label: '這次是哪一科的作業？',
  selection: 'single',
  allowCustom: true,
  required: true,
  options: [
    { id: 'chinese', label: '國語' },
    { id: 'math', label: '數學' },
    { id: 'english', label: '英文' },
    { id: 'science', label: '自然' },
    { id: 'social', label: '社會' },
    { id: 'arts', label: '藝術或其他課程' },
    { id: 'other', label: '其他' },
  ],
};

export const REVIEW_KIND: OptionGroup = {
  id: 'review_kind',
  label: '這次複習做什麼？',
  selection: 'multiple',
  allowCustom: true,
  required: true,
  options: [
    { id: 'correct', label: '訂正指定題目' },
    { id: 'unit', label: '複習一個小單元' },
    { id: 'collect_questions', label: '整理還不懂的問題' },
    { id: 'retry', label: '再試一次容易錯的內容' },
    { id: 'other', label: '其他' },
  ],
};

// ---------------------------------------------------------------------------
// 家庭參與：固定任務的具體範圍
//
// 刻意用選項而不是替每個動作開一個 family —— 「準備餐桌」只該有一張卡，
// 放什麼餐具是家長在 Step 2 決定的細節。
// ---------------------------------------------------------------------------

export const TABLE_SETUP: OptionGroup = {
  id: 'table_setup',
  label: '這次負責放什麼？',
  selection: 'multiple',
  allowCustom: true,
  options: [
    { id: 'placemat', label: '餐墊' },
    { id: 'utensils', label: '筷子或湯匙' },
    { id: 'cup', label: '水杯或杯墊' },
    { id: 'safe_dishes', label: '不易碎餐具' },
    { id: 'other', label: '其他' },
  ],
};

export const AFTER_MEAL_TIDY: OptionGroup = {
  id: 'after_meal_tidy',
  label: '餐後負責哪些事？',
  selection: 'multiple',
  allowCustom: true,
  options: [
    { id: 'own_dishes', label: '收好自己的餐具' },
    { id: 'placemat_back', label: '把餐墊放回原位' },
    { id: 'wipe_seat', label: '用乾布整理自己的位置' },
    { id: 'gather_safe', label: '將不易碎餐具集中到指定處' },
    { id: 'other', label: '其他' },
  ],
};

export const LAUNDRY_SORT: OptionGroup = {
  id: 'laundry_sort',
  label: '負責哪一部分？',
  selection: 'multiple',
  allowCustom: true,
  options: [
    { id: 'socks', label: '分類襪子' },
    { id: 'towels', label: '分類毛巾' },
    { id: 'fold_towels', label: '摺毛巾' },
    { id: 'to_family', label: '將簡單衣物分到家人的區域' },
    { id: 'other', label: '其他' },
  ],
};

export const SHARED_AREA: OptionGroup = {
  id: 'shared_area',
  label: '負責哪一個小區域？',
  selection: 'single',
  allowCustom: true,
  required: true,
  options: [
    { id: 'toy_basket', label: '玩具籃' },
    { id: 'sofa_side', label: '沙發旁' },
    { id: 'shelf_row', label: '客廳書架的一層' },
    { id: 'desk_corner', label: '共用桌面的一小區' },
    { id: 'other', label: '其他' },
  ],
};

export const RECYCLING_KIND: OptionGroup = {
  id: 'recycling_kind',
  label: '負責哪幾類回收物？',
  selection: 'multiple',
  options: [
    { id: 'paper', label: '紙類' },
    { id: 'plastic', label: '安全的塑膠容器' },
    { id: 'metal', label: '安全的金屬容器' },
    { id: 'assigned', label: '家長指定的其他回收物' },
  ],
};

export const HOUSEHOLD_SUPPLY: OptionGroup = {
  id: 'household_supply',
  label: '負責補充哪些用品？',
  selection: 'multiple',
  allowCustom: true,
  options: [
    { id: 'tissue', label: '衛生紙' },
    { id: 'napkin', label: '餐巾紙' },
    { id: 'towel', label: '毛巾' },
    { id: 'light_goods', label: '輕巧的採買用品' },
    { id: 'other', label: '其他' },
  ],
};

export const PLANT_PET_CARE: OptionGroup = {
  id: 'plant_pet_care',
  label: '負責哪些照顧步驟？',
  selection: 'multiple',
  allowCustom: true,
  required: true,
  options: [
    { id: 'water_plant', label: '為植物澆水' },
    { id: 'observe_plant', label: '觀察植物變化' },
    { id: 'pet_water', label: '補充寵物飲水' },
    { id: 'measured_food', label: '準備已量好的飼料' },
    { id: 'tidy_supplies', label: '整理安全用品' },
    { id: 'other', label: '其他' },
  ],
};

// ---------------------------------------------------------------------------
// 家庭角色：角色選擇（required single）
// ---------------------------------------------------------------------------

export const FAMILY_ROLE_KIND: OptionGroup = {
  id: 'family_role_kind',
  label: '想擔任哪一個角色？',
  selection: 'single',
  allowCustom: true,
  required: true,
  options: [
    { id: 'table_helper', label: '餐桌小幫手' },
    { id: 'laundry_sorter', label: '衣物分類員' },
    { id: 'recycling_keeper', label: '回收整理員' },
    { id: 'supply_restocker', label: '家庭用品補充員' },
    { id: 'space_tidier', label: '共同空間整理員' },
    { id: 'other', label: '其他角色' },
  ],
};

export const CARE_ROLE_KIND: OptionGroup = {
  id: 'care_role_kind',
  label: '想擔任哪一種照顧角色？',
  selection: 'single',
  allowCustom: true,
  required: true,
  options: [
    { id: 'plant_caretaker', label: '植物照顧員' },
    { id: 'pet_water_helper', label: '寵物飲水小幫手' },
    { id: 'pet_supply_keeper', label: '寵物用品整理員' },
    { id: 'other', label: '其他安全照顧角色' },
  ],
};

export const SUBJECT_SCOPE: OptionGroup = {
  id: 'subject_scope',
  label: '想加強哪個小範圍？',
  selection: 'single',
  allowCustom: true,
  required: true,
  options: [
    { id: 'chinese', label: '國語' },
    { id: 'math', label: '數學' },
    { id: 'english', label: '英文' },
    { id: 'other', label: '其他具體小範圍' },
  ],
};
