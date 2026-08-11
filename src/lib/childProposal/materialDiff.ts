import type { ChildProposalPlanVersion } from './types';

export type ChildProposalMaterialField =
  | 'cadence'
  | 'preferred_time'
  | 'completion_description';

export type ChildProposalMaterialDiff = {
  field: ChildProposalMaterialField;
  label: string;
  before: string;
  after: string;
};

const DAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'] as const;

const PREFERRED_TIME_LABELS: Record<string, string> = {
  before_school: '上學前',
  after_school: '放學後',
  after_dinner: '晚餐後',
  before_bed: '睡覺前',
  weekend: '週末',
  when_needed: '需要時',
};

function normalizedDays(days: number[] | null): number[] {
  return [...new Set((days ?? []).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))]
    .sort((a, b) => a - b);
}

export function formatPlanCadence(plan: ChildProposalPlanVersion): string {
  if (plan.cadence_mode === 'weekly_frequency'
    && typeof plan.cadence_weekly_frequency === 'number') {
    return `一週 ${plan.cadence_weekly_frequency} 次`;
  }
  if (plan.cadence_mode === 'fixed_days') {
    const labels = normalizedDays(plan.cadence_days).map(day => DAY_LABELS[day]);
    if (labels.length > 0) return `每${labels.join('、')}`;
  }
  return '還沒決定';
}

export function formatPreferredTime(plan: ChildProposalPlanVersion): string {
  if (plan.preferred_time === 'custom') {
    return plan.preferred_time_custom?.trim() || '自訂時間';
  }
  if (!plan.preferred_time) return '還沒決定';
  return PREFERRED_TIME_LABELS[plan.preferred_time] ?? '自訂時間';
}

function completion(plan: ChildProposalPlanVersion): string {
  return plan.completion_description?.trim() || '還沒決定';
}

export function materialDiff(
  beforePlan: ChildProposalPlanVersion,
  afterPlan: ChildProposalPlanVersion,
): ChildProposalMaterialDiff[] {
  const pairs: Array<{
    field: ChildProposalMaterialField;
    label: string;
    before: string;
    after: string;
  }> = [
    {
      field: 'cadence',
      label: '每週安排',
      before: formatPlanCadence(beforePlan),
      after: formatPlanCadence(afterPlan),
    },
    {
      field: 'preferred_time',
      label: '適合時間',
      before: formatPreferredTime(beforePlan),
      after: formatPreferredTime(afterPlan),
    },
    {
      field: 'completion_description',
      label: '怎樣算完成',
      before: completion(beforePlan),
      after: completion(afterPlan),
    },
  ];

  return pairs.filter(item => item.before !== item.after);
}
