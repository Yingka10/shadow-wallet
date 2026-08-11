let mockFrom = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import {
  SHARED_PLAN_GUARD_CODE,
  SHARED_PLAN_GUARD_MESSAGE,
  SharedPlanRequiresRenegotiationError,
  assertSharedPlanMutationAllowed,
  isActiveSharedPlanTask,
  isSharedPlanGuardFailure,
  normalizeSharedPlanGuardError,
} from '../sharedPlanIntegrity';

function makeProposalLookup(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    limit: () => Promise.resolve(result),
  };
  return chain;
}

describe('shared plan integrity client contract', () => {
  beforeEach(() => {
    mockFrom = jest.fn();
  });

  it('uses the approved stable code and product copy', () => {
    expect(SHARED_PLAN_GUARD_CODE).toBe('SHARED_PLAN_REQUIRES_RENEGOTIATION');
    expect(SHARED_PLAN_GUARD_MESSAGE).toBe('這是一起確認的計畫，調整內容需要再一起確認。');
  });

  it('recognizes both typed RPC results and database trigger errors', () => {
    expect(isSharedPlanGuardFailure({ error: SHARED_PLAN_GUARD_CODE })).toBe(true);
    expect(isSharedPlanGuardFailure({ message: SHARED_PLAN_GUARD_CODE })).toBe(true);
    expect(isSharedPlanGuardFailure(new Error(`db: ${SHARED_PLAN_GUARD_CODE}`))).toBe(true);
    expect(isSharedPlanGuardFailure({ error: 'invalid_max_claims' })).toBe(false);
  });

  it('normalizes a guard refusal without hiding unrelated errors', () => {
    const normalized = normalizeSharedPlanGuardError({ message: SHARED_PLAN_GUARD_CODE });
    expect(normalized).toBeInstanceOf(SharedPlanRequiresRenegotiationError);
    expect(normalized.message).toBe(SHARED_PLAN_GUARD_MESSAGE);

    const unrelated = new Error('network failed');
    expect(normalizeSharedPlanGuardError(unrelated)).toBe(unrelated);
  });

  it('rejects only active Shared Plan mutations', () => {
    expect(() => assertSharedPlanMutationAllowed(true))
      .toThrow(SHARED_PLAN_GUARD_MESSAGE);
    expect(() => assertSharedPlanMutationAllowed(false)).not.toThrow();
  });

  it('uses active Proposal linkage rather than task provenance', async () => {
    mockFrom.mockReturnValueOnce(makeProposalLookup({ data: [{ id: 'proposal-1' }], error: null }));

    await expect(isActiveSharedPlanTask('task-1')).resolves.toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('child_proposals');
  });

  it('returns false when no active Proposal links the task', async () => {
    mockFrom.mockReturnValueOnce(makeProposalLookup({ data: [], error: null }));

    await expect(isActiveSharedPlanTask('task-ordinary')).resolves.toBe(false);
  });

  it('does not silently treat a failed linkage query as ordinary', async () => {
    mockFrom.mockReturnValueOnce(makeProposalLookup({
      data: null,
      error: { message: 'proposal lookup failed' },
    }));

    await expect(isActiveSharedPlanTask('task-1')).rejects.toThrow('proposal lookup failed');
  });
});
