// 第七階段 A — Supabase service adapter
//
// adapter 只做傳話與翻譯。這一支測的就是翻譯：什麼情況該回哪一個 code，
// 以及「看不懂的回應絕對不能當成成功」。

// eslint-disable-next-line prefer-const -- let allows reassignment in beforeEach
let mockRpc = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

beforeEach(() => {
  mockRpc = jest.fn();
});

import {
  CREATE_PARENT_TASK_RPC,
  SupabaseParentTaskCreationService,
  mapPostgresErrorCode,
} from '../parentTaskCreationService';
import type {
  CreateParentTaskCommand,
} from '../../screens/parent/tablet/taskDrawer/taskPersistence';

const COMMAND = {
  schemaVersion: 1,
  childId: 'child-1',
  familyId: 'family-1',
} as CreateParentTaskCommand;

function service() {
  return new SupabaseParentTaskCreationService();
}

// ---------------------------------------------------------------------------
// 呼叫方式
// ---------------------------------------------------------------------------

describe('呼叫 RPC', () => {
  it('把命令整包當成 p_command 傳給 create_parent_task_v1', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, taskId: 't-1', relatedIds: [] }, error: null });

    await service().create(COMMAND);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(CREATE_PARENT_TASK_RPC, { p_command: COMMAND });
  });

  it('不自己做任何 insert —— 只呼叫這一支 RPC', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, taskId: 't-1', relatedIds: [] }, error: null });
    await service().create(COMMAND);
    // supabase mock 上根本沒有 from()，有用到就會 TypeError。
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 成功
// ---------------------------------------------------------------------------

describe('成功', () => {
  it('帶出 taskId 與一併建立的 relatedIds', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, taskId: 'task-1', relatedIds: ['child-task-1', 'goal-1'] },
      error: null,
    });

    const result = await service().create(COMMAND);
    expect(result).toEqual({
      ok: true,
      taskId: 'task-1',
      relatedIds: ['child-task-1', 'goal-1'],
      idempotentReplay: false,
    });
  });

  it('RPC 說這是重送時原樣帶上來', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, taskId: 'task-1', relatedIds: [], idempotentReplay: true },
      error: null,
    });

    const result = await service().create(COMMAND);
    expect(result).toEqual({
      ok: true, taskId: 'task-1', relatedIds: [], idempotentReplay: true,
    });
  });

  it('回應沒有 idempotentReplay 時當作「這次真的建立了」', async () => {
    // 保守的方向：把一次正常建立說成重送，比反過來更容易誤導偵錯。
    mockRpc.mockResolvedValue({
      data: { ok: true, taskId: 'task-1', relatedIds: [] },
      error: null,
    });

    const result = await service().create(COMMAND);
    if (!result.ok) throw new Error('unreachable');
    expect(result.idempotentReplay).toBe(false);
  });

  it('relatedIds 為 null 時給空陣列，不讓呼叫端處理 null', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, taskId: 'task-1', relatedIds: null }, error: null });
    const result = await service().create(COMMAND);
    if (!result.ok) throw new Error('unreachable');
    expect(result.relatedIds).toEqual([]);
  });

  it('說成功卻沒給 taskId 時不算成功', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, relatedIds: [] }, error: null });
    const result = await service().create(COMMAND);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('UNKNOWN');
  });
});

// ---------------------------------------------------------------------------
// RPC 自己回報的失敗
// ---------------------------------------------------------------------------

describe('RPC 回傳的結構化失敗', () => {
  it('政策被擋下時原封不動帶回 code 與訊息', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: false, code: 'POLICY_REJECTED', message: '時間儲蓄建立流程尚未啟用' },
      error: null,
    });

    const result = await service().create(COMMAND);
    expect(result).toEqual({
      ok: false,
      code: 'POLICY_REJECTED',
      message: '時間儲蓄建立流程尚未啟用',
    });
  });

  it('命令格式問題回 VALIDATION_FAILED', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: false, code: 'VALIDATION_FAILED', message: '缺少任務名稱' },
      error: null,
    });
    const result = await service().create(COMMAND);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('VALIDATION_FAILED');
  });

  it('沒見過的 code 退回 UNKNOWN，不硬塞成別的意思', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: false, code: 'SOMETHING_NEW', message: '之後才有的錯誤' },
      error: null,
    });
    const result = await service().create(COMMAND);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('之後才有的錯誤');
  });
});

// ---------------------------------------------------------------------------
// Postgres 錯誤
// ---------------------------------------------------------------------------

describe('Postgres 錯誤碼映射', () => {
  it('42501（授權不足）→ POLICY_REJECTED', () => {
    expect(mapPostgresErrorCode('42501')).toBe('POLICY_REJECTED');
  });

  it('22xxx（資料格式）與 23514（CHECK）→ VALIDATION_FAILED', () => {
    expect(mapPostgresErrorCode('22P02')).toBe('VALIDATION_FAILED');
    expect(mapPostgresErrorCode('22007')).toBe('VALIDATION_FAILED');
    expect(mapPostgresErrorCode('23514')).toBe('VALIDATION_FAILED');
  });

  it('其餘 23xxx（外鍵、唯一鍵）與 40xxx → PERSISTENCE_FAILED', () => {
    expect(mapPostgresErrorCode('23503')).toBe('PERSISTENCE_FAILED');
    expect(mapPostgresErrorCode('23505')).toBe('PERSISTENCE_FAILED');
    expect(mapPostgresErrorCode('40001')).toBe('PERSISTENCE_FAILED');
  });

  it('migration 還沒套用（PGRST202）→ PERSISTENCE_FAILED', () => {
    expect(mapPostgresErrorCode('PGRST202')).toBe('PERSISTENCE_FAILED');
  });

  it('沒有 code 或沒看過的 code → UNKNOWN', () => {
    expect(mapPostgresErrorCode(undefined)).toBe('UNKNOWN');
    expect(mapPostgresErrorCode('P0001')).toBe('UNKNOWN');
  });

  it('跨家庭被 RPC 擋下時，錯誤訊息不被吞掉', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Not authorized: caller does not belong to family x' },
    });

    const result = await service().create(COMMAND);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('POLICY_REJECTED');
    expect(result.message).toContain('Not authorized');
  });
});

// ---------------------------------------------------------------------------
// 例外與怪回應
// ---------------------------------------------------------------------------

describe('連線與未知回應', () => {
  it('rpc 直接 throw 時回 PERSISTENCE_FAILED，不讓例外往上炸', async () => {
    mockRpc.mockRejectedValue(new Error('Network request failed'));
    const result = await service().create(COMMAND);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('PERSISTENCE_FAILED');
    expect(result.message).toBe('Network request failed');
  });

  it('回了 null 不能當成成功', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await service().create(COMMAND);
    expect(result.ok).toBe(false);
  });

  it('回了認不得的形狀也不能當成成功', async () => {
    mockRpc.mockResolvedValue({ data: { taskId: 'task-1' }, error: null });
    const result = await service().create(COMMAND);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('UNKNOWN');
  });
});
