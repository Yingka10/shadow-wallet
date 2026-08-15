// GrowBook — 從一筆任務讀回它背後的共同計畫（LT-FINAL-1R §H）
//
// 這是長期詳情頁第一次真的讀得到孩子自己確認過的那份計畫。
// 讀不到就是 null —— 那代表這筆任務不是 P1 規劃來的，不是「再猜一份」。

import { supabase } from '../supabase';
import type { ChildProposalPlanVersion } from '../childProposal/types';
import {
  readAgreedReward,
  readChildConfirmedPlan,
  resolveChildFormalPlanVersion,
} from './sharedPlanLineage';
import type { AgreedRewardView, ChildConfirmedPlanView } from './sharedPlanLineage';

export type LongTermSharedPlan = {
  proposalId: string;
  effectivePlanVersionId: string;
  childPlan: ChildConfirmedPlanView | null;
  agreedReward: AgreedRewardView | null;
  /** 有共同版本，但回饋語意是 legacy 的（見 readAgreedReward）。 */
  legacyReward: boolean;
};

export async function loadLongTermSharedPlan({
  taskId,
  childId,
}: {
  taskId: string;
  childId: string;
}): Promise<LongTermSharedPlan | null> {
  try {
    return await load(taskId, childId);
  } catch {
    // 這一段是**補充資料**：讀不到就少顯示孩子那半邊，
    // 不可以讓整個詳情頁打不開。
    return null;
  }
}

async function load(
  taskId: string,
  childId: string,
): Promise<LongTermSharedPlan | null> {
  const { data: linked, error: linkError } = await supabase
    .from('child_proposal_plan_versions')
    .select('proposal_id')
    .eq('confirmed_source_task_id', taskId)
    .limit(20);
  if (linkError) return null;

  const proposalIds = [...new Set((linked ?? []).map((row) => row.proposal_id))];
  if (proposalIds.length === 0) return null;

  const { data: proposals, error: proposalError } = await supabase
    .from('child_proposals')
    .select('id, child_id, current_plan_version_id, status')
    .in('id', proposalIds)
    .eq('child_id', childId)
    .eq('status', 'active')
    .limit(2);
  if (proposalError) return null;

  // 一個任務對到兩個 active 提案是資料矛盾，不是可以挑一個的選擇題。
  const proposal = proposals?.length === 1 ? proposals[0] : null;
  if (!proposal?.current_plan_version_id) return null;

  const { data: versions, error: versionError } = await supabase
    .from('child_proposal_plan_versions')
    .select('*')
    .eq('proposal_id', proposal.id)
    .limit(40);
  if (versionError) return null;

  const all = (versions ?? []) as ChildProposalPlanVersion[];
  const effective = all.find((version) => version.id === proposal.current_plan_version_id) ?? null;
  if (!effective) return null;

  // ⚠️ 沿 adoption lineage 走，不是挑第一筆 authored_by='child'。
  const formal = resolveChildFormalPlanVersion(all, proposal.current_plan_version_id);
  const agreedReward = readAgreedReward(effective);

  return {
    proposalId: proposal.id,
    effectivePlanVersionId: effective.id,
    childPlan: readChildConfirmedPlan(formal),
    agreedReward,
    legacyReward: agreedReward === null && effective.confirmed_reward_policy !== null,
  };
}
