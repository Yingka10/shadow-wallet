// Shadow Wallet — 孩子端「想換閱讀時段」的送出流程（P0-8M）
//
// 這支 hook 只負責一件事：判斷「這份長期計畫能不能重新協商時段」，
// 以及把孩子的選擇送成一筆正式的 adjustment request。
//
// 刻意不做的事：
//   - 不自己 INSERT。所有寫入都經過 SECURITY DEFINER RPC，畫面拿不到捷徑。
//   - 不在送出失敗時清掉孩子的選擇。孩子剛剛才做完回顧，清掉等於要他重來。
//   - 不對「一般家長建立的長期任務」做任何事。讀不到共同計畫就回 null，
//     畫面維持原本的 local draft 行為。

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
  SupabaseChildProposalService,
  type ChildProposalReadingTimeWindow,
  type ChildSharedPlanContext,
} from '../lib/childProposal';
import { newClientRequestId } from '../screens/parent/tablet/taskDrawer/taskPersistence/clientRequestId';

export type ChildSharedPlanAdjustmentReader = Pick<
  SupabaseChildProposalService,
  'getActiveSharedPlanForTask' | 'createAdjustmentRequest'
>;

const defaultReader = new SupabaseChildProposalService();

const TIME_LABELS: Record<ChildSharedPlanTimeWindow, string> = {
  after_dinner: '晚餐後',
  before_bed: '睡前',
};

type ChildSharedPlanTimeWindow = ChildProposalReadingTimeWindow;

/**
 * 孩子的原因取自他剛剛在回顧裡做的選擇，不另外再問一輪，也不由 AI 代寫。
 * 「這週最喜歡哪一本書」那一題和調整理由無關，不會被當成理由送出去。
 */
export function buildTimeAdjustmentReason(
  preferredTime: ChildSharedPlanTimeWindow,
): string {
  return `這週回顧後，我想改成${TIME_LABELS[preferredTime]}試試看。`;
}

export function useChildSharedPlanTimeAdjustment(
  taskId: string | null,
  childId: string | null,
  reader: ChildSharedPlanAdjustmentReader = defaultReader,
) {
  const [context, setContext] = useState<ChildSharedPlanContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const generationRef = useRef(0);
  /*
    送出有自己的 generation，**不能**共用讀取的那一個 —— submit 成功後會呼叫
    refresh，而 refresh 會把讀取 generation 往前推。共用的話，送出流程收尾時
    會判定「自己已經過期」而跳過 setSubmitting(false)，按鈕從此卡在送出中。
  */
  const submitGenerationRef = useRef(0);

  /*
    同一次送出的識別碼。**不能**每次 render 或每次重試重新產生 ——
    重試的整個意義就是「這是剛才那一件事」，換了 id，RPC 只會看到第二件事。
    送出成功之後才清掉，下一次調整才是新的一件事。
  */
  const clientRequestIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const generation = ++generationRef.current;
    if (!taskId || !childId) {
      setContext(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const next = await reader.getActiveSharedPlanForTask({ taskId, childId });
      if (generationRef.current !== generation) return;
      setContext(next);
    } catch {
      // 讀不到共同計畫時**不要**把畫面變成錯誤狀態 —— 孩子只是在看計畫，
      // 而「能不能重新協商」對閱讀進度沒有影響。降級成「不能協商」即可。
      if (generationRef.current !== generation) return;
      setContext(null);
    } finally {
      if (generationRef.current === generation) setLoading(false);
    }
  }, [childId, reader, taskId]);

  useEffect(() => {
    submitGenerationRef.current += 1;
    setContext(null);
    setSubmitError(null);
    setJustSubmitted(false);
    setSubmitting(false);
    clientRequestIdRef.current = null;
    void refresh();
  }, [refresh]);

  const currentPreferredTime = context?.currentPlanVersion.preferred_time ?? null;
  const hasOpenRequest = Boolean(context?.openPreferredTimeRequest);

  /** 這一個時段值送出去有沒有意義。UI 用它決定 CTA 要不要換字。 */
  const canSubmit = useCallback(
    (preferredTime: ChildSharedPlanTimeWindow | null): boolean => {
      if (!context || !preferredTime) return false;
      if (hasOpenRequest) return false;
      if (!context.proposal.current_plan_version_id) return false;
      return currentPreferredTime !== preferredTime;
    },
    [context, currentPreferredTime, hasOpenRequest],
  );

  const submit = useCallback(async (
    preferredTime: ChildSharedPlanTimeWindow,
  ): Promise<boolean> => {
    if (!context || submitting) return false;
    if (!canSubmit(preferredTime)) return false;

    const expectedPlanVersionId = context.proposal.current_plan_version_id;
    if (!expectedPlanVersionId) return false;

    const generation = submitGenerationRef.current;
    const isCurrent = () => submitGenerationRef.current === generation;

    if (!clientRequestIdRef.current) {
      clientRequestIdRef.current = newClientRequestId();
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await reader.createAdjustmentRequest({
        schemaVersion: CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
        proposalId: context.proposal.id,
        expectedPlanVersionId,
        adjustmentKind: 'preferred_time',
        reason: buildTimeAdjustmentReason(preferredTime),
        requestedChanges: { preferredTime, preferredTimeCustom: null },
        clientRequestId: clientRequestIdRef.current,
      });
      if (!isCurrent()) return false;

      if (result.ok !== true) {
        setSubmitError(result.message);
        return false;
      }

      clientRequestIdRef.current = null;
      setJustSubmitted(true);
      await refresh();
      return true;
    } catch (caught) {
      if (!isCurrent()) return false;
      setSubmitError(caught instanceof Error ? caught.message : '送出失敗，可以再試一次。');
      return false;
    } finally {
      if (isCurrent()) setSubmitting(false);
    }
  }, [canSubmit, context, reader, refresh, submitting]);

  return {
    /** null 代表這不是可協商的共同計畫（例如一般家長建立的長期任務）。 */
    sharedPlan: context,
    loading,
    currentPreferredTime,
    hasOpenRequest,
    canSubmit,
    submit,
    submitting,
    submitError,
    justSubmitted,
    refresh,
  };
}
