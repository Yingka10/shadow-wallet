// 使用範圍閘門。
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支要證明的是一件不太直覺的事：**縮小範圍才是這一輪的安全措施。**
//
// B2A 的 red-team 顯示，關鍵字層對同義說法的攔截率只有 1/5。
// 補詞是輸的一方 —— 同義說法無限，而寬泛的詞（「廚房」「爐子」）
// 會擋掉正當任務，直到有人把整層關掉。
//
// 所以下面同時測兩件事：
//   1. A／B 類任務不會走到 Gemini（就算安全層漏了也不會出事）
//   2. C／D 類任務**沒有**被誤擋（否則這個功能等於沒開）
// ─────────────────────────────────────────────────────────────────────────

import { assert, assertEquals } from './assert.ts';
import {
  evaluateTaskAiRecommendationEligibility,
  fieldPathsFor,
} from '../eligibility.ts';
import { ALLOWED_FIELD_PATHS, type ValidatedInput } from '../contract.ts';
import { TASKS, taskById } from './fixtures.ts';

function withContext(
  base: ValidatedInput,
  over: Partial<ValidatedInput['taskContext']>,
): ValidatedInput {
  return { ...base, taskContext: { ...base.taskContext, ...over } };
}

const ELIGIBLE = taskById('sport-practice').input;

// ---------------------------------------------------------------------------
// 分類
// ---------------------------------------------------------------------------

Deno.test('C／D 類任務通過', () => {
  for (const category of ['autonomous_challenge', 'learning_skill']) {
    const result = evaluateTaskAiRecommendationEligibility(
      withContext(ELIGIBLE, { purposeCategory: category }),
    );
    assertEquals({ category, eligible: result.eligible }, { category, eligible: true });
  }
});

Deno.test('A／B 類任務不通過 —— 第一版刻意不開放', () => {
  for (const category of ['life_routine', 'family_participation']) {
    const result = evaluateTaskAiRecommendationEligibility(
      withContext(ELIGIBLE, { purposeCategory: category }),
    );
    assertEquals(
      { category, eligible: result.eligible, reason: result.eligible ? '' : result.reason },
      { category, eligible: false, reason: 'UNSUPPORTED_CATEGORY' },
    );
  }
});

Deno.test('家庭角色任務即使分類對了也不通過', () => {
  // 它的內容就是一份家務清單，而「新增一項負責內容」正是我們
  // 最不希望 AI 做的事。
  const result = evaluateTaskAiRecommendationEligibility(
    withContext(ELIGIBLE, { editorKind: 'family_role' }),
  );
  assertEquals(result.eligible, false);
  assertEquals(result.eligible ? '' : result.reason, 'TASK_TYPE_NOT_ENABLED');
});

// ---------------------------------------------------------------------------
// 六種 Demo 任務的實際落點
// ---------------------------------------------------------------------------

Deno.test('六種 Demo 任務：三種開放、三種不開放', () => {
  const verdict = TASKS.map((t) => ({
    id: t.id,
    eligible: evaluateTaskAiRecommendationEligibility(t.input).eligible,
  }));

  assertEquals(verdict, [
    { id: 'school-assignment', eligible: true },   // D · 單次
    { id: 'after-meal-tidy', eligible: false },    // B · 家庭參與
    { id: 'sport-practice', eligible: true },      // D · 週期
    { id: 'reading-plan', eligible: true },        // D · 成長計畫
    { id: 'schoolbag-14d', eligible: false },      // A · 生活常規
    { id: 'table-helper', eligible: false },       // B · 家庭角色
  ]);
});

// ---------------------------------------------------------------------------
// 內容風險
// ---------------------------------------------------------------------------

Deno.test('草稿本身寫著危險操作就不送 —— 包含 B2A 漏掉的同義說法', () => {
  // 這四句在 B2A 的關鍵字層全部通過。它們沒有出現「瓦斯」「爐子」「刀」。
  const bypasses = [
    '練習結束後把煮東西的檯面擦乾淨',
    '收拾時順便把加熱設備的外殼擦一擦',
    '練完把煮完的鍋子洗好',
    '自己拿銳利的工具把包裝拆開',
  ];

  for (const text of bypasses) {
    const input: ValidatedInput = {
      ...ELIGIBLE,
      currentDraft: { ...ELIGIBLE.currentDraft, completionDescription: text },
    };
    const result = evaluateTaskAiRecommendationEligibility(input);
    assertEquals(
      { text, eligible: result.eligible, reason: result.eligible ? '' : result.reason },
      { text, eligible: false, reason: 'HIGH_RISK_CONTEXT' },
    );
  }
});

Deno.test('正常的任務描述不會被誤擋', () => {
  // 這些**必須**通過。一個把「洗碗」「書架」擋掉的安全層會被關掉，
  // 而被關掉的安全層擋不住任何東西。
  const safe = [
    '練習完把自己的水壺洗乾淨',
    '練習完把運動鞋放回鞋架',
    '自己整理書桌和書架',
    '練習結束後把碗筷放到水槽',
    '幫忙擦餐桌',
  ];

  for (const text of safe) {
    const input: ValidatedInput = {
      ...ELIGIBLE,
      currentDraft: { ...ELIGIBLE.currentDraft, completionDescription: text },
    };
    const result = evaluateTaskAiRecommendationEligibility(input);
    assertEquals({ text, eligible: result.eligible }, { text, eligible: true });
  }
});

Deno.test('風險掃描看的是家長寫的欄位，不是我們自己組的字串', () => {
  // scheduleSummary 與 selectedOptions 由 App 依選項組出來，
  // 家長打不進自由文字。把它們也掃一遍只會製造誤判。
  const input: ValidatedInput = {
    ...ELIGIBLE,
    currentDraft: { ...ELIGIBLE.currentDraft, scheduleSummary: '固定在週二、週四、週六' },
  };
  assertEquals(evaluateTaskAiRecommendationEligibility(input).eligible, true);
});

// ---------------------------------------------------------------------------
// 內容量
// ---------------------------------------------------------------------------

Deno.test('草稿太空 → 不送（建議只會是模型在編）', () => {
  const cases: Array<[string, ValidatedInput]> = [
    ['標題只有空白', {
      ...ELIGIBLE,
      currentDraft: { ...ELIGIBLE.currentDraft, title: ' ' },
    }],
    ['原始期待只有一個字', {
      ...ELIGIBLE,
      parentIntent: { originalExpectation: '好' },
    }],
  ];

  for (const [name, input] of cases) {
    const result = evaluateTaskAiRecommendationEligibility(input);
    assertEquals(
      { name, eligible: result.eligible, reason: result.eligible ? '' : result.reason },
      { name, eligible: false, reason: 'INSUFFICIENT_CONTEXT' },
    );
  }
});

// ---------------------------------------------------------------------------
// context allowlist
// ---------------------------------------------------------------------------

Deno.test('每種 editorKind 拿到的欄位清單都是全域 allowlist 的子集', () => {
  for (const kind of ['growth_plan', 'short_support', 'recurring', 'one_time', 'family_role']) {
    const paths = fieldPathsFor(kind);
    const outside = paths.filter((p) => !ALLOWED_FIELD_PATHS.includes(p));
    assertEquals({ kind, outside }, { kind, outside: [] });
  }
});

Deno.test('里程碑只對成長計畫開放，支援步驟只對短期支援開放', () => {
  assert(fieldPathsFor('growth_plan').includes('milestones'), '成長計畫該有里程碑');
  assert(!fieldPathsFor('recurring').includes('milestones'), '週期任務沒有里程碑');

  assert(fieldPathsFor('short_support').includes('supportSteps'), '短期支援該有支援步驟');
  assert(!fieldPathsFor('one_time').includes('supportSteps'), '單次任務沒有支援步驟');
});

Deno.test('responsibilityItems 永遠不會開放給任何一種任務', () => {
  // 它只存在於家庭角色，而家庭角色整個不 eligible。
  // 這條測的是「就算有人把 family_role 加回允許清單，這個欄位仍然關著」。
  for (const kind of ['growth_plan', 'short_support', 'recurring', 'one_time', 'family_role']) {
    assertEquals(
      { kind, has: fieldPathsFor(kind).includes('responsibilityItems') },
      { kind, has: false },
    );
  }
});

Deno.test('通過的結果會帶著這次可用的 kind，而且每個 kind 都有落點', () => {
  const result = evaluateTaskAiRecommendationEligibility(ELIGIBLE);
  assert(result.eligible, '運動練習應該通過');
  if (!result.eligible) return;

  assert(result.allowedSuggestionKinds.length > 0, '至少要有一個可用的 kind');
  // 週期任務沒有里程碑，所以 split_milestone 不該出現在清單裡 ——
  // 出現了就代表模型會被鼓勵去提一個注定被丟掉的建議。
  assert(
    !result.allowedSuggestionKinds.includes('split_milestone'),
    '週期任務不該開放 split_milestone',
  );
  assert(result.allowedSuggestionKinds.includes('adjust_frequency'), '週期任務該能調頻率');
});
