// NOTE: This hook queries a `redemption_requests` table.
// Create it in Supabase before using pending/history features:
//
//   create table redemption_requests (
//     id                uuid        primary key default gen_random_uuid(),
//     family_id         uuid        not null references families(id),
//     child_id          uuid        not null references children(id),
//     name              text        not null,
//     description       text,
//     coin_cost         integer     not null,
//     status            text        not null default 'pending',
//     ai_verdict        text,
//     ai_reason         text,
//     ai_suggested_coins integer,
//     adjusted_coins    integer,
//     parent_note       text,
//     created_at        timestamptz not null default now(),
//     reviewed_at       timestamptz
//   );
//
//   alter table redemption_requests enable row level security;
//
// For parent proposals, this hook uses the existing `reward_items` table
// (added_by = 'parent', parent_approved = true).

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type AiVerdict = 'ok' | 'high';
export type RedemptionStatus = 'pending' | 'approved' | 'rejected';

export type RedemptionRequest = {
  id: string;
  child_id: string;
  family_id: string;
  name: string;
  description: string | null;
  coin_cost: number;
  status: RedemptionStatus;
  ai_verdict: AiVerdict | null;
  ai_reason: string | null;
  ai_suggested_coins: number | null;
  adjusted_coins: number | null;
  parent_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type ParentProposal = {
  id: string;
  family_id: string;
  child_id: string | null;
  name: string;
  coin_cost: number;
  is_active: boolean;
  created_at: string;
};

export type RedemptionChildInfo = {
  id: string;
  nickname: string;
};

/** Mock AI review based on coin cost — replace with real AI call later. */
export function mockAiResult(coinCost: number): {
  verdict: AiVerdict;
  reason: string;
  suggestedCoins: number | null;
} {
  if (coinCost <= 50) {
    return {
      verdict: 'ok',
      reason: '幣值合理，與孩子目前的獲幣速度相符，屬於短期可達成的目標。',
      suggestedCoins: null,
    };
  }
  if (coinCost <= 100) {
    return {
      verdict: 'ok',
      reason: '幣值稍高但屬合理範圍，孩子需要努力幾週才能達成，是不錯的中期目標。',
      suggestedCoins: null,
    };
  }
  const suggested = Math.round((coinCost * 0.65) / 5) * 5;
  return {
    verdict: 'high',
    reason: `幣值偏高，以目前獲幣速度估算超過兩個月才能達成，建議調整至 ${suggested} 幣左右。`,
    suggestedCoins: suggested,
  };
}

/** Return stored AI result if available; otherwise fall back to mock. */
export function getAiResult(req: RedemptionRequest): {
  verdict: AiVerdict;
  reason: string;
  suggestedCoins: number | null;
} {
  if (req.ai_verdict && req.ai_reason) {
    return {
      verdict: req.ai_verdict,
      reason: req.ai_reason,
      suggestedCoins: req.ai_suggested_coins,
    };
  }
  return mockAiResult(req.coin_cost);
}

export function useParentRedemption(familyId: string | null) {
  const [pendingRequests, setPendingRequests] = useState<RedemptionRequest[]>([]);
  const [parentProposals, setParentProposals] = useState<ParentProposal[]>([]);
  const [history, setHistory] = useState<RedemptionRequest[]>([]);
  const [children, setChildren] = useState<RedemptionChildInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    setError(null);
    try {
      const [childrenRes, pendingRes, proposalsRes, historyRes] = await Promise.all([
        supabase
          .from('children')
          .select('id, nickname')
          .eq('family_id', familyId),
        supabase
          .from('redemption_requests' as never)
          .select('*')
          .eq('family_id', familyId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('reward_items')
          .select('*')
          .eq('family_id', familyId)
          .eq('added_by', 'parent')
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('redemption_requests' as never)
          .select('*')
          .eq('family_id', familyId)
          .neq('status', 'pending')
          .order('reviewed_at', { ascending: false })
          .limit(50),
      ]);

      if (childrenRes.error) throw childrenRes.error;

      setChildren((childrenRes.data ?? []) as RedemptionChildInfo[]);
      setPendingRequests((pendingRes.data ?? []) as RedemptionRequest[]);
      setParentProposals((proposalsRes.data ?? []) as ParentProposal[]);
      setHistory((historyRes.data ?? []) as RedemptionRequest[]);
    } catch (err) {
      console.error('[useParentRedemption] fetch error:', err);
      setError('資料載入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  const approveRequest = useCallback(async (id: string, adjustedCoins?: number) => {
    const payload: Record<string, unknown> = {
      status: 'approved',
      reviewed_at: new Date().toISOString(),
    };
    if (adjustedCoins !== undefined) payload.adjusted_coins = adjustedCoins;

    const { error: err } = await supabase
      .from('redemption_requests' as never)
      .update(payload as never)
      .eq('id', id);
    if (err) throw err;
  }, []);

  const rejectRequest = useCallback(async (id: string, note: string) => {
    const { error: err } = await supabase
      .from('redemption_requests' as never)
      .update({
        status: 'rejected',
        parent_note: note.trim() || null,
        reviewed_at: new Date().toISOString(),
      } as never)
      .eq('id', id);
    if (err) throw err;
  }, []);

  const addParentProposal = useCallback(
    async (data: { name: string; coin_cost: number; child_id: string | null }) => {
      if (!familyId) return;
      const { error: err } = await supabase.from('reward_items').insert({
        family_id: familyId,
        child_id: data.child_id,
        name: data.name,
        reward_type: 'item' as const,
        coin_cost: data.coin_cost,
        added_by: 'parent' as const,
        parent_approved: true,
      });
      if (err) throw err;
    },
    [familyId],
  );

  const removeParentProposal = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from('reward_items')
      .update({ is_active: false })
      .eq('id', id);
    if (err) throw err;
  }, []);

  return {
    pendingRequests,
    parentProposals,
    history,
    children,
    loading,
    error,
    fetchAll,
    approveRequest,
    rejectRequest,
    addParentProposal,
    removeParentProposal,
  };
}
