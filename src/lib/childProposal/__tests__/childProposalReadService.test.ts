import type { ChildProposal, ChildProposalPlanVersion } from '../types';

const mockFrom = jest.fn();

jest.mock('../../supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import { SupabaseChildProposalService } from '../childProposalService';

const PROPOSAL = {
  id: 'proposal-a',
  family_id: 'family-1',
  child_id: 'child-a',
  status: 'proposed',
  child_original_goal: '我想兩週把這本書讀完',
  child_original_motivation: null,
  proposal_source: 'child',
  cadence_mode: 'weekly_frequency',
  cadence_weekly_frequency: 4,
  cadence_days: null,
  preferred_time: null,
  preferred_time_custom: null,
  estimated_minutes: null,
  child_reward_preference: 'hopes_for_coin',
  child_note: null,
  current_plan_version_id: null,
  task_id: null,
  closed_reason: null,
  closed_at: null,
  proposed_at: '2026-08-11T02:00:00Z',
  activated_at: null,
  created_at: '2026-08-11T02:00:00Z',
  updated_at: '2026-08-11T02:00:00Z',
} satisfies ChildProposal;

function queryResult<T>(result: { data: T[] | null; error: { message: string } | null }) {
  const chain: Record<string, jest.Mock> & PromiseLike<typeof result> = {} as never;
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.order = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.in = jest.fn(() => chain);
  chain.then = jest.fn((resolve) => Promise.resolve(result).then(resolve)) as never;
  return chain;
}

beforeEach(() => mockFrom.mockReset());

describe('SupabaseChildProposalService.listProposedForParent', () => {
  it('只查同家庭、目前孩子與 proposed/review，最新優先且最多三筆', async () => {
    const chain = queryResult({ data: [PROPOSAL], error: null });
    mockFrom.mockReturnValue(chain);

    await expect(new SupabaseChildProposalService().listProposedForParent({
      familyId: 'family-1',
      childId: 'child-a',
    })).resolves.toEqual([{ proposal: PROPOSAL, currentPlanVersion: null }]);

    expect(mockFrom).toHaveBeenCalledWith('child_proposals');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq.mock.calls).toEqual([
      ['family_id', 'family-1'],
      ['child_id', 'child-a'],
    ]);
    expect(chain.in).toHaveBeenCalledWith('status', ['proposed', 'needs_child_review']);
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(3);
  });

  it('用 exact current_plan_version_id 讀 structured plan，不從 ai_snapshot 拼資料', async () => {
    const withPlan = { ...PROPOSAL, current_plan_version_id: 'version-1' };
    const version = {
      id: 'version-1', proposal_id: PROPOSAL.id, authored_by: 'ai',
      plan_title: '兩週閱讀挑戰', progress_model: 'weekly_rhythm',
    } as ChildProposalPlanVersion;
    const proposalsQuery = queryResult({ data: [withPlan], error: null });
    const versionsQuery = queryResult({ data: [version], error: null });
    mockFrom.mockReturnValueOnce(proposalsQuery).mockReturnValueOnce(versionsQuery);

    await expect(new SupabaseChildProposalService().listProposedForParent({
      familyId: 'family-1', childId: 'child-a',
    })).resolves.toEqual([{ proposal: withPlan, currentPlanVersion: version }]);

    expect(mockFrom.mock.calls).toEqual([
      ['child_proposals'], ['child_proposal_plan_versions'],
    ]);
    expect(versionsQuery.in).toHaveBeenCalledWith('id', ['version-1']);
    expect(versionsQuery.select).toHaveBeenCalledWith('*');
  });

  it('version 不屬於 proposal 時誠實回 null，不顯示錯配 plan', async () => {
    const withPlan = { ...PROPOSAL, current_plan_version_id: 'version-1' };
    const wrong = { id: 'version-1', proposal_id: 'another-proposal' } as ChildProposalPlanVersion;
    mockFrom
      .mockReturnValueOnce(queryResult({ data: [withPlan], error: null }))
      .mockReturnValueOnce(queryResult({ data: [wrong], error: null }));

    await expect(new SupabaseChildProposalService().listProposedForParent({
      familyId: 'family-1', childId: 'child-a',
    })).resolves.toEqual([{ proposal: withPlan, currentPlanVersion: null }]);
  });

  it('不在 client 端撈全部狀態後過濾，draft/active/closed 由 query 排除', async () => {
    const chain = queryResult({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await new SupabaseChildProposalService().listProposedForParent({
      familyId: 'family-1', childId: 'child-b', limit: 2,
    });

    expect(chain.in).toHaveBeenCalledWith('status', ['proposed', 'needs_child_review']);
    expect(chain.eq).not.toHaveBeenCalledWith('status', 'draft');
    expect(chain.eq).not.toHaveBeenCalledWith('status', 'active');
    expect(chain.eq).not.toHaveBeenCalledWith('status', 'closed_unsuitable');
    expect(chain.limit).toHaveBeenCalledWith(2);
  });

  it('把讀取錯誤交給上層顯示 error state', async () => {
    mockFrom.mockReturnValue(queryResult({ data: null, error: { message: 'network down' } }));

    await expect(new SupabaseChildProposalService().listProposedForParent({
      familyId: 'family-1', childId: 'child-a',
    })).rejects.toThrow('network down');
  });
});

describe('SupabaseChildProposalService.listNeedsReviewForChild', () => {
  it('讀 exact current parent version 與 adopted source，供 structured diff', async () => {
    const proposal = {
      ...PROPOSAL,
      status: 'needs_child_review' as const,
      current_plan_version_id: 'parent-version',
    };
    const current = {
      id: 'parent-version', proposal_id: proposal.id, authored_by: 'parent',
      requires_child_review: true, adopted_from_plan_version_id: 'ai-version',
    } as ChildProposalPlanVersion;
    const source = {
      id: 'ai-version', proposal_id: proposal.id, authored_by: 'ai',
    } as ChildProposalPlanVersion;
    const proposalQuery = queryResult({ data: [proposal], error: null });
    const currentQuery = queryResult({ data: [current], error: null });
    const sourceQuery = queryResult({ data: [source], error: null });
    mockFrom
      .mockReturnValueOnce(proposalQuery)
      .mockReturnValueOnce(currentQuery)
      .mockReturnValueOnce(sourceQuery);

    await expect(new SupabaseChildProposalService().listNeedsReviewForChild({
      familyId: 'family-1', childId: 'child-a',
    })).resolves.toEqual([{
      proposal, currentPlanVersion: current, sourcePlanVersion: source,
    }]);

    expect(proposalQuery.eq.mock.calls).toEqual([
      ['family_id', 'family-1'], ['child_id', 'child-a'], ['status', 'needs_child_review'],
    ]);
    expect(currentQuery.in).toHaveBeenCalledWith('id', ['parent-version']);
    expect(sourceQuery.in).toHaveBeenCalledWith('id', ['ai-version']);
  });

  it('lineage 缺失或錯配時不猜 source，也不回傳不可 review 的卡', async () => {
    const proposal = {
      ...PROPOSAL,
      status: 'needs_child_review' as const,
      current_plan_version_id: 'parent-version',
    };
    const current = {
      id: 'parent-version', proposal_id: proposal.id, authored_by: 'parent',
      requires_child_review: true, adopted_from_plan_version_id: 'missing-source',
    } as ChildProposalPlanVersion;
    mockFrom
      .mockReturnValueOnce(queryResult({ data: [proposal], error: null }))
      .mockReturnValueOnce(queryResult({ data: [current], error: null }))
      .mockReturnValueOnce(queryResult({ data: [], error: null }));

    await expect(new SupabaseChildProposalService().listNeedsReviewForChild({
      familyId: 'family-1', childId: 'child-a',
    })).resolves.toEqual([]);
  });
});
