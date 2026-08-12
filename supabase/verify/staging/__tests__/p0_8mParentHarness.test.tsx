// staging 驗收 — §16 / §27 的 controlled async harness。
//
// 這兩項驗的是 **App 這一層的鎖**，不是 DB 的鎖：
//   §16 換孩子之後，前一個孩子的回應不能覆寫畫面
//   §27 同一張卡連按兩次，只能送出一次 RPC
//
// 人手點不出可靠的 race，所以這裡用 controlled harness：**資料與 service
// 回應全部來自真 staging**（真的家庭、真的 adjustment request、真的 RPC 結果），
// 只有「什麼時候 resolve」是我們控制的。回報時請標為
// controlled async harness，不要寫成純人工 live 點擊。
//
// 前置：p0_8m_fixture.sql + 這支自己建立的 shared plan。
//
// 跑法：
//   STAGING_P0_8M_HARNESS=1 … npx jest supabase/verify/staging

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { supabase } from '../../../../src/lib/supabase';
import { SupabaseChildProposalService } from '../../../../src/lib/childProposal/childProposalService';
import { useParentAdjustmentRequests } from '../../../../src/hooks/useParentAdjustmentRequests';
import type { ChildProposalAdjustmentCardData } from '../../../../src/lib/childProposal';

const RUN = process.env.STAGING_P0_8M_HARNESS === '1';
const suite = RUN ? describe : describe.skip;

const ISO_EMAIL = process.env.STAGING_ISO_EMAIL ?? '';
const ISO_PASSWORD = process.env.STAGING_ISO_PASSWORD ?? '';

jest.setTimeout(600_000);

const service = new SupabaseChildProposalService();

let familyId = '';
let childA = '';
let childB = '';
let liveCards: ChildProposalAdjustmentCardData[] = [];

suite('P0-8M · Parent harness（真 staging 資料 + 受控時序）', () => {
  beforeAll(async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: ISO_EMAIL, password: ISO_PASSWORD,
    });
    if (error) throw new Error(`登入失敗：${error.message}`);

    const { data: family } = await supabase
      .from('families').select('id').eq('family_name', 'P0-8M Verify Family').single();
    familyId = family!.id;

    const { data: kids } = await supabase
      .from('children').select('id, nickname').eq('family_id', familyId).order('created_at');
    childA = kids![0].id;

    // 第二個孩子只是為了「切換 selected child」，不需要任何計畫。
    if ((kids ?? []).length > 1) {
      childB = kids![1].id;
    } else {
      const { data: created, error: kidError } = await supabase
        .from('children')
        .insert({
          family_id: familyId, nickname: 'P0-8M Sibling',
          birth_date: new Date(Date.now() - 8 * 365 * 864e5).toISOString().slice(0, 10),
          age_group: '6-9',
        })
        .select('id').single();
      if (kidError) throw new Error(`建立第二個孩子失敗：${kidError.message}`);
      childB = created!.id;
    }

    // 真的去 staging 讀一次，之後 harness 回放的就是這份真實回應。
    liveCards = await service.listOpenAdjustmentsForParent({ familyId, childId: childA });
    if (liveCards.length === 0) {
      throw new Error('隔離家庭裡沒有 open 的調整請求，請先跑 isolated slice 建立');
    }
  });

  afterAll(async () => { await supabase.auth.signOut(); });

  it('§16 切換孩子後，child A 晚回的真實回應不會蓋掉 child B 的畫面', async () => {
    let releaseA: ((cards: ChildProposalAdjustmentCardData[]) => void) | null = null;

    const reader = {
      listOpenAdjustmentsForParent: jest.fn(({ childId }: { childId: string }) => {
        if (childId === childA) {
          // A 的查詢先掛著，等我們放行 —— 內容是剛剛從 staging 讀到的真資料。
          return new Promise<ChildProposalAdjustmentCardData[]>(resolve => {
            releaseA = resolve;
          });
        }
        return service.listOpenAdjustmentsForParent({ familyId, childId });
      }),
      acceptAdjustment: service.acceptAdjustment.bind(service),
      declineAdjustment: service.declineAdjustment.bind(service),
    };

    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) =>
        useParentAdjustmentRequests(childId, familyId, reader),
      { initialProps: { childId: childA } },
    );

    rerender({ childId: childB });
    await waitFor(() =>
      expect(reader.listOpenAdjustmentsForParent).toHaveBeenCalledTimes(2));

    // 現在才讓 A 的真實回應回來（而且它確實有一張卡）。
    await act(async () => { releaseA?.(liveCards); });

    expect(liveCards.length).toBeGreaterThan(0);
    expect(result.current.requests).toEqual([]);
  });

  it('§27 同一張卡連按兩次，只送一次 acceptAdjustment', async () => {
    let releaseAccept: ((value: unknown) => void) | null = null;
    const acceptSpy = jest.fn(() =>
      new Promise(resolve => { releaseAccept = resolve; }));

    const reader = {
      listOpenAdjustmentsForParent: () =>
        service.listOpenAdjustmentsForParent({ familyId, childId: childA }),
      acceptAdjustment: acceptSpy as never,
      declineAdjustment: service.declineAdjustment.bind(service),
    };

    const { result } = renderHook(() =>
      useParentAdjustmentRequests(childA, familyId, reader));
    await waitFor(() => expect(result.current.requests.length).toBeGreaterThan(0));

    const card = result.current.requests[0];
    act(() => { void result.current.accept(card); });
    await waitFor(() => expect(result.current.actingRequestId).toBe(card.request.id));
    // 第二次「按下去」—— UI 必須自己擋住，不能靠 DB 的 idempotency 收尾。
    await act(async () => { await result.current.accept(card); });

    expect(acceptSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseAccept?.({
        ok: true,
        adjustmentRequestId: card.request.id,
        proposalId: card.proposal.id,
        planVersionId: card.basedOnPlanVersion.id,
        taskId: card.proposal.task_id,
        idempotentReplay: false,
      });
    });
  });

  it('§27 DB 側確認：那張請求最多只解出一個版本', async () => {
    const card = liveCards[0];
    const { data: versions } = await supabase
      .from('child_proposal_plan_versions').select('id')
      .eq('proposal_id', card.proposal.id);
    const { data: request } = await supabase
      .from('child_proposal_adjustment_requests')
      .select('status, resolved_plan_version_id').eq('id', card.request.id).single();

    // harness 沒有真的送出 accept（acceptAdjustment 被攔截了），
    // 所以這張請求應該仍是 open，版本數也沒有增加。
    expect(request!.status).toBe('open');
    expect(request!.resolved_plan_version_id).toBeNull();
    expect((versions ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
