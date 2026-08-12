// Shadow Wallet · Parent Tablet — 「孩子想調整時段」卡片的呈現層（P0-8M）
//
// 這裡**不**自己算 diff。差異一律由 childProposal/materialDiff 產生：
// 把「請求要求的新時段」套進 based-on 版本做出一份假想的 after，再交給
// materialDiff 比對。好處有兩個 ——
//
//   1. 家長在提案 review 看到的字，和在這張卡看到的字，保證是同一套說法。
//   2. 如果請求要求的值其實和現況一樣，materialDiff 會回空陣列，這張卡就
//      不存在。「沒有差異的調整請求」不該長成一張可以按的卡。

import type {
  ChildProposalAdjustmentCardData,
  ChildProposalMaterialDiff,
  ChildProposalPlanVersion,
} from '../../../../lib/childProposal';
import { materialDiff } from '../../../../lib/childProposal';

export type ParentAdjustmentCardView = {
  id: string;
  title: string;
  reason: string | null;
  /** 只會有時段這一列 —— 其他欄位在 after 裡原封不動複製，比不出差異。 */
  diffs: ChildProposalMaterialDiff[];
};

/** requested_changes 是 jsonb，型別上是 unknown。逐鍵驗過才用。 */
function readRequestedPreferredTime(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const requested = (value as { preferredTime?: unknown }).preferredTime;
  return typeof requested === 'string' && requested.length > 0 ? requested : null;
}

export function presentParentAdjustment(
  card: ChildProposalAdjustmentCardData,
  childName: string,
): ParentAdjustmentCardView | null {
  const requestedTime = readRequestedPreferredTime(card.request.requested_changes);
  if (!requestedTime) return null;

  const after: ChildProposalPlanVersion = {
    ...card.basedOnPlanVersion,
    preferred_time: requestedTime,
    preferred_time_custom: null,
  };
  const diffs = materialDiff(card.basedOnPlanVersion, after);
  if (diffs.length === 0) return null;

  const reason = card.request.reason?.trim();
  return {
    id: card.request.id,
    title: `${childName}想調整閱讀時間`,
    reason: reason ? reason : null,
    diffs,
  };
}
