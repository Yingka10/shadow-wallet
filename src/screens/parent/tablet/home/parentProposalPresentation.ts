import { isDirectConfirmablePlan } from '../../../../lib/childProposal/directConfirm';
import type {
  ChildProposal,
  ChildProposalPlanVersion,
  ChildRewardPreference,
  ParentProposalCardData,
} from '../../../../lib/childProposal/types';

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
  planTitle: string | null;
  planSummary: string | null;
  planCadence: string | null;
  estimatedTime: string | null;
  completionDescription: string | null;
  nextStep: string | null;
  rhythmCopy: string | null;
  rewardSuggestion: string | null;
  rewardSuggestionLabel: string | null;
  canConfirm: boolean;
  waitingMessage: string | null;
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
  card: ParentProposalCardData,
  childName: string,
): ParentProposalViewModel {
  const { proposal, currentPlanVersion: plan } = card;
  const motivation = proposal.child_original_motivation?.trim();
  const canConfirm = isDirectConfirmablePlan(card);
  return {
    id: proposal.id,
    title: `${childName}有一個新的挑戰想法`,
    statusLabel: plan ? 'GrowBook 已經整理好' : '等你們一起看看',
    goal: proposal.child_original_goal,
    motivation: motivation ? motivation : null,
    cadence: formatProposalCadence(proposal),
    rewardHope: REWARD_HOPE_COPY[proposal.child_reward_preference],
    planTitle: plan?.plan_title ?? null,
    planSummary: plan?.plan_summary ?? null,
    planCadence: plan ? formatPlanCadence(plan) : null,
    estimatedTime: plan?.estimated_minutes
      ? `每次約 ${plan.estimated_minutes} 分鐘`
      : null,
    completionDescription: plan?.completion_description ?? null,
    nextStep: plan?.next_step ?? null,
    rhythmCopy: plan?.progress_model === 'weekly_rhythm'
      ? '以每週節奏累積，不會因漏一天重新開始'
      : null,
    rewardSuggestion:
      plan?.reward_policy === 'coin_eligible'
      && plan.reward_eligibility === 'allowed'
      && typeof plan.ai_suggested_coin_amount === 'number'
      && plan.ai_suggested_coin_amount > 0
        ? `建議：每次完成 ${plan.ai_suggested_coin_amount} 成長幣`
        : null,
    rewardSuggestionLabel: plan?.reward_policy === 'coin_eligible'
      && typeof plan.ai_suggested_coin_amount === 'number'
      ? 'GrowBook 建議'
      : null,
    canConfirm,
    waitingMessage: canConfirm
      ? null
      : 'GrowBook 還在整理，目前先看看孩子的原始想法',
  };
}

export function formatPlanCadence(plan: ChildProposalPlanVersion): string | null {
  if (plan.cadence_mode === 'weekly_frequency') {
    return typeof plan.cadence_weekly_frequency === 'number'
      ? `一週 ${plan.cadence_weekly_frequency} 次`
      : null;
  }
  if (plan.cadence_mode === 'fixed_days') {
    const selected = new Set(plan.cadence_days ?? []);
    const labels = WEEKDAY_ORDER.filter(day => selected.has(day)).map(day => WEEKDAYS[day]);
    return labels.length > 0 ? `每${labels.join('、')}` : null;
  }
  if (plan.cadence_mode === 'one_time') return '先完成一次';
  return null;
}
