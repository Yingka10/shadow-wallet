// task-ai-recommendation — server 端輸出驗證
//
// ─────────────────────────────────────────────────────────────────────────
// client validator 保護的是**畫面**。它擋不住直接對這個 endpoint 送請求的人，
// 也擋不住舊版 App。「只在 client 驗」的實際效果是
// 「只要不用我們的 App 就沒有驗證」。
//
// 這份與 App 端 taskAi/validateTaskAiResult.ts 是同一套規則的兩份實作。
// 資料只有一份（contract.json），行為由共用 fixture 釘住。
//
// ── 兩個 reason 的分工（與 App 端刻意不同）────────────────────────────
//
//   INVALID_RESPONSE — 形狀不對。模型沒有照 schema 回。
//   UNSAFE_OUTPUT    — 形狀對了，但**內容**越界：想改 immutable 欄位、
//                      想碰幣值、或帶著對孩子有危險的建議。
//
// App 端目前把 schema 錯誤也算成 UNSAFE_OUTPUT。兩邊的 accepted / rejected
// 結論一致，只有 reason 分得比較細 —— 那正是 server 多一層的意義：
// 「模型壞了」和「模型想越界」在稽核上不是同一件事，
// 而 client 沒有立場做這個區分（它看到的東西已經被 server 過濾過）。
//
// 家長看到的字一樣：「目前無法取得建議，不影響任務建立。」
// ─────────────────────────────────────────────────────────────────────────

import {
  ALLOWED_FIELD_PATHS,
  CONTRACT,
  FIELD_KINDS,
  LIMITS,
  unavailable,
  type AgeGroup,
  type RecommendationResult,
  type Suggestion,
} from './contract.ts';
import { findSafetyViolation, type SafetyViolation } from './contentSafety.ts';

const HTML_TAG = /<[^>]*>/;
const CONTROL_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

const SUGGESTION_KEYS = [
  'id', 'kind', 'fieldPath', 'currentValue', 'suggestedValue',
  'rationale', 'expectedBenefit', 'confidence',
];

const NUMBER_MAX: Record<string, number> = {
  sessionMinutes: LIMITS.maxMinutes,
  durationDays: LIMITS.maxDurationDays,
  weeklyFrequency: LIMITS.maxWeeklyFrequency,
  reviewAfterDays: LIMITS.maxReviewAfterDays,
};

/**
 * 驗證這一份輸出時的脈絡。
 *
 * `allowedFieldPaths` 是**這一次請求**可以被建議修改的欄位 ——
 * 由 eligibility 依 editorKind 算出來，永遠是全域 allowlist 的子集。
 *
 * 為什麼是必填而不是可選：可選的話，忘了傳就會安靜地退回全域 allowlist，
 * 也就是安靜地失去這一層。型別上要求它，忘記就編譯不過。
 */
export type OutputContext = {
  ageGroup: AgeGroup;
  allowedFieldPaths: readonly string[];
  allowedSuggestionKinds: readonly string[];
};

/** 為什麼被拒。只進 log，不回給家長。 */
export type OutputRejection =
  | { kind: 'schema'; detail: string }
  | { kind: 'boundary'; detail: string }
  | { kind: 'safety'; violation: SafetyViolation };

export type OutputValidationResult = {
  result: RecommendationResult;
  rejection?: OutputRejection;
};

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

type SuggestionCheck =
  | { ok: true; suggestion: Suggestion }
  | { ok: false; rejection: OutputRejection };

function checkSuggestion(
  raw: unknown,
  allowedFieldPaths: readonly string[],
  allowedSuggestionKinds: readonly string[],
): SuggestionCheck {
  const bad = (kind: 'schema' | 'boundary', detail: string): SuggestionCheck =>
    ({ ok: false, rejection: { kind, detail } });

  if (!isRecord(raw)) return bad('schema', 'suggestion 不是物件');

  // 未知欄位也算 schema 不符：模型多吐一個 `applyImmediately: true`
  // 這種東西，代表它對契約的理解和我們不同，不該當成只是雜訊。
  for (const key of Object.keys(raw)) {
    if (!SUGGESTION_KEYS.includes(key)) return bad('schema', `suggestion 含未知欄位 ${key}`);
  }

  const { id, kind, fieldPath, currentValue, suggestedValue, rationale, expectedBenefit, confidence } =
    raw;

  if (typeof id !== 'string' || !isCleanText(id, LIMITS.maxIdLength)) return bad('schema', 'id 不合法');
  if (typeof kind !== 'string' || !CONTRACT.allowedSuggestionKinds.includes(kind)) {
    return bad('schema', 'kind 不在 allowlist');
  }
  if (typeof fieldPath !== 'string') return bad('schema', 'fieldPath 不是字串');

  // 明確禁止的路徑先查 —— 結論和「不在 allowlist」一樣，但這是
  // **越界**不是**格式錯**。想改幣值和拼錯欄位名不該混在同一個桶子裡。
  if (CONTRACT.explicitlyForbiddenPaths.includes(fieldPath)) {
    return bad('boundary', `fieldPath 是明確禁止的路徑：${fieldPath}`);
  }
  if (CONTRACT.immutableFields.includes(fieldPath)) {
    return bad('boundary', `fieldPath 是 immutable 欄位：${fieldPath}`);
  }
  if (!ALLOWED_FIELD_PATHS.includes(fieldPath)) {
    return bad('schema', `fieldPath 不在 allowlist：${fieldPath}`);
  }

  // 全域 allowlist 說「這個欄位存在」，context allowlist 說「這種任務有這個欄位」。
  //
  // 兩者不同：`milestones` 是合法路徑，但固定任務沒有里程碑 ——
  // 模型對一個週期任務建議 milestones，寫進去會落在一個不存在的地方。
  // prompt 已經只列了這一份窄清單，所以越界代表模型沒照做，
  // 那是**越界**不是格式錯。
  if (!allowedFieldPaths.includes(fieldPath)) {
    return bad('boundary', `fieldPath 不在此任務的可修改範圍：${fieldPath}`);
  }

  if (!allowedSuggestionKinds.includes(kind)) {
    return bad('boundary', `kind 不在此任務的可用範圍：${kind}`);
  }

  // kind 與 fieldPath 必須相符。
  //
  // 這條是實測長出來的：staging 上第一次真實呼叫，模型回了
  // `kind: "add_support_step"` 搭 `fieldPath: "taskDetails"`。
  // 兩個欄位分開看都合法，合起來卻是錯的 ——
  // **App 依 fieldPath 決定要改哪裡，依 kind 決定畫面上寫什麼。**
  // 不相符就等於：家長看到「新增支援步驟」，按下去改的是任務細節。
  //
  // 那不是文案瑕疵，是家長在不知情的情況下同意了另一件事。
  const targets = CONTRACT.suggestionKindFieldPaths[kind] ?? [];
  if (!targets.includes(fieldPath)) {
    return bad('boundary', `kind 與 fieldPath 不相符：${kind} → ${fieldPath}`);
  }

  if (!valueMatchesKind(fieldPath, suggestedValue)) return bad('schema', 'suggestedValue 型別或長度不符');
  if (!currentValueIsAcceptable(fieldPath, currentValue)) return bad('schema', 'currentValue 型別不符');

  if (typeof rationale !== 'string' || !isCleanText(rationale, LIMITS.maxRationaleLength)) {
    return bad('schema', 'rationale 不合法');
  }
  if (typeof expectedBenefit !== 'string' || !CONTRACT.allowedBenefits.includes(expectedBenefit)) {
    return bad('schema', 'expectedBenefit 不在 allowlist');
  }
  if (typeof confidence !== 'string' || !CONTRACT.allowedConfidence.includes(confidence)) {
    return bad('schema', 'confidence 不在 allowlist');
  }

  return {
    ok: true,
    suggestion: {
      id, kind, fieldPath,
      currentValue: (currentValue ?? null) as Suggestion['currentValue'],
      suggestedValue: suggestedValue as Suggestion['suggestedValue'],
      rationale, expectedBenefit, confidence,
    },
  };
}

/**
 * `unknown` → `RecommendationResult`。
 *
 * 壞一項就整批丟。不做部分放行：家長看到三張卡時，那三張要嘛都經過完整
 * 驗證，要嘛一張都不給。默默扔掉第四張會讓前三張看起來比實際更可信 ——
 * 而我們既不知道第四張為什麼壞，也不知道前三張是不是同一批幻覺的產物。
 */
export function validateModelOutput(raw: unknown, context: OutputContext): OutputValidationResult {
  const { ageGroup, allowedFieldPaths, allowedSuggestionKinds } = context;
  const invalid = (detail: string): OutputValidationResult => ({
    result: unavailable('INVALID_RESPONSE'),
    rejection: { kind: 'schema', detail },
  });
  const unsafe = (rejection: OutputRejection): OutputValidationResult => ({
    result: unavailable('UNSAFE_OUTPUT'),
    rejection,
  });

  if (!isRecord(raw)) return invalid('回傳不是物件');
  if (raw.schemaVersion !== 1) return invalid('schemaVersion 不是 1');

  const status = raw.status;

  if (status === 'no_change') {
    const summary = raw.summary;
    if (typeof summary !== 'string' || !isCleanText(summary, LIMITS.maxSummaryLength)) {
      return invalid('no_change 的 summary 不合法');
    }
    if (Array.isArray(raw.suggestions) && raw.suggestions.length > 0) {
      return invalid('no_change 不該帶著建議');
    }
    const violation = findSafetyViolation({ ageGroup, summary, suggestions: [] });
    if (violation) return unsafe({ kind: 'safety', violation });

    return { result: { status: 'no_change', schemaVersion: 1, summary, suggestions: [] } };
  }

  // 模型不該自己回 unavailable —— 那是我們對 App 的說法，不是模型的詞彙。
  if (status !== 'suggestions') return invalid(`未知 status`);

  const summary = raw.summary;
  if (typeof summary !== 'string' || !isCleanText(summary, LIMITS.maxSummaryLength)) {
    return invalid('summary 不合法');
  }

  const list = raw.suggestions;
  if (!Array.isArray(list)) return invalid('suggestions 不是陣列');
  if (list.length === 0) return invalid('suggestions 是空陣列');
  // 超量是越界不是格式錯：模型被明確告知上限，它知道自己在超。
  if (list.length > LIMITS.maxSuggestions) {
    return unsafe({ kind: 'boundary', detail: `建議數量 ${list.length} 超過上限` });
  }

  const suggestions: Suggestion[] = [];
  for (const item of list) {
    const checked = checkSuggestion(item, allowedFieldPaths, allowedSuggestionKinds);
    if (!checked.ok) {
      return checked.rejection.kind === 'schema'
        ? { result: unavailable('INVALID_RESPONSE'), rejection: checked.rejection }
        : unsafe(checked.rejection);
    }
    suggestions.push(checked.suggestion);
  }

  const ids = new Set(suggestions.map((s) => s.id));
  if (ids.size !== suggestions.length) return invalid('建議 id 重複');

  // 最後一道，也是 schema 看不到的那一道。
  const violation = findSafetyViolation({ ageGroup, summary, suggestions });
  if (violation) return unsafe({ kind: 'safety', violation });

  return { result: { status: 'suggestions', schemaVersion: 1, summary, suggestions } };
}
