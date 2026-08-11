import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SupabaseChildProposalService,
  type ChildProposalReviewData,
} from '../lib/childProposal';

export type ChildProposalReviewReader = Pick<
  SupabaseChildProposalService,
  'listNeedsReviewForChild' | 'acceptReview' | 'requestChanges'
>;

const defaultReader = new SupabaseChildProposalService();

export function useChildProposalReview(
  childId: string | null,
  familyId: string | null,
  childAgeGroup: string | null,
  reader: ChildProposalReviewReader = defaultReader,
) {
  const [reviews, setReviews] = useState<ChildProposalReviewData[]>([]);
  const [loading, setLoading] = useState(Boolean(childId && familyId));
  const [error, setError] = useState<string | null>(null);
  const [actingProposalId, setActingProposalId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const readGeneration = useRef(0);
  const actionGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++readGeneration.current;
    if (!childId || !familyId) {
      setReviews([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await reader.listNeedsReviewForChild({ childId, familyId, limit: 3 });
      if (readGeneration.current !== generation) return;
      setReviews(next);
    } catch (caught) {
      if (readGeneration.current !== generation) return;
      setReviews([]);
      setError(caught instanceof Error ? caught.message : '讀取要一起看的計畫失敗');
    } finally {
      if (readGeneration.current === generation) setLoading(false);
    }
  }, [childId, familyId, reader]);

  useEffect(() => {
    actionGeneration.current += 1;
    setReviews([]);
    setActingProposalId(null);
    setActionError(null);
    setSuccessMessage(null);
    void refresh();
    return () => { readGeneration.current += 1; };
  }, [childId, familyId, refresh]);

  const accept = useCallback(async (review: ChildProposalReviewData): Promise<boolean> => {
    const generation = ++actionGeneration.current;
    setActionError(null);
    setSuccessMessage(null);
    if (!childAgeGroup) {
      setActionError('目前還不能確認這份計畫，請重新整理後再試。');
      return false;
    }
    setActingProposalId(review.proposal.id);
    try {
      const result = await reader.acceptReview(review, childAgeGroup);
      if (actionGeneration.current !== generation) return false;
      if (result.ok !== true) {
        setActionError(result.message);
        return false;
      }
      await refresh();
      if (actionGeneration.current !== generation) return false;
      setSuccessMessage('這份計畫一起說好了');
      return true;
    } catch (caught) {
      if (actionGeneration.current === generation) {
        setActionError(caught instanceof Error ? caught.message : '確認計畫失敗');
      }
      return false;
    } finally {
      if (actionGeneration.current === generation) setActingProposalId(null);
    }
  }, [childAgeGroup, reader, refresh]);

  const requestChanges = useCallback(async (
    review: ChildProposalReviewData,
    reason?: string,
  ): Promise<boolean> => {
    const generation = ++actionGeneration.current;
    setActionError(null);
    setSuccessMessage(null);
    setActingProposalId(review.proposal.id);
    try {
      const result = await reader.requestChanges(review, reason);
      if (actionGeneration.current !== generation) return false;
      if (result.ok !== true) {
        setActionError(result.message);
        return false;
      }
      await refresh();
      if (actionGeneration.current !== generation) return false;
      setSuccessMessage('好，我們再一起聊聊');
      return true;
    } catch (caught) {
      if (actionGeneration.current === generation) {
        setActionError(caught instanceof Error ? caught.message : '暫時保留討論失敗');
      }
      return false;
    } finally {
      if (actionGeneration.current === generation) setActingProposalId(null);
    }
  }, [reader, refresh]);

  return {
    reviews,
    loading,
    error,
    refresh,
    accept,
    requestChanges,
    actingProposalId,
    actionError,
    successMessage,
  };
}
