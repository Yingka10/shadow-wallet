// GrowBook — 一場 planning 對話的狀態機（P1-A2）
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支是**純函式**：不碰 DB、不碰畫面、不打模型。
//
// 它存在的理由是「孩子在這場對話裡走到哪裡」這件事有三個不同的執法點：
//
//   畫面   決定現在該顯示什麼
//   DB     決定哪些寫入合法
//   這裡   決定**規則**
//
// 規則寫在畫面裡的話，只有畫面守得住；寫在 RPC 裡的話，要有網路才測得到。
// 寫在這裡，三者共用同一份，而且 jest 一毫秒跑完。
//
// 三條產品規則在這裡變成程式：
//
//   1. **對話有盡頭。** 最多 3 次 planning round。第三輪還問不出來，
//      就把主導權交回孩子，不再問第四題。
//   2. **技術失敗不算孩子的錯。** unavailable 不消耗 round，也不會讓
//      整場 session 判死 —— 但它消耗 attempt，所以「再試一次」有盡頭。
//   3. **孩子確認過的計畫不可變。** 要重新規劃就開一場新的 session，
//      不是把舊的那份蓋掉。
// ─────────────────────────────────────────────────────────────────────────

import {
  CHILD_GOAL_PLANNING_MAX_ATTEMPTS,
  CHILD_GOAL_PLANNING_MAX_ROUNDS,
  CHILD_GOAL_PLANNING_SCHEMA_VERSION,
  type ChildGoalPlan,
  type ChildGoalPlanningResult,
  type ChildPlanningResponse,
} from './types';

/**
 * 一場 session 走到哪裡。
 *
 * 兩個進行中、兩個終點：
 *
 *   in_progress     還在對話（含剛剛逾時了一次）
 *   ready           手上有一份計畫，等孩子點頭
 *   child_confirmed 他說「就照這樣開始」
 *   abandoned       他沒有確認這份計畫，選擇停止規劃、直接送出原始提案
 *
 * `abandoned` 不是失敗，是一個孩子做的決定，所以要留下來。少了它，
 * 一個已經送到家長手上的提案會掛著一場「進行中的規劃」——
 * 那場對話還佔著位子、還收得了新的一輪。
 *
 * `unavailable` **不是**其中一個 —— 它是一次 attempt 的結果，不是這場
 * 對話的狀態。一次逾時就把 session 判死，孩子會被迫從第一題重來。
 */
export type ChildPlanningSessionStatus =
  | 'in_progress'
  | 'ready'
  | 'child_confirmed'
  | 'abandoned';

/** 走到這兩個就結束了，兩個都是單向的。 */
export function isTerminalPlanningStatus(status: ChildPlanningSessionStatus): boolean {
  return status === 'child_confirmed' || status === 'abandoned';
}

export type ChildPlanningSessionState = {
  schemaVersion: typeof CHILD_GOAL_PLANNING_SCHEMA_VERSION;
  status: ChildPlanningSessionStatus;
  /** 產出過對話結果的輪數。逾時不算。 */
  roundsUsed: number;
  /** 打過模型的次數，含失敗。 */
  attemptsUsed: number;
  /** 孩子回過的話，依時間排序。只 append。 */
  responses: ChildPlanningResponse[];
  /** 最後一次的結果，含 unavailable。畫面靠它決定要顯示什麼。 */
  latestResult: ChildGoalPlanningResult | null;
  /** 孩子確認過的那一份。一旦有值就**不可變**。 */
  confirmedPlan: ChildGoalPlan | null;
};

export type ChildPlanningSessionRefusal =
  /** 已經問滿三輪了。 */
  | 'ROUND_LIMIT_REACHED'
  /** 連失敗帶成功已經打滿五次。 */
  | 'ATTEMPT_LIMIT_REACHED'
  /** 孩子已經確認過了 —— 這場 session 結束了。 */
  | 'SESSION_CONFIRMED'
  /** 孩子選擇不規劃、直接送出 —— 這場 session 也結束了。 */
  | 'SESSION_ABANDONED'
  /** 現在手上沒有一份可以確認的計畫。 */
  | 'NO_READY_PLAN';

export type ChildPlanningSessionOutcome =
  | { ok: true; state: ChildPlanningSessionState }
  | { ok: false; reason: ChildPlanningSessionRefusal };

export function createChildPlanningSession(): ChildPlanningSessionState {
  return {
    schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION,
    status: 'in_progress',
    roundsUsed: 0,
    attemptsUsed: 0,
    responses: [],
    latestResult: null,
    confirmedPlan: null,
  };
}

/**
 * 還可以再打一次模型嗎。
 *
 * 三個條件缺一不可，而且**每一個都是為了不同的人**：
 * round 上限是為了孩子（不要被盤問）、attempt 上限是為了成本
 * （服務掛著時不要無限重試）、confirmed 是為了資料
 * （確認過的東西不可以再被一次新的 AI 回應動到）。
 */
export function canRequestPlanningRound(state: ChildPlanningSessionState): boolean {
  if (isTerminalPlanningStatus(state.status)) return false;
  if (state.roundsUsed >= CHILD_GOAL_PLANNING_MAX_ROUNDS) return false;
  return state.attemptsUsed < CHILD_GOAL_PLANNING_MAX_ATTEMPTS;
}

/**
 * 記下一次模型呼叫的結果。
 *
 * ⚠️ unavailable **不增加 roundsUsed**。一次逾時不是孩子講得不清楚，
 *    不該吃掉他「還可以被問幾次」的額度 —— 否則網路差的那天，
 *    孩子會在什麼都還沒被問到的情況下就被告知「不能再問了」。
 *    它增加的是 attemptsUsed，那才是「再試一次」的盡頭。
 */
export function recordPlanningResult(
  state: ChildPlanningSessionState,
  result: ChildGoalPlanningResult,
): ChildPlanningSessionOutcome {
  if (state.status === 'abandoned') return { ok: false, reason: 'SESSION_ABANDONED' };
  if (state.status === 'child_confirmed') return { ok: false, reason: 'SESSION_CONFIRMED' };
  if (state.roundsUsed >= CHILD_GOAL_PLANNING_MAX_ROUNDS) {
    return { ok: false, reason: 'ROUND_LIMIT_REACHED' };
  }
  if (state.attemptsUsed >= CHILD_GOAL_PLANNING_MAX_ATTEMPTS) {
    return { ok: false, reason: 'ATTEMPT_LIMIT_REACHED' };
  }

  const failed = result.status === 'unavailable';

  return {
    ok: true,
    state: {
      ...state,
      status: result.status === 'ready' ? 'ready' : 'in_progress',
      roundsUsed: failed ? state.roundsUsed : state.roundsUsed + 1,
      attemptsUsed: state.attemptsUsed + 1,
      latestResult: result,
    },
  };
}

/**
 * 孩子回了一句話。
 *
 * 回答之後一定回到 in_progress：他剛剛給了新的資訊，上一輪那份 ready
 * 計畫已經不是根據完整資訊做的了。**但 confirmedPlan 不會被清掉** ——
 * 那是另一件事，見 confirmChildPlan。
 */
export function recordChildResponse(
  state: ChildPlanningSessionState,
  response: ChildPlanningResponse,
): ChildPlanningSessionOutcome {
  if (state.status === 'abandoned') return { ok: false, reason: 'SESSION_ABANDONED' };
  if (state.status === 'child_confirmed') return { ok: false, reason: 'SESSION_CONFIRMED' };

  return {
    ok: true,
    state: {
      ...state,
      status: 'in_progress',
      responses: [...state.responses, response],
    },
  };
}

/**
 * 孩子說「就照這樣開始」。
 *
 * 這是這場 session 的終點，而且是**單向**的：確認之後 confirmedPlan
 * 不可變，也不能再打模型。孩子想改就開一場新的 session ——
 * 靜靜蓋掉舊的那份，等於他上次確認過的東西從來沒存在過。
 */
export function confirmChildPlan(state: ChildPlanningSessionState): ChildPlanningSessionOutcome {
  if (state.status === 'abandoned') return { ok: false, reason: 'SESSION_ABANDONED' };
  if (state.status === 'child_confirmed') return { ok: false, reason: 'SESSION_CONFIRMED' };
  if (state.latestResult?.status !== 'ready' || state.status !== 'ready') {
    return { ok: false, reason: 'NO_READY_PLAN' };
  }

  return {
    ok: true,
    state: {
      ...state,
      status: 'child_confirmed',
      confirmedPlan: state.latestResult.plan,
    },
  };
}

/**
 * 孩子選擇不規劃、直接把想法送給爸媽。
 *
 * ⚠️ 這是 **local 的鏡射**，不是真正的執法點。真正做這件事的是
 *    `submit_child_proposal_without_planning_v1` —— 放棄規劃與送出提案
 *    必須在同一個交易裡，中間斷掉會留下「已放棄但沒送出」或
 *    「已送出但規劃還開著」。
 *
 * 已經確認過的不能走這條：那份計畫是孩子同意過的，把它當成沒規劃送出
 * 等於讓它從來沒發生過。
 */
export function abandonChildPlanningSession(
  state: ChildPlanningSessionState,
): ChildPlanningSessionOutcome {
  if (state.status === 'abandoned') return { ok: false, reason: 'SESSION_ABANDONED' };
  if (state.status === 'child_confirmed') return { ok: false, reason: 'SESSION_CONFIRMED' };

  return { ok: true, state: { ...state, status: 'abandoned' } };
}

/**
 * 這一刻孩子有哪些路可以走。
 *
 * ⚠️ 後兩個的型別是字面量 `true`，與 allowCustomAnswer 同一個理由：
 *
 *    **AI 掛掉不可以連帶讓孩子的想法送不出去。** 一個把「自己寫」或
 *    「送給爸媽」藏起來的畫面，在這個型別下寫不出來 —— 不是靠 review 抓。
 */
export type ChildPlanningSessionExits = {
  /** 還可以再問一輪／再試一次。 */
  canRequestRound: boolean;
  /** 三輪問完了，不要再問第四題。 */
  roundsExhausted: boolean;
  /** 「我自己寫怎麼開始」。 */
  canWriteOwnStart: true;
  /** 「先把想法送給爸媽」——走既有的 legacy 送出，與 AI 無關。 */
  canSendToParents: true;
};

export function childPlanningSessionExits(
  state: ChildPlanningSessionState,
): ChildPlanningSessionExits {
  return {
    canRequestRound: canRequestPlanningRound(state),
    roundsExhausted: state.roundsUsed >= CHILD_GOAL_PLANNING_MAX_ROUNDS,
    canWriteOwnStart: true,
    canSendToParents: true,
  };
}
