// P0-3 — 產生 Plan Draft 的整條路徑
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支是整包最重要的測試，因為它釘住的是**失敗時會怎樣**：
//
//   AI 關著 / 逾時 / 回亂碼 / 服務掛掉 / 寫入失敗
//     → 一律「這筆提案目前沒有草稿」
//     → Proposal 完全不動、不建立任務、不碰錢包、不轉狀態
//
// 以及重試不會變成第二版、第三版。
// ─────────────────────────────────────────────────────────────────────────

import {
  generateChildProposalPlanDraft,
  generateChildProposalPlanDraftInBackground,
  type PlanDraftPort,
} from '../generatePlanDraft';
import { planDraftUnavailable } from '../validatePlanDraftResult';
import type {
  ChildProposalPlanDraft,
  ChildProposalPlanDraftClient,
  ChildProposalPlanDraftResult,
} from '../types';
import type { AddChildProposalPlanVersionCommand, ChildProposal } from '../../types';

const DEMO_GOAL = '我想兩週把這本書讀完';
const NOW = () => new Date('2026-08-11T03:00:00.000Z');

function proposal(overrides: Partial<ChildProposal> = {}): ChildProposal {
  return {
    id: 'p-1',
    family_id: 'f-1',
    child_id: 'c-1',
    status: 'proposed',
    child_original_goal: DEMO_GOAL,
    child_original_motivation: '因為同學說這本書很好看',
    proposal_source: 'child',
    cadence_mode: 'weekly_frequency',
    cadence_weekly_frequency: 4,
    cadence_days: null,
    preferred_time: null,
    preferred_time_custom: null,
    estimated_minutes: null,
    child_reward_preference: 'hopes_for_coin',
    child_note: null,
    current_plan_version_id: null,
    task_id: null,
    closed_reason: null,
    closed_at: null,
    proposed_at: '2026-08-11T02:00:00.000Z',
    activated_at: null,
    created_at: '2026-08-11T02:00:00.000Z',
    updated_at: '2026-08-11T02:00:00.000Z',
    ...overrides,
  };
}

function draft(overrides: Partial<ChildProposalPlanDraft> = {}): ChildProposalPlanDraft {
  return {
    schemaVersion: 1,
    planTitle: '兩週閱讀挑戰',
    planSummary: '先用一週 4 次的節奏，每次讀一個不會太大的段落。',
    // 模型寫什麼都不會成為正式的完成標準 —— 這裡刻意放一句不一樣的，
    // 讓「canonical 不照抄」這件事在測試裡看得出來。
    completionDescription: '模型自己寫的完成說明',
    activityKind: 'reading',
    nextStepSuggestion: '選一本想看的書，閱讀約 15 分鐘',
    cadence: { mode: 'weekly_frequency', weeklyFrequency: 4 },
    cadenceSource: 'child',
    estimatedMinutes: 15,
    durationType: 'long_term',
    durationDays: 14,
    category: 'D',
    categoryReason: '練習閱讀，有進步軌跡',
    difficulty: 'standard',
    rewardPolicy: 'coin_eligible',
    rewardEligibility: 'allowed',
    rewardPolicyVersion: 'coin-policy-1.0.0',
    pricingStatus: 'priced',
    aiSuggestedCoinAmount: 10,
    blockingIssues: [],
    requiresConfirmation: [],
    warnings: [],
    clarificationQuestion: null,
    model: 'gemini-flash-latest',
    ...overrides,
  };
}

type Recorded = {
  port: PlanDraftPort;
  commands: AddChildProposalPlanVersionCommand[];
  existing: Map<string, string>;
};

function makePort(overrides: Partial<PlanDraftPort> = {}, row = proposal()): Recorded {
  const commands: AddChildProposalPlanVersionCommand[] = [];
  const existing = new Map<string, string>();

  const port: PlanDraftPort = {
    getProposal: jest.fn(async () => row),
    getChildAgeGroup: jest.fn(async () => '6-9' as const),
    findPlanVersionIdByAiRequestId: jest.fn(async ({ aiRequestId }) =>
      existing.get(aiRequestId) ?? null,
    ),
    addPlanVersion: jest.fn(async (command: AddChildProposalPlanVersionCommand) => {
      commands.push(command);
      if (command.aiRequestId) existing.set(command.aiRequestId, 'v-1');
      return {
        ok: true as const, planVersionId: 'v-1', versionNo: 1,
        isCurrent: true, duplicate: false,
      };
    }),
    ...overrides,
  };

  return { port, commands, existing };
}

function client(
  result: ChildProposalPlanDraftResult = { status: 'draft', schemaVersion: 1, draft: draft() },
): ChildProposalPlanDraftClient & { calls: number } {
  const stub = {
    calls: 0,
    async requestPlanDraft() {
      stub.calls += 1;
      return result;
    },
  };
  return stub;
}

// ---------------------------------------------------------------------------
// A. live success
// ---------------------------------------------------------------------------

describe('A：模型正常回應 → 一版真實的 AI 計畫版本', () => {
  it('存成 authored_by = ai，而且是 current', async () => {
    const { port, commands } = makePort();
    const outcome = await generateChildProposalPlanDraft(
      { client: client(), port, now: NOW }, 'p-1',
    );

    expect(outcome).toMatchObject({ status: 'saved', planVersionId: 'v-1', versionNo: 1 });
    expect(commands).toHaveLength(1);
    expect(commands[0].authoredBy).toBe('ai');
    expect(commands[0].makeCurrent).toBe(true);
    // AI 整理不是家長的修改 —— 不需要孩子重新接受。
    expect(commands[0].requiresChildReview).toBe(false);
  });

  it('孩子選的一週 4 次原樣寫進版本，而且**不會**被展開成星期幾', async () => {
    const { port, commands } = makePort();
    await generateChildProposalPlanDraft({ client: client(), port, now: NOW }, 'p-1');

    // 「一週 4 次」＝ 一週完成 4 次、日期彈性。
    // 帶 days 出去會被 RPC 以 WEEKLY_FREQUENCY_HAS_NO_DAYS 拒絕，
    // 而且會讓 P0-7.1 開始對孩子說「星期三沒做到」——那天他從來沒答應過。
    expect(commands[0].cadence).toEqual({ mode: 'weekly_frequency', weeklyFrequency: 4 });
    expect(commands[0].cadence?.days).toBeUndefined();
  });

  it('兩週 → durationDays 14 / long_term', async () => {
    const { port, commands } = makePort();
    await generateChildProposalPlanDraft({ client: client(), port, now: NOW }, 'p-1');

    expect(commands[0].durationDays).toBe(14);
    expect(commands[0].durationType).toBe('long_term');
  });

  it('AI 建議幣值走 reward.aiSuggestedCoinAmount，而且附了 snapshot', async () => {
    const { port, commands } = makePort();
    await generateChildProposalPlanDraft({ client: client(), port, now: NOW }, 'p-1');

    expect(commands[0].reward?.aiSuggestedCoinAmount).toBe(10);
    expect(commands[0].aiSnapshot).toBeDefined();
  });

  it('命令裡沒有任何「最終幣值」的鍵 —— RPC 會整筆拒絕那種命令', async () => {
    const { port, commands } = makePort();
    await generateChildProposalPlanDraft({ client: client(), port, now: NOW }, 'p-1');

    const serialized = JSON.stringify(commands[0]);
    for (const forbidden of ['coinAmount"', 'finalAmount', 'confirmedCoinAmount', 'confirmedReward']) {
      expect({ forbidden, present: serialized.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
    expect('coinAmount' in commands[0]).toBe(false);
    expect(Object.keys(commands[0].reward ?? {})).not.toContain('coinAmount');
  });

  it('P0-5 要的四個值都是結構化欄位，不用解 ai_snapshot', async () => {
    const { port, commands } = makePort();
    await generateChildProposalPlanDraft({ client: client(), port, now: NOW }, 'p-1');

    expect(commands[0].purposeCategory).toBe('D');
    expect(commands[0].completionDescription).toBe('完成一次約定的閱讀時段');
    expect(commands[0].progressModel).toBe('weekly_rhythm');
    expect(commands[0].nextStep).toBe('選一本想看的書，閱讀約 15 分鐘');
  });

  it('正式的完成標準不照抄模型的自由文字', async () => {
    const { port, commands } = makePort();
    await generateChildProposalPlanDraft({ client: client(), port, now: NOW }, 'p-1');

    // 模型寫的是「模型自己寫的完成說明」，但結構化欄位是我們的固定句型。
    expect(commands[0].completionDescription).not.toBe('模型自己寫的完成說明');
    expect(commands[0].completionDescription).toBe('完成一次約定的閱讀時段');
  });

  it('模型建議的下一步不合格時，欄位就是沒有 —— 不硬湊一句', async () => {
    const { port, commands } = makePort();
    await generateChildProposalPlanDraft(
      {
        client: client({
          status: 'draft',
          schemaVersion: 1,
          draft: draft({ nextStepSuggestion: '兩週後把整本書讀完' }),
        }),
        port,
        now: NOW,
      },
      'p-1',
    );

    expect(commands[0].nextStep).toBeUndefined();
    // 但模型當時說了什麼仍然留在稽核紀錄裡。
    const snapshot = commands[0].aiSnapshot as { plan: { aiNextStepSuggestion: string | null } };
    expect(snapshot.plan.aiNextStepSuggestion).toBe('兩週後把整本書讀完');
  });

  it('證據不足時不寫 progress_model —— 不猜', async () => {
    const { port, commands } = makePort();
    await generateChildProposalPlanDraft(
      {
        client: client({
          status: 'draft',
          schemaVersion: 1,
          // C 類、只做一次：沒有每週節奏可看。
          draft: draft({
            category: 'C',
            durationType: 'one_time',
            durationDays: null,
            cadence: { mode: 'one_time' },
          }),
        }),
        port,
        now: NOW,
      },
      'p-1',
    );

    expect(commands[0].progressModel).toBeUndefined();
    expect(commands[0].purposeCategory).toBe('C');
    // 一次性的完成標準仍然是「一次投入」，不是結果。
    expect(commands[0].completionDescription).toBe('完成這一次約定的閱讀');
  });

  it('命令碰不到孩子的原話 —— 那兩欄只在 proposal 上，而且 DB 有 trigger 擋', async () => {
    const { port, commands } = makePort();
    await generateChildProposalPlanDraft({ client: client(), port, now: NOW }, 'p-1');

    expect(Object.keys(commands[0])).not.toContain('childOriginalGoal');
    expect(Object.keys(commands[0])).not.toContain('childOriginalMotivation');
    // 原話只在 snapshot 裡被「記下當時看到什麼」，不是拿來覆寫的。
    const snapshot = commands[0].aiSnapshot as { input: { childOriginalGoal: string } };
    expect(snapshot.input.childOriginalGoal).toBe(DEMO_GOAL);
    // 而 AI 整理出來的標題是另一個欄位，不會蓋掉原話。
    expect(commands[0].planTitle).toBe('兩週閱讀挑戰');
    expect(commands[0].planTitle).not.toBe(DEMO_GOAL);
  });

  it('這條路徑只呼叫 addPlanVersion，沒有第二個寫入動作', async () => {
    const { port } = makePort();
    await generateChildProposalPlanDraft({ client: client(), port, now: NOW }, 'p-1');

    expect(port.addPlanVersion).toHaveBeenCalledTimes(1);
    expect(port.getProposal).toHaveBeenCalledTimes(1);
    expect(port.getChildAgeGroup).toHaveBeenCalledTimes(1);
  });

  it('不寫 startDate / endDate —— 開始那天由家長確認時才算得準', async () => {
    const { port, commands } = makePort();
    await generateChildProposalPlanDraft({ client: client(), port, now: NOW }, 'p-1');

    expect(commands[0].startDate).toBeUndefined();
    expect(commands[0].endDate).toBeUndefined();
  });

  it('snapshot 記得下當時的輸入、模型、政策與待確認事項', async () => {
    const { port, commands } = makePort();
    await generateChildProposalPlanDraft({ client: client(), port, now: NOW }, 'p-1');

    const snapshot = commands[0].aiSnapshot as Record<string, Record<string, unknown>>;
    expect(snapshot.source).toBe('ai-proxy/childProposalPlanDraft');
    expect(snapshot.input.childOriginalGoal).toBe(DEMO_GOAL);
    // 模型寫的那一句與我們最後用的那一句都留著，才比對得出差異。
    expect(snapshot.plan.aiCompletionDescriptionCandidate).toBe('模型自己寫的完成說明');
    expect(snapshot.plan.canonicalCompletionDescription).toBe('完成一次約定的閱讀時段');
    expect(snapshot.plan.cadenceSource).toBe('child');
    expect(snapshot.policy.rewardPolicyVersion).toBe('coin-policy-1.0.0');
    expect(snapshot.policy.pricingStatus).toBe('priced');
    expect(snapshot.findings).toBeDefined();
    expect(commands[0].aiModel).toBe('gemini-flash-latest');
  });
});

// ---------------------------------------------------------------------------
// B / C / D：失敗與關閉
// ---------------------------------------------------------------------------

describe('D：AI 關著', () => {
  it('什麼都不做 —— 連提案都不查', async () => {
    const { port, commands } = makePort();
    const outcome = await generateChildProposalPlanDraft({ client: null, port }, 'p-1');

    expect(outcome).toEqual({ status: 'skipped', reason: 'ai_disabled' });
    expect(port.getProposal).not.toHaveBeenCalled();
    expect(commands).toHaveLength(0);
  });
});

describe('B：逾時 / 服務掛掉', () => {
  it.each([
    ['逾時', 'TIMEOUT'],
    ['服務不可用', 'SERVICE_ERROR'],
  ] as const)('%s → 沒有草稿，也沒有任何寫入', async (_label, reason) => {
    const { port, commands } = makePort();
    const outcome = await generateChildProposalPlanDraft(
      { client: client(planDraftUnavailable(reason)), port, now: NOW }, 'p-1',
    );

    expect(outcome).toEqual({ status: 'unavailable', reason });
    expect(commands).toHaveLength(0);
    expect(port.addPlanVersion).not.toHaveBeenCalled();
  });
});

describe('C：模型回了看不懂的東西', () => {
  it('validator 擋下 → 不寫假的計畫版本', async () => {
    const { port, commands } = makePort();
    const outcome = await generateChildProposalPlanDraft(
      { client: client(planDraftUnavailable('INVALID_RESPONSE')), port, now: NOW }, 'p-1',
    );

    expect(outcome).toEqual({ status: 'unavailable', reason: 'INVALID_RESPONSE' });
    expect(commands).toHaveLength(0);
  });
});

describe('寫入失敗也不影響提案', () => {
  it('RPC 拒絕 → 回報失敗，但不重試、不改狀態', async () => {
    const { port } = makePort({
      addPlanVersion: jest.fn(async () => ({
        ok: false as const, code: 'POLICY_REJECTED' as const, message: '已回絕的提案不能再新增計畫版本',
      })),
    });

    const outcome = await generateChildProposalPlanDraft(
      { client: client(), port, now: NOW }, 'p-1',
    );

    expect(outcome).toMatchObject({ status: 'persist_failed', code: 'POLICY_REJECTED' });
    expect(port.addPlanVersion).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 前置條件
// ---------------------------------------------------------------------------

describe('只有 proposed 的提案才整理', () => {
  it.each(['draft', 'active', 'closed_unsuitable', 'needs_child_review'] as const)(
    '%s → 不跑，也不呼叫模型',
    async (status) => {
      const { port, commands } = makePort({}, proposal({ status }));
      const stub = client();
      const outcome = await generateChildProposalPlanDraft(
        { client: stub, port, now: NOW }, 'p-1',
      );

      expect(outcome).toEqual({ status: 'skipped', reason: 'proposal_not_proposed' });
      expect(stub.calls).toBe(0);
      expect(commands).toHaveLength(0);
    },
  );

  it('提案不存在 → 不跑', async () => {
    const { port } = makePort({ getProposal: jest.fn(async () => null) });
    const outcome = await generateChildProposalPlanDraft(
      { client: client(), port, now: NOW }, 'p-1',
    );
    expect(outcome).toEqual({ status: 'skipped', reason: 'proposal_not_found' });
  });

  it('查不到年齡段 → 寧可沒有草稿，也不用猜的年齡去跑資格閘門', async () => {
    const { port, commands } = makePort({ getChildAgeGroup: jest.fn(async () => null) });
    const stub = client();
    const outcome = await generateChildProposalPlanDraft(
      { client: stub, port, now: NOW }, 'p-1',
    );

    expect(outcome).toEqual({ status: 'skipped', reason: 'missing_age_group' });
    expect(stub.calls).toBe(0);
    expect(commands).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 重試 / idempotency
// ---------------------------------------------------------------------------

describe('重試不會產生第二版、第三版', () => {
  it('連跑三次只寫一版，而且後兩次連模型都不呼叫', async () => {
    const { port, commands } = makePort();
    const stub = client();
    const deps = { client: stub, port, now: NOW };

    const first = await generateChildProposalPlanDraft(deps, 'p-1');
    const second = await generateChildProposalPlanDraft(deps, 'p-1');
    const third = await generateChildProposalPlanDraft(deps, 'p-1');

    expect(first.status).toBe('saved');
    expect(second).toEqual({ status: 'skipped', reason: 'already_generated', planVersionId: 'v-1' });
    expect(third).toEqual({ status: 'skipped', reason: 'already_generated', planVersionId: 'v-1' });

    expect(commands).toHaveLength(1);
    // 省下來的不只是一列資料，是兩次模型配額。
    expect(stub.calls).toBe(1);
  });

  it('真的併發時由 DB 的 unique index 收尾 —— 回既有那一版，仍算成功', async () => {
    // 兩個請求都通過了「呼叫前查重」（併發時都查不到），
    // 第二個插入撞到 unique index → RPC 回既有那一版並標記 duplicate。
    const { port } = makePort({
      findPlanVersionIdByAiRequestId: jest.fn(async () => null),
      addPlanVersion: jest.fn(async () => ({
        ok: true as const, planVersionId: 'v-1', versionNo: 1,
        isCurrent: true, duplicate: true,
      })),
    });

    const outcome = await generateChildProposalPlanDraft(
      { client: client(), port, now: NOW }, 'p-1',
    );

    // 「早就存好了」不是失敗 —— 當成 persist_failed 會讓背景一直重試。
    expect(outcome).toMatchObject({
      status: 'saved', planVersionId: 'v-1', duplicateSuppressed: true,
    });
  });

  it('一次就寫成時 duplicateSuppressed 是 false', async () => {
    const { port } = makePort();
    const outcome = await generateChildProposalPlanDraft(
      { client: client(), port, now: NOW }, 'p-1',
    );
    expect(outcome).toMatchObject({ status: 'saved', duplicateSuppressed: false });
  });

  it('查重發生在呼叫模型之前', async () => {
    const order: string[] = [];
    const { port } = makePort({
      findPlanVersionIdByAiRequestId: jest.fn(async () => {
        order.push('lookup');
        return 'v-existing';
      }),
    });
    const stub: ChildProposalPlanDraftClient = {
      async requestPlanDraft() {
        order.push('model');
        return { status: 'draft', schemaVersion: 1, draft: draft() };
      },
    };

    await generateChildProposalPlanDraft({ client: stub, port, now: NOW }, 'p-1');
    expect(order).toEqual(['lookup']);
  });

  it('上一次失敗（沒寫成版本）→ 下一次仍然會重新嘗試', async () => {
    const { port, commands } = makePort();
    const failing = client(planDraftUnavailable('TIMEOUT'));
    await generateChildProposalPlanDraft({ client: failing, port, now: NOW }, 'p-1');

    const outcome = await generateChildProposalPlanDraft(
      { client: client(), port, now: NOW }, 'p-1',
    );
    expect(outcome.status).toBe('saved');
    expect(commands).toHaveLength(1);
  });

  it('提案內容變了 → key 不同 → 可以重新整理一份', async () => {
    const { port, commands, existing } = makePort();
    await generateChildProposalPlanDraft({ client: client(), port, now: NOW }, 'p-1');
    expect(existing.size).toBe(1);

    const changed = makePort(
      {
        findPlanVersionIdByAiRequestId: port.findPlanVersionIdByAiRequestId,
        addPlanVersion: port.addPlanVersion,
      },
      proposal({ cadence_weekly_frequency: 2 }),
    );
    const outcome = await generateChildProposalPlanDraft(
      { client: client(), port: changed.port, now: NOW }, 'p-1',
    );

    expect(outcome.status).toBe('saved');
    expect(commands).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 這條路徑碰不到的東西
// ---------------------------------------------------------------------------

describe('不建立任務、不轉狀態、不碰錢包', () => {
  it('port 上根本沒有那些能力', async () => {
    const { port } = makePort();
    await generateChildProposalPlanDraft({ client: client(), port, now: NOW }, 'p-1');

    expect(Object.keys(port).sort()).toEqual([
      'addPlanVersion',
      'findPlanVersionIdByAiRequestId',
      'getChildAgeGroup',
      'getProposal',
    ]);
  });

  it('整支模組的原始碼沒有任務 / 錢包 / 轉換的路徑', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'generatePlanDraft.ts'),
      'utf8',
    ) as string;
    const code = source
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      })
      .join('\n');

    for (const forbidden of [
      'createChildTask',
      'create_parent_task',
      "from('tasks')",
      "from('wallets')",
      "from('transactions')",
      'transition',
      'complete_task',
    ]) {
      expect({ forbidden, present: code.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });
});

// ---------------------------------------------------------------------------
// 背景執行
// ---------------------------------------------------------------------------

describe('背景執行不會炸掉 app', () => {
  it('port 丟例外時被接住，回報 crashed', async () => {
    const { port } = makePort({
      getProposal: jest.fn(async () => {
        throw new Error('network down');
      }),
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const outcome = await new Promise((resolve) => {
      generateChildProposalPlanDraftInBackground({ client: client(), port }, 'p-1', resolve);
    });

    expect(outcome).toMatchObject({ status: 'crashed' });
    warn.mockRestore();
  });

  it('正常路徑照樣回報結果', async () => {
    const { port } = makePort();
    const outcome = await new Promise((resolve) => {
      generateChildProposalPlanDraftInBackground({ client: client(), port, now: NOW }, 'p-1', resolve);
    });
    expect(outcome).toMatchObject({ status: 'saved' });
  });
});
