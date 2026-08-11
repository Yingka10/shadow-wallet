// Shadow Wallet — 孩子提案草稿 → P0-1 命令的映射（P0-2）
//
// 全部是純函式。畫面只收集選擇，「這樣填對不對」與「送出去長什麼樣」
// 都在這裡，而且不需要渲染任何東西就測得出來。

// 直接指向 lib/childProposal/types，不走 barrel：barrel 會連帶載入
// childProposalService → supabase client。這一層是純映射，不該為了
// 被 import 就把一個需要環境變數的單例拉進來（測試也不必假造它）。
import {
  CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
  type CreateChildProposalCommand,
  type TransitionChildProposalCommand,
} from '../../../lib/childProposal/types';
import type {
  CadenceChoice,
  ChildProposalDraft,
  ProposalStep,
  SeenAsChoice,
} from './types';

/** 每週次數的上下限。與 DB 的 child_proposals_weekly_frequency_range 一致。 */
export const MIN_TIMES_PER_WEEK = 1;
export const MAX_TIMES_PER_WEEK = 7;

/** 0 = 週日 … 6 = 週六。與 tasks.recurrence_days 同一組編碼。 */
export const MIN_DAY = 0;
export const MAX_DAY = 6;

export function createEmptyDraft(): ChildProposalDraft {
  return {
    goal: '',
    motivation: '',
    // 預設「還不知道」而不是「一週幾次」：預設一個具體節奏等於替孩子做決定，
    // 而且會讓「我還沒想好」變成需要額外動作才選得到的答案。
    cadence: { kind: 'not_sure' },
    seenAs: 'not_specified',
  };
}

// ---------------------------------------------------------------------------
// 驗證
// ---------------------------------------------------------------------------

/**
 * 目標必填。
 *
 * 用 trim 後判斷「有沒有寫東西」，但**送出時送的是原文**（見 toCreateCommand）——
 * 判斷空白與改寫內容是兩件事。
 */
export function goalError(draft: ChildProposalDraft): string | null {
  return draft.goal.trim().length === 0 ? 'GOAL_REQUIRED' : null;
}

/** 動機永遠沒有錯誤 —— 它是選填的。這支函式存在是為了讓規則寫得出來。 */
export function motivationError(_draft: ChildProposalDraft): string | null {
  return null;
}

export function cadenceError(draft: ChildProposalDraft): string | null {
  const c = draft.cadence;

  if (c.kind === 'weekly_times') {
    if (!Number.isInteger(c.timesPerWeek)) return 'TIMES_NOT_INTEGER';
    if (c.timesPerWeek < MIN_TIMES_PER_WEEK || c.timesPerWeek > MAX_TIMES_PER_WEEK) {
      return 'TIMES_OUT_OF_RANGE';
    }
    return null;
  }

  if (c.kind === 'certain_days') {
    if (c.days.length === 0) return 'DAYS_REQUIRED';
    if (c.days.some((d) => !Number.isInteger(d) || d < MIN_DAY || d > MAX_DAY)) {
      return 'DAY_OUT_OF_RANGE';
    }
    if (new Set(c.days).size !== c.days.length) return 'DAYS_DUPLICATED';
    return null;
  }

  // just_once / not_sure 沒有額外資料，永遠合法。
  return null;
}

/** 送得出去嗎。畫面用這個決定「送出」按鈕的狀態。 */
export function canSubmit(draft: ChildProposalDraft): boolean {
  return goalError(draft) === null && cadenceError(draft) === null;
}

/** 這一步可以往下走嗎。goal 之外的步驟都可以略過。 */
export function canLeaveStep(step: ProposalStep, draft: ChildProposalDraft): boolean {
  if (step === 'goal') return goalError(draft) === null;
  if (step === 'cadence') return cadenceError(draft) === null;
  return true;
}

// ---------------------------------------------------------------------------
// 更新（不可變，畫面用 setState(update…)）
// ---------------------------------------------------------------------------

export function withGoal(draft: ChildProposalDraft, goal: string): ChildProposalDraft {
  return { ...draft, goal };
}

export function withMotivation(
  draft: ChildProposalDraft,
  motivation: string,
): ChildProposalDraft {
  return { ...draft, motivation };
}

export function withCadence(
  draft: ChildProposalDraft,
  cadence: CadenceChoice,
): ChildProposalDraft {
  return { ...draft, cadence };
}

export function withSeenAs(draft: ChildProposalDraft, seenAs: SeenAsChoice): ChildProposalDraft {
  return { ...draft, seenAs };
}

/** 切換某一天。選「固定哪幾天」時用。 */
export function toggleDay(draft: ChildProposalDraft, day: number): ChildProposalDraft {
  const current = draft.cadence.kind === 'certain_days' ? draft.cadence.days : [];
  const next = current.includes(day)
    ? current.filter((d) => d !== day)
    : [...current, day].sort((a, b) => a - b);
  return withCadence(draft, { kind: 'certain_days', days: next });
}

// ---------------------------------------------------------------------------
// 映射到 P0-1 契約
// ---------------------------------------------------------------------------

/**
 * 孩子的節奏選擇 → 命令的 cadence 區塊。
 *
 * `not_sure` 回 undefined —— 命令裡整個不帶 cadence，DB 的欄位維持 NULL。
 * 塞一個假的預設值（例如 one_time）會讓「孩子還沒想好」變成
 * 「孩子說只做一次」，而家長端會照著那個假答案顯示。
 *
 * 形狀也對齊 DB 的 child_proposals_cadence_shape：weeklyFrequency 只在
 * weekly_frequency 模式出現、days 只在 fixed_days 模式出現。
 */
export function toCadenceInput(
  cadence: CadenceChoice,
): CreateChildProposalCommand['cadence'] {
  switch (cadence.kind) {
    case 'weekly_times':
      return { mode: 'weekly_frequency', weeklyFrequency: cadence.timesPerWeek };
    case 'certain_days':
      return { mode: 'fixed_days', days: [...cadence.days].sort((a, b) => a - b) };
    case 'just_once':
      return { mode: 'one_time' };
    case 'not_sure':
      return undefined;
  }
}

/**
 * 建立提案的命令。
 *
 * ⚠️ `childOriginalGoal` 送的是**原文**，不 trim、不正規化、不截斷。
 *    那一欄是整個產品最不能被加工的東西（DB 還有 trigger 擋任何 UPDATE）。
 *    空白判斷在 goalError，那是「能不能送」，不是「送什麼」。
 *
 * ⚠️ 建立時一律是 draft。送出是第二步（transition），理由見 submitChildProposal。
 */
export function toCreateCommand(
  draft: ChildProposalDraft,
  childId: string,
): CreateChildProposalCommand {
  const motivation = draft.motivation.trim();

  return {
    schemaVersion: CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
    childId,
    childOriginalGoal: draft.goal,
    // 沒填就整個不帶這個鍵 —— 空字串會被存成一段「他說了但什麼都沒說」的內容。
    ...(motivation.length > 0 ? { childOriginalMotivation: motivation } : {}),
    ...(toCadenceInput(draft.cadence) ? { cadence: toCadenceInput(draft.cadence) } : {}),
    childRewardPreference: draft.seenAs,
    status: 'draft',
  };
}

/**
 * 送出（draft → proposed）的命令。
 *
 * actorRole 是 'child'：這一步在產品上就是孩子按下「送出」。
 * ⚠️ 它是 audit / UI role，不是身分證明 —— 見 lib/childProposal/types.ts 的說明。
 */
export function toProposeCommand(proposalId: string): TransitionChildProposalCommand {
  return {
    schemaVersion: CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
    proposalId,
    toStatus: 'proposed',
    actorRole: 'child',
  };
}
