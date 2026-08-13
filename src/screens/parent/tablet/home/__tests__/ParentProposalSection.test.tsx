import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type {
  ChildProposal,
  ChildProposalPlanVersion,
  ParentProposalCardData,
} from '../../../../../lib/childProposal';
import { ParentProposalSection } from '../ParentProposalSection';

function proposal(id: string, overrides: Partial<ChildProposal> = {}): ChildProposal {
  return {
    id, family_id: 'family-1', child_id: 'child-1', status: 'proposed',
    child_original_goal: `想法 ${id}`, child_original_motivation: null,
    proposal_source: 'child', cadence_mode: null, cadence_weekly_frequency: null,
    cadence_days: null, preferred_time: null, preferred_time_custom: null,
    estimated_minutes: null, child_reward_preference: 'not_specified', child_note: null,
    current_plan_version_id: null, task_id: null, closed_reason: null, closed_at: null,
    proposed_at: null, activated_at: null, created_at: '2026-08-11T00:00:00Z',
    updated_at: '2026-08-11T00:00:00Z', ...overrides,
  };
}

function plan(proposalId: string, overrides: Partial<ChildProposalPlanVersion> = {}) {
  return {
    id: `version-${proposalId}`, proposal_id: proposalId, authored_by: 'ai',
    plan_title: '兩週閱讀挑戰', plan_summary: '用每週節奏完成一本書',
    purpose_category: 'D', completion_description: '完成一次約定的閱讀時段',
    progress_model: 'weekly_rhythm', next_step: '拿出想讀的書，先閱讀約 15 分鐘',
    cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 4, cadence_days: null,
    preferred_time: null, preferred_time_custom: null, estimated_minutes: 15,
    duration_type: 'long_term', duration_days: 14,
    reward_policy: 'coin_eligible', reward_eligibility: 'allowed',
    reward_policy_version: 'coin-policy-1.0.0', task_policy_version: 'task-taxonomy-2026-07',
    ai_suggested_coin_amount: 10, ...overrides,
  } as ChildProposalPlanVersion;
}

function card(id: string, withPlan = false): ParentProposalCardData {
  const version = withPlan ? plan(id) : null;
  return {
    proposal: proposal(id, { current_plan_version_id: version?.id ?? null }),
    currentPlanVersion: version,
  };
}

const base = {
  childName: '承恩', loading: false, error: null, onRetry: jest.fn(),
  onConfirm: jest.fn(), confirmingProposalId: null,
  confirmError: null, successMessage: null,
  onRevise: jest.fn(), onCloseProposal: jest.fn(), actingProposalId: null,
  actionError: null,
};

describe('ParentProposalSection', () => {
  it('空資料時整個 section 不佔首頁位置', () => {
    render(<ParentProposalSection {...base} proposals={[]} />);
    expect(screen.queryByTestId('parent-proposal-section')).toBeNull();
  });

  it('顯示 loading，讀取失敗時可以重試但不阻斷首頁', () => {
    const onRetry = jest.fn();
    const { rerender } = render(
      <ParentProposalSection {...base} proposals={[]} loading onRetry={onRetry} />,
    );
    expect(screen.getByText('正在看看孩子的新想法…')).toBeTruthy();
    rerender(<ParentProposalSection {...base} proposals={[]} error="讀取失敗" onRetry={onRetry} />);
    fireEvent.press(screen.getByText('再試一次'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('把孩子原話與精簡的 structured plan 分成三個有順序的決策帶', () => {
    const item = card('p1', true);
    item.proposal = proposal('p1', {
      current_plan_version_id: item.currentPlanVersion!.id,
      child_original_goal: '我想兩週把這本書讀完',
      child_original_motivation: '因為同學說這本書很好看',
      child_reward_preference: 'hopes_for_coin',
    });
    item.currentPlanVersion = plan('p1', { preferred_time: 'after_dinner' });
    const onConfirm = jest.fn();
    render(<ParentProposalSection {...base} proposals={[item]} onConfirm={onConfirm} />);

    expect(screen.getByTestId('proposal-card-p1')).toBeTruthy();
    expect(screen.getByTestId('proposal-child-voice-p1')).toBeTruthy();
    expect(screen.getByTestId('proposal-plan-p1')).toBeTruthy();
    expect(screen.getByTestId('proposal-decision-p1')).toBeTruthy();
    expect(screen.getByText('孩子的聲音')).toBeTruthy();
    expect(screen.getByText('我想兩週把這本書讀完')).toBeTruthy();
    expect(screen.getByText('因為同學說這本書很好看')).toBeTruthy();
    expect(screen.getByText('還沒決定，想一起討論')).toBeTruthy();
    expect(screen.getByText('希望如果適合，可以有成長幣鼓勵')).toBeTruthy();
    expect(screen.getByText('GrowBook 幫忙整理')).toBeTruthy();
    expect(screen.getByText('一週 4 次')).toBeTruthy();
    expect(screen.getByText('每次約 15 分鐘')).toBeTruthy();
    expect(screen.getByText('完成一次約定的閱讀時段')).toBeTruthy();
    expect(screen.getByText('晚餐後')).toBeTruthy();
    expect(screen.getByText('拿出想讀的書，先閱讀約 15 分鐘')).toBeTruthy();
    expect(screen.getByText('以每週節奏累積，不會因漏一天重新開始')).toBeTruthy();
    expect(screen.getByText('GrowBook 建議')).toBeTruthy();
    expect(screen.getByText('建議：每次完成 10 成長幣')).toBeTruthy();
    expect(screen.getByText('這樣開始，適合承恩嗎？')).toBeTruthy();
    fireEvent.press(screen.getByText('確認這個計畫'));
    expect(onConfirm).toHaveBeenCalledWith(item);
    expect(screen.queryByText(/核准|批准|審核通過|已核定/)).toBeNull();
  });

  it('把 plan summary 預設收起，並用可存取的 disclosure 展開與收合', () => {
    const item = card('p1', true);
    item.currentPlanVersion = plan('p1', {
      plan_summary: '先用短時間建立節奏，再依承恩的感受調整閱讀安排',
    });
    render(<ParentProposalSection {...base} proposals={[item]} />);

    expect(screen.queryByText('先用短時間建立節奏，再依承恩的感受調整閱讀安排')).toBeNull();
    const expandButton = screen.getByLabelText('展開為什麼這樣整理');
    expect(expandButton.props.accessibilityState).toEqual({ expanded: false });

    fireEvent.press(expandButton);

    expect(screen.getByText('先用短時間建立節奏，再依承恩的感受調整閱讀安排')).toBeTruthy();
    const collapseButton = screen.getByLabelText('收起為什麼這樣整理');
    expect(collapseButton.props.accessibilityState).toEqual({ expanded: true });

    fireEvent.press(collapseButton);
    expect(screen.queryByText('先用短時間建立節奏，再依承恩的感受調整閱讀安排')).toBeNull();
  });

  it('沒有完整 AI plan 時保留原話但不顯示 confirm CTA 或 fake plan', () => {
    render(<ParentProposalSection {...base} proposals={[card('p1')]} />);
    expect(screen.getByText('想法 p1')).toBeTruthy();
    expect(screen.getByText('GrowBook 還在整理，目前先看看孩子的原始想法')).toBeTruthy();
    expect(screen.queryByText('確認這個計畫')).toBeNull();
    expect(screen.queryByText('GrowBook 幫忙整理')).toBeNull();
  });

  it('confirm loading、success 與 typed error 都使用自然文案', () => {
    const item = card('p1', true);
    const { rerender } = render(
      <ParentProposalSection {...base} proposals={[item]} confirmingProposalId="p1" />,
    );
    expect(screen.getByText('正在建立共同計畫…')).toBeTruthy();
    expect(screen.queryByText('確認這個計畫')).toBeNull();

    rerender(<ParentProposalSection {...base} proposals={[item]} successMessage="已經一起確認好了" />);
    expect(screen.getByText('已經一起確認好了')).toBeTruthy();

    rerender(<ParentProposalSection {...base} proposals={[item]} confirmError="計畫已更新，請重新整理" />);
    expect(screen.getByText('計畫已更新，請重新整理')).toBeTruthy();
  });

  it('最多顯示三張', () => {
    render(<ParentProposalSection {...base} proposals={[
      card('p1'), card('p2'), card('p3'), card('p4'),
    ]} />);
    expect(screen.getByTestId('proposal-card-p1')).toBeTruthy();
    expect(screen.getByTestId('proposal-card-p2')).toBeTruthy();
    expect(screen.getByTestId('proposal-card-p3')).toBeTruthy();
    expect(screen.queryByTestId('proposal-card-p4')).toBeNull();
  });

  it('fresh AI plan 提供確認、調整與目前不適合三條窄路徑', () => {
    const item = card('p1', true);
    render(<ParentProposalSection {...base} proposals={[item]} />);
    expect(screen.getByText('確認這個計畫')).toBeTruthy();
    expect(screen.getByText('調整一下')).toBeTruthy();
    expect(screen.getByText('目前不適合')).toBeTruthy();
    expect(screen.getByText('這樣開始，適合承恩嗎？')).toBeTruthy();
    fireEvent.press(screen.getByText('調整一下'));
    expect(screen.getByTestId('proposal-weekly-frequency-input')).toBeTruthy();
  });

  it('parent revision 等孩子時不再顯示 confirm/edit，也不把舊 summary 當現況', () => {
    const item = card('p1', true);
    item.proposal = proposal('p1', {
      status: 'needs_child_review', current_plan_version_id: item.currentPlanVersion!.id,
    });
    item.currentPlanVersion = plan('p1', {
      authored_by: 'parent', requires_child_review: true,
      plan_summary: '舊文字仍寫一週 4 次', cadence_weekly_frequency: 3,
    });
    render(<ParentProposalSection {...base} proposals={[item]} />);
    expect(screen.getByText('等孩子看看新的安排是不是也想試試看')).toBeTruthy();
    expect(screen.getByText('一週 3 次')).toBeTruthy();
    expect(screen.queryByText('舊文字仍寫一週 4 次')).toBeNull();
    expect(screen.queryByText('確認這個計畫')).toBeNull();
    expect(screen.queryByText('調整一下')).toBeNull();
  });

  it('孩子想再聊聊時可重新調整，並把 typed action error 留在卡區', () => {
    const item = card('p1', true);
    item.currentPlanVersion = plan('p1', { authored_by: 'parent', requires_child_review: true });
    render(<ParentProposalSection {...base} proposals={[item]} actionError="計畫已更新，請重新整理" />);
    expect(screen.getAllByText('孩子想再一起聊聊')).toHaveLength(2);
    expect(screen.getByText('再調整一下')).toBeTruthy();
    expect(screen.getByText('計畫已更新，請重新整理')).toBeTruthy();
  });

  it('目前不適合 sheet 將 reason 與 exact card 傳給 callback', () => {
    const item = card('p1', true);
    const onCloseProposal = jest.fn();
    render(<ParentProposalSection {...base} proposals={[item]} onCloseProposal={onCloseProposal} />);
    fireEvent.press(screen.getByText('目前不適合'));
    fireEvent.press(screen.getByText('這個做法現在可能不太適合'));
    fireEvent.press(screen.getByText('先把這個想法收好'));
    expect(onCloseProposal).toHaveBeenCalledWith(item, '這個做法現在可能不太適合');
  });
});
