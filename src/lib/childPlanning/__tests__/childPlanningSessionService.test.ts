// P1-A2 — planning session 的持久化契約
//
// 這一支不碰資料庫：rpc 被注入成一支函式，所以 stale、重送、拒絕、
// 網路炸掉全部測得到。DB 那一側的規則由 migration 的斷言測試守。

import {
  CONFIRM_PLANNING_SESSION_RPC,
  ChildPlanningSessionService,
  RECORD_PLANNING_ROUND_RPC,
  START_PLANNING_SESSION_RPC,
  SUBMIT_WITHOUT_PLANNING_RPC,
  type PlanningSessionRpc,
} from '../childPlanningSessionService';
import type { ChildGoalPlanningResult } from '../types';

const READY: ChildGoalPlanningResult = {
  status: 'unavailable',
  schemaVersion: 1,
  reason: 'TIMEOUT',
};

type Call = { name: string; command: Record<string, unknown> };

/** 回固定 payload 的替身，並記下每一次呼叫。 */
function stub(payload: unknown): { rpc: PlanningSessionRpc; calls: Call[] } {
  const calls: Call[] = [];
  const rpc: PlanningSessionRpc = async (name, command) => {
    calls.push({ name, command: command as Record<string, unknown> });
    return { data: payload, error: null };
  };
  return { rpc, calls };
}

const OK = {
  ok: true,
  sessionId: 'session-1',
  status: 'in_progress',
  revision: 1,
  roundsUsed: 1,
  attemptsUsed: 1,
  idempotentReplay: false,
};

describe('開始一場對話', () => {
  it('帶 clientRequestId —— 連點兩下不該生出兩場', async () => {
    const { rpc, calls } = stub({ ...OK, revision: 0, roundsUsed: 0, attemptsUsed: 0 });
    await new ChildPlanningSessionService(rpc).start({
      proposalId: 'proposal-1',
      clientRequestId: 'attempt-1',
    });

    expect(calls[0].name).toBe(START_PLANNING_SESSION_RPC);
    expect(calls[0].command).toEqual({
      schemaVersion: 1,
      proposalId: 'proposal-1',
      clientRequestId: 'attempt-1',
    });
  });

  it('重送同一次嘗試回原本那筆，而且不是錯誤', async () => {
    const { rpc } = stub({ ...OK, idempotentReplay: true });
    const result = await new ChildPlanningSessionService(rpc).start({
      proposalId: 'proposal-1',
      clientRequestId: 'attempt-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.idempotentReplay).toBe(true);
  });
});

describe('記一輪', () => {
  it('送的是驗證過的結果與 expectedRevision，**不送次數**', async () => {
    const { rpc, calls } = stub(OK);
    await new ChildPlanningSessionService(rpc).recordRound({
      sessionId: 'session-1',
      expectedRevision: 0,
      childResponse: { type: 'custom_choice', answer: '我想早上讀' },
      result: READY,
    });

    expect(calls[0].name).toBe(RECORD_PLANNING_ROUND_RPC);
    // 次數由 RPC 自己加。送得進來的話，上限就只是一個建議。
    expect(calls[0].command).not.toHaveProperty('roundsUsed');
    expect(calls[0].command).not.toHaveProperty('attemptsUsed');
    expect(calls[0].command.expectedRevision).toBe(0);
    expect(calls[0].command.childResponse).toEqual({
      type: 'custom_choice',
      answer: '我想早上讀',
    });
  });

  it('沒有孩子回話時整個鍵都不帶', async () => {
    const { rpc, calls } = stub(OK);
    await new ChildPlanningSessionService(rpc).recordRound({
      sessionId: 'session-1',
      expectedRevision: 0,
      result: READY,
    });

    expect(calls[0].command).not.toHaveProperty('childResponse');
  });

  it('晚到的舊回應 → STALE_SESSION，而且帶回真正的 revision', async () => {
    const { rpc } = stub({
      ok: false,
      code: 'STALE_SESSION',
      reason: 'REVISION_MISMATCH',
      revision: 3,
      message: '這場對話已經往前走了',
    });

    const result = await new ChildPlanningSessionService(rpc).recordRound({
      sessionId: 'session-1',
      expectedRevision: 1,
      result: READY,
    });

    expect(result).toEqual({
      ok: false,
      code: 'STALE_SESSION',
      reason: 'REVISION_MISMATCH',
      revision: 3,
      message: '這場對話已經往前走了',
    });
  });
});

describe('孩子確認', () => {
  it('**不送計畫** —— RPC 自己從 latest_result 複製', async () => {
    const { rpc, calls } = stub({ ...OK, status: 'child_confirmed', revision: 2 });
    await new ChildPlanningSessionService(rpc).confirm({
      sessionId: 'session-1',
      expectedRevision: 1,
    });

    expect(calls[0].name).toBe(CONFIRM_PLANNING_SESSION_RPC);
    expect(calls[0].command).toEqual({
      schemaVersion: 1,
      sessionId: 'session-1',
      expectedRevision: 1,
    });
    // 送得進來的話，孩子確認的就不一定是他螢幕上那一份。
    expect(calls[0].command).not.toHaveProperty('plan');
    expect(calls[0].command).not.toHaveProperty('confirmedPlan');
  });
});

describe('壞掉的回覆一律當失敗', () => {
  it.each([
    ['不是物件', 'nope'],
    ['ok 但沒有 sessionId', { ok: true, status: 'ready', revision: 1 }],
    ['ok 但狀態不認得', { ok: true, sessionId: 's', status: 'unavailable', revision: 1 }],
    ['ok 但沒有 revision', { ok: true, sessionId: 's', status: 'ready' }],
  ])('%s', async (_label, payload) => {
    const { rpc } = stub(payload);
    const result = await new ChildPlanningSessionService(rpc).start({ proposalId: 'p' });

    // 靜靜放行的話，畫面會拿 undefined 當 id，然後在下一次寫入才炸掉。
    expect(result.ok).toBe(false);
  });

  it('網路層丟例外 → PERSISTENCE_FAILED，不往外拋', async () => {
    const rpc: PlanningSessionRpc = async () => {
      throw new Error('offline');
    };
    const result = await new ChildPlanningSessionService(rpc).start({ proposalId: 'p' });

    expect(result).toEqual({ ok: false, code: 'PERSISTENCE_FAILED', message: 'offline' });
  });

  it('PostgrestError → PERSISTENCE_FAILED', async () => {
    const rpc: PlanningSessionRpc = async () => ({
      data: null,
      error: { code: 'PGRST202', message: '找不到函式' },
    });
    const result = await new ChildPlanningSessionService(rpc).start({ proposalId: 'p' });

    expect(result).toEqual({ ok: false, code: 'PERSISTENCE_FAILED', message: '找不到函式' });
  });
});

// ---------------------------------------------------------------------------
// P1-A2 Correction — 不規劃直接送出
// ---------------------------------------------------------------------------

describe('不規劃、直接送給爸媽', () => {
  it('走的是 atomic RPC，一次呼叫做完放棄與送出', async () => {
    const { rpc, calls } = stub({
      ok: true,
      proposalId: 'proposal-1',
      fromStatus: 'draft',
      toStatus: 'proposed',
      sessionId: 'session-1',
      sessionStatus: 'abandoned',
      idempotentReplay: false,
    });

    const result = await new ChildPlanningSessionService(rpc).submitWithoutPlanning({
      proposalId: 'proposal-1',
    });

    // 一次。分兩次做的話，中間斷掉會留下「已放棄但沒送出」。
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe(SUBMIT_WITHOUT_PLANNING_RPC);
    expect(calls[0].command).toEqual({ schemaVersion: 1, proposalId: 'proposal-1' });
    expect(result).toEqual({
      ok: true,
      proposalId: 'proposal-1',
      sessionStatus: 'abandoned',
      idempotentReplay: false,
    });
  });

  it('本來就沒有 session 也送得出去', async () => {
    const { rpc } = stub({
      ok: true,
      proposalId: 'proposal-1',
      toStatus: 'proposed',
      sessionId: null,
      sessionStatus: null,
      idempotentReplay: false,
    });

    const result = await new ChildPlanningSessionService(rpc).submitWithoutPlanning({
      proposalId: 'proposal-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sessionStatus).toBeNull();
  });

  it('連點兩下 → 冪等，不是錯誤', async () => {
    const { rpc } = stub({
      ok: true,
      proposalId: 'proposal-1',
      toStatus: 'proposed',
      sessionStatus: 'abandoned',
      idempotentReplay: true,
    });

    const result = await new ChildPlanningSessionService(rpc).submitWithoutPlanning({
      proposalId: 'proposal-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.idempotentReplay).toBe(true);
  });

  it('孩子已經確認過計畫 → 拒絕，不得把它當成沒規劃送出', async () => {
    const { rpc } = stub({
      ok: false,
      code: 'POLICY_REJECTED',
      reason: 'PLANNING_ALREADY_CONFIRMED',
      message: '這份計畫孩子已經確認過了',
    });

    const result = await new ChildPlanningSessionService(rpc).submitWithoutPlanning({
      proposalId: 'proposal-1',
    });

    expect(result).toEqual({
      ok: false,
      code: 'POLICY_REJECTED',
      reason: 'PLANNING_ALREADY_CONFIRMED',
      message: '這份計畫孩子已經確認過了',
    });
  });

  it('RPC 說 ok 但狀態不是 proposed → 當失敗', async () => {
    // 靜靜通過會讓孩子看到一個假的成功畫面。
    const { rpc } = stub({ ok: true, proposalId: 'proposal-1', toStatus: 'draft' });

    const result = await new ChildPlanningSessionService(rpc).submitWithoutPlanning({
      proposalId: 'proposal-1',
    });

    expect(result.ok).toBe(false);
  });
});
