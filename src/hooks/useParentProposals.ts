import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SupabaseChildProposalService,
  type ParentProposalCardData,
} from '../lib/childProposal';

export type ParentProposalReader = Pick<SupabaseChildProposalService, 'listProposedForParent'>
  & Partial<Pick<SupabaseChildProposalService, 'confirmDirect'>>;

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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const requestId = useRef(0);

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
    setConfirmError(null);
    setSuccessMessage(null);
    setConfirmingProposalId(null);
  }, [childId, familyId]);

  const confirmProposal = useCallback(async (card: ParentProposalCardData) => {
    setConfirmError(null);
    setSuccessMessage(null);
    if (!reader.confirmDirect || !childAgeGroup) {
      setConfirmError('目前還不能確認這個計畫，請重新整理後再試。');
      return;
    }

    setConfirmingProposalId(card.proposal.id);
    try {
      const result = await reader.confirmDirect(card, childAgeGroup);
      if (result.ok !== true) {
        setConfirmError(result.message);
        return;
      }
      setSuccessMessage('已經一起確認好了');
      await refresh();
    } catch (caught) {
      setConfirmError(caught instanceof Error ? caught.message : '建立共同計畫失敗');
    } finally {
      setConfirmingProposalId(null);
    }
  }, [childAgeGroup, reader, refresh]);

  return {
    proposals,
    loading,
    error,
    refresh,
    confirmProposal,
    confirmingProposalId,
    confirmError,
    successMessage,
  };
}
