import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SupabaseChildProposalService,
  type ParentProposalCardData,
  type ParentProposalMaterialEdits,
} from '../lib/childProposal';
import { resolveConfirmRoute } from '../lib/childPlanning/parentAgreement';

export type ParentProposalReader = Pick<SupabaseChildProposalService, 'listProposedForParent'>
  & Partial<Pick<
    SupabaseChildProposalService,
    'confirmDirect' | 'confirmChildPlanAgreement' | 'revisePlan' | 'closeUnsuitable'
  >>;

const defaultReader = new SupabaseChildProposalService();

export function useParentProposals(
  childId: string | null,
  familyId: string | null,
  reader: ParentProposalReader = defaultReader,
  childAgeGroup: string | null = null,
) {
  const [proposals, setProposals] = useState<ParentProposalCardData[]>([]);
  const [loading, setLoading] = useState(Boolean(childId && familyId));
  const [error, setError] = useState<string | null>(null);
  const [confirmingProposalId, setConfirmingProposalId] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [actingProposalId, setActingProposalId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const requestId = useRef(0);
  const actionRequestId = useRef(0);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;

    if (!childId || !familyId) {
      setProposals([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await reader.listProposedForParent({ childId, familyId, limit: 3 });
      if (requestId.current !== currentRequest) return;
      setProposals(next);
    } catch (caught) {
      if (requestId.current !== currentRequest) return;
      setProposals([]);
      setError(caught instanceof Error ? caught.message : '讀取孩子的新想法失敗');
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, [childId, familyId, reader]);

  useEffect(() => {
    void refresh();
    return () => { requestId.current += 1; };
  }, [refresh]);

  useEffect(() => {
    actionRequestId.current += 1;
    setProposals([]);
    setLoading(Boolean(childId && familyId));
    setConfirmError(null);
    setActionError(null);
    setSuccessMessage(null);
    setConfirmingProposalId(null);
    setActingProposalId(null);
  }, [childId, familyId]);

  const confirmProposal = useCallback(async (card: ParentProposalCardData) => {
    const currentAction = ++actionRequestId.current;
    setConfirmError(null);
    setSuccessMessage(null);

    // 路由只看 authorship 與 lineage。兩條線是兩支 RPC，語意不同 ——
    // 合成一支帶旗標的，每加一個條件都要先問「這是哪一條的」。
    const route = resolveConfirmRoute(card);
    const confirm = route === 'child_planning_plan'
      ? reader.confirmChildPlanAgreement
      : route === 'legacy_ai_plan'
        ? reader.confirmDirect
        : undefined;

    if (!confirm || !childAgeGroup) {
      setConfirmError('目前還不能確認這個計畫，請重新整理後再試。');
      return;
    }

    setConfirmingProposalId(card.proposal.id);
    try {
      const result = await confirm.call(reader, card, childAgeGroup);
      if (actionRequestId.current !== currentAction) return;
      if (result.ok !== true) {
        setConfirmError(result.message);
        return;
      }
      setSuccessMessage(route === 'child_planning_plan' ? '已經一起說定了' : '已經一起確認好了');
      await refresh();
    } catch (caught) {
      setConfirmError(caught instanceof Error ? caught.message : '建立共同計畫失敗');
    } finally {
      if (actionRequestId.current === currentAction) setConfirmingProposalId(null);
    }
  }, [childAgeGroup, reader, refresh]);

  const reviseProposal = useCallback(async (
    card: ParentProposalCardData,
    edits: ParentProposalMaterialEdits,
  ): Promise<boolean> => {
    const currentAction = ++actionRequestId.current;
    setActionError(null);
    setSuccessMessage(null);
    if (!reader.revisePlan) {
      setActionError('目前還不能儲存調整，請重新整理後再試。');
      return false;
    }
    setActingProposalId(card.proposal.id);
    try {
      const result = await reader.revisePlan(card, edits);
      if (actionRequestId.current !== currentAction) return false;
      if (result.ok !== true) {
        setActionError(result.message);
        return false;
      }
      await refresh();
      if (actionRequestId.current !== currentAction) return false;
      setSuccessMessage('已存下來，等孩子看看');
      return true;
    } catch (caught) {
      if (actionRequestId.current === currentAction) {
        setActionError(caught instanceof Error ? caught.message : '儲存調整失敗');
      }
      return false;
    } finally {
      if (actionRequestId.current === currentAction) setActingProposalId(null);
    }
  }, [reader, refresh]);

  const closeProposal = useCallback(async (
    card: ParentProposalCardData,
    reason: string,
  ): Promise<boolean> => {
    const currentAction = ++actionRequestId.current;
    setActionError(null);
    setSuccessMessage(null);
    if (!reader.closeUnsuitable) {
      setActionError('目前還不能先收起這個想法，請重新整理後再試。');
      return false;
    }
    setActingProposalId(card.proposal.id);
    try {
      const result = await reader.closeUnsuitable(card, reason);
      if (actionRequestId.current !== currentAction) return false;
      if (result.ok !== true) {
        setActionError(result.message);
        return false;
      }
      await refresh();
      if (actionRequestId.current !== currentAction) return false;
      setSuccessMessage('已先把這個想法收好');
      return true;
    } catch (caught) {
      if (actionRequestId.current === currentAction) {
        setActionError(caught instanceof Error ? caught.message : '關閉提案失敗');
      }
      return false;
    } finally {
      if (actionRequestId.current === currentAction) setActingProposalId(null);
    }
  }, [reader, refresh]);

  return {
    proposals,
    loading,
    error,
    refresh,
    confirmProposal,
    confirmingProposalId,
    confirmError,
    reviseProposal,
    closeProposal,
    actingProposalId,
    actionError,
    successMessage,
  };
}
