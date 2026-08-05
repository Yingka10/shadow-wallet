// task-ai-recommendation — server 端輸入驗證
//
// ─────────────────────────────────────────────────────────────────────────
// 兩件事，順序不能顛倒：
//
//   1. **拒絕**不認識的結構（而不是清洗它）
//   2. **重建**一個全新的物件，逐欄抄過來
//
// 為什麼是重建而不是「驗過就放行原物件」：放行原物件的話，
// 一個通過驗證的 body 仍然可以夾帶我們沒檢查的鍵一路送進 Gemini。
// 這裡回傳的 ValidatedInput 是新蓋的，raw body 到不了 prompt。
//
// 為什麼是拒絕而不是清洗：濾掉再送出會安靜地成功。哪天有人在
// buildTaskAiInput 裡多塞一個 childNickname 想「讓建議更親切」，
// 清洗的話沒有人會發現那個欄位本來就不該存在；拒絕的話，
// 那個 commit 在測試階段就過不了。
//
// ⚠️ 一個必須講清楚的區別：
// `blockedFields` 裡**本來就會**出現 "childId" / "familyId" 這些字串。
// 那是在告訴 AI 不准碰的**欄位名稱**，不是 childId 的**值**。
// 個資掃描因此只掃「會被送出去的值」，不掃 blockedFields ——
// 把政策清單當成個資洩漏會讓這支 Function 拒收每一個合法請求。
// ─────────────────────────────────────────────────────────────────────────

import {
  AGE_GROUPS,
  COMPLETION_POLICIES,
  CONTRACT,
  DURATION_TYPES,
  EDITOR_KINDS,
  INPUT_LIMITS,
  PURPOSE_CATEGORIES,
  REWARD_POLICIES,
  TASK_SOURCES,
  type AgeGroup,
  type ValidatedInput,
} from './contract.ts';

export type InputRejection = { code: string; detail: string };

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

/**
 * 明確禁止出現在 body 任何位置的鍵名。
 *
 * 這一份和 blockedFields 是兩件事：blockedFields 說的是「AI 不可以**修改**
 * 這些欄位」，這一份說的是「這些欄位**根本不該送到這裡**」。
 */
const FORBIDDEN_KEYS = [
  'childName', 'childNickname', 'nickname', 'parentName', 'email',
  'userId', 'user_id', 'childId', 'child_id', 'familyId', 'family_id',
  'accessToken', 'access_token', 'supabaseKey', 'apiKey', 'anonKey',
  'walletBalance', 'balance', 'taskHistory', 'conversationHistory',
  'birthDate', 'birth_date',
];

/** 長得像身分的**值**。只掃會被送出去的部分。 */
const IDENTITY_PATTERNS: Array<[string, RegExp]> = [
  ['email', /[\w.+-]+@[\w-]+\.[\w.]+/],
  ['uuid', /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
  ['jwt', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['supabase_url', /[a-z0-9]{20}\.supabase\.co/],
  ['phone', /\b09\d{2}-?\d{3}-?\d{3}\b/],
];

const CONTROL_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function reject(code: string, detail: string): InputRejection {
  return { code, detail };
}

function cleanString(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  if (v.length > max) return null;
  if (CONTROL_CHARS.test(v)) return null;
  return v;
}

function positiveInt(v: unknown, max: number): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0 || v > max) return null;
  return v;
}

function stringList(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  if (v.length > INPUT_LIMITS.maxListItems) return null;
  const out: string[] = [];
  for (const item of v) {
    const s = cleanString(item, INPUT_LIMITS.maxListItemLength);
    if (s === null) return null;
    out.push(s);
  }
  return out;
}

/** 深度固定為 2：`Record<string, string[]>`，不接受巢狀物件。 */
function optionMap(v: unknown): Record<string, string[]> | null {
  if (!isRecord(v)) return null;
  const keys = Object.keys(v);
  if (keys.length > INPUT_LIMITS.maxOptionGroups) return null;

  const out: Record<string, string[]> = {};
  for (const key of keys) {
    if (cleanString(key, INPUT_LIMITS.maxOptionValueLength) === null) return null;
    const values = v[key];
    if (!Array.isArray(values) || values.length > INPUT_LIMITS.maxOptionValues) return null;
    const list: string[] = [];
    for (const item of values) {
      const s = cleanString(item, INPUT_LIMITS.maxOptionValueLength);
      if (s === null) return null;
      list.push(s);
    }
    out[key] = list;
  }
  return out;
}

/** 找出物件樹裡任何一個被禁止的鍵名。回傳第一個命中的路徑。 */
function findForbiddenKey(value: unknown, path = ''): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findForbiddenKey(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (!isRecord(value)) return null;

  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.includes(key)) return path ? `${path}.${key}` : key;
    const hit = findForbiddenKey(value[key], path ? `${path}.${key}` : key);
    if (hit) return hit;
  }
  return null;
}

export type InputValidationResult =
  | { ok: true; input: ValidatedInput }
  | { ok: false; rejection: InputRejection };

/**
 * `unknown` → `ValidatedInput`。
 *
 * 輸入型別是 `unknown`，呼叫端沒有辦法用 cast 繞過去。
 * 回傳的是**新建構的物件**，不是驗過的 raw body。
 */
export function validateTaskAiInput(raw: unknown): InputValidationResult {
  const fail = (code: string, detail: string): InputValidationResult =>
    ({ ok: false, rejection: reject(code, detail) });

  if (!isRecord(raw)) return fail('NOT_AN_OBJECT', 'input 不是物件');

  if (raw.schemaVersion !== 1) {
    return fail('BAD_SCHEMA_VERSION', 'schemaVersion 必須是 1');
  }

  // ── 個資鍵名先擋 ──────────────────────────────────────────────────────
  // 順序有意義：`currentDraft.childName` 同時是「未知欄位」也是「禁止欄位」，
  // 兩者都會拒收，但 log 上只會留下先命中的那一個。
  // 「有人送了孩子的名字過來」值得知道；「有人多送了一個欄位」是雜訊。
  // 具體的理由要贏過泛稱 —— 與 outputValidator 先查禁止路徑是同一個原則。
  const forbiddenKey = findForbiddenKey(raw);
  if (forbiddenKey) return fail('FORBIDDEN_FIELD', `body 含禁止欄位：${forbiddenKey}`);

  // ── 結構：未知鍵一律拒絕 ──────────────────────────────────────────────
  for (const key of Object.keys(raw)) {
    if (!(TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      return fail('UNKNOWN_FIELD', `未預期的欄位：${key}`);
    }
  }
  for (const key of TOP_LEVEL_KEYS) {
    if (!(key in raw)) return fail('MISSING_FIELD', `缺少欄位：${key}`);
  }
  for (const [section, allowed] of Object.entries(SECTION_KEYS)) {
    const value = raw[section];
    if (!isRecord(value)) return fail('BAD_SECTION', `${section} 不是物件`);
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) {
        return fail('UNKNOWN_FIELD', `未預期的欄位：${section}.${key}`);
      }
    }
  }

  const childContext = raw.childContext as Record<string, unknown>;
  const taskContext = raw.taskContext as Record<string, unknown>;
  const parentIntent = raw.parentIntent as Record<string, unknown>;
  const draft = raw.currentDraft as Record<string, unknown>;
  const policies = raw.immutablePolicies as Record<string, unknown>;

  // ── childContext ─────────────────────────────────────────────────────
  const ageGroup = childContext.ageGroup;
  if (typeof ageGroup !== 'string' || !(AGE_GROUPS as readonly string[]).includes(ageGroup)) {
    return fail('BAD_AGE_GROUP', 'ageGroup 不是合法分級');
  }

  // ── taskContext ──────────────────────────────────────────────────────
  const enumChecks: Array<[string, unknown, readonly string[]]> = [
    ['editorKind', taskContext.editorKind, EDITOR_KINDS],
    ['purposeCategory', taskContext.purposeCategory, PURPOSE_CATEGORIES],
    ['durationType', taskContext.durationType, DURATION_TYPES],
    ['source', taskContext.source, TASK_SOURCES],
    ['rewardPolicy', taskContext.rewardPolicy, REWARD_POLICIES],
    ['completionPolicy', taskContext.completionPolicy, COMPLETION_POLICIES],
  ];
  for (const [name, value, allowed] of enumChecks) {
    if (typeof value !== 'string' || !allowed.includes(value)) {
      return fail('BAD_ENUM', `taskContext.${name} 不是合法值`);
    }
  }

  // ── parentIntent ─────────────────────────────────────────────────────
  const originalExpectation = cleanString(parentIntent.originalExpectation, INPUT_LIMITS.maxTextLength);
  if (originalExpectation === null) return fail('BAD_TEXT', 'originalExpectation 不合法');

  // ── currentDraft ─────────────────────────────────────────────────────
  const title = cleanString(draft.title, INPUT_LIMITS.maxTextLength);
  if (title === null) return fail('BAD_TEXT', 'title 不合法');

  const completionDescription = cleanString(draft.completionDescription, INPUT_LIMITS.maxTextLength);
  if (completionDescription === null) return fail('BAD_TEXT', 'completionDescription 不合法');

  const scheduleSummary = cleanString(draft.scheduleSummary, INPUT_LIMITS.maxScheduleSummaryLength);
  if (scheduleSummary === null) return fail('BAD_TEXT', 'scheduleSummary 不合法');

  const selectedOptions = optionMap(draft.selectedOptions);
  if (selectedOptions === null) return fail('BAD_OPTIONS', 'selectedOptions 結構不合法');

  const validated: ValidatedInput = {
    schemaVersion: 1,
    childContext: { ageGroup: ageGroup as AgeGroup },
    taskContext: {
      editorKind: taskContext.editorKind as string,
      purposeCategory: taskContext.purposeCategory as string,
      durationType: taskContext.durationType as string,
      source: taskContext.source as string,
      rewardPolicy: taskContext.rewardPolicy as string,
      completionPolicy: taskContext.completionPolicy as string,
    },
    parentIntent: { originalExpectation },
    currentDraft: { title, completionDescription, scheduleSummary, selectedOptions },
    immutablePolicies: {
      purposeCategory: taskContext.purposeCategory as string,
      rewardPolicy: taskContext.rewardPolicy as string,
      blockedFields: [],
    },
  };

  // 可選數值。有給就必須合法 —— 「給了一個壞值」和「沒給」不是同一件事。
  const optionalNumbers: Array<[string, unknown, number, (n: number) => void]> = [
    ['estimatedMinutes', draft.estimatedMinutes, INPUT_LIMITS.maxEstimatedMinutes,
      n => { validated.currentDraft.estimatedMinutes = n; }],
    ['durationDays', draft.durationDays, INPUT_LIMITS.maxDurationDays,
      n => { validated.currentDraft.durationDays = n; }],
    ['reviewAfterDays', draft.reviewAfterDays, INPUT_LIMITS.maxReviewAfterDays,
      n => { validated.currentDraft.reviewAfterDays = n; }],
  ];
  for (const [name, value, max, assign] of optionalNumbers) {
    if (value === undefined) continue;
    const n = positiveInt(value, max);
    if (n === null) return fail('BAD_NUMBER', `${name} 不是合法正整數`);
    assign(n);
  }

  // 可選清單。
  const optionalLists: Array<[string, unknown, (l: string[]) => void]> = [
    ['supportSteps', draft.supportSteps, l => { validated.currentDraft.supportSteps = l; }],
    ['milestones', draft.milestones, l => { validated.currentDraft.milestones = l; }],
    ['responsibilities', draft.responsibilities, l => { validated.currentDraft.responsibilities = l; }],
  ];
  for (const [name, value, assign] of optionalLists) {
    if (value === undefined) continue;
    const list = stringList(value);
    if (list === null) return fail('BAD_LIST', `${name} 不是合法字串陣列`);
    assign(list);
  }

  // ── immutablePolicies ────────────────────────────────────────────────
  // 必須與 taskContext 一致。不一致代表 client 組錯了，
  // 而「AI 被告知的政策」和「這個任務實際的政策」不同是很危險的錯 ——
  // prompt 會說不准改 X，實際保護的卻是 Y。
  if (policies.purposeCategory !== taskContext.purposeCategory) {
    return fail('POLICY_MISMATCH', 'immutablePolicies.purposeCategory 與 taskContext 不一致');
  }
  if (policies.rewardPolicy !== taskContext.rewardPolicy) {
    return fail('POLICY_MISMATCH', 'immutablePolicies.rewardPolicy 與 taskContext 不一致');
  }

  const blockedFields = policies.blockedFields;
  if (!Array.isArray(blockedFields) || blockedFields.length === 0) {
    return fail('BAD_BLOCKED_FIELDS', 'blockedFields 必須是非空陣列');
  }
  for (const field of blockedFields) {
    if (typeof field !== 'string' || !CONTRACT.immutableFields.includes(field)) {
      return fail('BAD_BLOCKED_FIELDS', 'blockedFields 含非法欄位名');
    }
  }
  validated.immutablePolicies.blockedFields = [...blockedFields] as string[];

  // ── 個資：只掃會被送出去的值 ──────────────────────────────────────────
  // 掃的是 validated（重建後的），而且**跳過 blockedFields**：
  // 那份清單裡的 "childId" 是欄位名稱，不是資料。見檔頭。
  const outboundValues = JSON.stringify({
    childContext: validated.childContext,
    taskContext: validated.taskContext,
    parentIntent: validated.parentIntent,
    currentDraft: validated.currentDraft,
  });
  for (const [name, pattern] of IDENTITY_PATTERNS) {
    if (pattern.test(outboundValues)) {
      return fail('IDENTITY_IN_INPUT', `input 含疑似 ${name}`);
    }
  }

  return { ok: true, input: validated };
}
