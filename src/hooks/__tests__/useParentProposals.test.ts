import { act, renderHook, waitFor } from '@testing-library/react-native';
import type {
  ChildProposal,
  ParentProposalCardData,
  ParentProposalMaterialEdits,
} from '../../lib/childProposal';
import { useParentProposals, type ParentProposalReader } from '../useParentProposals';

jest.mock('../../lib/supabase', () => ({ supabase: {} }));

function proposal(id: string, childId: string): ChildProposal {
  return {
    id, family_id: 'family-1', child_id: childId, status: 'proposed',
    child_original_goal: `goal-${id}`, child_original_motivation: null,
    proposal_source: 'child', cadence_mode: null, cadence_weekly_frequency: null,
    cadence_days: null, preferred_time: null, preferred_time_custom: null,
    estimated_minutes: null, child_reward_preference: 'not_specified', child_note: null,
    current_plan_version_id: null, task_id: null, closed_reason: null, closed_at: null,
    proposed_at: null, activated_at: null, created_at: '2026-08-11T00:00:00Z',
    updated_at: '2026-08-11T00:00:00Z',
  };
}

function card(id: string, childId: string): ParentProposalCardData {
  return { proposal: proposal(id, childId), currentPlanVersion: null };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const edits: ParentProposalMaterialEdits = {
  cadenceMode: 'weekly_frequency', cadenceWeeklyFrequency: 3, cadenceDays: null,
  preferredTime: 'after_dinner', preferredTimeCustom: null,
  completionDescription: '完成一次閱讀時段',
};

describe('useParentProposals', () => {
  it('提供 loading、資料與手動 refresh', async () => {
    const first = deferred<ParentProposalCardData[]>();
    const reader: ParentProposalReader = { listProposedForParent: jest.fn(() => first.promise) };
    const { result } = renderHook(() => useParentProposals('child-a', 'family-1', reader));

    expect(result.current.loading).toBe(true);
    act(() => first.resolve([card('p-a', 'child-a')]));
    await waitFor(() => expect(result.current.proposals).toHaveLength(1));
    expect(result.current.loading).toBe(false);

    await act(async () => { await result.current.refresh(); });
    expect(reader.listProposedForParent).toHaveBeenCalledTimes(2);
  });

  it('錯誤可顯示且不保留舊資料', async () => {
    const reader: ParentProposalReader = {
      listProposedForParent: jest.fn().mockRejectedValue(new Error('讀取失敗')),
    };
    const { result } = renderHook(() => useParentProposals('child-a', 'family-1', reader));

    await waitFor(() => expect(result.current.error).toBe('讀取失敗'));
    expect(result.current.proposals).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('selected child 改變後以新 child/family 重新讀取', async () => {
    const reader: ParentProposalReader = {
      listProposedForParent: jest.fn(({ childId }) =>
        Promise.resolve([card(`p-${childId}`, childId)])),
    };
    const { result, rerender } = renderHook<
      ReturnType<typeof useParentProposals>,
      { childId: string }
    >(
      ({ childId }: { childId: string }) => useParentProposals(childId, 'family-1', reader),
      { initialProps: { childId: 'child-a' } },
    );
    await waitFor(() => expect(result.current.proposals[0]?.proposal.child_id).toBe('child-a'));

    rerender({ childId: 'child-b' });
    await waitFor(() => expect(result.current.proposals[0]?.proposal.child_id).toBe('child-b'));
    expect(reader.listProposedForParent).toHaveBeenLastCalledWith({
      childId: 'child-b', familyId: 'family-1', limit: 3,
    });
  });

  it('較慢的上一個孩子回應不會蓋掉目前孩子', async () => {
    const a = deferred<ParentProposalCardData[]>();
    const reader: ParentProposalReader = {
      listProposedForParent: jest.fn(({ childId }) => childId === 'child-a'
        ? a.promise
        : Promise.resolve([card('p-b', 'child-b')]))
    };
    const { result, rerender } = renderHook<
      ReturnType<typeof useParentProposals>,
      { childId: string }
    >(
      ({ childId }: { childId: string }) => useParentProposals(childId, 'family-1', reader),
      { initialProps: { childId: 'child-a' } },
    );

    rerender({ childId: 'child-b' });
    await waitFor(() => expect(result.current.proposals[0]?.proposal.id).toBe('p-b'));
    act(() => a.resolve([card('p-a', 'child-a')]));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.proposals[0]?.proposal.id).toBe('p-b');
  });

  it('confirm 時提供 loading，成功後 refresh 讓 proposed card 消失', async () => {
    const item = card('p-a', 'child-a');
    const confirm = deferred<{ ok: true; taskId: string }>();
    const reader: ParentProposalReader = {
      listProposedForParent: jest.fn()
        .mockResolvedValueOnce([item])
        .mockResolvedValueOnce([]),
      confirmDirect: jest.fn(() => confirm.promise as never),
    };
    const { result } = renderHook(() =>
      useParentProposals('child-a', 'family-1', reader, '6-9'));
    await waitFor(() => expect(result.current.proposals).toHaveLength(1));

    let pending!: Promise<unknown>;
    act(() => { pending = result.current.confirmProposal(item); });
    expect(result.current.confirmingProposalId).toBe('p-a');

    await act(async () => {
      confirm.resolve({ ok: true, taskId: 'task-1' });
      await pending;
    });
    expect(reader.confirmDirect).toHaveBeenCalledWith(item, '6-9');
    expect(result.current.proposals).toEqual([]);
    expect(result.current.successMessage).toBe('已經一起確認好了');
    expect(result.current.confirmingProposalId).toBeNull();
  });

  it('typed confirm failure 保留訊息，不把 card 當成功移除', async () => {
    const item = card('p-a', 'child-a');
    const reader: ParentProposalReader = {
      listProposedForParent: jest.fn().mockResolvedValue([item]),
      confirmDirect: jest.fn().mockResolvedValue({
        ok: false, code: 'STALE_PLAN_VERSION', message: '計畫已更新，請重新整理',
      }),
    };
    const { result } = renderHook(() =>
      useParentProposals('child-a', 'family-1', reader, '6-9'));
    await waitFor(() => expect(result.current.proposals).toHaveLength(1));

    await act(async () => { await result.current.confirmProposal(item); });
    expect(result.current.confirmError).toBe('計畫已更新，請重新整理');
    expect(result.current.proposals).toHaveLength(1);
  });

  it('revise 提供 pending/typed error，成功才 refresh', async () => {
    const item = card('p-a', 'child-a');
    const save = deferred<{ ok: true; planVersionId: string }>();
    const reader: ParentProposalReader = {
      listProposedForParent: jest.fn()
        .mockResolvedValueOnce([item])
        .mockResolvedValueOnce([]),
      revisePlan: jest.fn(() => save.promise as never),
    };
    const { result } = renderHook(() =>
      useParentProposals('child-a', 'family-1', reader, '6-9'));
    await waitFor(() => expect(result.current.proposals).toHaveLength(1));

    let pending!: Promise<boolean>;
    act(() => { pending = result.current.reviseProposal(item, edits); });
    expect(result.current.actingProposalId).toBe('p-a');
    await act(async () => {
      save.resolve({ ok: true, planVersionId: 'parent-v' });
      await pending;
    });
    expect(reader.revisePlan).toHaveBeenCalledWith(item, edits);
    expect(result.current.proposals).toEqual([]);
    expect(result.current.successMessage).toBe('已存下來，等孩子看看');
    expect(result.current.actingProposalId).toBeNull();
  });

  it('NO_MATERIAL_CHANGE 顯示 typed message，不假裝 refresh 成功', async () => {
    const item = card('p-a', 'child-a');
    const reader: ParentProposalReader = {
      listProposedForParent: jest.fn().mockResolvedValue([item]),
      revisePlan: jest.fn().mockResolvedValue({
        ok: false, code: 'NO_MATERIAL_CHANGE', message: '這些安排和目前計畫一樣',
      }),
    };
    const { result } = renderHook(() =>
      useParentProposals('child-a', 'family-1', reader, '6-9'));
    await waitFor(() => expect(result.current.proposals).toHaveLength(1));
    await act(async () => { await result.current.reviseProposal(item, edits); });
    expect(result.current.actionError).toBe('這些安排和目前計畫一樣');
    expect(reader.listProposedForParent).toHaveBeenCalledTimes(1);
  });

  it('close 成功 refresh；切換孩子後舊 action completion 不覆蓋新畫面', async () => {
    const a = card('p-a', 'child-a');
    const close = deferred<{ ok: true; proposalId: string }>();
    const reader: ParentProposalReader = {
      listProposedForParent: jest.fn(({ childId }) => Promise.resolve(
        childId === 'child-a' ? [a] : [card('p-b', 'child-b')],
      )),
      closeUnsuitable: jest.fn(() => close.promise as never),
    };
    const { result, rerender } = renderHook<
      ReturnType<typeof useParentProposals>, { childId: string }
    >(
      ({ childId }) => useParentProposals(childId, 'family-1', reader, '6-9'),
      { initialProps: { childId: 'child-a' } },
    );
    await waitFor(() => expect(result.current.proposals[0]?.proposal.id).toBe('p-a'));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.closeProposal(a, '最近安排比較滿'); });
    rerender({ childId: 'child-b' });
    await waitFor(() => expect(result.current.proposals[0]?.proposal.id).toBe('p-b'));
    await act(async () => {
      close.resolve({ ok: true, proposalId: 'p-a' });
      await pending;
    });
    expect(result.current.successMessage).toBeNull();
    expect(result.current.proposals[0]?.proposal.id).toBe('p-b');
  });

  it('切換孩子後立即清掉舊卡，不能在新 read 完成前操作上一個孩子', async () => {
    const nextRead = deferred<ParentProposalCardData[]>();
    const reader: ParentProposalReader = {
      listProposedForParent: jest.fn(({ childId }) => childId === 'child-a'
        ? Promise.resolve([card('p-a', 'child-a')])
        : nextRead.promise),
    };
    const { result, rerender } = renderHook<
      ReturnType<typeof useParentProposals>, { childId: string }
    >(
      ({ childId }) => useParentProposals(childId, 'family-1', reader),
      { initialProps: { childId: 'child-a' } },
    );
    await waitFor(() => expect(result.current.proposals[0]?.proposal.id).toBe('p-a'));
    rerender({ childId: 'child-b' });
    expect(result.current.proposals).toEqual([]);
    expect(result.current.loading).toBe(true);
    await act(async () => { nextRead.resolve([card('p-b', 'child-b')]); });
    await waitFor(() => expect(result.current.proposals[0]?.proposal.id).toBe('p-b'));
  });

  it('缺 child 或 family 時不查詢並呈現空狀態', () => {
    const reader: ParentProposalReader = { listProposedForParent: jest.fn() };
    const { result } = renderHook(() => useParentProposals(null, null, reader));
    expect(result.current).toMatchObject({ proposals: [], loading: false, error: null });
    expect(reader.listProposedForParent).not.toHaveBeenCalled();
  });
});
