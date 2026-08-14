// P1-A3 §20 / §21 — enrichment 掛掉不會把孩子鎖在 draft
//
// 這一組守的是一條產品判斷：
//
//   孩子已經在螢幕上看過一份計畫並且點頭了。那件事已經發生。
//   在那之後，AI policy helper 可不可用只影響「政策欄位有沒有算出來」——
//   不影響那份計畫成不成立，也不影響它能不能送到家長手上。
//
// 所以下面每一種 enrichment 失敗，publish 都必須照樣發生。

import { publishChildConfirmedPlan } from '../formalPlan/publishChildConfirmedPlan';
import type {
  FormalPlanBridgePort,
  PublishChildConfirmedPlanDeps,
} from '../formalPlan/publishChildConfirmedPlan';
import type { PublishChildConfirmedPlanArgs } from '../formalPlan/formalPlanService';
import type { ChildProposal } from '../../childProposal/types';
import type {
  ChildProposalPlanDraft,
  ChildProposalPlanDraftClient,
} from '../../childProposal/planDraft/types';

const PROPOSAL = {
  id: 'p1',
  family_id: 'f1',
  child_id: 'c1',
  status: 'draft',
  child_original_goal: '我想兩週讀完一本書',
  child_original_motivation: null,
  proposal_source: 'child',
  cadence_mode: null,
  cadence_weekly_frequency: null,
  cadence_days: null,
  preferred_time: null,
  preferred_time_custom: null,
  estimated_minutes: null,
  child_reward_preference: 'not_specified',
  child_note: null,
  current_plan_version_id: null,
  task_id: null,
  closed_reason: null,
  closed_at: null,
  proposed_at: null,
  activated_at: null,
  created_at: '2026-08-14T00:00:00.000Z',
  updated_at: '2026-08-14T00:00:00.000Z',
} as unknown as ChildProposal;

const DRAFT: ChildProposalPlanDraft = {
  schemaVersion: 2,
  planTitle: '兩週閱讀養成計畫',
  planSummary: '每天睡前閱讀 15 分鐘。',
  completionDescription: '兩週後把整本書讀完',
  activityKind: 'reading',
  nextStepSuggestion: '今晚讀第一章',
  cadence: { mode: 'weekly_frequency', weeklyFrequency: 5 },
  cadenceSource: 'ai_suggested',
  estimatedMinutes: 15,
  durationType: 'long_term',
  durationDays: 14,
  category: 'D',
  categoryReason: '學習與技能',
  difficulty: 'standard',
  rewardPolicy: 'coin_eligible',
  rewardEligibility: 'allowed',
  rewardPolicyVersion: 'v1',
  pricingStatus: 'priced',
  payoutType: 'per_completion',
  pricing: null,
  sessionCoinReference: null,
  aiSuggestedCoinAmount: null,
  blockingIssues: [],
  requiresConfirmation: [],
  warnings: [],
  clarificationQuestion: null,
  model: 'test-model',
};

function makeDeps(overrides: {
  client?: ChildProposalPlanDraftClient | null;
  port?: Partial<FormalPlanBridgePort>;
} = {}) {
  const published: PublishChildConfirmedPlanArgs[] = [];
  const port: FormalPlanBridgePort = {
    getProposal: async () => PROPOSAL,
    getChildAgeGroup: async () => '6-9',
    publish: async (args) => {
      published.push(args);
      return {
        ok: true,
        proposalId: args.proposalId,
        sessionId: args.sessionId,
        planVersionId: 'v1',
        versionNo: 1,
        authoredBy: 'child',
        proposalStatus: 'proposed',
        requiresParentDecision: [],
        enrichmentStatus: args.enrichment ? 'enriched' : 'unavailable',
        idempotentReplay: false,
      };
    },
    ...overrides.port,
  };

  const deps: PublishChildConfirmedPlanDeps = {
    port,
    enrichmentClient:
      overrides.client === undefined
        ? { requestPlanDraft: async () => ({ status: 'draft', schemaVersion: 2, draft: DRAFT }) }
        : overrides.client,
    now: () => new Date('2026-08-14T00:00:00.000Z'),
  };
  return { deps, published };
}

const INPUT = { proposalId: 'p1', sessionId: 's1' };

describe('路徑 A：enrichment 成功', () => {
  it('正式計畫帶著政策欄位', async () => {
    const { deps, published } = makeDeps();
    const result = await publishChildConfirmedPlan(deps, INPUT);

    expect(result.ok).toBe(true);
    expect(result.ok && result.enrichmentStatus).toBe('enriched');
    expect(published[0].enrichment?.purposeCategory).toBe('D');
    expect(published[0].enrichment?.completionDescription).toBe('完成一次約定的閱讀時段');
  });

  it('P0 的標題與建議節奏沒有跟著進來', async () => {
    const { deps, published } = makeDeps();
    await publishChildConfirmedPlan(deps, INPUT);

    const { aiSnapshot: _snapshot, ...enrichment } = published[0].enrichment ?? {};
    const serialized = JSON.stringify(enrichment);
    expect(serialized).not.toContain('兩週閱讀養成計畫');
    expect(serialized).not.toContain('weeklyFrequency');
  });
});

describe('路徑 B：enrichment 不可用 —— 但一定要送出去', () => {
  const cases: [string, Parameters<typeof makeDeps>[0]][] = [
    ['這個環境沒有 policy helper', { client: null }],
    [
      '模型回不可用',
      { client: { requestPlanDraft: async () => ({ status: 'unavailable', schemaVersion: 2, reason: 'TIMEOUT' }) } },
    ],
    [
      '模型直接丟例外',
      {
        client: {
          requestPlanDraft: async () => {
            throw new Error('boom');
          },
        },
      },
    ],
    ['查不到年齡段', { port: { getChildAgeGroup: async () => null } }],
    [
      '查年齡段時丟例外',
      {
        port: {
          getChildAgeGroup: async () => {
            throw new Error('db down');
          },
        },
      },
    ],
    ['讀不到提案', { port: { getProposal: async () => null } }],
    [
      '讀提案時丟例外',
      {
        port: {
          getProposal: async () => {
            throw new Error('db down');
          },
        },
      },
    ],
  ];

  it.each(cases)('%s → 照樣送出，enrichment 標成 unavailable', async (_name, overrides) => {
    const { deps, published } = makeDeps(overrides);
    const result = await publishChildConfirmedPlan(deps, INPUT);

    expect(result.ok).toBe(true);
    expect(published).toHaveLength(1);
    expect(published[0].enrichment).toBeUndefined();
    expect(result.ok && result.enrichmentStatus).toBe('unavailable');
  });
});

describe('不再跑一輪 planning AI', () => {
  it('只打一次 policy helper，沒有第二次對話', async () => {
    let calls = 0;
    const { deps } = makeDeps({
      client: {
        requestPlanDraft: async () => {
          calls += 1;
          return { status: 'draft', schemaVersion: 2, draft: DRAFT };
        },
      },
    });
    await publishChildConfirmedPlan(deps, INPUT);
    expect(calls).toBe(1);
  });
});

describe('RPC 是唯一的權威', () => {
  it('publish 失敗就如實回傳，這一層不改寫成功', async () => {
    const { deps } = makeDeps({
      port: {
        publish: async () => ({
          ok: false,
          code: 'POLICY_REJECTED',
          reason: 'PLANNING_NOT_CONFIRMED',
          message: '還沒有孩子確認過的計畫',
        }),
      },
    });
    const result = await publishChildConfirmedPlan(deps, INPUT);
    expect(result).toEqual({
      ok: false,
      code: 'POLICY_REJECTED',
      reason: 'PLANNING_NOT_CONFIRMED',
      message: '還沒有孩子確認過的計畫',
    });
  });
});
