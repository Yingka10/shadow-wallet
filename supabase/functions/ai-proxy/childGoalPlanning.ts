// childGoalPlanning — 孩子的長期目標 → 一份接下來真的做得到的計畫（P1-A1）。
//
// ─────────────────────────────────────────────────────────────────────────
// 這支只做**接線**：prompt → Gemini → 正規化 → deterministic 組裝。
// 所有判斷都在 childGoalPlanningLogic.ts（純函式、jest 測得到）。
//
// 重用的東西全部是既有的，一個都沒有另外做一套：
//   callGeminiWithModel   ./gemini.ts   （同一個 transport、同一條 model chain、
//                                        同一個 FORCE_AI_FALLBACK 開關）
//
// ⚠️ **這一支不碰幣值。** 它連 rewardEligibility / coinPolicy 都不 import ——
//    「怎麼向前走」與「值多少幣」是兩件事，P1-A1 只回答前者。
//    需要幣值的路徑仍然是既有的 childProposalPlanDraft，那一支一個字都沒改。
//
// ⚠️ **失敗一律回 unavailable，不編一份假的計畫。** 與 P0-3 同一條規則。
//
// ⚠️ 目前**還沒有任何 production UI 呼叫這個 type**。它存在的目的是讓
//    契約可以被真的測試，而不是讓提案流程立刻改變行為。
// ─────────────────────────────────────────────────────────────────────────

import { callGeminiWithModel, parseJson } from './gemini.ts';
import {
  buildChildGoalPlanningPrompt,
  childGoalPlanningInputIsUsable,
  composeChildGoalPlanningResponse,
  normalizeChildGoalPlanning,
  CHILD_GOAL_PLANNING_GEMINI_TIMEOUT_MS,
  CHILD_GOAL_PLANNING_SCHEMA_VERSION,
  type ChildGoalPlanningInput,
  type ChildGoalPlanningResponse,
} from './childGoalPlanningLogic.ts';

function unavailable(
  reason: 'INVALID_AI_OUTPUT' | 'SERVICE_ERROR' | 'INVALID_INPUT',
): ChildGoalPlanningResponse {
  return {
    status: 'unavailable',
    schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION,
    reason,
  };
}

export async function handleChildGoalPlanning(
  payload: ChildGoalPlanningInput,
): Promise<ChildGoalPlanningResponse> {
  if (!childGoalPlanningInputIsUsable(payload)) return unavailable('INVALID_INPUT');

  let raw: string;
  let model: string;
  try {
    ({ text: raw, model } = await callGeminiWithModel(
      buildChildGoalPlanningPrompt(payload),
      true,
      // 這一支要一整包結構化 JSON，8 秒的預設不夠（見常數本身的說明）。
      CHILD_GOAL_PLANNING_GEMINI_TIMEOUT_MS,
    ));
  } catch (err) {
    console.warn('[ai-proxy] handleChildGoalPlanning gemini error:', err);
    return unavailable('SERVICE_ERROR');
  }

  let understanding: ReturnType<typeof normalizeChildGoalPlanning>;
  try {
    understanding = normalizeChildGoalPlanning(parseJson<unknown>(raw));
  } catch (err) {
    console.warn('[ai-proxy] handleChildGoalPlanning parse error:', err);
    return unavailable('INVALID_AI_OUTPUT');
  }
  if (understanding === null) return unavailable('INVALID_AI_OUTPUT');

  return composeChildGoalPlanningResponse({ input: payload, understanding, model });
}
