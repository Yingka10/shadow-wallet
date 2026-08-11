import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CompleteTaskRpc,
  handleCompleteTaskRequest,
} from '../handler';

const validBody = {
  taskId: 'task-1',
  childId: 'child-1',
  completedDate: '2026-08-11',
  isPrerequisiteMet: true,
  goalId: 'goal-1',
};

describe('complete-task Edge handler', () => {
  it('rejects a missing caller JWT without invoking the RPC', async () => {
    const rpc = jest.fn() as jest.MockedFunction<CompleteTaskRpc>;

    await expect(handleCompleteTaskRequest({ method: 'POST', authorization: null, body: validBody }, rpc))
      .resolves.toEqual({ status: 401, body: { error: 'Missing authorization header' } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes the exact caller JWT and canonical arguments to the RPC', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { completionId: 'completion-1', coinEarned: 3 },
      error: null,
    }) as jest.MockedFunction<CompleteTaskRpc>;

    const result = await handleCompleteTaskRequest(
      { method: 'POST', authorization: 'Bearer caller-jwt', body: validBody },
      rpc,
      () => new Date('2026-08-11T02:34:00.000Z'),
    );

    expect(rpc).toHaveBeenCalledWith('Bearer caller-jwt', {
      p_task_id: 'task-1',
      p_child_id: 'child-1',
      p_completed_at: '2026-08-11T10:34:00+08:00',
      p_is_prerequisite_met: true,
      p_goal_id: 'goal-1',
    });
    expect(result).toEqual({
      status: 200,
      body: { completionId: 'completion-1', coinEarned: 3 },
    });
  });

  it('returns a typed 409 for an already completed task', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { error: 'already_completed' },
      error: null,
    }) as jest.MockedFunction<CompleteTaskRpc>;

    const result = await handleCompleteTaskRequest(
      { method: 'POST', authorization: 'Bearer jwt', body: validBody },
      rpc,
    );

    expect(result.status).toBe(409);
    expect(result.body.error).toBe('already_completed');
    expect(result.body.message).toBe('今天已經完成過這個任務了');
  });

  it('maps database authorization rejection to 403', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Not authorized' },
    }) as jest.MockedFunction<CompleteTaskRpc>;

    const result = await handleCompleteTaskRequest(
      { method: 'POST', authorization: 'Bearer wrong-family', body: validBody },
      rpc,
    );

    expect(result).toEqual({ status: 403, body: { error: 'Not authorized' } });
  });

  it('does not hide an unrelated database error', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'some_other_unique_constraint' },
    }) as jest.MockedFunction<CompleteTaskRpc>;

    const result = await handleCompleteTaskRequest(
      { method: 'POST', authorization: 'Bearer jwt', body: validBody },
      rpc,
    );

    expect(result).toEqual({
      status: 400,
      body: { error: 'some_other_unique_constraint' },
    });
  });

  it('returns a controlled error when the RPC transport throws', async () => {
    const rpc = jest.fn().mockRejectedValue(new Error('network unavailable')) as
      jest.MockedFunction<CompleteTaskRpc>;

    const result = await handleCompleteTaskRequest(
      { method: 'POST', authorization: 'Bearer jwt', body: validBody },
      rpc,
    );

    expect(result).toEqual({
      status: 400,
      body: { error: 'network unavailable' },
    });
  });

  it.each(['task_inactive', 'task_not_assigned', 'invalid_goal', 'goal_inactive'])(
    'maps the typed %s guard to conflict',
    async errorName => {
      const rpc = jest.fn().mockResolvedValue({
        data: { error: errorName },
        error: null,
      }) as jest.MockedFunction<CompleteTaskRpc>;

      const result = await handleCompleteTaskRequest(
        { method: 'POST', authorization: 'Bearer jwt', body: validBody },
        rpc,
      );

      expect(result).toEqual({ status: 409, body: { error: errorName } });
    },
  );

  it('configures the runtime client with caller auth and no service-role key', () => {
    const index = readFileSync(
      join(process.cwd(), 'supabase', 'functions', 'complete-task', 'index.ts'),
      'utf8',
    );

    expect(index).toContain("Deno.env.get('SUPABASE_ANON_KEY')");
    expect(index).toContain('Authorization: callerAuthorization');
    expect(index).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
