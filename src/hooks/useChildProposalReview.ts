import { useCallback, useEffect, useRef, useState } from 'react';
import { SupabaseChildProposalService } from '../lib/childProposal/childProposalService';
import type { ChildProposalReviewData } from '../lib/childProposal/types';
import { isChildPlanningReviewCard } from '../lib/childPlanning/childReview';

export type ChildProposalReviewReader = Pick<
  SupabaseChildProposalService,
  'listNeedsReviewForChild' | 'acceptReview' | 'requestChanges'
> & Partial<Pick<
  SupabaseChildProposalService,
  'acceptChildPlanningTerms' | 'requestChildPlanningTermChanges'
>>;

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
    // P1 與 legacy 是兩條線。路由只看 authorship 與 lineage —— 內容看起來
    // 像什麼都不能決定走哪一支。
    const planningRoute = isChildPlanningReviewCard(review)
      && typeof reader.acceptChildPlanningTerms === 'function';
    setActingProposalId(review.proposal.id);
    try {
      const result = planningRoute
        ? await reader.acceptChildPlanningTerms!(review, childAgeGroup)
        : await reader.acceptReview(review, childAgeGroup);
      if (actionGeneration.current !== generation) return false;
      if (result.ok !== true) {
        setActionError(result.message);
        return false;
      }
      await refresh();
      if (actionGeneration.current !== generation) return false;
      // 「同意這一輪」不是「開始了」。訊息說錯的話，孩子會以為今天
      // 就要開始做，然後在任務清單裡找不到它。
      setSuccessMessage(
        planningRoute && 'activated' in result && result.activated !== true
          ? '好，這些安排你說可以了，還有一項要再和爸媽確認'
          : '這份計畫一起說好了',
      );
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
    const planningRoute = isChildPlanningReviewCard(review)
      && typeof reader.requestChildPlanningTermChanges === 'function';
    setActingProposalId(review.proposal.id);
    try {
      const result = planningRoute
        ? await reader.requestChildPlanningTermChanges!(review, reason)
        : await reader.requestChanges(review, reason);
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
