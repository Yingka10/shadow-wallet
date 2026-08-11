import type { ChildProposal, ChildRewardPreference } from '../../../../lib/childProposal';

const UNDECIDED_CADENCE = '還沒決定，想一起討論';
const WEEKDAYS: Record<number, string> = {
  0: '週日', 1: '週一', 2: '週二', 3: '週三', 4: '週四', 5: '週五', 6: '週六',
};
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const REWARD_HOPE_COPY: Record<ChildRewardPreference, string> = {
  not_specified: '還沒決定，希望一起討論',
  just_record: '希望先把完成記錄下來',
  see_progress: '希望看得到自己的進度',
  hopes_for_coin: '希望如果適合，可以有成長幣鼓勵',
};

export type ParentProposalViewModel = {
  id: string;
  title: string;
  statusLabel: string;
  goal: string;
  motivation: string | null;
  cadence: string;
  rewardHope: string;
};

export function formatProposalCadence(proposal: ChildProposal): string {
  if (proposal.cadence_mode === 'weekly_frequency') {
    const frequency = proposal.cadence_weekly_frequency;
    return typeof frequency === 'number' && frequency >= 1 && frequency <= 7
      ? `一週 ${frequency} 次`
      : UNDECIDED_CADENCE;
  }

  if (proposal.cadence_mode === 'fixed_days') {
    const selected = new Set(
      (proposal.cadence_days ?? []).filter(day => Number.isInteger(day) && day >= 0 && day <= 6),
    );
    const labels = WEEKDAY_ORDER.filter(day => selected.has(day)).map(day => WEEKDAYS[day]);
    return labels.length > 0 ? `每${labels.join('、')}` : UNDECIDED_CADENCE;
  }

  if (proposal.cadence_mode === 'one_time') return '想先試一次';
  if (proposal.cadence_mode === 'plan_schedule') return '想照自己的計畫開始';
  return UNDECIDED_CADENCE;
}

export function presentParentProposal(
  proposal: ChildProposal,
  childName: string,
): ParentProposalViewModel {
  const motivation = proposal.child_original_motivation?.trim();
  return {
    id: proposal.id,
    title: `${childName}有一個新的挑戰想法`,
    statusLabel: '等你們一起看看',
    goal: proposal.child_original_goal,
    motivation: motivation ? motivation : null,
    cadence: formatProposalCadence(proposal),
    rewardHope: REWARD_HOPE_COPY[proposal.child_reward_preference],
  };
}
