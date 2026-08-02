// task-ai-recommendation — server 端輸出驗證
//
// ─────────────────────────────────────────────────────────────────────────
// 為什麼 client 已經有一份還要在這裡再驗一次：
//
// client validator 保護的是**畫面**。它擋不住直接對 Edge Function 送請求的人，
// 也擋不住舊版 App。任何「只在 client 驗」的設計，實際的效果是
// 「只要不用我們的 App 就沒有驗證」。
//
// 這份與 src/screens/parent/tablet/taskDrawer/taskAi/validateTaskAiResult.ts
// 是同一套規則的兩份實作。**資料（allowlist、上限）只有一份**，
// 在 contract.json；漂移由 taskAi/__tests__/contractParity.test.ts 釘住。
//
// 為什麼不共用同一份 TS：Edge Function 跑 Deno，App 跑 RN/babel。
// 讓 Deno import App 的 module graph 會部署不了；讓 App import 這支的
// import attributes 會讓 jest 解析失敗。兩邊各實作一次、共用資料，
// 是這個 repo 已經驗證過可行的做法（見 taskReward/coinPolicy.ts 的檔頭）。
// ─────────────────────────────────────────────────────────────────────────

import contract from './contract.json' with { type: 'json' };

export type UnavailableReason = 'TIMEOUT' | 'INVALID_RESPONSE' | 'SERVICE_ERROR' | 'UNSAFE_OUTPUT';

type ValueKind = 'string' | 'number' | 'string[]';

const FIELD_KINDS = contract.allowedFieldPaths as Record<string, ValueKind>;
const ALLOWED_PATHS = Object.keys(FIELD_KINDS);
const LIMITS = contract.limits;

const HTML_TAG = /<[^>]*>/;
const CONTROL_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

const NUMBER_MAX: Record<string, number> = {
  sessionMinutes: LIMITS.maxMinutes,
  durationDays: LIMITS.maxDurationDays,
  weeklyFrequency: LIMITS.maxWeeklyFrequency,
  reviewAfterDays: LIMITS.maxReviewAfterDays,
};

export function unavailable(reason: UnavailableReason) {
  return { status: 'unavailable' as const, schemaVersion: 1 as const, reason, suggestions: [] };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isCleanText(v: string, max: number): boolean {
  if (v.trim().length === 0) return false;
  if (v.length > max) return false;
  if (HTML_TAG.test(v)) return false;
  if (CONTROL_CHARS.test(v)) return false;
  return true;
}

function valueMatchesKind(path: string, value: unknown): boolean {
  const kind = FIELD_KINDS[path];

  if (kind === 'string') {
    return typeof value === 'string' && isCleanText(value, LIMITS.maxTextValueLength);
  }

  if (kind === 'number') {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return false;
    const max = NUMBER_MAX[path];
    return max === undefined || value <= max;
  }

  if (!Array.isArray(value)) return false;
  if (value.length === 0 || value.length > LIMITS.maxListItems) return false;
  return value.every(
    (item) => typeof item === 'string' && isCleanText(item, LIMITS.maxListItemLength),
  );
}

function currentValueIsAcceptable(path: string, value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const kind = FIELD_KINDS[path];
  if (kind === 'string') return typeof value === 'string' && value.length <= LIMITS.maxTextValueLength;
  if (kind === 'number') return typeof value === 'number' && Number.isFinite(value);
  return Array.isArray(value) && value.every((i) => typeof i === 'string');
}

function validateSuggestion(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;

  const { id, kind, fieldPath, currentValue, suggestedValue, rationale, expectedBenefit, confidence } =
    raw;

  if (typeof id !== 'string' || !isCleanText(id, LIMITS.maxIdLength)) return null;
  if (typeof kind !== 'string' || !contract.allowedSuggestionKinds.includes(kind)) return null;

  if (typeof fieldPath !== 'string') return null;
  // 先查明確禁止清單再查 allowlist：兩者結論一樣，但 log 分得出
  // 「想改幣值」和「欄位名拼錯」不是同一件事。
  if (contract.explicitlyForbiddenPaths.includes(fieldPath)) return null;
  if (!ALLOWED_PATHS.includes(fieldPath)) return null;

  if (!valueMatchesKind(fieldPath, suggestedValue)) return null;
  if (!currentValueIsAcceptable(fieldPath, currentValue)) return null;

  if (typeof rationale !== 'string' || !isCleanText(rationale, LIMITS.maxRationaleLength)) return null;
  if (typeof expectedBenefit !== 'string' || !contract.allowedBenefits.includes(expectedBenefit)) {
    return null;
  }
  if (typeof confidence !== 'string' || !contract.allowedConfidence.includes(confidence)) return null;

  return {
    id, kind, fieldPath,
    currentValue: currentValue ?? null,
    suggestedValue, rationale, expectedBenefit, confidence,
  };
}

/**
 * 驗證模型回傳。輸入型別是 `unknown` —— 呼叫端沒有辦法用 cast 繞過去。
 *
 * 壞一項就整批 unavailable，不做部分放行：家長看到三張卡時，
 * 那三張要嘛都經過完整驗證，要嘛一張都不給。默默扔掉第四張會讓前三張
 * 看起來比實際更可信。
 */
export function validateModelOutput(raw: unknown) {
  if (!isRecord(raw)) return unavailable('INVALID_RESPONSE');
  if (raw.schemaVersion !== 1) return unavailable('INVALID_RESPONSE');

  const status = raw.status;

  if (status === 'no_change') {
    const summary = raw.summary;
    if (typeof summary !== 'string' || !isCleanText(summary, LIMITS.maxSummaryLength)) {
      return unavailable('INVALID_RESPONSE');
    }
    if (Array.isArray(raw.suggestions) && raw.suggestions.length > 0) {
      return unavailable('INVALID_RESPONSE');
    }
    return { status: 'no_change' as const, schemaVersion: 1 as const, summary, suggestions: [] };
  }

  // 模型不該自己回 unavailable —— 那是我們對 App 的說法，不是模型的詞彙。
  if (status !== 'suggestions') return unavailable('INVALID_RESPONSE');

  const summary = raw.summary;
  if (typeof summary !== 'string' || !isCleanText(summary, LIMITS.maxSummaryLength)) {
    return unavailable('INVALID_RESPONSE');
  }

  const list = raw.suggestions;
  if (!Array.isArray(list) || list.length === 0) return unavailable('INVALID_RESPONSE');
  if (list.length > LIMITS.maxSuggestions) return unavailable('UNSAFE_OUTPUT');

  const suggestions: Array<Record<string, unknown>> = [];
  for (const item of list) {
    const valid = validateSuggestion(item);
    if (!valid) return unavailable('UNSAFE_OUTPUT');
    suggestions.push(valid);
  }

  const ids = new Set(suggestions.map((s) => s.id as string));
  if (ids.size !== suggestions.length) return unavailable('INVALID_RESPONSE');

  return { status: 'suggestions' as const, schemaVersion: 1 as const, summary, suggestions };
}
