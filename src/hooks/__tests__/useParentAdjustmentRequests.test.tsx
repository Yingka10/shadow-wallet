// P0-8M — 家長端調整請求 hook。
//
// 最重要的一條：家長在切孩子。上一個孩子的請求回應如果晚一步才回來，
// 絕對不能寫進現在這個孩子的畫面 —— 那會讓家長替錯的孩子按下確認。

import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  useParentAdjustmentRequests,
  type ParentAdjustmentReader,
} from '../useParentAdjustmentRequests';
import type {
  ChildProposal,
  ChildProposalAdjustmentCardData,
  ChildProposalAdjustmentRequest,
  ChildProposalPlanVersion,
} from '../../lib/childProposal';

const FAMILY_ID = 'fam-1';

function makeCard(requestId = 'req-1'): ChildProposalAdjustmentCardData {
  return {
    request: {
      id: requestId,
      proposal_id: 'prop-1',
      status: 'open',
      adjustment_kind: 'preferred_time',
      based_on_plan_version_id: 'ver-1',
      reason: '這週回顧後，我想改成晚餐後試試看。',
      requested_changes: { preferredTime: 'after_dinner', preferredTimeCustom: null },
    } as unknown as ChildProposalAdjustmentRequest,
    proposal: {
      id: 'prop-1', status: 'active', current_plan_version_id: 'ver-1',
    } as unknown as ChildProposal,
    basedOnPlanVersion: {
      id: 'ver-1', proposal_id: 'prop-1', preferred_time: 'before_bed',
    } as unknown as ChildProposalPlanVersion,
  };
}

function makeReader(
  overrides: Partial<ParentAdjustmentReader> = {},
): ParentAdjustmentReader {
  return {
    listOpenAdjustmentsForParent: jest.fn(async () => [makeCard()]),
    acceptAdjustment: jest.fn(async () => ({
      ok: true as const,
      adjustmentRequestId: 'req-1',
      proposalId: 'prop-1',
      planVersionId: 'ver-2',
      taskId: 'task-1',
      idempotentReplay: false,
    })),
    declineAdjustment: jest.fn(async () => ({
      ok: true as const,
      adjustmentRequestId: 'req-1',
      status: 'declined' as const,
      idempotentReplay: false,
    })),
    ...overrides,
  } as ParentAdjustmentReader;
}

describe('useParentAdjustmentRequests', () => {
  it('只查目前選中的孩子與家庭', async () => {
    const reader = makeReader();
    const { result } = renderHook(() =>
      useParentAdjustmentRequests('child-1', FAMILY_ID, reader));

    await waitFor(() => expect(result.current.requests).toHaveLength(1));
    expect(reader.listOpenAdjustmentsForParent)
      .toHaveBeenCalledWith({ childId: 'child-1', familyId: FAMILY_ID });
  });

  it('沒有選中孩子時不查，也不顯示任何卡', async () => {
    const reader = makeReader();
    const { result } = renderHook(() =>
      useParentAdjustmentRequests(null, FAMILY_ID, reader));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(reader.listOpenAdjustmentsForParent).not.toHaveBeenCalled();
    expect(result.current.requests).toEqual([]);
  });

  it('切換孩子後，前一個孩子的回應不會覆寫現在的畫面', async () => {
    let releaseFirst: ((cards: ChildProposalAdjustmentCardData[]) => void) | null = null;
    const listOpenAdjustmentsForParent = jest.fn()
      .mockImplementationOnce(() => new Promise(resolve => { releaseFirst = resolve; }))
      .mockResolvedValue([]);
    const reader = makeReader({ listOpenAdjustmentsForParent });

    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) =>
        useParentAdjustmentRequests(childId, FAMILY_ID, reader),
      { initialProps: { childId: 'child-1' } },
    );

    rerender({ childId: 'child-2' });
    await waitFor(() => expect(listOpenAdjustmentsForParent).toHaveBeenCalledTimes(2));

    // 現在才讓 child-1 的查詢回來，而且回一張卡。
    await act(async () => { releaseFirst?.([makeCard('stale-req')]); });

    expect(result.current.requests).toEqual([]);
  });

  it('確認時帶的 expectedPlanVersionId 是這張卡的 based-on 版本', async () => {
    const reader = makeReader();
    const { result } = renderHook(() =>
      useParentAdjustmentRequests('child-1', FAMILY_ID, reader));
    await waitFor(() => expect(result.current.requests).toHaveLength(1));

    await act(async () => { await result.current.accept(result.current.requests[0]); });

    expect(reader.acceptAdjustment).toHaveBeenCalledWith({
      schemaVersion: 1,
      adjustmentRequestId: 'req-1',
      expectedPlanVersionId: 'ver-1',
    });
  });

  it('確認成功後重讀清單，成功訊息說出真正寫進去的時段', async () => {
    const listOpenAdjustmentsForParent = jest.fn()
      .mockResolvedValueOnce([makeCard()])
      .mockResolvedValue([]);
    const reader = makeReader({ listOpenAdjustmentsForParent });
    const { result } = renderHook(() =>
      useParentAdjustmentRequests('child-1', FAMILY_ID, reader));
    await waitFor(() => expect(result.current.requests).toHaveLength(1));

    await act(async () => { await result.current.accept(result.current.requests[0]); });

    expect(result.current.requests).toEqual([]);
    expect(result.current.successMessage).toBe('已一起更新成晚餐後。');
  });

  it('確認失敗時卡片留著，訊息交給畫面', async () => {
    const reader = makeReader({
      acceptAdjustment: jest.fn(async () => ({
        ok: false as const,
        code: 'STALE_PLAN_VERSION' as const,
        message: '計畫剛剛更新過了',
      })),
    });
    const { result } = renderHook(() =>
      useParentAdjustmentRequests('child-1', FAMILY_ID, reader));
    await waitFor(() => expect(result.current.requests).toHaveLength(1));

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.accept(result.current.requests[0]); });

    expect(ok).toBe(false);
    expect(result.current.actionError).toBe('計畫剛剛更新過了');
    expect(result.current.requests).toHaveLength(1);
  });

  it('同一張卡連按兩次只會送一次 RPC', async () => {
    let releaseAccept: ((value: unknown) => void) | null = null;
    const acceptAdjustment = jest.fn(() =>
      new Promise(resolve => { releaseAccept = resolve; }));
    const reader = makeReader({
      acceptAdjustment: acceptAdjustment as unknown as ParentAdjustmentReader['acceptAdjustment'],
    });
    const { result } = renderHook(() =>
      useParentAdjustmentRequests('child-1', FAMILY_ID, reader));
    await waitFor(() => expect(result.current.requests).toHaveLength(1));

    const card = result.current.requests[0];
    act(() => { void result.current.accept(card); });
    await waitFor(() => expect(result.current.actingRequestId).toBe('req-1'));
    await act(async () => { await result.current.accept(card); });

    expect(acceptAdjustment).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseAccept?.({
        ok: true,
        adjustmentRequestId: 'req-1',
        proposalId: 'prop-1',
        planVersionId: 'ver-2',
        taskId: 'task-1',
        idempotentReplay: false,
      });
    });
  });

  it('「先維持原本」只呼叫 decline，不會順手呼叫 accept', async () => {
    const reader = makeReader();
    const { result } = renderHook(() =>
      useParentAdjustmentRequests('child-1', FAMILY_ID, reader));
    await waitFor(() => expect(result.current.requests).toHaveLength(1));

    await act(async () => { await result.current.decline(result.current.requests[0]); });

    expect(reader.declineAdjustment).toHaveBeenCalledWith({
      schemaVersion: 1,
      adjustmentRequestId: 'req-1',
    });
    expect(reader.acceptAdjustment).not.toHaveBeenCalled();
    expect(result.current.successMessage).toBe('先維持原本安排。');
  });

  it('讀取失敗時清空清單並保留錯誤訊息', async () => {
    const reader = makeReader({
      listOpenAdjustmentsForParent: jest.fn(async () => { throw new Error('讀不到'); }),
    });
    const { result } = renderHook(() =>
      useParentAdjustmentRequests('child-1', FAMILY_ID, reader));

    await waitFor(() => expect(result.current.error).toBe('讀不到'));
    expect(result.current.requests).toEqual([]);
  });
});
