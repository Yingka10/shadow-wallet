import type { ChildProposal } from '../types';

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

function queryResult(result: { data: ChildProposal[] | null; error: { message: string } | null }) {
  const chain: Record<string, jest.Mock> & PromiseLike<typeof result> = {} as never;
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.order = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.then = jest.fn((resolve) => Promise.resolve(result).then(resolve)) as never;
  return chain;
}

beforeEach(() => mockFrom.mockReset());

describe('SupabaseChildProposalService.listProposedForParent', () => {
  it('只查同家庭、目前孩子與 proposed，最新優先且最多三筆', async () => {
    const chain = queryResult({ data: [PROPOSAL], error: null });
    mockFrom.mockReturnValue(chain);

    await expect(new SupabaseChildProposalService().listProposedForParent({
      familyId: 'family-1',
      childId: 'child-a',
    })).resolves.toEqual([PROPOSAL]);

    expect(mockFrom).toHaveBeenCalledWith('child_proposals');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq.mock.calls).toEqual([
      ['family_id', 'family-1'],
      ['child_id', 'child-a'],
      ['status', 'proposed'],
    ]);
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(3);
  });

  it('不在 client 端撈全部狀態後過濾，draft/active/closed 由 query 排除', async () => {
    const chain = queryResult({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await new SupabaseChildProposalService().listProposedForParent({
      familyId: 'family-1', childId: 'child-b', limit: 2,
    });

    expect(chain.eq).toHaveBeenCalledWith('status', 'proposed');
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
