// Shadow Wallet — 預設任務建立 service（Supabase adapter）
//
// 職責只有一件事：把 CreateParentTaskCommand 交給 create_parent_task_v1，
// 再把 RPC 的回覆翻成 CreateParentTaskResult。
//
// 刻意不做的事：不碰 UI、不 refresh 任何列表、不吞錯誤、
// 也不用 console.error 當作錯誤處理 —— 呼叫端要拿到結構化的失敗原因才做得了事。
//
// 為什麼建立邏輯完全不在這裡：家庭角色一次要寫五張表，
// 前端多次 insert 沒有交易，任何一步失敗都會留下孤兒 task
// （ParentTaskCreateScreen 與 taskActions.ts 現在就是這樣）。
// 整段搬進 RPC 之後，這一層只剩傳話。
//
// 本輪 production Drawer 不呼叫這支 —— DraftReview 的「確認建立」仍是 disabled。
// 串接留到第七階段 B。

import { supabase } from './supabase';
import type {
  CreateParentTaskCommand,
  CreateParentTaskFailureCode,
  CreateParentTaskResult,
  ParentTaskCreationService,
} from '../screens/parent/tablet/taskDrawer/taskPersistence';

/** RPC 名稱。改版時會是 _v2，舊版仍留著給尚未更新的 client。 */
export const CREATE_PARENT_TASK_RPC = 'create_parent_task_v1';

/** create_parent_task_v1 回傳的 jsonb 形狀。 */
type CreateParentTaskRpcResponse =
  | { ok: true; taskId: string; relatedIds: string[] | null }
  | { ok: false; code: CreateParentTaskFailureCode; message: string };

const FAILURE_CODES: CreateParentTaskFailureCode[] = [
  'VALIDATION_FAILED',
  'POLICY_REJECTED',
  'PERSISTENCE_FAILED',
  'UNKNOWN',
];

function isFailureCode(value: unknown): value is CreateParentTaskFailureCode {
  return typeof value === 'string'
    && (FAILURE_CODES as string[]).includes(value);
}

/**
 * Postgres / PostgREST 的錯誤碼 → 我們的四個 code。
 *
 * 分類的依據是「呼叫端該做什麼」：
 *   VALIDATION_FAILED  家長改得動 —— 回編輯畫面補欄位
 *   POLICY_REJECTED    家長改不動 —— 這個組合本來就不允許（含跨家庭）
 *   PERSISTENCE_FAILED 家長沒做錯 —— 重試或回報
 *   UNKNOWN            我們沒看過的東西，不要假裝知道
 */
export function mapPostgresErrorCode(code: string | undefined): CreateParentTaskFailureCode {
  if (!code) return 'UNKNOWN';

  // 42501 = insufficient_privilege。RPC 的 authz 檢查（跨家庭、未登入）走這個。
  if (code === '42501') return 'POLICY_REJECTED';

  // 22xxx = data exception（uuid 格式錯、日期格式錯…）→ 命令本身有問題。
  // 23514 = check_violation，也就是我們自己的 CHECK constraint 擋下的值。
  if (code.startsWith('22') || code === '23514') return 'VALIDATION_FAILED';

  // 其餘 23xxx（外鍵、唯一鍵）與 40001 序列化失敗都是寫入層的問題。
  if (code.startsWith('23') || code.startsWith('40')) return 'PERSISTENCE_FAILED';

  // PGRST202 = 找不到這個 function（migration 還沒套用）。
  if (code === 'PGRST202') return 'PERSISTENCE_FAILED';

  return 'UNKNOWN';
}

export class SupabaseParentTaskCreationService implements ParentTaskCreationService {
  async create(command: CreateParentTaskCommand): Promise<CreateParentTaskResult> {
    let data: unknown;
    let error: { code?: string; message?: string } | null = null;

    try {
      const response = await supabase.rpc(CREATE_PARENT_TASK_RPC, { p_command: command });
      data = response.data;
      error = response.error;
    } catch (thrown) {
      // 網路層丟出來的東西不是 PostgrestError，沒有 code 可以分類。
      return {
        ok: false,
        code: 'PERSISTENCE_FAILED',
        message: thrown instanceof Error ? thrown.message : '建立任務時發生連線錯誤',
      };
    }

    if (error) {
      return {
        ok: false,
        code: mapPostgresErrorCode(error.code),
        message: error.message ?? '建立任務失敗',
      };
    }

    const payload = data as CreateParentTaskRpcResponse | null;

    if (!payload || typeof payload !== 'object' || !('ok' in payload)) {
      // RPC 回了我們看不懂的東西。不能當成成功 —— 沒有 taskId 就是沒建立。
      return { ok: false, code: 'UNKNOWN', message: '建立任務的回應格式無法辨識' };
    }

    if (payload.ok === true) {
      if (typeof payload.taskId !== 'string' || payload.taskId.length === 0) {
        return { ok: false, code: 'UNKNOWN', message: '建立任務的回應缺少任務編號' };
      }
      return {
        ok: true,
        taskId: payload.taskId,
        relatedIds: Array.isArray(payload.relatedIds) ? payload.relatedIds : [],
      };
    }

    return {
      ok: false,
      // RPC 自己給的 code 優先；給了沒見過的值就退回 UNKNOWN，不要硬塞。
      code: isFailureCode(payload.code) ? payload.code : 'UNKNOWN',
      message: typeof payload.message === 'string' && payload.message.length > 0
        ? payload.message
        : '建立任務失敗',
    };
  }
}
