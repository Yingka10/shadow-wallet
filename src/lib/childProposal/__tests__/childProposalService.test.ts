// P0-1 — 孩子提案 service adapter
//
// adapter 只做傳話與翻譯。這一支測的就是翻譯：命令有沒有原樣送出、
// 什麼情況該回哪一個 code、以及兩件不能妥協的事：
//
//   · 看不懂的回應絕對不能當成成功
//   · walletEffect 不是 'none' 一律當失敗（P0 試行不入帳）

// eslint-disable-next-line prefer-const -- let allows reassignment in beforeEach
let mockRpc = jest.fn();

jest.mock('../../supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

beforeEach(() => {
  mockRpc = jest.fn();
});

import {
  ADD_CHILD_PROPOSAL_PLAN_VERSION_RPC,
  CREATE_CHILD_PROPOSAL_RPC,
  RECORD_CHILD_PROPOSAL_TRIAL_RPC,
  CONFIRM_CHILD_PROPOSAL_RPC,
  REVISE_CHILD_PROPOSAL_PLAN_RPC,
  ACCEPT_CHILD_PROPOSAL_PLAN_RPC,
  REQUEST_CHILD_PROPOSAL_CHANGES_RPC,
  CLOSE_CHILD_PROPOSAL_UNSUITABLE_RPC,
  SupabaseChildProposalService,
  TRANSITION_CHILD_PROPOSAL_RPC,
} from '../childProposalService';
import type {
  AddChildProposalPlanVersionCommand,
  CreateChildProposalCommand,
  RecordChildProposalTrialCommand,
  TransitionChildProposalCommand,
  ParentProposalCardData,
  ChildProposalReviewData,
  ParentProposalMaterialEdits,
} from '../types';

function service() {
  return new SupabaseChildProposalService();
}

const CREATE_COMMAND: CreateChildProposalCommand = {
  schemaVersion: 1,
  childId: 'child-1',
  childOriginalGoal: '我想每天練直排輪',
  childOriginalMotivation: '因為想跟阿翔一起去公園',
};

const TRIAL_COMMAND: RecordChildProposalTrialCommand = {
  schemaVersion: 1,
  proposalId: 'proposal-1',
  occurredOn: '2026-08-10',
  outcome: 'completed',
};

// ---------------------------------------------------------------------------
// 呼叫方式
// ---------------------------------------------------------------------------

describe('呼叫 RPC', () => {
  it('命令整包當成 p_command 傳出去，一個欄位都不改寫', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, proposalId: 'p-1', status: 'draft' },
      error: null,
    });

    await service().create(CREATE_COMMAND);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(CREATE_CHILD_PROPOSAL_RPC, {
      p_command: CREATE_COMMAND,
    });
  });

  it('每個動作都只打一支 RPC —— adapter 不自己組多次寫入', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, planVersionId: 'v-1', versionNo: 1, isCurrent: true },
      error: null,
    });

    await service().addPlanVersion({
      schemaVersion: 1,
      proposalId: 'p-1',
      authoredBy: 'ai',
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc.mock.calls[0][0]).toBe(ADD_CHILD_PROPOSAL_PLAN_VERSION_RPC);
  });

  it('Direct Confirm 只打一支 orchestration RPC', async () => {
    const card = {
      proposal: {
        id: '11111111-1111-4111-8111-111111111111', family_id: 'family-1',
        child_id: 'child-1', status: 'proposed', child_original_goal: '讀完一本書',
        proposal_source: 'child',
        current_plan_version_id: '44444444-4444-4444-8444-444444444444',
      },
      currentPlanVersion: {
        id: '44444444-4444-4444-8444-444444444444',
        proposal_id: '11111111-1111-4111-8111-111111111111', authored_by: 'ai',
        plan_title: '兩週閱讀挑戰', purpose_category: 'D',
        completion_description: '完成一次閱讀時段', progress_model: 'weekly_rhythm',
        next_step: '先讀 15 分鐘', cadence_mode: 'weekly_frequency',
        cadence_weekly_frequency: 4, cadence_days: null, preferred_time: null,
        preferred_time_custom: null, estimated_minutes: 15, duration_type: 'long_term',
        duration_days: 14, reward_policy: 'coin_eligible', reward_eligibility: 'allowed',
        reward_policy_version: 'coin-policy-1.0.0', task_policy_version: 'task-taxonomy-2026-07',
        ai_suggested_coin_amount: 10,
      },
    } as ParentProposalCardData;
    mockRpc.mockResolvedValue({
      data: {
        ok: true, proposalId: card.proposal.id, planVersionId: 'parent-v', taskId: 'task-1',
        relatedIds: ['child-task-1', 'goal-1'], idempotentReplay: false,
        confirmedReward: {
          rewardPolicy: 'coin_eligible', coinAmount: 10, payoutBasis: 'per_session',
          claimPeriod: 'week', maxClaimsPerPeriod: 4,
          rewardPolicyVersion: 'coin-policy-1.0.0', taskPolicyVersion: 'task-taxonomy-2026-07',
          sourceTaskId: 'task-1',
        },
      },
      error: null,
    });

    await expect(service().confirmDirect(card, '6-9')).resolves.toMatchObject({
      ok: true, taskId: 'task-1', planVersionId: 'parent-v', idempotentReplay: false,
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(CONFIRM_CHILD_PROPOSAL_RPC, {
      p_command: expect.objectContaining({
        proposalId: card.proposal.id,
        expectedPlanVersionId: card.currentPlanVersion!.id,
        rewardDecision: expect.objectContaining({
          rewardPolicy: 'coin_eligible', coin: expect.objectContaining({ finalAmount: 10 }),
        }),
      }),
    });
  });
});

describe('P0-5B review orchestration calls', () => {
  const reviewProposal = {
    id: '11111111-1111-4111-8111-111111111111', family_id: 'family-1',
    child_id: 'child-1', status: 'needs_child_review', child_original_goal: '讀完一本書',
    proposal_source: 'child', current_plan_version_id: '55555555-5555-4555-8555-555555555555',
    task_id: null,
  } as ChildProposalReviewData['proposal'];
  const source = {
    id: '44444444-4444-4444-8444-444444444444', proposal_id: reviewProposal.id,
    authored_by: 'ai',
  } as ChildProposalReviewData['sourcePlanVersion'];
  const current = {
    ...source,
    id: reviewProposal.current_plan_version_id!, authored_by: 'parent',
    plan_title: '兩週閱讀挑戰', purpose_category: 'D',
    completion_description: '完成一次閱讀時段', progress_model: 'weekly_rhythm',
    next_step: '先讀 15 分鐘', cadence_mode: 'weekly_frequency',
    cadence_weekly_frequency: 3, cadence_days: null, preferred_time: 'after_dinner',
    preferred_time_custom: null, estimated_minutes: 15, duration_type: 'long_term',
    duration_days: 14, reward_policy: 'coin_eligible', reward_eligibility: 'allowed',
    reward_policy_version: 'coin-policy-1.0.0', task_policy_version: 'task-taxonomy-2026-07',
    ai_suggested_coin_amount: 10, adopted_from_plan_version_id: source.id,
    requires_child_review: true, parent_confirmed_at: '2026-08-11T01:00:00Z',
    effective_at: null, child_accepted_at: null,
  } as ChildProposalReviewData['currentPlanVersion'];
  const review: ChildProposalReviewData = {
    proposal: reviewProposal, currentPlanVersion: current, sourcePlanVersion: source,
  };
  const edits: ParentProposalMaterialEdits = {
    cadenceMode: 'weekly_frequency', cadenceWeeklyFrequency: 3, cadenceDays: null,
    preferredTime: 'after_dinner', preferredTimeCustom: null,
    completionDescription: '完成一次閱讀時段',
  };

  it('revise 只打一支 RPC，NO_MATERIAL_CHANGE 保持 typed failure', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: false, code: 'NO_MATERIAL_CHANGE', reason: 'NO_MATERIAL_CHANGE', message: '沒有改變' },
      error: null,
    });
    const card: ParentProposalCardData = {
      proposal: { ...reviewProposal, status: 'proposed' }, currentPlanVersion: current,
    };
    await expect(service().revisePlan(card, edits)).resolves.toMatchObject({
      ok: false, code: 'NO_MATERIAL_CHANGE',
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(REVISE_CHILD_PROPOSAL_PLAN_RPC, {
      p_command: expect.objectContaining({ materialEdits: edits }),
    });
  });

  it('accept 使用 fresh decision 且解析 transition-owned reward snapshot', async () => {
    mockRpc.mockResolvedValue({
      data: {
        ok: true, proposalId: reviewProposal.id, planVersionId: current.id,
        taskId: 'task-1', relatedIds: ['assignment-1'], idempotentReplay: true,
        confirmedReward: {
          rewardPolicy: 'coin_eligible', coinAmount: 10, payoutBasis: 'per_session',
          claimPeriod: 'week', maxClaimsPerPeriod: 3,
          rewardPolicyVersion: 'coin-policy-1.0.0', taskPolicyVersion: 'task-taxonomy-2026-07',
          sourceTaskId: 'task-1',
        },
      },
      error: null,
    });
    await expect(service().acceptReview(review, '6-9')).resolves.toMatchObject({
      ok: true, taskId: 'task-1', idempotentReplay: true,
    });
    expect(mockRpc).toHaveBeenCalledWith(ACCEPT_CHILD_PROPOSAL_PLAN_RPC, {
      p_command: expect.objectContaining({
        expectedPlanVersionId: current.id,
        rewardDecision: expect.objectContaining({
          rewardPolicy: 'coin_eligible', coin: expect.objectContaining({ finalAmount: 10 }),
        }),
      }),
    });
  });

  it('request changes 與 close 都只送 typed command', async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: { ok: true, proposalId: reviewProposal.id, planVersionId: current.id,
          status: 'proposed', idempotentReplay: false }, error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: true, proposalId: reviewProposal.id, planVersionId: current.id,
          status: 'closed_unsuitable', idempotentReplay: false }, error: null,
      });

    await expect(service().requestChanges(review, '想再聊聊')).resolves.toMatchObject({
      ok: true, status: 'proposed',
    });
    await expect(service().closeUnsuitable({
      proposal: { ...reviewProposal, status: 'proposed' }, currentPlanVersion: current,
    }, '最近比較忙')).resolves.toMatchObject({ ok: true, status: 'closed_unsuitable' });

    expect(mockRpc.mock.calls[0][0]).toBe(REQUEST_CHILD_PROPOSAL_CHANGES_RPC);
    expect(mockRpc.mock.calls[1][0]).toBe(CLOSE_CHILD_PROPOSAL_UNSUITABLE_RPC);
  });
});

// ---------------------------------------------------------------------------
// 成功
// ---------------------------------------------------------------------------

describe('成功的回應', () => {
  it('建立提案回傳 id 與狀態', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, proposalId: 'p-1', status: 'proposed' },
      error: null,
    });

    await expect(service().create(CREATE_COMMAND)).resolves.toEqual({
      ok: true,
      proposalId: 'p-1',
      status: 'proposed',
    });
  });

  it('新增版本回傳版號與是否成為 current', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, planVersionId: 'v-2', versionNo: 2, isCurrent: true },
      error: null,
    });

    await expect(
      service().addPlanVersion({ schemaVersion: 1, proposalId: 'p-1', authoredBy: 'parent' }),
    ).resolves.toEqual({
      ok: true, planVersionId: 'v-2', versionNo: 2, isCurrent: true,
      // 舊版 RPC 不回這個鍵 —— 沒有就是「這是新的一版」，不是 undefined。
      duplicate: false,
    });
  });

  it('同一把 aiRequestId 撞到既有版本 → 成功且標記 duplicate，不是失敗', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, planVersionId: 'v-1', versionNo: 1, isCurrent: true, duplicate: true },
      error: null,
    });

    // 背景重試撞到既有版本時，正確的結果是「早就存好了」。
    // 當成失敗的話，呼叫端會一直重試一件已經完成的事。
    await expect(
      service().addPlanVersion({
        schemaVersion: 1, proposalId: 'p-1', authoredBy: 'ai', aiRequestId: 'cpd1:p-1:abcd',
      }),
    ).resolves.toEqual({
      ok: true, planVersionId: 'v-1', versionNo: 1, isCurrent: true, duplicate: true,
    });
  });

  it('轉換回傳前後狀態；非 active 的轉換沒有回饋快照', async () => {
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        proposalId: 'p-1',
        fromStatus: 'draft',
        toStatus: 'proposed',
        planVersionId: null,
        confirmedReward: null,
      },
      error: null,
    });

    const command: TransitionChildProposalCommand = {
      schemaVersion: 1,
      proposalId: 'p-1',
      toStatus: 'proposed',
      actorRole: 'child',
    };

    await expect(service().transition(command)).resolves.toEqual({
      ok: true,
      proposalId: 'p-1',
      fromStatus: 'draft',
      toStatus: 'proposed',
      planVersionId: null,
      confirmedReward: null,
    });
    expect(mockRpc.mock.calls[0][0]).toBe(TRANSITION_CHILD_PROPOSAL_RPC);
  });

  it('同一天重複回報試行不是錯誤，但會標成 duplicate', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, trialEventId: 'e-1', duplicate: true, walletEffect: 'none' },
      error: null,
    });

    await expect(service().recordTrial(TRIAL_COMMAND)).resolves.toEqual({
      ok: true,
      trialEventId: 'e-1',
      duplicate: true,
      walletEffect: 'none',
    });
  });
});

// ---------------------------------------------------------------------------
// 共同確認的回饋快照
// ---------------------------------------------------------------------------

const COIN_SNAPSHOT = {
  rewardPolicy: 'coin_eligible',
  coinAmount: 8,
  payoutBasis: 'per_completion',
  periodTargetCount: null,
  claimPeriod: 'day',
  maxClaimsPerPeriod: 1,
  rewardPolicyVersion: 'reward-2026-07',
  taskPolicyVersion: 'task-2026-07',
  sourceTaskId: 'task-1',
};

/**
 * per_period 的共同版本。達標次數 4、claim 上限 5 —— 兩個數字刻意不同，
 * 「拿 maxClaimsPerPeriod 當達標次數」才驗得出來。
 */
const PERIOD_SNAPSHOT = {
  ...COIN_SNAPSHOT,
  payoutBasis: 'per_period',
  periodTargetCount: 4,
  claimPeriod: 'week',
  maxClaimsPerPeriod: 5,
};

function activeResponse(confirmedReward: unknown) {
  return {
    data: {
      ok: true,
      proposalId: 'p-1',
      fromStatus: 'proposed',
      toStatus: 'active',
      planVersionId: 'v-3',
      confirmedReward,
    },
    error: null,
  };
}

const ACTIVATE: TransitionChildProposalCommand = {
  schemaVersion: 1,
  proposalId: 'p-1',
  toStatus: 'active',
  actorRole: 'parent',
  taskId: 'task-1',
};

describe('shared version 的回饋可追溯', () => {
  it('轉 active 時把快照原樣帶回來', async () => {
    mockRpc.mockResolvedValue(activeResponse(COIN_SNAPSHOT));

    await expect(service().transition(ACTIVATE)).resolves.toEqual({
      ok: true,
      proposalId: 'p-1',
      fromStatus: 'proposed',
      toStatus: 'active',
      planVersionId: 'v-3',
      confirmedReward: COIN_SNAPSHOT,
    });
  });

  it('per_period 的快照帶著達標次數，而且不等於 claim 上限', async () => {
    mockRpc.mockResolvedValue(activeResponse(PERIOD_SNAPSHOT));

    const result = await service().transition(ACTIVATE);
    expect(result).toMatchObject({ ok: true, confirmedReward: PERIOD_SNAPSHOT });
    // 兩個數字必須分開帶回來 —— 混用會讓孩子端的「還差幾次」算錯。
    expect(PERIOD_SNAPSHOT.periodTargetCount).not.toBe(PERIOD_SNAPSHOT.maxClaimsPerPeriod);
  });

  it('legacy 快照的 per_period 沒有達標次數，一樣算數', async () => {
    // 那時的 per_period 是從 claim_period 推導的，家庭沒有確認過任何次數。
    // 把它擋掉會讓既有共同計畫的重試整個失敗。
    const legacy = { ...PERIOD_SNAPSHOT, periodTargetCount: null };
    mockRpc.mockResolvedValue(activeResponse(legacy));

    await expect(service().transition(ACTIVATE)).resolves.toMatchObject({
      ok: true,
      confirmedReward: legacy,
    });
  });

  it('不發幣的共同版本一樣有快照，只是沒有金額', async () => {
    const snapshot = {
      ...COIN_SNAPSHOT,
      rewardPolicy: 'record_only',
      coinAmount: null,
    };
    mockRpc.mockResolvedValue(activeResponse(snapshot));

    const result = await service().transition(ACTIVATE);
    expect(result).toMatchObject({ ok: true, confirmedReward: snapshot });
  });

  it('命令裡沒有任何幣值欄位可以帶 —— 最終值由 RPC 從 tasks 複製', () => {
    // @ts-expect-error 轉換命令不接受幣值
    const bad: TransitionChildProposalCommand = { ...ACTIVATE, coinAmount: 8 };
    expect(bad.taskId).toBe('task-1');
  });

  it('轉 active 卻沒有快照就當失敗 —— 沒有回饋紀錄的共同版本不是共同版本', async () => {
    mockRpc.mockResolvedValue(activeResponse(null));

    await expect(service().transition(ACTIVATE)).resolves.toEqual({
      ok: false,
      code: 'UNKNOWN',
      reason: 'CONFIRMED_REWARD_MISSING',
      message: '變更提案狀態失敗：共同版本缺少確認的回饋紀錄',
    });
  });

  it.each([
    ['缺 sourceTaskId（對不了帳）', { ...COIN_SNAPSHOT, sourceTaskId: '' }],
    ['缺 rewardPolicyVersion', { ...COIN_SNAPSHOT, rewardPolicyVersion: '' }],
    ['缺 payoutBasis', { ...COIN_SNAPSHOT, payoutBasis: undefined }],
    ['缺 claimPeriod', { ...COIN_SNAPSHOT, claimPeriod: undefined }],
    ['缺 maxClaimsPerPeriod', { ...COIN_SNAPSHOT, maxClaimsPerPeriod: null }],
    ['coin_eligible 卻沒有金額', { ...COIN_SNAPSHOT, coinAmount: null }],
    ['coin_eligible 金額是 0', { ...COIN_SNAPSHOT, coinAmount: 0 }],
    ['不發幣卻夾帶金額', { ...COIN_SNAPSHOT, rewardPolicy: 'progress_only' }],
    ['達標次數是 0', { ...PERIOD_SNAPSHOT, periodTargetCount: 0 }],
    ['達標次數不是數字', { ...PERIOD_SNAPSHOT, periodTargetCount: '4' }],
  ])('殘缺的快照不算數：%s', async (_label, snapshot) => {
    mockRpc.mockResolvedValue(activeResponse(snapshot));

    await expect(service().transition(ACTIVATE)).resolves.toMatchObject({
      ok: false,
      reason: 'CONFIRMED_REWARD_MISSING',
    });
  });

  it('AI 建議的幣值走自己的鍵，不會被當成最終值', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, planVersionId: 'v-2', versionNo: 2, isCurrent: true },
      error: null,
    });

    await service().addPlanVersion({
      schemaVersion: 1,
      proposalId: 'p-1',
      authoredBy: 'ai',
      aiSnapshot: { suggestion: '一週三次' },
      reward: { policy: 'coin_eligible', aiSuggestedCoinAmount: 12 },
    });

    const sent = mockRpc.mock.calls[0][1] as { p_command: Record<string, unknown> };
    const reward = sent.p_command.reward as Record<string, unknown>;
    expect(reward.aiSuggestedCoinAmount).toBe(12);
    // 命令裡永遠不該出現這些鍵 —— RPC 收到會直接 POLICY_REJECTED。
    expect(reward).not.toHaveProperty('coinAmount');
    expect(reward).not.toHaveProperty('finalAmount');
    expect(reward).not.toHaveProperty('confirmedCoinAmount');
  });

  it('計畫版本命令沒有最終幣值的鍵可以填', () => {
    const bad: AddChildProposalPlanVersionCommand = {
      schemaVersion: 1,
      proposalId: 'p-1',
      authoredBy: 'parent',
      // @ts-expect-error 最終幣值不由呼叫端決定，reward 上沒有這個鍵
      reward: { policy: 'coin_eligible', coinAmount: 8 },
    };
    expect(bad.proposalId).toBe('p-1');
  });
});

// ---------------------------------------------------------------------------
// P0 試行不入帳
// ---------------------------------------------------------------------------

describe('試行絕不入帳', () => {
  it('walletEffect 是 none 才算成功', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, trialEventId: 'e-1', duplicate: false, walletEffect: 'none' },
      error: null,
    });

    const result = await service().recordTrial(TRIAL_COMMAND);
    expect(result).toEqual({
      ok: true,
      trialEventId: 'e-1',
      duplicate: false,
      walletEffect: 'none',
    });
  });

  it.each(['credited', 'pending', '', null, undefined])(
    'walletEffect 是 %p 就當失敗，不讓它靜靜通過',
    async (walletEffect) => {
      mockRpc.mockResolvedValue({
        data: { ok: true, trialEventId: 'e-1', duplicate: false, walletEffect },
        error: null,
      });

      const result = await service().recordTrial(TRIAL_COMMAND);
      expect(result).toEqual({
        ok: false,
        code: 'POLICY_REJECTED',
        reason: 'TRIAL_WALLET_EFFECT_UNEXPECTED',
        message: '試行紀錄回報了非預期的錢包影響，已中止',
      });
    },
  );

  it('試行命令本身沒有任何幣值欄位可以帶', () => {
    // 型別層的斷言：多帶一個 coinAmount 會是編譯錯誤。
    // @ts-expect-error 試行命令不接受幣值
    const bad: RecordChildProposalTrialCommand = { ...TRIAL_COMMAND, coinAmount: 5 };
    expect(bad.proposalId).toBe('proposal-1');
  });
});

// ---------------------------------------------------------------------------
// 失敗
// ---------------------------------------------------------------------------

describe('失敗的回應', () => {
  it('RPC 自己給的 code 與 reason 都保留下來', async () => {
    mockRpc.mockResolvedValue({
      data: {
        ok: false,
        code: 'POLICY_REJECTED',
        reason: 'ILLEGAL_TRANSITION',
        message: 'child 不能把提案從 proposed 轉成 active',
      },
      error: null,
    });

    await expect(
      service().transition({
        schemaVersion: 1,
        proposalId: 'p-1',
        toStatus: 'active',
        actorRole: 'child',
      }),
    ).resolves.toEqual({
      ok: false,
      code: 'POLICY_REJECTED',
      reason: 'ILLEGAL_TRANSITION',
      message: 'child 不能把提案從 proposed 轉成 active',
    });
  });

  it('42501（跨家庭 / 未登入）翻成 POLICY_REJECTED', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Not authorized: child ... is not in the caller family' },
    });

    const result = await service().create(CREATE_COMMAND);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: 'POLICY_REJECTED' });
  });

  it('CHECK constraint（23514）翻成 VALIDATION_FAILED', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'check violation' },
    });

    await expect(service().create(CREATE_COMMAND)).resolves.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('migration 還沒套用（PGRST202）翻成 PERSISTENCE_FAILED', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'function not found' },
    });

    await expect(service().create(CREATE_COMMAND)).resolves.toMatchObject({
      code: 'PERSISTENCE_FAILED',
    });
  });

  it('連線層丟例外時不會炸到呼叫端', async () => {
    mockRpc.mockRejectedValue(new Error('network down'));

    await expect(service().create(CREATE_COMMAND)).resolves.toEqual({
      ok: false,
      code: 'PERSISTENCE_FAILED',
      message: 'network down',
    });
  });

  it('看不懂的回應不能當成成功', async () => {
    mockRpc.mockResolvedValue({ data: { whatever: true }, error: null });

    await expect(service().create(CREATE_COMMAND)).resolves.toMatchObject({
      ok: false,
      code: 'UNKNOWN',
    });
  });

  it('ok 但沒有 id 也不算成功 —— 沒有 id 就是沒建立', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, status: 'draft' }, error: null });

    await expect(service().create(CREATE_COMMAND)).resolves.toMatchObject({
      ok: false,
      code: 'UNKNOWN',
    });
  });

  it('回了沒見過的狀態一樣不算成功', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, proposalId: 'p-1', status: 'archived' },
      error: null,
    });

    await expect(service().create(CREATE_COMMAND)).resolves.toMatchObject({
      ok: false,
      code: 'UNKNOWN',
    });
  });

  it('沒見過的失敗 code 退回 UNKNOWN，不硬塞', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: false, code: 'TEAPOT', message: '?' },
      error: null,
    });

    await expect(service().create(CREATE_COMMAND)).resolves.toMatchObject({
      ok: false,
      code: 'UNKNOWN',
    });
  });
});
