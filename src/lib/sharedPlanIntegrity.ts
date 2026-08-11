import { supabase } from './supabase';

export const SHARED_PLAN_GUARD_CODE = 'SHARED_PLAN_REQUIRES_RENEGOTIATION';
export const SHARED_PLAN_GUARD_MESSAGE = '這是一起確認的計畫，調整內容需要再一起確認。';

export class SharedPlanRequiresRenegotiationError extends Error {
  readonly code = SHARED_PLAN_GUARD_CODE;

  constructor() {
    super(SHARED_PLAN_GUARD_MESSAGE);
    this.name = 'SharedPlanRequiresRenegotiationError';
  }
}

function candidateText(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value instanceof Error) return [value.message];
  if (value == null || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  return [record.code, record.error, record.message, record.details]
    .filter((item): item is string => typeof item === 'string');
}

export function isSharedPlanGuardFailure(value: unknown): boolean {
  return candidateText(value).some(text => text.includes(SHARED_PLAN_GUARD_CODE));
}

export function normalizeSharedPlanGuardError(error: unknown): Error {
  if (isSharedPlanGuardFailure(error)) {
    return new SharedPlanRequiresRenegotiationError();
  }
  return error instanceof Error ? error : new Error(String(error));
}

export function assertSharedPlanMutationAllowed(isActiveSharedPlan: boolean): void {
  if (isActiveSharedPlan) throw new SharedPlanRequiresRenegotiationError();
}

export async function isActiveSharedPlanTask(taskId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('child_proposals')
    .select('id')
    .eq('task_id', taskId)
    .eq('status', 'active')
    .limit(1);

  if (error) throw new Error(error.message || '讀取共同計畫狀態失敗');
  return (data?.length ?? 0) > 0;
}
