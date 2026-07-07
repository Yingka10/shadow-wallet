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
 * 兌換願望：繞過 redeem_wish RPC（RPC 參照不存在的 reward_items.is_redeemed 欄位）。
 * 4 步直接操作：取餘額 → 餘額不足回傳 error → 扣款 → 寫交易 → 下架。
 */
export async function redeemWishItem({ childId, itemId, cost }: RedeemWishArgs): Promise<RedeemWishOutcome> {
  // 1. 取最新餘額
  const { data: wallet, error: walletErr } = await supabase
    .from('wallets')
    .select('id, balance')
    .eq('child_id', childId)
    .eq('wallet_type', 'spending')
    .single();

  if (walletErr || !wallet) throw walletErr ?? new Error('找不到錢包');

  // 2. 餘額檢查
  if (wallet.balance < cost) {
    return { ok: false, error: 'insufficient_balance' };
  }

  // 3. 扣款
  const { error: deductErr } = await supabase
    .from('wallets')
    .update({ balance: wallet.balance - cost })
    .eq('id', wallet.id);

  if (deductErr) throw deductErr;

  // 4. 寫交易紀錄
  const { error: txErr } = await supabase
    .from('transactions')
    .insert({
      wallet_id: wallet.id,
      amount: cost,
      type: 'redeem',
      reference_id: itemId,
      reference_type: 'reward_item',
    });

  if (txErr) throw txErr;

  // 5. 下架獎勵項目
  const { error: itemErr } = await supabase
    .from('reward_items')
    .update({ is_active: false })
    .eq('id', itemId);

  if (itemErr) throw itemErr;

  return { ok: true };
}
