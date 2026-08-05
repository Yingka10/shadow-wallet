// 第七階段 C — 提交管線與建立後的分頁
//
// 這一支守兩件事：
//
//   1. 五種 editor 的預設草稿都真的走得完 validate → map → evaluate →
//      finalize → service。任何一種走不完，那個任務家族就是建不出來的，
//      而 UI 上看不出差別 —— 家長要按到最後一步才知道。
//
//   2. 失敗停在正確的階段。停錯階段的後果是把家長丟回一個沒有任何欄位是紅的
//      表單，或反過來讓他在預覽畫面上盯著一句「有欄位要補」卻不知道補哪裡。

import {
  ALL_FAMILIES,
  TASK_POLICY_VERSION,
  type TaskPresetFamily,
  type TaskPresetVariant,
} from '../../taskCatalog';
import {
  applyRoleSelection,
  createTaskDraft,
  focusChoicesFor,
  syncSupportSteps,
  type DraftChildContext,
  type TaskDraft,
} from '../../taskDraft';
import { FakeParentTaskCreationService } from '../../../../../../testing/fakeParentTaskCreationService';
import { previewTaskRewardDecision, submitTaskDraft } from '../submitTaskDraft';
import { tabForCreatedTask } from '../tabForCreatedTask';
import { mapTaskDraftToCommand } from '../mapTaskDraftToCommand';
import type { CommandChildContext } from '../types';

const DRAFT_CHILD: DraftChildContext = {
  nickname: '承恩',
  birthDate: '2018-03-05',
  familyId: 'family-1',
};
const CHILD: CommandChildContext = {
  id: 'child-1',
  familyId: 'family-1',
  ageGroup: '6-9',
};
const REQUEST_ID = '6f1c0f7e-2a4b-4c9d-8e12-3b5a7c9d0e11';

function pick(familyId: string, variantId?: string): [TaskPresetFamily, TaskPresetVariant] {
  const family = ALL_FAMILIES.find(f => f.id === familyId);
  if (!family) throw new Error(`family not found: ${familyId}`);
  const variant = variantId
    ? family.variants.find(v => v.id === variantId)
    : family.variants[0];
  if (!variant) throw new Error(`variant not found: ${variantId}`);
  return [family, variant];
}

/**
 * 找出第一個用指定 editor 的 family/variant，並補齊該 editor 的必填。
 *
 * 用真的 catalog 而不是手寫 fixture：手寫的草稿永遠會通過自己寫的驗證，
 * 那證明不了「家長真的建得出這種任務」。
 */
function draftFor(editorKind: TaskDraft['editorKind']): {
  family: TaskPresetFamily;
  variant: TaskPresetVariant;
  draft: TaskDraft;
} {
  for (const family of ALL_FAMILIES) {
    for (const variant of family.variants) {
      const draft = createTaskDraft(family, variant, DRAFT_CHILD, '6-9');
      if (draft.editorKind !== editorKind) continue;
      return { family, variant, draft: completeRequired(draft, family, variant) };
    }
  }
  throw new Error(`沒有任何 variant 使用 ${editorKind}`);
}

/**
 * 補上「預設草稿沒有、但 validator 要求」的欄位。
 *
 * 這些正是家長在畫面上一定會填的東西 —— 必選的選項組、單次任務的具體內容、
 * 短期支援的焦點與步驟、家庭角色的角色。用真的 helper（applyRoleSelection、
 * syncSupportSteps）而不是手塞值，才不會補出一份 UI 產不出來的草稿。
 */
function completeRequired(
  draft: TaskDraft,
  family: TaskPresetFamily,
  variant: TaskPresetVariant,
): TaskDraft {
  let next = draft;

  for (const group of variant.optionGroups) {
    if (!group.required) continue;
    if ((next.selectedOptions[group.id] ?? []).length > 0) continue;
    const option = group.options.find(o => o.id !== 'other');
    if (!option) continue;
    next = {
      ...next,
      selectedOptions: { ...next.selectedOptions, [group.id]: [option.id] },
    };
  }

  if (next.editorKind === 'one_time' && !next.taskDetails.trim()) {
    next = { ...next, taskDetails: '把書桌上的東西收回原位' };
  }

  if (next.editorKind === 'short_support' && next.focusOptionIds.length === 0) {
    const choices = focusChoicesFor(family, variant);
    const first = choices[0];
    if (first) {
      const focusOptionIds = [first.id];
      next = {
        ...next,
        focusOptionIds,
        supportSteps: syncSupportSteps(next.supportSteps, focusOptionIds, choices),
      };
    }
  }

  if (next.editorKind === 'family_role' && !next.roleOptionId) {
    const roleGroup = variant.optionGroups[0];
    const option = roleGroup?.options.find(o => o.id !== 'other');
    if (roleGroup && option) next = applyRoleSelection(next, option.id, roleGroup.id);
  }

  return next;
}

async function submit(
  editorKind: TaskDraft['editorKind'],
  service = new FakeParentTaskCreationService(),
) {
  const { family, variant, draft } = draftFor(editorKind);
  const outcome = await submitTaskDraft({
    draft, family, variant, child: CHILD,
    taskPolicyVersion: TASK_POLICY_VERSION,
    clientRequestId: REQUEST_ID,
    service,
  });
  return { outcome, service, family, variant, draft };
}

// ---------------------------------------------------------------------------
// D. 五種 editor 都建得出來（測試 19-23）
// ---------------------------------------------------------------------------

describe('五種 editor 都走得完建立流程', () => {
  const KINDS = [
    'one_time', 'recurring', 'growth_plan', 'short_support', 'family_role',
  ] as const;

  for (const kind of KINDS) {
    it(`${kind} 可以建立`, async () => {
      const { outcome, service } = await submit(kind);
      expect({ kind, ok: outcome.ok, stage: outcome.ok ? null : outcome.stage })
        .toEqual({ kind, ok: true, stage: null });
      expect(service.callCount).toBe(1);
    });
  }

  it('送出的命令都帶著同一個建立請求識別碼', async () => {
    for (const kind of KINDS) {
      const { service } = await submit(kind);
      expect({ kind, ids: service.requestIds }).toEqual({ kind, ids: [REQUEST_ID] });
    }
  });

  it('每一份命令都帶得出回饋決策，而且與任務上的政策一致', async () => {
    for (const kind of KINDS) {
      const { outcome } = await submit(kind);
      if (!outcome.ok) throw new Error(`${kind} 應該成功`);
      const { command } = outcome;
      expect({ kind, same: command.task.rewardPolicy === command.reward.decision.rewardPolicy })
        .toEqual({ kind, same: true });
      expect(command.reward.decision.eligibility).toBe('allowed');
    }
  });
});

// ---------------------------------------------------------------------------
// 十一. 建立後跳哪個分頁（測試 14-15 的純函式部分）
// ---------------------------------------------------------------------------

describe('建立後的分頁', () => {
  const EXPECTED: Record<TaskDraft['editorKind'], 'daily' | 'longTerm'> = {
    one_time: 'daily',
    recurring: 'daily',
    growth_plan: 'longTerm',
    short_support: 'longTerm',
    family_role: 'longTerm',
  };

  for (const [kind, tab] of Object.entries(EXPECTED)) {
    it(`${kind} → ${tab}`, async () => {
      const { outcome } = await submit(kind as TaskDraft['editorKind']);
      if (!outcome.ok) throw new Error(`${kind} 應該成功`);
      expect({ kind, tab: tabForCreatedTask(outcome.command) }).toEqual({ kind, tab });
    });
  }

  it('永遠不會回 paused 或 archive —— 剛建立的任務不可能屬於那裡', async () => {
    for (const kind of Object.keys(EXPECTED) as Array<TaskDraft['editorKind']>) {
      const { outcome } = await submit(kind);
      if (!outcome.ok) throw new Error('unreachable');
      expect(['daily', 'longTerm']).toContain(tabForCreatedTask(outcome.command));
    }
  });
});

// ---------------------------------------------------------------------------
// B. 失敗停在正確的階段（測試 7-10 的資料層部分）
// ---------------------------------------------------------------------------

describe('失敗停在哪一步', () => {
  it('草稿有欄位錯誤時停在 validation，而且完全不呼叫 service', async () => {
    const [family, variant] = pick('learn-reading', 'learn-reading-recurring');
    const draft = createTaskDraft(family, variant, DRAFT_CHILD, '6-9');
    const service = new FakeParentTaskCreationService();

    // 預設草稿沒有選必填的閱讀方式。
    const outcome = await submitTaskDraft({
      draft, family, variant, child: CHILD,
      taskPolicyVersion: TASK_POLICY_VERSION,
      clientRequestId: REQUEST_ID,
      service,
    });

    if (outcome.ok) throw new Error('應該失敗');
    expect(outcome.stage).toBe('validation');
    expect(outcome.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(outcome.fieldErrors ?? {}).length).toBeGreaterThan(0);
    expect(service.callCount).toBe(0);
  });

  /**
   * 家庭參與選成可發幣 —— 政策擋死的組合。
   *
   * 它停在 **validation** 而不是 reward，這是對的：能力閘門
   * （validateRewardAvailability）跑在最前面，家長根本選不到這個選項。
   * 「選完才在後面被拒絕」正是第七階段 B 要消掉的體驗。
   *
   * reward 階段因此是一道防線而不是常走的路：它只在「驗證放行、但政策
   * 算不出合法結果」時才會觸發。那條路徑由 finalizeCreateParentTaskCommand
   * 的測試直接覆蓋。
   */
  it('政策擋死的回饋組合在驗證階段就被攔下，service 完全沒被呼叫', async () => {
    const [family, variant] = pick('fam-set-table');
    const base = completeRequired(
      createTaskDraft(family, variant, DRAFT_CHILD, '6-9'), family, variant,
    );
    const draft: TaskDraft = { ...base, rewardPolicy: 'coin_eligible' };
    const service = new FakeParentTaskCreationService();

    const outcome = await submitTaskDraft({
      draft, family, variant, child: CHILD,
      taskPolicyVersion: TASK_POLICY_VERSION,
      clientRequestId: REQUEST_ID,
      service,
    });

    if (outcome.ok) throw new Error('應該失敗');
    expect(outcome.stage).toBe('validation');
    expect(service.callCount).toBe(0);
  });

  it('service 失敗時停在 service，並原樣帶出它給的 code', async () => {
    const service = new FakeParentTaskCreationService({ kind: 'persistenceFailed' });
    const { outcome } = await submit('recurring', service);

    if (outcome.ok) throw new Error('應該失敗');
    expect(outcome.stage).toBe('service');
    expect(outcome.code).toBe('PERSISTENCE_FAILED');
    expect(service.callCount).toBe(1);
  });

  it('idempotent replay 仍然算成功', async () => {
    const service = new FakeParentTaskCreationService({
      kind: 'success', taskId: 'task-existing', idempotentReplay: true,
    });
    const { outcome } = await submit('recurring', service);

    if (!outcome.ok) throw new Error('replay 應該視為成功');
    expect(outcome.taskId).toBe('task-existing');
    expect(outcome.idempotentReplay).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 五. 提交前重新產生完整命令
// ---------------------------------------------------------------------------

describe('提交時重跑整條管線', () => {
  it('草稿改過之後送出的是新的決策，不是進預覽時算好的那份', async () => {
    const [family, variant] = pick('learn-reading', 'learn-reading-recurring');
    const base = completeRequired(
      createTaskDraft(family, variant, DRAFT_CHILD, '6-9'), family, variant,
    );
    if (base.editorKind !== 'recurring') throw new Error('預期是固定任務');

    const shorter: TaskDraft = { ...base, minutesPerSession: 10 };
    const longer: TaskDraft = { ...base, minutesPerSession: 45 };

    const args = {
      family, variant, child: CHILD,
      taskPolicyVersion: TASK_POLICY_VERSION,
      clientRequestId: REQUEST_ID,
    };
    const before = previewTaskRewardDecision({ ...args, draft: shorter });
    const after = previewTaskRewardDecision({ ...args, draft: longer });

    // 時間分級不同 → 幣值不同。這正是「沿用舊 command」會寫錯的那個數字。
    if (before?.eligibility !== 'allowed' || after?.eligibility !== 'allowed') {
      throw new Error('兩份草稿都應該算得出決策');
    }
    expect(before.coin?.finalAmount).not.toBe(after.coin?.finalAmount);

    const service = new FakeParentTaskCreationService();
    await submitTaskDraft({ ...args, draft: longer, service });
    const sent = service.calls[0]?.reward.decision;
    if (sent?.eligibility !== 'allowed' || sent.rewardPolicy !== 'coin_eligible') {
      throw new Error('送出的應該是可發幣的決策');
    }
    expect(sent.coin.finalAmount).toBe(after.coin?.finalAmount);
  });

  it('重跑映射不會換掉建立請求識別碼', () => {
    const { family, variant, draft } = draftFor('recurring');
    const args = {
      draft, family, variant, child: CHILD,
      taskPolicyVersion: TASK_POLICY_VERSION,
      clientRequestId: REQUEST_ID,
    };
    // 映射是純函式，識別碼由外面帶進來 —— 跑幾次都一樣。
    expect(mapTaskDraftToCommand(args).metadata.clientRequestId).toBe(REQUEST_ID);
    expect(mapTaskDraftToCommand(args).metadata.clientRequestId).toBe(REQUEST_ID);
  });

  it('草稿有錯時預覽不硬算一個決策出來', () => {
    const [family, variant] = pick('learn-reading', 'learn-reading-recurring');
    const draft = createTaskDraft(family, variant, DRAFT_CHILD, '6-9');
    expect(previewTaskRewardDecision({
      draft, family, variant, child: CHILD,
      taskPolicyVersion: TASK_POLICY_VERSION,
      clientRequestId: REQUEST_ID,
    })).toBeNull();
  });
});
