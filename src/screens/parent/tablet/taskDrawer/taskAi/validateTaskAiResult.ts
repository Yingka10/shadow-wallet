// Shadow Wallet · Parent Tablet — AI 回傳的驗證
//
// ─────────────────────────────────────────────────────────────────────────
// 這一層存在的理由：**TypeScript 的 cast 不是驗證。**
//
// 既有的 ai-proxy 寫的是 `JSON.parse(cleaned) as T`。那行字讓整個型別系統
// 對這批資料失效 —— Gemini 回 `{"category":"Z"}`，編譯器不會抗議，
// 它會一路流進規則引擎。
//
// 所以這裡對每一個欄位逐一檢查，並且**壞掉就整批丟掉**。
//
// 為什麼不「只略過壞掉的那一項」：那會讓家長看到三張建議卡，
// 以為這三張都經過完整驗證 —— 但實際上第四張已經被默默扔了，
// 而我們並不知道那第四張為什麼壞、也不知道前三張是不是同一批幻覺的產物。
// 一批輸出要嘛整批可信，要嘛整批不可信。
// ─────────────────────────────────────────────────────────────────────────

import {
  AI_FIELD_VALUE_KIND,
  AI_LIMITS,
  ALLOWED_BENEFITS,
  ALLOWED_SUGGESTION_KINDS,
  ALLOWED_AI_FIELD_PATHS,
  type AllowedAiFieldPath,
  type TaskAiRecommendationResult,
  type TaskAiSuggestion,
  type TaskAiUnavailableReason,
} from './types';

/** 驗證失敗時一律回這個 —— 不回 partial，不回「部分成功」。 */
function unavailable(reason: TaskAiUnavailableReason): TaskAiRecommendationResult {
  return { status: 'unavailable', schemaVersion: 1, reason, suggestions: [] };
}

/**
 * 明確禁止的路徑。
 *
 * 它們本來就不在 allowlist 裡，所以走不到這裡 —— 但單獨列出來是為了
 * 讓「AI 想改幣值」這件事在 log 與測試裡有名字，而不是混在
 * 「未知欄位」這個泛稱裡。禁止改幣值和拼錯欄位名不是同一件事。
 */
const EXPLICITLY_FORBIDDEN_PATHS = [
  'rewardPolicy',
  'reward_policy',
  'coinAmount',
  'coin_amount',
  'rewardCoinAmount',
  'reward.decision',
  'reward.coin.finalAmount',
  'coin',
  'purposeCategory',
  'durationType',
  'source',
  'completionPolicy',
  'childId',
  'familyId',
  'originalExpectation',
];

/** 含 HTML tag 的文字一律視為不安全 —— 我們不渲染 HTML，出現就是異常。 */
const HTML_TAG = /<[^>]*>/;
/**
 * 控制字元。
 *
 * 換行與 tab 以外的 C0 / C1 控制字元一律拒絕：它們在正常的建議文字裡
 * 沒有理由出現，而且是終端機轉義與隱藏內容的常見載體。
 */
const CONTROL_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

function isCleanText(value: string, maxLength: number): boolean {
  if (value.trim().length === 0) return false;
  if (value.length > maxLength) return false;
  if (HTML_TAG.test(value)) return false;
  if (CONTROL_CHARS.test(value)) return false;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueMatchesKind(path: AllowedAiFieldPath, value: unknown): boolean {
  const kind = AI_FIELD_VALUE_KIND[path];

  if (kind === 'string') {
    return typeof value === 'string' && isCleanText(value, AI_LIMITS.maxTextValueLength);
  }

  if (kind === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) return false;
    if (value <= 0) return false;
    // 數值也有上限：一個「建議每次 9999 分鐘」的東西不是建議，是幻覺。
    if (path === 'sessionMinutes') return value <= AI_LIMITS.maxMinutes;
    if (path === 'durationDays') return value <= AI_LIMITS.maxDurationDays;
    if (path === 'weeklyFrequency') return value <= AI_LIMITS.maxWeeklyFrequency;
    if (path === 'reviewAfterDays') return value <= AI_LIMITS.maxReviewAfterDays;
    return true;
  }

  // string[]
  if (!Array.isArray(value)) return false;
  if (value.length === 0 || value.length > AI_LIMITS.maxListItems) return false;
  return value.every(
    item => typeof item === 'string' && isCleanText(item, AI_LIMITS.maxListItemLength),
  );
}

/** currentValue 允許 null（原本沒設定），型別對不上就整批拒絕。 */
function currentValueIsAcceptable(path: AllowedAiFieldPath, value: unknown): boolean {
  if (value === null) return true;
  const kind = AI_FIELD_VALUE_KIND[path];
  if (kind === 'string') return typeof value === 'string' && value.length <= AI_LIMITS.maxTextValueLength;
  if (kind === 'number') return typeof value === 'number' && Number.isFinite(value);
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function validateSuggestion(raw: unknown): TaskAiSuggestion | null {
  if (!isRecord(raw)) return null;

  const { id, kind, fieldPath, currentValue, suggestedValue, rationale, expectedBenefit, confidence } =
    raw;

  if (typeof id !== 'string' || !isCleanText(id, 64)) return null;
  if (typeof kind !== 'string' || !(ALLOWED_SUGGESTION_KINDS as readonly string[]).includes(kind)) {
    return null;
  }
  if (typeof fieldPath !== 'string') return null;
  if (EXPLICITLY_FORBIDDEN_PATHS.includes(fieldPath)) return null;
  if (!(ALLOWED_AI_FIELD_PATHS as readonly string[]).includes(fieldPath)) return null;

  const path = fieldPath as AllowedAiFieldPath;
  if (!valueMatchesKind(path, suggestedValue)) return null;
  if (!currentValueIsAcceptable(path, currentValue)) return null;

  if (typeof rationale !== 'string' || !isCleanText(rationale, AI_LIMITS.maxRationaleLength)) {
    return null;
  }
  if (
    typeof expectedBenefit !== 'string' ||
    !(ALLOWED_BENEFITS as readonly string[]).includes(expectedBenefit)
  ) {
    return null;
  }
  if (confidence !== 'low' && confidence !== 'medium' && confidence !== 'high') return null;

  return {
    id,
    kind: kind as TaskAiSuggestion['kind'],
    fieldPath: path,
    currentValue: (currentValue ?? null) as TaskAiSuggestion['currentValue'],
    suggestedValue: suggestedValue as TaskAiSuggestion['suggestedValue'],
    rationale,
    expectedBenefit: expectedBenefit as TaskAiSuggestion['expectedBenefit'],
    confidence,
  };
}

/**
 * 驗證一份來路不明的回傳。
 *
 * 輸入型別刻意是 `unknown`：呼叫端沒有辦法用一個 cast 繞過這裡。
 */
export function validateTaskAiRecommendationResult(raw: unknown): TaskAiRecommendationResult {
  if (!isRecord(raw)) return unavailable('INVALID_RESPONSE');
  if (raw.schemaVersion !== 1) return unavailable('INVALID_RESPONSE');

  const status = raw.status;

  if (status === 'unavailable') {
    const reason = raw.reason;
    const known: readonly string[] = [
      'TIMEOUT', 'INVALID_RESPONSE', 'SERVICE_ERROR', 'UNSAFE_OUTPUT',
      'NOT_ELIGIBLE', 'SERVICE_DISABLED',
    ];
    if (typeof reason !== 'string' || !known.includes(reason)) return unavailable('INVALID_RESPONSE');
    return unavailable(reason as TaskAiUnavailableReason);
  }

  if (status === 'no_change') {
    const summary = raw.summary;
    if (typeof summary !== 'string' || !isCleanText(summary, AI_LIMITS.maxSummaryLength)) {
      return unavailable('INVALID_RESPONSE');
    }
    // no_change 帶著建議是自相矛盾的回傳，不要試著理解它。
    if (Array.isArray(raw.suggestions) && raw.suggestions.length > 0) {
      return unavailable('INVALID_RESPONSE');
    }
    return { status: 'no_change', schemaVersion: 1, summary, suggestions: [] };
  }

  if (status !== 'suggestions') return unavailable('INVALID_RESPONSE');

  const summary = raw.summary;
  if (typeof summary !== 'string' || !isCleanText(summary, AI_LIMITS.maxSummaryLength)) {
    return unavailable('INVALID_RESPONSE');
  }

  const list = raw.suggestions;
  if (!Array.isArray(list)) return unavailable('INVALID_RESPONSE');
  if (list.length === 0) return unavailable('INVALID_RESPONSE');
  if (list.length > AI_LIMITS.maxSuggestions) return unavailable('UNSAFE_OUTPUT');

  const suggestions: TaskAiSuggestion[] = [];
  for (const item of list) {
    const valid = validateSuggestion(item);
    // 壞掉一項就整批不可信 —— 見檔頭。
    if (!valid) return unavailable('UNSAFE_OUTPUT');
    suggestions.push(valid);
  }

  const ids = new Set(suggestions.map(s => s.id));
  if (ids.size !== suggestions.length) return unavailable('INVALID_RESPONSE');

  return { status: 'suggestions', schemaVersion: 1, summary, suggestions };
}
