import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ChildProposalPlanVersion, ParentProposalCardData } from '../../../../../lib/childProposal';
import { ParentProposalEditSheet } from '../ParentProposalEditSheet';

const card = {
  proposal: {
    id: 'proposal-1', status: 'proposed', current_plan_version_id: 'version-1',
  },
  currentPlanVersion: {
    id: 'version-1', proposal_id: 'proposal-1', authored_by: 'ai',
    cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 4, cadence_days: null,
    preferred_time: 'after_dinner', preferred_time_custom: null,
    completion_description: '完成一次 15 分鐘閱讀', duration_days: 14,
    reward_policy: 'coin_eligible', ai_suggested_coin_amount: 10,
  } as ChildProposalPlanVersion,
} as ParentProposalCardData;

describe('ParentProposalEditSheet', () => {
  it('只顯示 cadence、preferred time、completion description', () => {
    render(<ParentProposalEditSheet
      visible card={card} saving={false} error={null}
      onClose={jest.fn()} onSave={jest.fn()}
    />);
    expect(screen.getByText('調整一下')).toBeTruthy();
    expect(screen.getByText('一週幾次')).toBeTruthy();
    expect(screen.getByText('固定星期')).toBeTruthy();
    expect(screen.getByText('適合時間')).toBeTruthy();
    expect(screen.getByText('怎樣算完成')).toBeTruthy();
    expect(screen.queryByText(/計畫天數|成長幣|預估時間|任務分類|進度模式/)).toBeNull();
  });

  it('4→3 後送出完整 editable patch，不夾帶 readonly fields', () => {
    const onSave = jest.fn();
    render(<ParentProposalEditSheet
      visible card={card} saving={false} error={null}
      onClose={jest.fn()} onSave={onSave}
    />);
    fireEvent.changeText(screen.getByTestId('proposal-weekly-frequency-input'), '3');
    fireEvent.press(screen.getByText('存下來，讓孩子看看'));
    expect(onSave).toHaveBeenCalledWith({
      cadenceMode: 'weekly_frequency', cadenceWeeklyFrequency: 3, cadenceDays: null,
      preferredTime: 'after_dinner', preferredTimeCustom: null,
      completionDescription: '完成一次 15 分鐘閱讀',
    });
    expect(JSON.stringify(onSave.mock.calls)).not.toContain('duration');
    expect(JSON.stringify(onSave.mock.calls)).not.toContain('reward');
  });

  it('fixed days 與 custom time 有明確 controls；saving/error 不會被吞', () => {
    render(<ParentProposalEditSheet
      visible card={card} saving error="固定星期至少選一天"
      onClose={jest.fn()} onSave={jest.fn()}
    />);
    fireEvent.press(screen.getByText('固定星期'));
    expect(screen.getByText('週一')).toBeTruthy();
    fireEvent.press(screen.getByText('自訂時間'));
    expect(screen.getByTestId('proposal-preferred-time-custom-input')).toBeTruthy();
    expect(screen.getByText('固定星期至少選一天')).toBeTruthy();
    expect(screen.getByText('正在存下來…')).toBeTruthy();
  });

  it('原本未指定時間時沿用 canonical when_needed，不因只改 cadence 偷改成晚餐後', () => {
    const onSave = jest.fn();
    const withoutTime = {
      ...card,
      currentPlanVersion: { ...card.currentPlanVersion!, preferred_time: null },
    } as ParentProposalCardData;
    render(<ParentProposalEditSheet
      visible card={withoutTime} saving={false} error={null}
      onClose={jest.fn()} onSave={onSave}
    />);
    fireEvent.changeText(screen.getByTestId('proposal-weekly-frequency-input'), '3');
    fireEvent.press(screen.getByText('存下來，讓孩子看看'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      cadenceWeeklyFrequency: 3,
      preferredTime: 'when_needed',
      preferredTimeCustom: null,
    }));
  });
});
