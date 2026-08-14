// P1-A3 §4 / §14 / §15 — bridge RPC 包裝層
//
// 這一層守兩件事：
//
//   1. **命令裡不會有計畫。** 送得進去的話，家長看到的就不一定是
//      孩子點頭的那一份。
//   2. **「回了成功但其實不對」一律當失敗。** 尤其 authoredBy —— 那是
//      整包最容易被為了「讓 Direct Confirm 能用」而偷改的一欄。

import {
  ChildFormalPlanService,
  PUBLISH_CHILD_CONFIRMED_PLAN_RPC,
  type FormalPlanRpc,
} from '../formalPlan/formalPlanService';
import type { ChildPlanEnrichment } from '../formalPlan/types';

const ENRICHMENT: ChildPlanEnrichment = {
  purposeCategory: 'D',
  completionDescription: '完成一次約定的閱讀時段',
  estimatedMinutes: 15,
  durationType: 'long_term',
  durationDays: 14,
  reward: { policy: 'coin_eligible', eligibility: 'allowed', policyVersion: 'v1' },
  taskPolicyVersion: 't1',
  aiSnapshot: { snapshotVersion: 1 },
  aiModel: 'test-model',
};

function serviceWith(payload: unknown, error: { message?: string } | null = null) {
  const calls: { name: string; command: Record<string, unknown> }[] = [];
  const rpc: FormalPlanRpc = async (name, command) => {
    calls.push({ name, command: command as Record<string, unknown> });
    return { data: payload, error };
  };
  return { service: new ChildFormalPlanService(rpc), calls };
}

const OK = {
  ok: true,
  proposalId: 'p1',
  sessionId: 's1',
  planVersionId: 'v1',
  versionNo: 1,
  authoredBy: 'child',
  proposalStatus: 'proposed',
  requiresParentDecision: ['cadence', 'duration'],
  enrichmentStatus: 'enriched',
  idempotentReplay: false,
};

describe('命令的形狀', () => {
  it('只送 proposalId / sessionId / enrichment', async () => {
    const { service, calls } = serviceWith(OK);
    await service.publish({ proposalId: 'p1', sessionId: 's1', enrichment: ENRICHMENT });

    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe(PUBLISH_CHILD_CONFIRMED_PLAN_RPC);
    expect(Object.keys(calls[0].command).sort()).toEqual([
      'enrichment',
      'proposalId',
      'schemaVersion',
      'sessionId',
    ]);
  });

  it('沒有任何一份計畫的文字', async () => {
    const { service, calls } = serviceWith(OK);
    await service.publish({ proposalId: 'p1', sessionId: 's1', enrichment: ENRICHMENT });

    const serialized = JSON.stringify(calls[0].command);
    for (const forbidden of [
      'confirmedPlan',
      'childConfirmedPlan',
      'planTitle',
      'planSummary',
      'nextStep',
      'desiredOutcome',
      'actionPlanSummary',
      'progressionKind',
      'provenance',
    ]) {
      expect({ forbidden, present: serialized.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });

  it('enrichment 缺席時整個鍵不出現', async () => {
    const { service, calls } = serviceWith(OK);
    await service.publish({ proposalId: 'p1', sessionId: 's1' });
    expect('enrichment' in calls[0].command).toBe(false);
  });
});

describe('成功', () => {
  it('回傳版本、待決條件與 enrichment 狀態', async () => {
    const { service } = serviceWith(OK);
    const result = await service.publish({ proposalId: 'p1', sessionId: 's1' });

    expect(result).toEqual({
      ok: true,
      proposalId: 'p1',
      sessionId: 's1',
      planVersionId: 'v1',
      versionNo: 1,
      authoredBy: 'child',
      proposalStatus: 'proposed',
      requiresParentDecision: ['cadence', 'duration'],
      enrichmentStatus: 'enriched',
      idempotentReplay: false,
    });
  });

  it('重送回同一版，而且不是錯誤', async () => {
    const { service } = serviceWith({ ...OK, idempotentReplay: true });
    const result = await service.publish({ proposalId: 'p1', sessionId: 's1' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.idempotentReplay).toBe(true);
  });

  it('不認得的 requiresParentDecision 值會被丟掉，不會傳到畫面上', async () => {
    const { service } = serviceWith({
      ...OK,
      requiresParentDecision: ['cadence', 'something_new', 42],
    });
    const result = await service.publish({ proposalId: 'p1', sessionId: 's1' });
    expect(result.ok && result.requiresParentDecision).toEqual(['cadence']);
  });

  it('enrichment 不可用時如實回報，不假裝成功', async () => {
    const { service } = serviceWith({
      ...OK,
      enrichmentStatus: 'unavailable',
      requiresParentDecision: ['cadence', 'duration', 'reward', 'purpose_category'],
    });
    const result = await service.publish({ proposalId: 'p1', sessionId: 's1' });
    expect(result.ok && result.enrichmentStatus).toBe('unavailable');
  });
});

describe('「回了成功但其實不對」一律當失敗', () => {
  it('authoredBy 不是 child', async () => {
    // 為了讓目前的 Direct Confirm 能用而偽裝成 ai —— 這件事必須在這裡
    // 就爆出來，不是等半年後有人查資料才發現。
    const { service } = serviceWith({ ...OK, authoredBy: 'ai' });
    const result = await service.publish({ proposalId: 'p1', sessionId: 's1' });
    expect(result).toEqual({
      ok: false,
      code: 'UNKNOWN',
      message: '正式計畫的作者不是孩子',
    });
  });

  it('提案狀態沒有變成 proposed', async () => {
    const { service } = serviceWith({ ...OK, proposalStatus: 'draft' });
    const result = await service.publish({ proposalId: 'p1', sessionId: 's1' });
    expect(result.ok).toBe(false);
  });

  it('沒有版本 id', async () => {
    const { service } = serviceWith({ ...OK, planVersionId: null });
    const result = await service.publish({ proposalId: 'p1', sessionId: 's1' });
    expect(result.ok).toBe(false);
  });
});

describe('失敗', () => {
  it('保留 RPC 的機器可讀理由', async () => {
    const { service } = serviceWith({
      ok: false,
      code: 'POLICY_REJECTED',
      reason: 'PLANNING_NOT_CONFIRMED',
      message: '還沒有孩子確認過的計畫',
    });
    const result = await service.publish({ proposalId: 'p1', sessionId: 's1' });
    expect(result).toEqual({
      ok: false,
      code: 'POLICY_REJECTED',
      reason: 'PLANNING_NOT_CONFIRMED',
      message: '還沒有孩子確認過的計畫',
    });
  });

  it('傳輸層錯誤是 PERSISTENCE_FAILED', async () => {
    const { service } = serviceWith(null, { message: 'network down' });
    const result = await service.publish({ proposalId: 'p1', sessionId: 's1' });
    expect(result).toEqual({
      ok: false,
      code: 'PERSISTENCE_FAILED',
      message: 'network down',
    });
  });

  it('rpc 丟例外也回結構化失敗，不往上炸', async () => {
    const rpc: FormalPlanRpc = async () => {
      throw new Error('boom');
    };
    const result = await new ChildFormalPlanService(rpc).publish({
      proposalId: 'p1',
      sessionId: 's1',
    });
    expect(result).toEqual({ ok: false, code: 'PERSISTENCE_FAILED', message: 'boom' });
  });
});
