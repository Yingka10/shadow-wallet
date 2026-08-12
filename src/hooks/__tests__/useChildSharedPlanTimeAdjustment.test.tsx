// P0-8M — 孩子端送出換時段的 hook。
//
// 這裡驗的是「同一次送出」的定義：重試必須是同一件事，成功之後才換新的一件事。
// 換 id 的重試在 DB 那端會變成第二筆請求，而那正是 clientRequestId 要防的事。

import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  buildTimeAdjustmentReason,
  useChildSharedPlanTimeAdjustment,
  type ChildSharedPlanAdjustmentReader,
} from '../useChildSharedPlanTimeAdjustment';
import type {
  ChildProposal,
  ChildProposalAdjustmentRequest,
  ChildProposalPlanVersion,
  ChildSharedPlanContext,
} from '../../lib/childProposal';

const PROPOSAL_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';
const CHILD_ID = '44444444-4444-4444-8444-444444444444';

function makeContext(
  overrides: Partial<ChildSharedPlanContext> = {},
): ChildSharedPlanContext {
  return {
    proposal: {
      id: PROPOSAL_ID,
      status: 'active',
      current_plan_version_id: VERSION_ID,
    } as unknown as ChildProposal,
    currentPlanVersion: {
      id: VERSION_ID,
      proposal_id: PROPOSAL_ID,
      preferred_time: 'before_bed',
      preferred_time_custom: null,
    } as unknown as ChildProposalPlanVersion,
    openPreferredTimeRequest: null,
    ...overrides,
  };
}

function makeReader(
  overrides: Partial<ChildSharedPlanAdjustmentReader> = {},
): ChildSharedPlanAdjustmentReader {
  return {
    getActiveSharedPlanForTask: jest.fn(async () => makeContext()),
    createAdjustmentRequest: jest.fn(async () => ({
      ok: true as const,
      adjustmentRequestId: '55555555-5555-4555-8555-555555555555',
      status: 'open' as const,
      idempotentReplay: false,
    })),
    ...overrides,
  } as ChildSharedPlanAdjustmentReader;
}

function renderAdjustment(reader: ChildSharedPlanAdjustmentReader) {
  return renderHook(() =>
    useChildSharedPlanTimeAdjustment(TASK_ID, CHILD_ID, reader));
}

describe('useChildSharedPlanTimeAdjustment', () => {
  it('讀到進行中的共同計畫後，換一個時段是可以送的', async () => {
    const { result } = renderAdjustment(makeReader());

    await waitFor(() => expect(result.current.sharedPlan).not.toBeNull());
    expect(result.current.currentPreferredTime).toBe('before_bed');
    expect(result.current.canSubmit('after_dinner')).toBe(true);
    expect(result.current.canSubmit('before_bed')).toBe(false);
    expect(result.current.canSubmit(null)).toBe(false);
  });

  it('讀不到共同計畫時安靜降級，不把畫面變成錯誤狀態', async () => {
    const reader = makeReader({
      getActiveSharedPlanForTask: jest.fn(async () => null),
    });
    const { result } = renderAdjustment(reader);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sharedPlan).toBeNull();
    expect(result.current.canSubmit('after_dinner')).toBe(false);
  });

  it('reader 直接丟例外時同樣降級成「不能協商」', async () => {
    const reader = makeReader({
      getActiveSharedPlanForTask: jest.fn(async () => { throw new Error('boom'); }),
    });
    const { result } = renderAdjustment(reader);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sharedPlan).toBeNull();
  });

  it('送出的命令帶的是 current_plan_version_id 與孩子選的時段', async () => {
    const reader = makeReader();
    const { result } = renderAdjustment(reader);
    await waitFor(() => expect(result.current.sharedPlan).not.toBeNull());

    await act(async () => { await result.current.submit('after_dinner'); });

    expect(reader.createAdjustmentRequest).toHaveBeenCalledTimes(1);
    const command = (reader.createAdjustmentRequest as jest.Mock).mock.calls[0][0];
    expect(command).toMatchObject({
      schemaVersion: 1,
      proposalId: PROPOSAL_ID,
      expectedPlanVersionId: VERSION_ID,
      adjustmentKind: 'preferred_time',
      requestedChanges: { preferredTime: 'after_dinner', preferredTimeCustom: null },
    });
    expect(command.reason).toBe(buildTimeAdjustmentReason('after_dinner'));
    expect(typeof command.clientRequestId).toBe('string');
  });

  it('重試沿用同一個 clientRequestId；成功之後才換新的', async () => {
    const createAdjustmentRequest = jest.fn()
      .mockResolvedValueOnce({
        ok: false, code: 'UNKNOWN', message: '網路不太穩',
      })
      .mockResolvedValue({
        ok: true, adjustmentRequestId: 'req-1', status: 'open', idempotentReplay: false,
      });
    const reader = makeReader({ createAdjustmentRequest });
    const { result } = renderAdjustment(reader);
    await waitFor(() => expect(result.current.sharedPlan).not.toBeNull());

    await act(async () => { await result.current.submit('after_dinner'); });
    await act(async () => { await result.current.submit('after_dinner'); });

    const first = createAdjustmentRequest.mock.calls[0][0].clientRequestId;
    const retry = createAdjustmentRequest.mock.calls[1][0].clientRequestId;
    expect(retry).toBe(first);

    // 送出成功之後這一件事結束了；下一次調整必須是新的識別碼，
    // 否則 RPC 會把它當成剛才那一筆的重播而不新增。
    await act(async () => { await result.current.submit('after_dinner'); });
    expect(createAdjustmentRequest).toHaveBeenCalledTimes(3);
    expect(createAdjustmentRequest.mock.calls[2][0].clientRequestId).not.toBe(first);
  });

  it('已經有 open 請求時不送第二次', async () => {
    const reader = makeReader({
      getActiveSharedPlanForTask: jest.fn(async () => makeContext({
        openPreferredTimeRequest: {
          id: 'open-1', status: 'open',
        } as unknown as ChildProposalAdjustmentRequest,
      })),
    });
    const { result } = renderAdjustment(reader);
    await waitFor(() => expect(result.current.hasOpenRequest).toBe(true));

    expect(result.current.canSubmit('after_dinner')).toBe(false);
    await act(async () => { await result.current.submit('after_dinner'); });
    expect(reader.createAdjustmentRequest).not.toHaveBeenCalled();
  });

  it('選到和現況一樣的時段不會送出', async () => {
    const reader = makeReader();
    const { result } = renderAdjustment(reader);
    await waitFor(() => expect(result.current.sharedPlan).not.toBeNull());

    await act(async () => { await result.current.submit('before_bed'); });
    expect(reader.createAdjustmentRequest).not.toHaveBeenCalled();
  });

  it('RPC 回失敗時把訊息留給畫面，並且不宣稱送出成功', async () => {
    const reader = makeReader({
      createAdjustmentRequest: jest.fn(async () => ({
        ok: false as const,
        code: 'STALE_PLAN_VERSION' as const,
        message: '計畫剛剛更新過了',
      })),
    });
    const { result } = renderAdjustment(reader);
    await waitFor(() => expect(result.current.sharedPlan).not.toBeNull());

    let sent: boolean | undefined;
    await act(async () => { sent = await result.current.submit('after_dinner'); });

    expect(sent).toBe(false);
    expect(result.current.submitError).toBe('計畫剛剛更新過了');
    expect(result.current.justSubmitted).toBe(false);
  });

  it('孩子的原因說的就是他剛剛選的時段，不是別的內容', () => {
    expect(buildTimeAdjustmentReason('after_dinner'))
      .toBe('這週回顧後，我想改成晚餐後試試看。');
    expect(buildTimeAdjustmentReason('before_bed'))
      .toBe('這週回顧後，我想改成睡前試試看。');
  });
});
