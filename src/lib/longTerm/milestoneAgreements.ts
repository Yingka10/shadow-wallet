// GrowBook — 讀一個 task 底下的 canonical milestone agreements（P1-M1B）
//
// canonical read rule：同一 task/goal、effective（沒被 supersede）、
// reward-bearing 一定要 parent 已確認（schema 的 CHECK 已經保證這件事，
// 這裡再明講一次是防禦性寫法，不假設呼叫端一定走過 RPC）。
//
// 讀不到就是空陣列 —— 呼叫端（buildGoalPresentation）看到空陣列會
// fallback 回 legacy checkpoint_rewards 顯示路徑，不是打不開畫面。
//
// 三支個別 query 而不是一個 embedded select：milestone_* 三張表在
// database.ts 手動維護的 Database 型別裡 Relationships 是空的（不是
// codegen 出來的），PostgREST 的 embedded-select 型別推導在這裡靠不住，
// 分開查雖然多一趟往返，但型別跟資料都乾淨。

import { supabase } from '../supabase';

export type MilestoneAgreementView = {
  id: string;
  title: string;
  note: string | null;
  rewardCoinAmount: number | null;
  achievedAt: string | null;
  settledAt: string | null;
};

export async function loadMilestoneAgreements({
  taskId,
}: {
  taskId: string;
}): Promise<MilestoneAgreementView[]> {
  try {
    const { data: agreements, error: agreementError } = await supabase
      .from('milestone_agreements')
      .select('id, title, note, reward_coin_amount, parent_confirmed_at, superseded_at, effective_at')
      .eq('task_id', taskId)
      .is('superseded_at', null)
      .order('effective_at', { ascending: true });

    if (agreementError || !agreements || agreements.length === 0) return [];

    // canonical read rule：reward-bearing 一定要 parent 已確認才算 effective。
    // 沒有幣的 milestone（review-only 站）不強制要求。
    const effective = agreements.filter(
      (row) => row.reward_coin_amount === null || row.parent_confirmed_at !== null,
    );
    if (effective.length === 0) return [];

    const agreementIds = effective.map((row) => row.id);

    const [{ data: achievements }, { data: settlements }] = await Promise.all([
      supabase
        .from('milestone_achievements')
        .select('id, milestone_agreement_id, achieved_at')
        .in('milestone_agreement_id', agreementIds),
      supabase
        .from('milestone_settlements')
        .select('milestone_agreement_id, settled_at')
        .in('milestone_agreement_id', agreementIds),
    ]);

    const achievedAtByAgreement = new Map(
      (achievements ?? []).map((row) => [row.milestone_agreement_id, row.achieved_at]),
    );
    const settledAtByAgreement = new Map(
      (settlements ?? []).map((row) => [row.milestone_agreement_id, row.settled_at]),
    );

    return effective.map((row): MilestoneAgreementView => ({
      id: row.id,
      title: row.title,
      note: row.note,
      rewardCoinAmount: row.reward_coin_amount,
      achievedAt: achievedAtByAgreement.get(row.id) ?? null,
      settledAt: settledAtByAgreement.get(row.id) ?? null,
    }));
  } catch {
    // 這一段是補充資料：讀不到就 fallback legacy 路徑，不能讓整個詳情頁打不開。
    return [];
  }
}
