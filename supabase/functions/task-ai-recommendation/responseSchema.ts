// task-ai-recommendation — Gemini structured output schema
//
// ─────────────────────────────────────────────────────────────────────────
// 這個 schema **從 contract.json 產生**，不是手寫的第二份 allowlist。
// 手寫的話它就是第三個會漂移的地方（App validator、server validator、
// 還有這個），而漂移的症狀是「模型被允許生成 validator 會拒絕的東西」——
// 那看起來就像模型在亂回答。
//
// ── 一件關鍵的事：模型不可以生成 unavailable ──────────────────────────
//
// `TaskAiRecommendationResult` 有三個 status，但 schema 的 enum 只有兩個：
// `suggestions` 與 `no_change`。
//
// `unavailable` 是**我們**對 App 說的話，不是模型的詞彙。它只能由三種東西
// 產生：transport 失敗（TIMEOUT / SERVICE_ERROR）、validator 拒收
// （INVALID_RESPONSE）、或內容安全攔截（UNSAFE_OUTPUT）。
//
// 如果模型能自己回 `unavailable`，它就能宣稱一個沒有發生的逾時，
// 而我們的 log 會記下一個假的 TIMEOUT。更糟的是：一個被 prompt injection
// 誘導的模型可以用 `unavailable` 讓建議功能整個靜默失效，
// 而家長只會看到「目前無法取得建議」，不會知道發生過什麼。
//
// ── structured output 不能取代 validator ─────────────────────────────
//
// 它降低的是**格式錯誤**的機率，不是零。它管不到：
//   - 值的語意（`sessionMinutes: 9999` 型別正確、內容荒謬）
//   - 內容安全（「清理瓦斯爐」是一個完全合法的 string）
//   - id 是否重複
//   - 跨欄位一致性
// 所以 outputValidator 與 contentSafety 一個都不能拿掉。
// ─────────────────────────────────────────────────────────────────────────

import { CONTRACT, FIELD_KINDS, LIMITS } from './contract.ts';

/**
 * Gemini 的 `responseSchema` 用的是 OpenAPI 3.0 Schema 的子集。
 * 它**不支援** `oneOf` / `anyOf` / `additionalProperties`，
 * 所以下面用得到的只有 type / enum / properties / required / items / 上下限。
 */
type GeminiSchema = {
  type?: string;
  description?: string;
  enum?: string[];
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  items?: GeminiSchema;
  minItems?: number;
  maxItems?: number;
  nullable?: boolean;
  propertyOrdering?: string[];
  anyOf?: GeminiSchema[];
};

/**
 * `suggestedValue` 在契約裡是 `string | number | string[]`，依 `fieldPath` 而定。
 *
 * 這裡用 `anyOf` 把三種都列出來，而**不是**宣告成 string。
 *
 * 差別很實際：如果 schema 說 `suggestedValue` 是 string，模型就會把
 * `sessionMinutes` 的建議寫成 `"15"`，而 outputValidator 要求那一格是
 * `number` —— 於是每一則數值建議都會被判成 INVALID_RESPONSE。
 * schema 與 validator 對同一個欄位有兩種說法，症狀會長得像「模型很爛」。
 *
 * ⚠️ `anyOf` 需要對真實 API 驗證過才算數（見檔尾）。
 */
const VALUE_ANY_OF: GeminiSchema[] = [
  { type: 'string' },
  { type: 'integer' },
  { type: 'array', items: { type: 'string' } },
];

const NUMBER_PATHS = Object.entries(FIELD_KINDS)
  .filter(([, kind]) => kind === 'number')
  .map(([path]) => path);

const LIST_PATHS = Object.entries(FIELD_KINDS)
  .filter(([, kind]) => kind === 'string[]')
  .map(([path]) => path);

const SUGGESTION_SCHEMA: GeminiSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      description: `這一則建議的識別碼，同一批內不可重複，最多 ${LIMITS.maxIdLength} 字元。`,
    },
    kind: {
      type: 'string',
      enum: [...CONTRACT.allowedSuggestionKinds],
    },
    fieldPath: {
      type: 'string',
      enum: [...Object.keys(FIELD_KINDS)],
    },
    currentValue: {
      nullable: true,
      anyOf: VALUE_ANY_OF,
      description: '草稿目前的值；原本沒有設定就給 null。型別要與 fieldPath 相符。',
    },
    suggestedValue: {
      anyOf: VALUE_ANY_OF,
      description:
        `建議的新值，型別必須與 fieldPath 相符：`
        + `${NUMBER_PATHS.join(' / ')} 給正整數；`
        + `${LIST_PATHS.join(' / ')} 給字串陣列；`
        + `其餘給純文字（最多 ${LIMITS.maxTextValueLength} 字）。不可含 HTML 標籤。`,
    },
    rationale: {
      type: 'string',
      description: `為什麼建議這樣改，最多 ${LIMITS.maxRationaleLength} 字。`,
    },
    expectedBenefit: {
      type: 'string',
      enum: [...CONTRACT.allowedBenefits],
    },
    confidence: {
      type: 'string',
      enum: [...CONTRACT.allowedConfidence],
    },
  },
  required: [
    'id', 'kind', 'fieldPath', 'suggestedValue', 'rationale', 'expectedBenefit', 'confidence',
  ],
  propertyOrdering: [
    'id', 'kind', 'fieldPath', 'currentValue', 'suggestedValue',
    'rationale', 'expectedBenefit', 'confidence',
  ],
};

export const RESPONSE_SCHEMA: GeminiSchema = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      // 只有兩個值。`unavailable` 不在這裡 —— 見檔頭。
      enum: ['suggestions', 'no_change'],
    },
    schemaVersion: {
      type: 'integer',
      description: '固定填 1。',
    },
    summary: {
      type: 'string',
      description: `一句話總結，最多 ${LIMITS.maxSummaryLength} 字。`,
    },
    suggestions: {
      type: 'array',
      minItems: 0,
      maxItems: LIMITS.maxSuggestions,
      items: SUGGESTION_SCHEMA,
      description: `最多 ${LIMITS.maxSuggestions} 則。status 是 no_change 時給空陣列。`,
    },
  },
  required: ['status', 'schemaVersion', 'summary', 'suggestions'],
  propertyOrdering: ['status', 'schemaVersion', 'summary', 'suggestions'],
};

/** 模型被允許生成的 status。測試用它斷言 `unavailable` 不在其中。 */
export const MODEL_ALLOWED_STATUSES: readonly string[] = RESPONSE_SCHEMA
  .properties!.status.enum!;

// ─────────────────────────────────────────────────────────────────────────
// ⚠️ 尚未對真實 API 驗證的兩件事
//
// 1. **`anyOf` 是否被 responseSchema 接受。** Gemini 的 Schema 型別文件上
//    有 `anyOf`，但 structured output 實際支援的子集比文件窄過不只一次。
//    如果 API 回 400，退路是把 `suggestedValue` 宣告成 string 並在
//    outputValidator 加一層「依 fieldPath 反序列化」—— 那會讓 validator
//    多一個職責，是次佳解，所以先試 anyOf。
//
// 2. **`propertyOrdering` 是否影響輸出品質。** 它是提示不是保證。
//
// 這兩件事都要等真的打過一次 API 才知道。在那之前，
// 不要說 structured output「已經生效」—— 只能說「已經送出去了」。
// ─────────────────────────────────────────────────────────────────────────
