// Shadow Wallet — 孩子端回顧後的重新協商送出流程
//
// 前身是 useChildSharedPlanTimeAdjustment（P0-8M，只有換時段一條）。
// CHILD-REVIEW-V2 多了每週次數，兩條通道共用同一份共同計畫 context，
// 但**其餘全部各自獨立**：
//
//   各自的 clientRequestId    重試是「剛才那一件事」，兩條事不是同一件
//   各自的 submitting / error 一條失敗不該讓另一條看起來也壞了
//   各自的 pending            送過換時段不該連帶把改次數也鎖住
//
// 刻意不做的事：
//   - 不自己 INSERT。所有寫入都經過 SECURITY DEFINER RPC，畫面拿不到捷徑。
//   - 不在送出失敗時清掉孩子的選擇。孩子剛剛才做完回顧，清掉等於要他重來。
//   - 不對「一般家長建立的長期任務」做任何事。讀不到共同計畫就回 null，
//     畫面連選項都不會長出來。
//   - **不從進度推導次數。** 要改成幾次由呼叫端（孩子選的方向）決定。

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
 */
export function buildTimeAdjustmentReason(
  preferredTime: ChildSharedPlanTimeWindow,
): string {
  return `這週回顧後，我想改成${TIME_LABELS[preferredTime]}試試看。`;
}

/**
 * 同上。**不寫**「因為這週只完成 2 次」之類的理由 —— 那會把孩子選的方向
 * 重新詮釋成一個績效歸因，而那不是他說的話。
 */
export function buildCadenceAdjustmentReason(weeklyFrequency: number): string {
  return `這週回顧後，我想改成每週 ${weeklyFrequency} 次試試看。`;
}

type Lane = {
  submitting: boolean;
  error: string | null;
  justSubmitted: boolean;
};

const EMPTY_LANE: Lane = { submitting: false, error: null, justSubmitted: false };

export function useChildSharedPlanAdjustments(
  taskId: string | null,
  childId: string | null,
  reader: ChildSharedPlanAdjustmentReader = defaultReader,
) {
  const [context, setContext] = useState<ChildSharedPlanContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeLane, setTimeLane] = useState<Lane>(EMPTY_LANE);
  const [cadenceLane, setCadenceLane] = useState<Lane>(EMPTY_LANE);

  const generationRef = useRef(0);
  /*
    送出有自己的 generation，**不能**共用讀取的那一個 —— submit 成功後會呼叫
    refresh，而 refresh 會把讀取 generation 往前推。共用的話，送出流程收尾時
    會判定「自己已經過期」而跳過收尾，按鈕從此卡在送出中。
  */
  const submitGenerationRef = useRef(0);

  /*
    同一次送出的識別碼，兩條通道各一個。**不能**每次 render 或每次重試重新
    產生 —— 重試的整個意義就是「這是剛才那一件事」，換了 id，RPC 只會看到
    第二件事。送出成功之後才清掉，下一次調整才是新的一件事。
  */
  const timeRequestIdRef = useRef<string | null>(null);
  const cadenceRequestIdRef = useRef<string | null>(null);

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
      // 而「能不能重新協商」對進度顯示沒有影響。降級成「不能協商」即可。
      if (generationRef.current !== generation) return;
      setContext(null);
    } finally {
      if (generationRef.current === generation) setLoading(false);
    }
  }, [childId, reader, taskId]);

  useEffect(() => {
    submitGenerationRef.current += 1;
    setContext(null);
    setTimeLane(EMPTY_LANE);
    setCadenceLane(EMPTY_LANE);
    timeRequestIdRef.current = null;
    cadenceRequestIdRef.current = null;
    void refresh();
  }, [refresh]);

  const currentPreferredTime = context?.currentPlanVersion.preferred_time ?? null;
  const currentWeeklyFrequency =
    context?.currentPlanVersion.cadence_weekly_frequency ?? null;
  const hasOpenTimeRequest = Boolean(context?.openPreferredTimeRequest);
  const hasOpenCadenceRequest = Boolean(context?.openCadenceRequest);

  const canSubmitTime = useCallback(
    (preferredTime: ChildSharedPlanTimeWindow | null): boolean => {
      if (!context || !preferredTime) return false;
      if (hasOpenTimeRequest) return false;
      if (!context.proposal.current_plan_version_id) return false;
      return currentPreferredTime !== preferredTime;
    },
    [context, currentPreferredTime, hasOpenTimeRequest],
  );

  const canSubmitCadence = useCallback(
    (weeklyFrequency: number | null): boolean => {
      if (!context || weeklyFrequency === null) return false;
      if (hasOpenCadenceRequest) return false;
      if (!context.proposal.current_plan_version_id) return false;
      // 這份計畫本來就沒有每週次數的話，沒有東西可以談。
      if (currentWeeklyFrequency === null) return false;
      if (!Number.isInteger(weeklyFrequency)) return false;
      if (weeklyFrequency < 1 || weeklyFrequency > 7) return false;
      return currentWeeklyFrequency !== weeklyFrequency;
    },
    [context, currentWeeklyFrequency, hasOpenCadenceRequest],
  );

  const submitTime = useCallback(async (
    preferredTime: ChildSharedPlanTimeWindow,
  ): Promise<boolean> => {
    if (!context || timeLane.submitting) return false;
    if (!canSubmitTime(preferredTime)) return false;

    const expectedPlanVersionId = context.proposal.current_plan_version_id;
    if (!expectedPlanVersionId) return false;

    const generation = submitGenerationRef.current;
    const isCurrent = () => submitGenerationRef.current === generation;

    if (!timeRequestIdRef.current) {
      timeRequestIdRef.current = newClientRequestId();
    }

    setTimeLane(lane => ({ ...lane, submitting: true, error: null }));
    try {
      const result = await reader.createAdjustmentRequest({
        schemaVersion: CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
        proposalId: context.proposal.id,
        expectedPlanVersionId,
        adjustmentKind: 'preferred_time',
        reason: buildTimeAdjustmentReason(preferredTime),
        requestedChanges: { preferredTime, preferredTimeCustom: null },
        clientRequestId: timeRequestIdRef.current,
      });
      if (!isCurrent()) return false;

      if (result.ok !== true) {
        setTimeLane(lane => ({ ...lane, error: result.message }));
        return false;
      }

      timeRequestIdRef.current = null;
      setTimeLane(lane => ({ ...lane, justSubmitted: true }));
      await refresh();
      return true;
    } catch (caught) {
      if (!isCurrent()) return false;
      setTimeLane(lane => ({
        ...lane,
        error: caught instanceof Error ? caught.message : '送出失敗，可以再試一次。',
      }));
      return false;
    } finally {
      if (isCurrent()) setTimeLane(lane => ({ ...lane, submitting: false }));
    }
  }, [canSubmitTime, context, reader, refresh, timeLane.submitting]);

  const submitCadence = useCallback(async (
    weeklyFrequency: number,
  ): Promise<boolean> => {
    if (!context || cadenceLane.submitting) return false;
    if (!canSubmitCadence(weeklyFrequency)) return false;

    const expectedPlanVersionId = context.proposal.current_plan_version_id;
    if (!expectedPlanVersionId) return false;

    const generation = submitGenerationRef.current;
    const isCurrent = () => submitGenerationRef.current === generation;

    if (!cadenceRequestIdRef.current) {
      cadenceRequestIdRef.current = newClientRequestId();
    }

    setCadenceLane(lane => ({ ...lane, submitting: true, error: null }));
    try {
      const result = await reader.createAdjustmentRequest({
        schemaVersion: CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
        proposalId: context.proposal.id,
        expectedPlanVersionId,
        adjustmentKind: 'cadence',
        reason: buildCadenceAdjustmentReason(weeklyFrequency),
        requestedChanges: { weeklyFrequency },
        clientRequestId: cadenceRequestIdRef.current,
      });
      if (!isCurrent()) return false;

      if (result.ok !== true) {
        setCadenceLane(lane => ({ ...lane, error: result.message }));
        return false;
      }

      cadenceRequestIdRef.current = null;
      setCadenceLane(lane => ({ ...lane, justSubmitted: true }));
      await refresh();
      return true;
    } catch (caught) {
      if (!isCurrent()) return false;
      setCadenceLane(lane => ({
        ...lane,
        error: caught instanceof Error ? caught.message : '送出失敗，可以再試一次。',
      }));
      return false;
    } finally {
      if (isCurrent()) setCadenceLane(lane => ({ ...lane, submitting: false }));
    }
  }, [canSubmitCadence, cadenceLane.submitting, context, reader, refresh]);

  return {
    /** null 代表這不是可協商的共同計畫（例如一般家長建立的長期任務）。 */
    sharedPlan: context,
    loading,
    refresh,

    currentPreferredTime,
    hasOpenTimeRequest,
    canSubmitTime,
    submitTime,
    timeSubmitting: timeLane.submitting,
    timeError: timeLane.error,
    timeJustSubmitted: timeLane.justSubmitted,

    currentWeeklyFrequency,
    hasOpenCadenceRequest,
    canSubmitCadence,
    submitCadence,
    cadenceSubmitting: cadenceLane.submitting,
    cadenceError: cadenceLane.error,
    cadenceJustSubmitted: cadenceLane.justSubmitted,
  };
}
