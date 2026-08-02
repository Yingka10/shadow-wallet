// task-ai-recommendation — server 端輸入驗證與資料最小化
//
// ─────────────────────────────────────────────────────────────────────────
// 這一層在防的不是攻擊者，主要是**我們自己未來的疏忽**。
//
// input 是 client 組的。哪天有人在 buildTaskAiInput 裡多塞一個
// `childNickname` 想「讓建議更親切」，那個名字就會直接進 Gemini，
// 而 code review 不一定看得出來。所以這裡用嚴格 allowlist：
// **出現任何不認識的鍵，整個請求就拒絕**，而不是把它濾掉後照樣送出去。
//
// 濾掉再送出的問題是它會安靜地成功 —— 沒有人會發現那個欄位本來就不該存在。
//
// ⚠️ 一件這一層做不到的事，講清楚免得被誤會：
// 姓名遮蔽只能在 client 做，因為**孩子的名字根本沒有送到這裡**（那正是重點）。
// server 沒有辦法「再遮一次」它從來不知道的字串。這裡能做的是反向檢查：
// 拒絕任何長得像身分的東西（email、UUID、JWT、電話），以及拒絕任何
// 不在白名單上的欄位。真正的姓名遮蔽仍然只有 buildTaskAiInput 那一處。
// ─────────────────────────────────────────────────────────────────────────

const TOP_LEVEL_KEYS = [
  'schemaVersion', 'childContext', 'taskContext', 'parentIntent', 'currentDraft', 'immutablePolicies',
] as const;

const SECTION_KEYS: Record<string, readonly string[]> = {
  childContext: ['ageGroup'],
  taskContext: ['editorKind', 'purposeCategory', 'durationType', 'source', 'rewardPolicy', 'completionPolicy'],
  parentIntent: ['originalExpectation'],
  currentDraft: [
    'title', 'completionDescription', 'estimatedMinutes', 'scheduleSummary',
    'durationDays', 'reviewAfterDays', 'selectedOptions',
    'supportSteps', 'milestones', 'responsibilities',
  ],
  immutablePolicies: ['purposeCategory', 'rewardPolicy', 'blockedFields'],
};

/** 長得像身分的東西。出現在任何一段自由文字裡都拒收。 */
const IDENTITY_PATTERNS: Array<[string, RegExp]> = [
  ['email', /[\w.+-]+@[\w-]+\.[\w.]+/],
  ['uuid', /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
  ['jwt', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['supabase_url', /[a-z0-9]{20}\.supabase\.co/],
  ['phone', /\b09\d{2}-?\d{3}-?\d{3}\b/],
];

/** ageGroup 只接受分級字串。`2018-03-05` 這種東西進不來。 */
const AGE_GROUP = /^\d{1,2}-\d{1,2}$/;

export type InputRejection = { code: string; detail: string };

/**
 * 驗證 client 送來的 input。
 *
 * 回 null 表示通過。**不修改、不清洗、不補預設值** —— 一個需要被修好才能用的
 * input，代表 client 有 bug，那應該被看見而不是被吸收掉。
 */
export function rejectTaskAiInput(raw: unknown): InputRejection | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { code: 'NOT_AN_OBJECT', detail: 'input 不是物件' };
  }
  const input = raw as Record<string, unknown>;

  if (input.schemaVersion !== 1) {
    return { code: 'BAD_SCHEMA_VERSION', detail: 'schemaVersion 必須是 1' };
  }

  for (const key of Object.keys(input)) {
    if (!(TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      return { code: 'UNKNOWN_FIELD', detail: `未預期的欄位：${key}` };
    }
  }
  for (const key of TOP_LEVEL_KEYS) {
    if (!(key in input)) return { code: 'MISSING_FIELD', detail: `缺少欄位：${key}` };
  }

  for (const [section, allowed] of Object.entries(SECTION_KEYS)) {
    const value = input[section];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { code: 'BAD_SECTION', detail: `${section} 不是物件` };
    }
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (!allowed.includes(key)) {
        // 這一條就是攔下「順手多送一個欄位」的地方。
        return { code: 'UNKNOWN_FIELD', detail: `未預期的欄位：${section}.${key}` };
      }
    }
  }

  const ageGroup = (input.childContext as Record<string, unknown>).ageGroup;
  if (typeof ageGroup !== 'string' || !AGE_GROUP.test(ageGroup)) {
    return { code: 'BAD_AGE_GROUP', detail: 'ageGroup 必須是分級字串，例如 6-9' };
  }

  const serialized = JSON.stringify(input);
  for (const [name, pattern] of IDENTITY_PATTERNS) {
    if (pattern.test(serialized)) {
      return { code: 'IDENTITY_IN_INPUT', detail: `input 含疑似 ${name}` };
    }
  }

  // 一個超長 input 多半是 client bug 或有人在灌 prompt，兩種都不該送去 Gemini。
  if (serialized.length > 8000) {
    return { code: 'INPUT_TOO_LARGE', detail: `input 長度 ${serialized.length} 超過上限` };
  }

  return null;
}
