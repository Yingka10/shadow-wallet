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
  SupabaseChildProposalService,
  TRANSITION_CHILD_PROPOSAL_RPC,
} from '../childProposalService';
import type {
  AddChildProposalPlanVersionCommand,
  CreateChildProposalCommand,
  RecordChildProposalTrialCommand,
  TransitionChildProposalCommand,
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
  claimPeriod: 'day',
  maxClaimsPerPeriod: 1,
  rewardPolicyVersion: 'reward-2026-07',
  taskPolicyVersion: 'task-2026-07',
  sourceTaskId: 'task-1',
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
