export type CompleteTaskBody = {
  taskId: string;
  childId: string;
  completedDate: string;
  isPrerequisiteMet: boolean;
  goalId?: string;
};

export type HandlerInput = {
  method: string;
  authorization: string | null;
  body?: CompleteTaskBody;
};

export type HandlerResult = {
  status: number;
  body: Record<string, unknown>;
};

export type CompleteTaskRpc = (
  authorization: string,
  args: Record<string, unknown>,
) => Promise<{ data: Record<string, unknown> | null; error: { code?: string; message: string } | null }>;

export async function handleCompleteTaskRequest(
  input: HandlerInput,
  completeTask: CompleteTaskRpc,
  now: () => Date = () => new Date(),
): Promise<HandlerResult> {
  if (!input.authorization) {
    return { status: 401, body: { error: 'Missing authorization header' } };
  }

  const body = input.body;
  if (
    !body
    || typeof body.taskId !== 'string'
    || typeof body.childId !== 'string'
    || typeof body.completedDate !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(body.completedDate)
    || typeof body.isPrerequisiteMet !== 'boolean'
    || (body.goalId !== undefined && typeof body.goalId !== 'string')
  ) {
    return { status: 400, body: { error: 'Invalid request body' } };
  }

  const nowUtc = now();
  const taipeiHour = String((nowUtc.getUTCHours() + 8) % 24).padStart(2, '0');
  const taipeiMinute = String(nowUtc.getUTCMinutes()).padStart(2, '0');
  const completedAt = `${body.completedDate}T${taipeiHour}:${taipeiMinute}:00+08:00`;

  let rpcResult: Awaited<ReturnType<CompleteTaskRpc>>;
  try {
    rpcResult = await completeTask(input.authorization, {
      p_task_id: body.taskId,
      p_child_id: body.childId,
      p_completed_at: completedAt,
      p_is_prerequisite_met: body.isPrerequisiteMet,
      p_goal_id: body.goalId ?? null,
    });
  } catch (cause) {
    return {
      status: 400,
      body: { error: cause instanceof Error ? cause.message : 'Request failed' },
    };
  }

  const { data, error } = rpcResult;

  if (error) {
    return {
      status: error.code === '42501' ? 403 : 400,
      body: { error: error.message },
    };
  }

  if (data?.error === 'already_completed') {
    return {
      status: 409,
      body: {
        error: 'already_completed',
        message: '今天已經完成過這個任務了',
      },
    };
  }

  if (
    data?.error === 'task_inactive'
    || data?.error === 'task_not_assigned'
    || data?.error === 'invalid_goal'
    || data?.error === 'goal_inactive'
  ) {
    return { status: 409, body: { error: data.error } };
  }

  return { status: 200, body: data ?? {} };
}
