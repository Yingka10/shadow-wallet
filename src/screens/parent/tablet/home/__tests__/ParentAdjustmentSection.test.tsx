// P0-8M — 家長首頁那張「孩子想調整閱讀時間」的卡。
//
// 驗兩件事：家長看到的差異來自 structured truth（不是自由文字、不是 raw enum），
// 以及兩個 CTA 真的接到 accept / decline，而且不會被連按成兩次。

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type {
  ChildProposal,
  ChildProposalAdjustmentCardData,
  ChildProposalAdjustmentRequest,
  ChildProposalPlanVersion,
} from '../../../../../lib/childProposal';
import { ParentAdjustmentSection } from '../ParentAdjustmentSection';

const VERSION_ID = 'ver-1';

function makeCard(
  overrides: {
    requestId?: string;
    requestedTime?: string | null;
    basedOnTime?: string | null;
    reason?: string;
  } = {},
): ChildProposalAdjustmentCardData {
  const {
    requestId = 'req-1',
    requestedTime = 'after_dinner',
    basedOnTime = 'before_bed',
    reason = '這週回顧後，我想改成晚餐後試試看。',
  } = overrides;

  return {
    request: {
      id: requestId,
      proposal_id: 'prop-1',
      status: 'open',
      adjustment_kind: 'preferred_time',
      based_on_plan_version_id: VERSION_ID,
      reason,
      requested_changes: requestedTime === null
        ? null
        : { preferredTime: requestedTime, preferredTimeCustom: null },
    } as unknown as ChildProposalAdjustmentRequest,
    proposal: {
      id: 'prop-1',
      status: 'active',
      current_plan_version_id: VERSION_ID,
    } as unknown as ChildProposal,
    basedOnPlanVersion: {
      id: VERSION_ID,
      proposal_id: 'prop-1',
      preferred_time: basedOnTime,
      preferred_time_custom: null,
      cadence_mode: 'weekly_frequency',
      cadence_weekly_frequency: 3,
      cadence_days: null,
      completion_description: '完成一次 15 分鐘的閱讀時段',
    } as unknown as ChildProposalPlanVersion,
  };
}

function renderSection(
  overrides: Partial<React.ComponentProps<typeof ParentAdjustmentSection>> = {},
) {
  const props: React.ComponentProps<typeof ParentAdjustmentSection> = {
    childName: '承恩',
    requests: [makeCard()],
    loading: false,
    error: null,
    onRetry: jest.fn(),
    onAccept: jest.fn(),
    onDecline: jest.fn(),
    actingRequestId: null,
    actionError: null,
    successMessage: null,
    ...overrides,
  };
  return { ...render(<ParentAdjustmentSection {...props} />), props };
}

describe('P0-8M · 家長端調整卡', () => {
  it('用孩子的名字說明這是誰提的', () => {
    renderSection();
    expect(screen.getByText('承恩想調整閱讀時間')).toBeTruthy();
  });

  it('顯示的差異是「睡覺前 → 晚餐後」，不是 raw enum', () => {
    renderSection();

    expect(screen.getByText('適合時間')).toBeTruthy();
    expect(screen.getByText('睡覺前')).toBeTruthy();
    expect(screen.getByText('晚餐後')).toBeTruthy();
    expect(screen.queryByText(/before_bed|after_dinner/)).toBeNull();
  });

  it('只列有變動的欄位 —— 沒改的每週安排與完成標準不出現', () => {
    renderSection();

    expect(screen.queryByText('每週安排')).toBeNull();
    expect(screen.queryByText('怎樣算完成')).toBeNull();
    expect(screen.queryByText(/幣|獎勵/)).toBeNull();
  });

  it('顯示孩子自己說的原因', () => {
    renderSection();
    expect(screen.getByText('這週回顧後，我想改成晚餐後試試看。')).toBeTruthy();
  });

  it('「確認這個調整」呼叫 onAccept，帶的是這張卡', () => {
    const onAccept = jest.fn();
    const card = makeCard();
    renderSection({ onAccept, requests: [card] });

    fireEvent.press(screen.getByRole('button', { name: '確認這個調整' }));
    expect(onAccept).toHaveBeenCalledWith(card);
  });

  it('「先維持原本」呼叫 onDecline，語氣不是拒絕孩子', () => {
    const onDecline = jest.fn();
    const card = makeCard();
    renderSection({ onDecline, requests: [card] });

    const cta = screen.getByRole('button', { name: '先維持原本' });
    fireEvent.press(cta);
    expect(onDecline).toHaveBeenCalledWith(card);
    expect(screen.queryByText(/拒絕|不同意|駁回/)).toBeNull();
  });

  it('動作進行中收起兩個 CTA，連按不會送出第二次', () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    renderSection({ onAccept, onDecline, actingRequestId: 'req-1' });

    expect(screen.queryByRole('button', { name: '確認這個調整' })).toBeNull();
    expect(screen.queryByRole('button', { name: '先維持原本' })).toBeNull();
    expect(onAccept).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
  });

  it('另一張卡在處理中時，這張卡的 CTA 也按不動', () => {
    const onAccept = jest.fn();
    renderSection({
      onAccept,
      requests: [makeCard({ requestId: 'req-1' }), makeCard({ requestId: 'req-2' })],
      actingRequestId: 'req-2',
    });

    fireEvent.press(screen.getByRole('button', { name: '確認這個調整' }));
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('沒有請求時整區安靜消失', () => {
    renderSection({ requests: [] });
    expect(screen.queryByTestId('parent-adjustment-section')).toBeNull();
  });

  it('確認成功後 hook 會把卡移走，這一區就跟著消失（只剩成功訊息）', () => {
    renderSection({ requests: [], successMessage: '已一起更新成晚餐後。' });

    expect(screen.getByText('已一起更新成晚餐後。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '確認這個調整' })).toBeNull();
  });

  it('確認失敗時卡片留著，讓家長可以再試一次', () => {
    renderSection({ actionError: '計畫剛剛更新過了' });

    expect(screen.getByText('計畫剛剛更新過了')).toBeTruthy();
    expect(screen.getByRole('button', { name: '確認這個調整' })).toBeTruthy();
  });

  it('requested_changes 讀不出時段就不畫卡 —— 不顯示一張看不懂的差異', () => {
    renderSection({ requests: [makeCard({ requestedTime: null })] });
    expect(screen.queryByTestId('parent-adjustment-section')).toBeNull();
  });

  it('要求的時段其實和現況一樣時也不畫卡', () => {
    renderSection({
      requests: [makeCard({ requestedTime: 'before_bed', basedOnTime: 'before_bed' })],
    });
    expect(screen.queryByTestId('parent-adjustment-section')).toBeNull();
  });
});
