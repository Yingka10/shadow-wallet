import { isDirectConfirmablePlan } from '../../../../lib/childProposal/directConfirm';
import {
  childPlanSharedDecisions,
  isChildPlanDirectConfirmable,
  resolveConfirmRoute,
} from '../../../../lib/childPlanning/parentAgreement';
import { formatPreferredTime } from '../../../../lib/childProposal/materialDiff';
import { childPlanCardSummary, sharedDecisionLabels } from './childPlanSummary';
import type { ChildPlanCardSummary } from './childPlanSummary';
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
  state:
    | 'fresh_ai'
    | 'waiting_child'
    | 'child_revisit'
    /** P1：孩子自己規劃並確認過的完整安排，等家長同意。 */
    | 'child_plan'
    /** P1：孩子的安排成立，但還有家庭共同條件要一起決定（A4B）。 */
    | 'child_plan_needs_terms'
    | 'unready';
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
  preferredTime: string | null;
  nextStep: string | null;
  rhythmCopy: string | null;
  rewardSuggestion: string | null;
  rewardSuggestionLabel: string | null;
  canConfirm: boolean;
  waitingMessage: string | null;

  // ── P1-A4A ────────────────────────────────────────────────────────────
  /**
   * 孩子確認過的計畫。**只有 P1 版本才有值。**
   *
   * 它與下面那些扁平欄位（planTitle / planCadence…）是兩半：
   * 這一半是「孩子想怎麼做」，那一半是「家庭要一起約定什麼」。
   * 家長要看得出來哪些是孩子決定的、哪些是現在要一起談的。
   */
  childPlan: ChildPlanCardSummary | null;
  /** 還要一起補充的安排，家長讀得懂的說法。空陣列＝沒有。 */
  sharedDecisions: string[];
  /** 主要按鈕的字。P1 是「確認這份約定」，不是「採用 AI 建議」。 */
  confirmLabel: string;
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
  const route = resolveConfirmRoute(card);

  // P1 與 legacy 是兩條線。canConfirm 只在自己那一條上有意義 ——
  // 用一個布林同時代表兩種確認，之後每個讀它的人都要再問一次「哪一種」。
  const isChildPlan = route === 'child_planning_plan';
  const pending = childPlanSharedDecisions(plan);
  const childPlanReady = isChildPlan && isChildPlanDirectConfirmable(card);
  const canConfirm = isChildPlan ? childPlanReady : isDirectConfirmablePlan(card);

  const isParentReview = plan?.authored_by === 'parent' && plan.requires_child_review === true;
  const state: ParentProposalViewModel['state'] =
    proposal.status === 'needs_child_review' && isParentReview
      ? 'waiting_child'
      : proposal.status === 'proposed' && isParentReview
        ? 'child_revisit'
        : isChildPlan
          ? (childPlanReady ? 'child_plan' : 'child_plan_needs_terms')
          : canConfirm
            ? 'fresh_ai'
            : 'unready';
  const statusLabel = state === 'waiting_child'
    ? '等孩子看看'
    : state === 'child_revisit'
      ? '孩子想再一起聊聊'
      : state === 'child_plan'
        ? '孩子已經想好怎麼做'
        : state === 'child_plan_needs_terms'
          ? '還有安排要一起補充'
          : plan ? 'GrowBook 已經整理好' : '等你們一起看看';
  const waitingMessage = state === 'waiting_child'
    ? '等孩子看看新的安排是不是也想試試看'
    : state === 'child_revisit'
      ? '孩子想再一起聊聊'
      : state === 'child_plan'
        ? null
        : state === 'child_plan_needs_terms'
          // 不說「還不能確認」—— 孩子把「怎麼做到」想得很清楚，
          // 缺的是家庭共同條件，而那本來就不該由他一個人決定。
          ? '孩子的想法已經很完整，還有幾件要一起說定'
          : canConfirm ? null : 'GrowBook 還在整理，目前先看看孩子的原始想法';
  return {
    state,
    childPlan: isChildPlan ? childPlanCardSummary(plan) : null,
    sharedDecisions: sharedDecisionLabels(pending),
    confirmLabel: isChildPlan ? '確認這份約定' : '確認這個計畫',
    id: proposal.id,
    title: `${childName}有一個新的挑戰想法`,
    statusLabel,
    goal: proposal.child_original_goal,
    motivation: motivation ? motivation : null,
    cadence: formatProposalCadence(proposal),
    rewardHope: REWARD_HOPE_COPY[proposal.child_reward_preference],
    planTitle: plan?.plan_title ?? null,
    // Parent revision 保留 summary 作 provenance，但 current authority 只看 structured fields。
    planSummary: state === 'fresh_ai' || state === 'child_plan'
      ? plan?.plan_summary ?? null
      : null,
    planCadence: plan ? formatPlanCadence(plan) : null,
    estimatedTime: plan?.estimated_minutes
      ? `每次約 ${plan.estimated_minutes} 分鐘`
      : null,
    completionDescription: plan?.completion_description ?? null,
    preferredTime: plan ? formatPreferredTime(plan) : null,
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
    waitingMessage,
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
