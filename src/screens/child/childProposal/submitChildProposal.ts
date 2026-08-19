// Shadow Wallet — 送出孩子提案（P0-2）
//
// ─────────────────────────────────────────────────────────────────────────
// 送出是**兩步**，而且不能合成一步：
//
//   1. create_child_proposal_v1  → 建立 draft（孩子的原話落地）
//   2. transition_child_proposal_v1 → draft → proposed（真的送出）
//
// P0-1 的 RPC 其實接受直接以 status: 'proposed' 建立。不那樣做的理由是
// 稽核鏈：分成兩步會在 child_proposal_status_events 留下
// 「→ draft」與「draft → proposed」兩筆，家長之後看得到孩子是先寫下、
// 再決定送出的。一步建立只會留下一筆，那段過程就消失了。
//
// 代價是中間可能斷掉。斷掉時**絕對不可以顯示成功** —— 孩子會以為
// 想法已經送到，而家長端什麼都看不到。所以失敗結果帶著 stage，
// 而且 transition 失敗時把 proposalId 帶回去：重試只要重送第二步，
// 不會產生第二份提案。
//
// ⚠️ 這裡不碰 tasks、child_tasks、wallets、transactions。
//    一個 import 都沒有 —— 沒有 import 就沒有路徑。
// ─────────────────────────────────────────────────────────────────────────

import type {
  ChildProposalFailureCode,
  CreateChildProposalCommand,
} from '../../../lib/childProposal/types';
import type { SupabaseChildProposalService } from '../../../lib/childProposal/childProposalService';
import { toProposeCommand } from './proposalDraft';

/** 送出走到哪一步失敗的。決定畫面要說什麼，以及重試要從哪裡開始。 */
export type SubmitStage = 'create' | 'transition';

export type SubmitProposalSuccess = {
  ok: true;
  proposalId: string;
  /** 真的到 proposed 才算成功。RPC 回別的狀態一律當失敗。 */
  status: 'proposed';
};

export type SubmitProposalFailure = {
  ok: false;
  stage: SubmitStage;
  code: ChildProposalFailureCode;
  message: string;
  /**
   * 第一步成功、第二步失敗時才有值。
   * 有值代表「內容已經存下來了，只是還沒送出」—— 重試要用它，不要重建。
   */
  proposalId?: string;
};

export type SubmitProposalResult = SubmitProposalSuccess | SubmitProposalFailure;

/** 只要這幾個方法，不要整包 service —— 測試才不必假造用不到的東西。 */
export type ProposalSubmitPort = Pick<SupabaseChildProposalService, 'create' | 'transition'>;

export type CreateDraftSuccess = { ok: true; proposalId: string };
export type CreateDraftResult = CreateDraftSuccess | SubmitProposalFailure;

/**
 * 只建立 draft，**不送出**（P1-A2）。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * P1 的流程在這裡分岔：孩子的原話先安全落地成 draft，然後才開始
 * 「一起想怎麼開始」。這一步刻意只做兩步中的第一步。
 *
 * 為什麼不是規劃完再一次建立：因為規劃會失敗。AI 逾時、孩子中途離開、
 * 網路斷掉 —— 這些都不可以讓他剛剛打的那段話消失。先存下來，
 * 後面發生什麼事都只是「這份 draft 還沒有規劃」。
 *
 * 為什麼不在這裡順便 transition：那是 P1-A3 的事。現在轉 proposed 的話，
 * 孩子看的是 P1 計畫、家長看到的會是背景跑出來的 P0 草稿 ——
 * 兩份「真正的計畫」不可以同時存在。
 *
 * ⚠️ 這一支**不取代** submitChildProposal。AI 關掉時走的仍然是那一支，
 *    一個字都沒有變（見 §3 的 legacy 路徑）。
 * ─────────────────────────────────────────────────────────────────────────
 */
export async function createChildProposalDraft(
  service: Pick<ProposalSubmitPort, 'create'>,
  command: CreateChildProposalCommand,
): Promise<CreateDraftResult> {
  const created = await service.create(command);

  if (!created.ok) {
    return {
      ok: false,
      stage: 'create',
      code: created.code,
      message: created.message,
    };
  }

  return { ok: true, proposalId: created.proposalId };
}

/**
 * 建立並送出一份提案。
 *
 * @param resumeProposalId 上一次第二步失敗時帶回來的 id。有值就跳過建立，
 *                         直接重送 —— 這是「不要因為重試而多一份提案」的作法。
 */
export async function submitChildProposal(
  service: ProposalSubmitPort,
  command: CreateChildProposalCommand,
  resumeProposalId?: string,
): Promise<SubmitProposalResult> {
  let proposalId = resumeProposalId;

  if (!proposalId) {
    const created = await service.create(command);

    if (!created.ok) {
      return {
        ok: false,
        stage: 'create',
        code: created.code,
        message: created.message,
      };
    }

    proposalId = created.proposalId;
  }

  const moved = await service.transition(toProposeCommand(proposalId));

  if (!moved.ok) {
    return {
      ok: false,
      stage: 'transition',
      code: moved.code,
      message: moved.message,
      // 內容還在。重試只要重送第二步。
      proposalId,
    };
  }

  // RPC 說 ok 但狀態不是 proposed → 不當成功。
  // 這種情況代表契約變了而這一層還沒跟上，靜靜通過會讓孩子看到假的成功畫面。
  if (moved.toStatus !== 'proposed') {
    return {
      ok: false,
      stage: 'transition',
      code: 'UNKNOWN',
      message: `提案狀態沒有變成已送出（收到 ${moved.toStatus}）`,
      proposalId,
    };
  }

  return { ok: true, proposalId, status: 'proposed' };
}
