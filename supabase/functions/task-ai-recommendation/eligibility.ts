// task-ai-recommendation — 使用範圍閘門
//
// ─────────────────────────────────────────────────────────────────────────
// B2A 的 red-team 量化了一件事：關鍵字安全層擋得住「清理瓦斯爐」，
// 擋不住「把煮東西的檯面擦乾淨，包含上面那圈金屬架」。5 種同義說法有 4 種通過。
//
// 對那個缺口，有兩種反應：
//
//   (a) 不斷往 hazard 清單加詞
//   (b) 把第一版的使用範圍縮到「就算漏掉也不會叫孩子去碰爐火」的地方
//
// (a) 是輸的一方 —— 自然語言的同義說法是無限的，而每加一個寬泛的詞
// （「廚房」「爐子」）就會擋掉一批正當任務，直到有人把整層關掉。
//
// 這個檔案原本是 (b)：**第一版只對 C／D 類任務開放。**
//
// A（生活常規）與 B（家庭參與）不是「比較危險的孩子」，
// 而是它們的建議天然落在**實體家務操作**上 —— 那正好是安全層最弱的地方。
// 閱讀計畫、運動練習、學校作業的建議則落在時間、範圍與文字表達上，
// 就算模型胡說，最壞的結果是一句不合適的文案，不是一個危險的動作。
//
// ⚠️ 2026-08-11：團隊決策把 allowedPurposeCategories 擴大到全部四類，
//    用於競賽 Demo。docs/TASK_AI_PRODUCTION_READINESS.md 記錄的三個放寬
//    前提（A/B 類語料 red-team、付費方案、真實家長使用資料）**均未成立**——
//    這是知情狀態下的決定，不是條件已經滿足。contentSafety.ts 的關鍵字/片語
//    掃描因此變成 A/B 類任務唯一的內容防線，而它自己承認不是完整的語意安全。
//    詳情與追記見 docs/TASK_AI_PRODUCTION_READINESS.md。
//
// ⚠️ 不符合資格**不是服務錯誤**。它是一個正常且預期的結果，
// 而且完全不影響家長建立任務。
// ─────────────────────────────────────────────────────────────────────────

import { CONTRACT, type ValidatedInput } from './contract.ts';
import { scanInputForHighRisk, type SafetyViolation } from './contentSafety.ts';

export type EligibilityDenialReason =
  | 'TASK_TYPE_NOT_ENABLED'
  | 'HIGH_RISK_CONTEXT'
  | 'UNSUPPORTED_CATEGORY'
  | 'INSUFFICIENT_CONTEXT';

export type TaskAiEligibilityResult =
  | {
      eligible: true;
      allowedSuggestionKinds: string[];
      allowedFieldPaths: string[];
    }
  | {
      eligible: false;
      reason: EligibilityDenialReason;
      /** 只進 log，不回給 client。 */
      detail?: string;
    };

const E = CONTRACT.eligibility;

/**
 * 這一份任務草稿可不可以送給 AI，以及可以被建議修改哪些欄位。
 *
 * 純函式，不碰網路也不碰時間。
 */
export function evaluateTaskAiRecommendationEligibility(
  input: ValidatedInput,
): TaskAiEligibilityResult {
  const { purposeCategory, editorKind } = input.taskContext;

  // 1. 分類。見檔頭 2026-08-11 追記：現已擴大到全部四類。
  if (!E.allowedPurposeCategories.includes(purposeCategory)) {
    return {
      eligible: false,
      reason: 'UNSUPPORTED_CATEGORY',
      detail: `purposeCategory=${purposeCategory} 尚未開放`,
    };
  }

  // 2. 任務形式。家庭角色明確排除 —— 它的內容就是一份家務清單，
  //    而「新增一項負責內容」正是我們最不希望 AI 做的事。
  if (E.deniedEditorKinds.includes(editorKind) || !E.allowedEditorKinds.includes(editorKind)) {
    return {
      eligible: false,
      reason: 'TASK_TYPE_NOT_ENABLED',
      detail: `editorKind=${editorKind} 尚未開放`,
    };
  }

  // 3. 內容風險。草稿本身已經寫著危險操作時就不送 ——
  //    我們不希望 AI 把一句模糊的危險描述**改寫得更可執行**。
  const risk = scanInputForHighRisk(input);
  if (risk) {
    return {
      eligible: false,
      reason: 'HIGH_RISK_CONTEXT',
      detail: `${risk.code}@${risk.where}`,
    };
  }

  // 4. 內容量。草稿太空的話，建議只會是模型在編。
  const min = E.minimumContext;
  if (input.currentDraft.title.trim().length < min.minTitleLength) {
    return { eligible: false, reason: 'INSUFFICIENT_CONTEXT', detail: 'title 太短' };
  }
  if (input.parentIntent.originalExpectation.trim().length < min.minOriginalExpectationLength) {
    return { eligible: false, reason: 'INSUFFICIENT_CONTEXT', detail: 'originalExpectation 太短' };
  }

  const allowedFieldPaths = fieldPathsFor(editorKind);
  return {
    eligible: true,
    allowedFieldPaths,
    allowedSuggestionKinds: kindsFor(allowedFieldPaths),
  };
}

/**
 * 這一種 editor 可以被建議修改哪些欄位。
 *
 * 「全域 allowlist 有這個欄位」不代表「這個任務適合被改這個欄位」：
 * `responsibilityItems` 是合法路徑，但它只存在於家庭角色，
 * 而家庭角色不 eligible —— 所以它永遠不會被開放。
 */
export function fieldPathsFor(editorKind: string): string[] {
  const extra = E.extraFieldPathsByEditorKind[editorKind] ?? [];
  const merged = [...E.baseFieldPaths, ...extra];

  return merged.filter((path) =>
    !E.neverAllowedFieldPaths.includes(path)
    // 全域 allowlist 仍然是上界。context allowlist 只能更窄，不能更寬。
    && Object.prototype.hasOwnProperty.call(CONTRACT.allowedFieldPaths, path)
  );
}

/**
 * 目標路徑全被關掉的 kind 就不開放。
 *
 * 例：`split_milestone` 只落在 `milestones` 上，
 * 而 `milestones` 只對成長計畫開放 —— 所以固定任務不會拿到這個 kind。
 */
function kindsFor(allowedFieldPaths: string[]): string[] {
  const allowed = new Set(allowedFieldPaths);
  return CONTRACT.allowedSuggestionKinds.filter((kind) => {
    const targets = CONTRACT.suggestionKindFieldPaths[kind] ?? [];
    return targets.some((path) => allowed.has(path));
  });
}

export type { SafetyViolation };
