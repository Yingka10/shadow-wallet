import { supabase } from '../../lib/supabase';

type RedeemWishArgs = {
  childId: string;
  itemId: string;
  cost: number;
};

export type RedeemWishOutcome =
  | { ok: true }
  | { ok: false; error: string };

export async function redeemWishItem({ childId, itemId, cost }: RedeemWishArgs): Promise<RedeemWishOutcome> {
  const { data, error } = await supabase.rpc('redeem_wish', {
    p_child_id: childId,
    p_item_id: itemId,
    p_cost: cost,
  });

  if (error) throw error;

  const result = data as { ok?: boolean; error?: string } | null;
  if (result?.error) return { ok: false, error: result.error };
  return { ok: true };
}
