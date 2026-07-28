// 第六階段 B — 建立 service 的介面
//
// 本輪只有介面與一個「明確不可用」的實作。這裡要固定住的是那個「明確」：
// 尚未串接時必須失敗，而不是回傳假的成功。

import {
  UnavailableParentTaskCreationService,
  type CreateParentTaskCommand,
  type CreateParentTaskResult,
  type ParentTaskCreationService,
} from '../types';

const COMMAND = {} as CreateParentTaskCommand;

describe('UnavailableParentTaskCreationService', () => {
  it('一律回傳失敗，不會假裝建立成功', async () => {
    const service = new UnavailableParentTaskCreationService();
    const result = await service.create(COMMAND);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('PERSISTENCE_FAILED');
    expect(result.message.length).toBeGreaterThan(0);
    expect(result).not.toHaveProperty('taskId');
  });
});

describe('CreateParentTaskResult 的形狀', () => {
  it('成功時帶得出主要 id 與一併建立的 id', () => {
    const ok: CreateParentTaskResult = {
      ok: true,
      taskId: 'task-1',
      relatedIds: ['child-task-1', 'goal-1'],
      idempotentReplay: false,
    };
    if (!ok.ok) throw new Error('unreachable');
    expect(ok.relatedIds).toHaveLength(2);
  });

  it('失敗時可以把欄位錯誤原封不動送回 editor', () => {
    const failed: CreateParentTaskResult = {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: '還有欄位需要補齊',
      fieldErrors: { 'option:reading_method': '請選擇一項' },
    };
    if (failed.ok) throw new Error('unreachable');
    // 鍵的形狀與 UI 的 TaskDraftValidationErrors 一致，不需要再翻譯一次。
    expect(failed.fieldErrors?.['option:reading_method']).toBe('請選擇一項');
  });
});

describe('測試替身也吃同一個介面', () => {
  it('之後接上 RPC 或 Edge Function 時，呼叫端不用改', async () => {
    class FakeService implements ParentTaskCreationService {
      async create(command: CreateParentTaskCommand): Promise<CreateParentTaskResult> {
        return {
          ok: true, taskId: `task-${command.childId}`,
          relatedIds: [], idempotentReplay: false,
        };
      }
    }
    const result = await new FakeService().create({
      ...COMMAND,
      childId: 'child-9',
    } as CreateParentTaskCommand);
    expect(result).toEqual({
      ok: true, taskId: 'task-child-9', relatedIds: [], idempotentReplay: false,
    });
  });
});
