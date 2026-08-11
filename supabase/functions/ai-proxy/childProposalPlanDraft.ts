// childProposalPlanDraft — 孩子的提案 → 一份可以拿去跟家長討論的計畫草稿。
//
// ─────────────────────────────────────────────────────────────────────────
// 這支只做**接線**：prompt → Gemini → 正規化 → 既有規則引擎 → 組裝。
// 所有判斷都在 childProposalPlanDraftLogic.ts（純函式、jest 測得到）。
//
// 重用的東西全部是既有的，一個都沒有另外做一套：
//   callGeminiWithModel   ./gemini.ts          （同一個 transport、同一條 model chain）
//   runEligibilityGate    ./rewardEligibility.ts（八步資格閘門）
//   calcCoins / POLICY_VERSION ./coinPolicy.ts  （版本化幣值規則）
//
// ⚠️ **模型不決定幣值。** 它連幣值欄位都拿不到 —— prompt 裡沒有，
//    輸出 schema 裡沒有，normalize 也不會讀。發不發、發多少一律走規則引擎。
//
// ⚠️ **失敗一律回 unavailable，不編一份假的草稿。** 這支的呼叫端會把結果
//    寫成 authored_by='ai' 的計畫版本；隨便編一份等於在資料庫裡留下
//    一筆「模型從來沒跑過、但看起來像 AI 寫的」紀錄。
//    這一點與 wishClarify 的 fallback 策略刻意不同：許願的 fallback 只是
//    讓孩子的流程走得下去，不會被當成 AI 產出保存。
// ─────────────────────────────────────────────────────────────────────────

import { callGeminiWithModel, parseJson } from './gemini.ts';
import {
  runEligibilityGate,
  type AgeGroup as GateAgeGroup,
} from './rewardEligibility.ts';
import { calcCoins, POLICY_VERSION } from './coinPolicy.ts';
import {
  buildPlanDraftPrompt,
  composePlanDraft,
  normalizePlanDraftUnderstanding,
  planDraftInputIsUsable,
  resolveDurationType,
  toEligibilityDurationType,
  CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION,
  type ChildProposalPlanDraftInput,
  type ChildProposalPlanDraftResponse,
  type PlanDraftPricing,
} from './childProposalPlanDraftLogic.ts';

function unavailable(
  reason: 'INVALID_AI_OUTPUT' | 'SERVICE_ERROR' | 'INVALID_INPUT',
): ChildProposalPlanDraftResponse {
  return {
    status: 'unavailable',
    schemaVersion: CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION,
    reason,
  };
}

export async function handleChildProposalPlanDraft(
  payload: ChildProposalPlanDraftInput,
): Promise<ChildProposalPlanDraftResponse> {
  if (!planDraftInputIsUsable(payload)) return unavailable('INVALID_INPUT');

  let raw: string;
  let model: string;
  try {
    ({ text: raw, model } = await callGeminiWithModel(buildPlanDraftPrompt(payload), true));
  } catch (err) {
    console.warn('[ai-proxy] handleChildProposalPlanDraft gemini error:', err);
    return unavailable('SERVICE_ERROR');
  }

  let understanding: ReturnType<typeof normalizePlanDraftUnderstanding>;
  try {
    understanding = normalizePlanDraftUnderstanding(parseJson<unknown>(raw));
  } catch (err) {
    console.warn('[ai-proxy] handleChildProposalPlanDraft parse error:', err);
    return unavailable('INVALID_AI_OUTPUT');
  }
  if (understanding === null) return unavailable('INVALID_AI_OUTPUT');

  // 節奏在這裡就先定案（孩子選的優先），因為執行形式會影響閘門的判斷。
  const cadence = payload.cadence ?? understanding.suggestedCadence ?? null;
  const durationType = resolveDurationType(cadence, understanding.durationDays);

  const gate = runEligibilityGate({
    category: understanding.category,
    ageGroup: payload.ageGroup as GateAgeGroup,
    // 這是孩子提出來的東西 —— 來源是事實，不交給模型判斷。
    taskSource: payload.proposalSource === 'co_created' ? 'negotiated' : 'child',
    durationType: toEligibilityDurationType(durationType),
    outcomeBased: understanding.outcomeBased,
    needsClarification: understanding.needsClarification,
    clarificationQuestion: understanding.clarificationQuestion,
  });

  const pricing = resolvePricing(gate, payload.ageGroup as GateAgeGroup, understanding);

  return {
    status: 'draft',
    schemaVersion: CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION,
    draft: composePlanDraft({ input: payload, understanding, gate, pricing, model }),
  };
}

/**
 * 幣值：只有 C/D 且閘門放行才進入 calcCoins。
 *
 * coin-policy.json 目前的 bandBaseCoins 全是 placeholder（null），
 * 所以 calcCoins 會誠實地回 unpriced —— 那不是壞掉，是「數字還沒定案」。
 * 這裡照實傳出去，不補一個看起來合理的數字。
 */
function resolvePricing(
  gate: ReturnType<typeof runEligibilityGate>,
  ageGroup: GateAgeGroup,
  understanding: NonNullable<ReturnType<typeof normalizePlanDraftUnderstanding>>,
): PlanDraftPricing {
  if (!gate.coinEnabled) return { status: 'coin_disabled', policyVersion: POLICY_VERSION };
  if (gate.gateBlocked) return { status: 'gated', policyVersion: POLICY_VERSION };

  const calc = calcCoins(
    ageGroup,
    understanding.category as 'C' | 'D',
    understanding.estimatedMinutes,
    understanding.difficulty,
  );

  if (calc.status === 'priced') {
    return { status: 'priced', coins: calc.coins, policyVersion: calc.policyVersion };
  }
  if (calc.status === 'coin_disabled') {
    return { status: 'coin_disabled', policyVersion: calc.policyVersion };
  }
  return { status: 'unpriced', policyVersion: calc.policyVersion };
}
