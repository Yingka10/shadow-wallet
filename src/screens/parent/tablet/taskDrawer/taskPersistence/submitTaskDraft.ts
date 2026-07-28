// Shadow Wallet · Parent Tablet — 提交管線
//
// 按下「確認建立」時整條重跑，不是把進入預覽時算好的 command 拿來重用。
//
// 原因是家長可以「預覽 → 返回修改 → 再預覽」。中間如果把每次改成 25 分鐘，
// 幣值就從 10 變 15；沿用舊 command 等於送出一份家長已經改過的決策 ——
// 畫面顯示 15、資料庫寫 10，而且沒有任何一層會發現。
//
// 五個步驟依序跑，任何一步失敗就停在那裡，**不呼叫 RPC**：
//   validateTaskDraft            家長改得動的欄位問題
//   mapTaskDraftToCommand        純映射（不算幣）
//   evaluateTaskReward           政策決定回饋與幣值
//   finalizeCreateParentTaskCommand  兩邊的回饋方式必須一致
//   service.create               唯一會寫資料庫的一步
//
// clientRequestId 由呼叫端傳入、不在這裡產生：它屬於草稿的生命週期，
// 每次重跑管線都必須是同一個，否則重試會建出第二筆任務。

import type { TaskPresetFamily, TaskPresetVariant } from '../taskCatalog';
import {
  hasErrors,
  validateTaskDraft,
  type TaskDraft,
  type TaskDraftValidationErrors,
} from '../taskDraft';
import { evaluateTaskReward } from '../taskReward';
import type { TaskRewardDecision } from '../taskReward/types';
import { finalizeCreateParentTaskCommand } from './finalizeCreateParentTaskCommand';
import { mapTaskDraftToCommand } from './mapTaskDraftToCommand';
import type {
  CommandChildContext,
  CreateParentTaskCommand,
  CreateParentTaskFailureCode,
  ParentTaskCreationService,
} from './types';

export type SubmitTaskDraftArgs = {
  draft: TaskDraft;
  family: TaskPresetFamily;
  variant: TaskPresetVariant;
  child: CommandChildContext;
  taskPolicyVersion: string;
  /** 整份草稿共用同一個，重試不變。 */
  clientRequestId: string;
  service: ParentTaskCreationService;
};

/**
 * 失敗停在哪一步。
 *
 * UI 要靠它決定「回編輯畫面」還是「留在預覽」——
 * 欄位問題家長改得動，政策問題改不動。
 */
export type SubmitFailureStage = 'validation' | 'reward' | 'service';

export type SubmitTaskDraftOutcome =
  | {
      ok: true;
      command: CreateParentTaskCommand;
      taskId: string;
      relatedIds: string[];
      idempotentReplay: boolean;
    }
  | {
      ok: false;
      stage: SubmitFailureStage;
      code: CreateParentTaskFailureCode;
      message: string;
      /** stage === 'validation' 時一定有；可直接餵回 editor 的 field-keyed errors。 */
      fieldErrors?: TaskDraftValidationErrors;
      /** 走到 reward 之後才有；讓 UI 顯示是哪一份決策被擋下。 */
      decision?: TaskRewardDecision;
    };

/** 送出一份草稿。這是唯一會呼叫建立 service 的地方。 */
export async function submitTaskDraft(
  args: SubmitTaskDraftArgs,
): Promise<SubmitTaskDraftOutcome> {
  const { draft, family, variant, child, taskPolicyVersion, clientRequestId, service } = args;

  // ── 1. 驗證 ──────────────────────────────────────────────────────────────
  const errors = validateTaskDraft(draft, variant, child.ageGroup);
  if (hasErrors(errors)) {
    return {
      ok: false,
      stage: 'validation',
      code: 'VALIDATION_FAILED',
      message: '有些設定需要再確認。',
      fieldErrors: errors,
    };
  }

  // ── 2. 映射 ──────────────────────────────────────────────────────────────
  const base = mapTaskDraftToCommand({
    draft,
    family,
    variant,
    child,
    taskPolicyVersion,
    clientRequestId,
  });

  // ── 3. 回饋決策 ──────────────────────────────────────────────────────────
  const decision = evaluateTaskReward({ command: base, childAgeGroup: child.ageGroup });

  // ── 4. 合成 ──────────────────────────────────────────────────────────────
  const finalized = finalizeCreateParentTaskCommand(base, decision);
  if (!finalized.ok) {
    return {
      ok: false,
      stage: 'reward',
      // 這些都是「這個組合本來就不允許」，家長補欄位也不會變合法。
      code: 'POLICY_REJECTED',
      message: finalized.message,
      decision,
    };
  }

  // ── 5. 寫入 ──────────────────────────────────────────────────────────────
  const result = await service.create(finalized.command);
  if (!result.ok) {
    return {
      ok: false,
      stage: 'service',
      code: result.code,
      message: result.message,
      ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : null),
      decision,
    };
  }

  return {
    ok: true,
    command: finalized.command,
    taskId: result.taskId,
    relatedIds: result.relatedIds,
    idempotentReplay: result.idempotentReplay,
  };
}

/**
 * 提交前先算一次回饋決策，給預覽畫面顯示用。
 *
 * 和 submitTaskDraft 走同一組函式，所以預覽上看到的就是等一下真的會送出的那份 ——
 * 兩邊各算一次才是「畫面說一套、送出另一套」的來源。
 * 草稿本身有欄位錯誤時回 null：那種狀態下映射的前提不成立。
 */
export function previewTaskRewardDecision(
  args: Omit<SubmitTaskDraftArgs, 'service'>,
): TaskRewardDecision | null {
  const { draft, family, variant, child, taskPolicyVersion, clientRequestId } = args;

  if (hasErrors(validateTaskDraft(draft, variant, child.ageGroup))) return null;

  const base = mapTaskDraftToCommand({
    draft, family, variant, child, taskPolicyVersion, clientRequestId,
  });
  return evaluateTaskReward({ command: base, childAgeGroup: child.ageGroup });
}
