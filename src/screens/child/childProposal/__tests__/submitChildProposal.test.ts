// P0-2 — 送出提案的兩步流程
//
// 這一支釘住三件不能妥協的事：
//   · 兩步都成功才算成功
//   · 任何一步失敗都不可以回 ok
//   · 這條路徑不碰 tasks / child_tasks / wallet / transactions

import { createEmptyDraft, toCreateCommand, withGoal } from '../proposalDraft';
import { submitChildProposal, type ProposalSubmitPort } from '../submitChildProposal';

const COMMAND = toCreateCommand(withGoal(createEmptyDraft(), '我想兩週把這本書讀完'), 'child-1');

function port(overrides: Partial<ProposalSubmitPort> = {}): ProposalSubmitPort {
  return {
    create: jest.fn().mockResolvedValue({
      ok: true,
      proposalId: 'p-1',
      status: 'draft',
    }),
    transition: jest.fn().mockResolvedValue({
      ok: true,
      proposalId: 'p-1',
      fromStatus: 'draft',
      toStatus: 'proposed',
      planVersionId: null,
      confirmedReward: null,
    }),
    ...overrides,
  } as ProposalSubmitPort;
}

describe('成功路徑', () => {
  it('先建立 draft，再轉成 proposed', async () => {
    const service = port();
    const result = await submitChildProposal(service, COMMAND);

    expect(result).toEqual({ ok: true, proposalId: 'p-1', status: 'proposed' });
    expect(service.create).toHaveBeenCalledTimes(1);
    expect(service.create).toHaveBeenCalledWith(COMMAND);
    expect(service.transition).toHaveBeenCalledWith({
      schemaVersion: 1,
      proposalId: 'p-1',
      toStatus: 'proposed',
      actorRole: 'child',
    });
  });

  it('建立用的命令原樣送出，一個欄位都沒被改寫', async () => {
    const service = port();
    await submitChildProposal(service, COMMAND);
    expect((service.create as jest.Mock).mock.calls[0][0]).toBe(COMMAND);
  });
});

describe('第一步失敗', () => {
  it('建立失敗就不呼叫第二步，也不回成功', async () => {
    const service = port({
      create: jest.fn().mockResolvedValue({
        ok: false, code: 'VALIDATION_FAILED', message: '提案缺少孩子的原始目標',
      }),
    });

    const result = await submitChildProposal(service, COMMAND);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ stage: 'create', code: 'VALIDATION_FAILED' });
    expect(service.transition).not.toHaveBeenCalled();
  });

  it('建立失敗不帶 proposalId —— 沒有東西可以重送', async () => {
    const service = port({
      create: jest.fn().mockResolvedValue({
        ok: false, code: 'PERSISTENCE_FAILED', message: 'network down',
      }),
    });

    const result = await submitChildProposal(service, COMMAND);
    expect(result).toEqual({
      ok: false, stage: 'create', code: 'PERSISTENCE_FAILED', message: 'network down',
    });
  });
});

describe('第二步失敗', () => {
  it('轉換失敗一律不算成功', async () => {
    const service = port({
      transition: jest.fn().mockResolvedValue({
        ok: false, code: 'POLICY_REJECTED', reason: 'ILLEGAL_TRANSITION',
        message: 'child 不能把提案從 proposed 轉成 proposed',
      }),
    });

    const result = await submitChildProposal(service, COMMAND);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ stage: 'transition', code: 'POLICY_REJECTED' });
  });

  it('帶回 proposalId，讓重試不會產生第二份提案', async () => {
    const service = port({
      transition: jest.fn().mockResolvedValue({
        ok: false, code: 'PERSISTENCE_FAILED', message: 'network down',
      }),
    });

    const result = await submitChildProposal(service, COMMAND);
    expect(result).toMatchObject({ ok: false, stage: 'transition', proposalId: 'p-1' });
  });

  it('重試時跳過建立，只重送第二步', async () => {
    const service = port();
    const result = await submitChildProposal(service, COMMAND, 'p-1');

    expect(result).toEqual({ ok: true, proposalId: 'p-1', status: 'proposed' });
    expect(service.create).not.toHaveBeenCalled();
    expect(service.transition).toHaveBeenCalledTimes(1);
  });
});

describe('回應形狀不對也不算成功', () => {
  it('RPC 說 ok 但狀態不是 proposed → 當失敗', async () => {
    const service = port({
      transition: jest.fn().mockResolvedValue({
        ok: true, proposalId: 'p-1', fromStatus: 'draft', toStatus: 'draft',
        planVersionId: null, confirmedReward: null,
      }),
    });

    const result = await submitChildProposal(service, COMMAND);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ stage: 'transition', code: 'UNKNOWN', proposalId: 'p-1' });
  });
});

describe('送出不碰任何金流或任務', () => {
  it('整支模組沒有 import tasks / wallet / transactions 的路徑', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'submitChildProposal.ts'),
      'utf8',
    ) as string;
    const code = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');

    for (const forbidden of [
      'taskActions',
      'createChildTask',
      'from(\'tasks\')',
      'from(\'child_tasks\')',
      'from(\'wallets\')',
      'from(\'transactions\')',
      'complete_task',
    ]) {
      expect({ forbidden, present: code.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });

  it('只呼叫 create 與 transition，沒有第三個動作', async () => {
    const service = port();
    await submitChildProposal(service, COMMAND);
    expect(Object.keys(service)).toEqual(['create', 'transition']);
    expect(service.create).toHaveBeenCalledTimes(1);
    expect(service.transition).toHaveBeenCalledTimes(1);
  });
});
