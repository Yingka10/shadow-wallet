// Shadow Wallet — 家長首頁的「孩子想調整時段」待回應清單（P0-8M）
//
// 與 useParentProposals 同一套骨架：selected-child 換人時舊請求的回應不得覆寫
// 新孩子的畫面，所以每次讀取與每次動作都帶一個遞增的 generation。
//
// 這一層不做 diff、不做文案 —— 那些在 ParentAdjustmentSection。

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
  SupabaseChildProposalService,
  formatPreferredTimeValue,
  type ChildProposalAdjustmentCardData,
} from '../lib/childProposal';

/** 成功訊息要說出真正被寫進去的時段，不能寫死。 */
function acceptedTimeLabel(card: ChildProposalAdjustmentCardData): string | null {
  const changes = card.request.requested_changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null;
  const requested = (changes as { preferredTime?: unknown }).preferredTime;
  if (typeof requested !== 'string' || requested.length === 0) return null;
  return formatPreferredTimeValue(requested, null);
}

export type ParentAdjustmentReader = Pick<
  SupabaseChildProposalService,
  'listOpenAdjustmentsForParent' | 'acceptAdjustment' | 'declineAdjustment'
>;

const defaultReader = new SupabaseChildProposalService();

export function useParentAdjustmentRequests(
  childId: string | null,
  familyId: string | null,
  reader: ParentAdjustmentReader = defaultReader,
) {
  const [requests, setRequests] = useState<ChildProposalAdjustmentCardData[]>([]);
  const [loading, setLoading] = useState(Boolean(childId && familyId));
  const [error, setError] = useState<string | null>(null);
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const readGeneration = useRef(0);
  const actionGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++readGeneration.current;

    if (!childId || !familyId) {
      setRequests([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await reader.listOpenAdjustmentsForParent({ childId, familyId });
      if (readGeneration.current !== generation) return;
      setRequests(next);
    } catch (caught) {
      if (readGeneration.current !== generation) return;
      setRequests([]);
      setError(caught instanceof Error ? caught.message : '讀取孩子的調整請求失敗');
    } finally {
      if (readGeneration.current === generation) setLoading(false);
    }
  }, [childId, familyId, reader]);

  useEffect(() => {
    void refresh();
    return () => { readGeneration.current += 1; };
  }, [refresh]);

  // 換孩子時整批清乾淨。留著上一個孩子的卡片一秒都不行 —— 家長會以為
  // 那是現在這個孩子提的。
  useEffect(() => {
    actionGeneration.current += 1;
    setRequests([]);
    setLoading(Boolean(childId && familyId));
    setActionError(null);
    setSuccessMessage(null);
    setActingRequestId(null);
  }, [childId, familyId]);

  const accept = useCallback(async (
    card: ChildProposalAdjustmentCardData,
  ): Promise<boolean> => {
    // 已經有一件動作在跑就直接不受理。DB 那層有 idempotency 擋重複，
    // 但那是最後一道防線，不是讓 UI 可以連送的理由。
    if (actingRequestId) return false;

    const generation = ++actionGeneration.current;
    setActionError(null);
    setSuccessMessage(null);
    setActingRequestId(card.request.id);
    try {
      const result = await reader.acceptAdjustment({
        schemaVersion: CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
        adjustmentRequestId: card.request.id,
        expectedPlanVersionId: card.basedOnPlanVersion.id,
      });
      if (actionGeneration.current !== generation) return false;
      if (result.ok !== true) {
        setActionError(result.message);
        return false;
      }
      await refresh();
      if (actionGeneration.current !== generation) return false;
      const label = acceptedTimeLabel(card);
      setSuccessMessage(label ? `已一起更新成${label}。` : '已一起更新好了。');
      return true;
    } catch (caught) {
      if (actionGeneration.current === generation) {
        setActionError(caught instanceof Error ? caught.message : '確認調整失敗');
      }
      return false;
    } finally {
      if (actionGeneration.current === generation) setActingRequestId(null);
    }
  }, [actingRequestId, reader, refresh]);

  const decline = useCallback(async (
    card: ChildProposalAdjustmentCardData,
  ): Promise<boolean> => {
    if (actingRequestId) return false;

    const generation = ++actionGeneration.current;
    setActionError(null);
    setSuccessMessage(null);
    setActingRequestId(card.request.id);
    try {
      const result = await reader.declineAdjustment({
        schemaVersion: CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
        adjustmentRequestId: card.request.id,
      });
      if (actionGeneration.current !== generation) return false;
      if (result.ok !== true) {
        setActionError(result.message);
        return false;
      }
      await refresh();
      if (actionGeneration.current !== generation) return false;
      setSuccessMessage('先維持原本安排。');
      return true;
    } catch (caught) {
      if (actionGeneration.current === generation) {
        setActionError(caught instanceof Error ? caught.message : '保留原本安排失敗');
      }
      return false;
    } finally {
      if (actionGeneration.current === generation) setActingRequestId(null);
    }
  }, [actingRequestId, reader, refresh]);

  return {
    requests,
    loading,
    error,
    refresh,
    accept,
    decline,
    actingRequestId,
    actionError,
    successMessage,
  };
}
