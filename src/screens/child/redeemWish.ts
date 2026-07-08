import { supabase } from '../../lib/supabase';

type RedeemWishArgs = {
  childId: string;
  itemId: string;
  cost: number;
};

export type RedeemWishOutcome =
  | { ok: true }
  | { ok: false; error: string };

/**
 * 兌換願望：呼叫 redeem_wish RPC（原子、race-safe、冪等）。
 */
export async function redeemWishItem({ childId, itemId, cost }: RedeemWishArgs): Promise<RedeemWishOutcome> {
  const { data, error } = await supabase.rpc('redeem_wish', {
    p_child_id: childId,
    p_item_id: itemId,
    p_cost: cost,
  });

  if (error) throw error;

  if (data?.error === 'already_redeemed') return { ok: false, error: 'already_redeemed' };
  if (data?.error === 'insufficient_balance') return { ok: false, error: 'insufficient_balance' };
  return { ok: true };
}
