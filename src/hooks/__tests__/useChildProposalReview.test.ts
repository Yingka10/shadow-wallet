import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ChildProposalReviewData } from '../../lib/childProposal';
import { useChildProposalReview } from '../useChildProposalReview';

function review(id: string): ChildProposalReviewData {
  return {
    proposal: { id, child_id: 'child-a', family_id: 'family-a', status: 'needs_child_review' },
    currentPlanVersion: { id: `${id}-parent` },
    sourcePlanVersion: { id: `${id}-source` },
  } as ChildProposalReviewData;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('useChildProposalReview', () => {
  it('載入 selected child 的 review，成功接受後 refresh', async () => {
    const reader = {
      listNeedsReviewForChild: jest.fn().mockResolvedValueOnce([review('p1')]).mockResolvedValueOnce([]),
      acceptReview: jest.fn().mockResolvedValue({ ok: true, proposalId: 'p1', taskId: 't1' }),
      requestChanges: jest.fn(),
    } as any;
    const { result } = renderHook(() => useChildProposalReview('child-a', 'family-a', 'middle', reader));
    await waitFor(() => expect(result.current.reviews).toHaveLength(1));
    await act(async () => { expect(await result.current.accept(result.current.reviews[0])).toBe(true); });
    expect(reader.acceptReview).toHaveBeenCalledWith(expect.objectContaining({ proposal: expect.objectContaining({ id: 'p1' }) }), 'middle');
    expect(result.current.reviews).toEqual([]);
    expect(result.current.successMessage).toBe('這份計畫一起說好了');
  });

  it('想再聊聊走 typed command，錯誤保留給孩子看', async () => {
    const reader = {
      listNeedsReviewForChild: jest.fn().mockResolvedValue([review('p1')]),
      acceptReview: jest.fn(),
      requestChanges: jest.fn().mockResolvedValue({ ok: false, code: 'STALE_PLAN_VERSION', message: '計畫已更新' }),
    } as any;
    const { result } = renderHook(() => useChildProposalReview('child-a', 'family-a', 'middle', reader));
    await waitFor(() => expect(result.current.reviews).toHaveLength(1));
    await act(async () => { expect(await result.current.requestChanges(result.current.reviews[0])).toBe(false); });
    expect(result.current.actionError).toBe('計畫已更新');
  });

  it('讀取失敗可 refresh，不隱藏其他孩子首頁內容', async () => {
    const reader = {
      listNeedsReviewForChild: jest.fn().mockRejectedValueOnce(new Error('讀取失敗')).mockResolvedValueOnce([]),
    } as any;
    const { result } = renderHook(() => useChildProposalReview('child-a', 'family-a', 'middle', reader));
    await waitFor(() => expect(result.current.error).toBe('讀取失敗'));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.error).toBeNull();
  });

  it('切換孩子後忽略舊 read response', async () => {
    const oldRead = deferred<ChildProposalReviewData[]>();
    const reader = {
      listNeedsReviewForChild: jest.fn()
        .mockReturnValueOnce(oldRead.promise)
        .mockResolvedValueOnce([review('new')]),
    } as any;
    const { result, rerender } = renderHook<
      ReturnType<typeof useChildProposalReview>,
      { childId: string }
    >(
      ({ childId }) => useChildProposalReview(childId, 'family-a', 'middle', reader),
      { initialProps: { childId: 'child-a' } },
    );
    rerender({ childId: 'child-b' });
    await waitFor(() => expect(result.current.reviews[0]?.proposal.id).toBe('new'));
    await act(async () => { oldRead.resolve([review('old')]); });
    expect(result.current.reviews[0]?.proposal.id).toBe('new');
  });

  it('切換孩子後忽略舊 action completion', async () => {
    const pending = deferred<any>();
    const reader = {
      listNeedsReviewForChild: jest.fn().mockResolvedValue([review('p1')]),
      acceptReview: jest.fn().mockReturnValue(pending.promise),
    } as any;
    const { result, rerender } = renderHook<
      ReturnType<typeof useChildProposalReview>,
      { childId: string }
    >(
      ({ childId }) => useChildProposalReview(childId, 'family-a', 'middle', reader),
      { initialProps: { childId: 'child-a' } },
    );
    await waitFor(() => expect(result.current.reviews).toHaveLength(1));
    let action!: Promise<boolean>;
    act(() => { action = result.current.accept(result.current.reviews[0]); });
    rerender({ childId: 'child-b' });
    await act(async () => { pending.resolve({ ok: true, proposalId: 'p1' }); await action; });
    expect(result.current.successMessage).toBeNull();
    expect(result.current.actingProposalId).toBeNull();
  });
});
