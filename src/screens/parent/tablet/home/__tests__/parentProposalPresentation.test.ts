import type { ChildProposal } from '../../../../../lib/childProposal';
import {
  formatProposalCadence,
  presentParentProposal,
} from '../parentProposalPresentation';

function proposal(overrides: Partial<ChildProposal> = {}): ChildProposal {
  return {
    id: 'proposal-1', family_id: 'family-1', child_id: 'child-1', status: 'proposed',
    child_original_goal: '我想兩週把這本書讀完',
    child_original_motivation: '因為同學說這本書很好看',
    proposal_source: 'child', cadence_mode: null, cadence_weekly_frequency: null,
    cadence_days: null, preferred_time: null, preferred_time_custom: null,
    estimated_minutes: null, child_reward_preference: 'not_specified', child_note: null,
    current_plan_version_id: null, task_id: null, closed_reason: null, closed_at: null,
    proposed_at: '2026-08-11T02:00:00Z', activated_at: null,
    created_at: '2026-08-11T02:00:00Z', updated_at: '2026-08-11T02:00:00Z',
    ...overrides,
  };
}

describe('formatProposalCadence', () => {
  it('weekly_frequency 顯示孩子實際填的每週次數', () => {
    expect(formatProposalCadence(proposal({
      cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 4,
    }))).toBe('一週 4 次');
  });

  it('fixed_days 依週一到週日排序、去重並忽略無效星期', () => {
    expect(formatProposalCadence(proposal({
      cadence_mode: 'fixed_days', cadence_days: [5, 1, 3, 1, 8],
    }))).toBe('每週一、週三、週五');
  });

  it('one_time 使用自然且不宣稱已完成的語言', () => {
    expect(formatProposalCadence(proposal({ cadence_mode: 'one_time' }))).toBe('想先試一次');
  });

  it('cadence 未決定或資料形狀不足時誠實 fallback', () => {
    expect(formatProposalCadence(proposal())).toBe('還沒決定，想一起討論');
    expect(formatProposalCadence(proposal({
      cadence_mode: 'weekly_frequency', cadence_weekly_frequency: null,
    }))).toBe('還沒決定，想一起討論');
    expect(formatProposalCadence(proposal({ cadence_mode: 'fixed_days', cadence_days: [] })))
      .toBe('還沒決定，想一起討論');
  });
});

describe('presentParentProposal', () => {
  it('保留孩子原文與動機，不需要 AI plan version', () => {
    expect(presentParentProposal(proposal(), '承恩')).toEqual(expect.objectContaining({
      id: 'proposal-1',
      title: '承恩有一個新的挑戰想法',
      goal: '我想兩週把這本書讀完',
      motivation: '因為同學說這本書很好看',
      statusLabel: '等你們一起看看',
    }));
  });

  it('空白 motivation 不製造空欄', () => {
    expect(presentParentProposal(proposal({ child_original_motivation: '   ' }), '承恩').motivation)
      .toBeNull();
  });

  it('hopes_for_coin 只描述孩子的希望，不映射成正式 policy 或核定幣值', () => {
    const result = presentParentProposal(proposal({
      child_reward_preference: 'hopes_for_coin',
    }), '承恩');

    expect(result.rewardHope).toBe('希望如果適合，可以有成長幣鼓勵');
    expect(JSON.stringify(result)).not.toContain('coin_eligible');
    expect(JSON.stringify(result)).not.toContain('已核定');
  });
});
