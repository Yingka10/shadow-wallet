import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ChildProposal } from '../../../../../lib/childProposal';
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

describe('ParentProposalSection', () => {
  it('空資料時整個 section 不佔首頁位置', () => {
    render(<ParentProposalSection childName="承恩" proposals={[]} loading={false} error={null} onRetry={jest.fn()} />);
    expect(screen.queryByTestId('parent-proposal-section')).toBeNull();
  });

  it('顯示 loading，讀取失敗時可以重試但不阻斷首頁', () => {
    const onRetry = jest.fn();
    const { rerender } = render(
      <ParentProposalSection childName="承恩" proposals={[]} loading error={null} onRetry={onRetry} />,
    );
    expect(screen.getByText('正在看看孩子的新想法…')).toBeTruthy();

    rerender(<ParentProposalSection childName="承恩" proposals={[]} loading={false} error="讀取失敗" onRetry={onRetry} />);
    expect(screen.getByText('孩子的新想法暫時讀不到')).toBeTruthy();
    fireEvent.press(screen.getByText('再試一次'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('最多顯示三張，保留原文、可選動機、節奏與孩子希望的回饋', () => {
    render(
      <ParentProposalSection
        childName="承恩"
        proposals={[
          proposal('p1', {
            child_original_goal: '我想兩週把這本書讀完',
            child_original_motivation: '因為同學說這本書很好看',
            cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 4,
            child_reward_preference: 'hopes_for_coin',
          }),
          proposal('p2'), proposal('p3'), proposal('p4'),
        ]}
        loading={false}
        error={null}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getAllByText('承恩有一個新的挑戰想法')).toHaveLength(3);
    expect(screen.getByText('我想兩週把這本書讀完')).toBeTruthy();
    expect(screen.getByText('因為同學說這本書很好看')).toBeTruthy();
    expect(screen.getByText('一週 4 次')).toBeTruthy();
    expect(screen.getByText('希望如果適合，可以有成長幣鼓勵')).toBeTruthy();
    expect(screen.queryByText('想法 p4')).toBeNull();
  });

  it('沒有 motivation 時不顯示原因空欄，也沒有審核、mutation 或 AI 假操作', () => {
    render(<ParentProposalSection childName="承恩" proposals={[proposal('p1')]} loading={false} error={null} onRetry={jest.fn()} />);
    expect(screen.queryByText('孩子為什麼想做')).toBeNull();
    expect(screen.queryByText(/核准|駁回|確認|建立任務|AI 建議/)).toBeNull();
    expect(screen.getByText('等你們一起看看')).toBeTruthy();
  });
});
