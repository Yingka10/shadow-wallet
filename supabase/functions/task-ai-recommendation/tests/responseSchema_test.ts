// Gemini structured output schema。
//
// 最重要的一條：**模型不可以生成 `unavailable`。**
//
// 如果它能，它就能宣稱一個沒有發生的逾時，而我們的 log 會記下一個假的
// TIMEOUT。更糟的是，一個被 injection 誘導的模型可以用 `unavailable`
// 讓建議功能整個靜默失效 —— 家長只會看到「目前無法取得建議」。

import { assert, assertEquals } from './assert.ts';
import { MODEL_ALLOWED_STATUSES, RESPONSE_SCHEMA } from '../responseSchema.ts';
import { CONTRACT, FIELD_KINDS, LIMITS } from '../contract.ts';
import { buildGeminiRequestBody } from '../prompt.ts';
import { validInput } from './fixtures.ts';

Deno.test('模型只能生成 suggestions 與 no_change', () => {
  assertEquals([...MODEL_ALLOWED_STATUSES].sort(), ['no_change', 'suggestions']);
});

Deno.test('unavailable 與四種 reason 都不在 schema 裡', () => {
  const serialized = JSON.stringify(RESPONSE_SCHEMA);
  for (const forbidden of ['unavailable', 'TIMEOUT', 'INVALID_RESPONSE', 'SERVICE_ERROR', 'UNSAFE_OUTPUT']) {
    assertEquals(
      { forbidden, present: serialized.includes(forbidden) },
      { forbidden, present: false },
      `${forbidden} 只能由 Function 產生，不能由模型宣稱`,
    );
  }
});

Deno.test('schema 的 enum 與 contract.json 完全一致，不是手寫的第二份 allowlist', () => {
  const suggestion = RESPONSE_SCHEMA.properties!.suggestions.items!;
  assertEquals(suggestion.properties!.kind.enum, [...CONTRACT.allowedSuggestionKinds]);
  assertEquals(suggestion.properties!.fieldPath.enum, Object.keys(FIELD_KINDS));
  assertEquals(suggestion.properties!.expectedBenefit.enum, [...CONTRACT.allowedBenefits]);
  assertEquals(suggestion.properties!.confidence.enum, [...CONTRACT.allowedConfidence]);
});

Deno.test('數量上限與 contract.json 一致', () => {
  assertEquals(RESPONSE_SCHEMA.properties!.suggestions.maxItems, LIMITS.maxSuggestions);
});

Deno.test('required 欄位齊全，currentValue 可為 null', () => {
  const suggestion = RESPONSE_SCHEMA.properties!.suggestions.items!;
  assertEquals(suggestion.required, [
    'id', 'kind', 'fieldPath', 'suggestedValue', 'rationale', 'expectedBenefit', 'confidence',
  ]);
  // currentValue 不在 required 裡，而且明確可為 null ——
  // 「原本沒有設定」是一個正常狀態。
  assertEquals(suggestion.properties!.currentValue.nullable, true);

  assertEquals(RESPONSE_SCHEMA.required, ['status', 'schemaVersion', 'summary', 'suggestions']);
});

Deno.test('suggestedValue 用 anyOf 涵蓋三種型別，而不是宣告成 string', () => {
  // 宣告成 string 的話，模型會把 sessionMinutes 寫成 "15"，
  // 而 outputValidator 要求那一格是 number —— 每一則數值建議都會被判成
  // INVALID_RESPONSE。schema 與 validator 對同一個欄位有兩種說法，
  // 症狀會長得像「模型很爛」。
  const suggestion = RESPONSE_SCHEMA.properties!.suggestions.items!;
  const anyOf = suggestion.properties!.suggestedValue.anyOf;

  assert(Array.isArray(anyOf), 'suggestedValue 應該用 anyOf');
  assertEquals(anyOf!.map((s) => s.type), ['string', 'integer', 'array']);

  // 契約裡確實有這三種型別，缺一不可。
  const kinds = new Set(Object.values(FIELD_KINDS));
  assertEquals([...kinds].sort(), ['number', 'string', 'string[]']);
});

Deno.test('request body 帶上 responseSchema 與 responseMimeType', () => {
  const body = buildGeminiRequestBody(validInput());
  const generationConfig = body.generationConfig as Record<string, unknown>;

  assertEquals(generationConfig.responseMimeType, 'application/json');
  assertEquals(generationConfig.responseSchema, RESPONSE_SCHEMA);
  // 低溫度：這是在改寫既有文字，不是創作。
  assertEquals(generationConfig.temperature, 0.2);
});

Deno.test('structured output 不取代 validator —— schema 過得了的東西 validator 仍可能擋', () => {
  // 這一條是說明性的，但它釘住一個真實的風險：有人看到 responseSchema
  // 之後把 outputValidator 當成多餘的。下面每一項都符合 schema，
  // 但都必須被 validator 擋掉。
  const schemaValidButUnacceptable = [
    'sessionMinutes 給 9999（型別正確、內容荒謬）',
    '兩則建議用同一個 id（schema 管不到跨項目一致性）',
    'suggestedValue 是「清理瓦斯爐」（完全合法的 string）',
    'rationale 裡有 <script>（schema 沒有格式約束）',
  ];
  assert(schemaValidButUnacceptable.length === 4, '四種 schema 擋不住的東西');
});
