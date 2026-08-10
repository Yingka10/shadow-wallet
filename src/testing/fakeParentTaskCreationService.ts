// Shadow Wallet — 建立 service 的測試替身
//
// 放在 src/testing/ 而不是某個 __tests__/ 底下：jest 會把 __tests__ 裡的每一支
// 檔案都當成測試套件，一個只有 helper 沒有 it() 的檔案會直接讓那一支失敗。
//
// production 不會 import 這支（沒有任何一支非測試檔案 import 它，
// drawerSubmit.test 有一條斷言在守這件事）。
//
// 它必須能演出的情境，就是抽屜真的會遇到的那幾種：
//   成功 / 延遲成功（測 submitting 狀態）/ 欄位錯誤 / 政策拒絕 /
//   寫入失敗 / idempotent replay
// 「refresh 失敗」不在這裡 —— 那是列表的事，由 onRefreshTaskList 直接 reject。

import type {
  CreateParentTaskCommand,
  CreateParentTaskResult,
  ParentTaskCreationService,
} from '../screens/parent/tablet/taskDrawer/taskPersistence';

export type FakeCreationBehaviour =
  | { kind: 'success'; taskId?: string; idempotentReplay?: boolean }
  /** resolve 交給呼叫端控制，用來停在 submitting 狀態上做斷言。 */
  | { kind: 'manual' }
  | { kind: 'validationError'; fieldErrors?: Record<string, string> }
  | { kind: 'policyRejected'; message?: string }
  | { kind: 'persistenceFailed'; message?: string }
  | { kind: 'unknown'; message?: string };

export class FakeParentTaskCreationService implements ParentTaskCreationService {
  /** 每一次呼叫收到的命令。用來檢查「只送了一次」與「重試沿用同一個識別碼」。 */
  readonly calls: CreateParentTaskCommand[] = [];

  private behaviour: FakeCreationBehaviour;
  private pending: ((result: CreateParentTaskResult) => void) | null = null;

  constructor(behaviour: FakeCreationBehaviour = { kind: 'success' }) {
    this.behaviour = behaviour;
  }

  /** 換下一次呼叫的行為（例如失敗一次之後改成成功，測重試）。 */
  setBehaviour(behaviour: FakeCreationBehaviour): void {
    this.behaviour = behaviour;
  }

  /** kind: 'manual' 時，由測試決定什麼時候 resolve。 */
  resolveManual(result: CreateParentTaskResult): void {
    const resolve = this.pending;
    if (!resolve) throw new Error('沒有等待中的 create 呼叫');
    this.pending = null;
    resolve(result);
  }

  get callCount(): number {
    return this.calls.length;
  }

  /** 每次呼叫帶的建立請求識別碼，依序排列。 */
  get requestIds(): string[] {
    return this.calls.map(command => command.metadata.clientRequestId);
  }

  async create(command: CreateParentTaskCommand): Promise<CreateParentTaskResult> {
    this.calls.push(command);
    const behaviour = this.behaviour;

    switch (behaviour.kind) {
      case 'manual':
        return new Promise<CreateParentTaskResult>(resolve => {
          this.pending = resolve;
        });

      case 'validationError':
        return {
          ok: false,
          code: 'VALIDATION_FAILED',
          message: '還有欄位需要補齊',
          ...(behaviour.fieldErrors ? { fieldErrors: behaviour.fieldErrors } : null),
        };

      case 'policyRejected':
        return {
          ok: false,
          code: 'POLICY_REJECTED',
          message: behaviour.message ?? '家庭參與只能以家庭貢獻回饋，不發成長幣',
        };

      case 'persistenceFailed':
        return {
          ok: false,
          code: 'PERSISTENCE_FAILED',
          // 預設是一段像 Postgres 原始錯誤的字串 —— 用來檢查它不會被顯示給家長。
          message: behaviour.message
            ?? 'insert or update on table "tasks" violates foreign key constraint',
        };

      case 'unknown':
        return {
          ok: false,
          code: 'UNKNOWN',
          message: behaviour.message ?? 'PGRST202 function public.create_parent_task_v1 not found',
        };

      default:
        return {
          ok: true,
          taskId: behaviour.taskId ?? 'task-created-1',
          relatedIds: ['child-task-1'],
          idempotentReplay: behaviour.idempotentReplay ?? false,
        };
    }
  }
}
