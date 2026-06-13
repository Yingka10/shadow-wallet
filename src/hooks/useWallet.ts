import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Wallet } from '../types/database';

export type UseWalletResult = {
  spending: Wallet | null;
  saving: Wallet | null;
  loading: boolean;
  refresh: () => void;
};

export function useWallet(childId: string): UseWalletResult {
  const [spending, setSpending] = useState<Wallet | null>(null);
  const [saving, setSaving] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const channelNameRef = useRef(`wallets:child_${childId}_${Date.now()}`);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('child_id', childId);

      if (error) throw error;

      const rows = data ?? [];
      setSpending(rows.find(w => w.wallet_type === 'spending') ?? null);
      setSaving(rows.find(w => w.wallet_type === 'saving') ?? null);
    } catch (err) {
      console.error('[useWallet] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    let isMounted = true;

    const setup = async () => {
      await fetchAll();

      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      if (!isMounted) return;

      const channel = supabase
        .channel(channelNameRef.current)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'wallets', filter: `child_id=eq.${childId}` },
          () => { if (isMounted) fetchAll(); },
        )
        .subscribe();

      if (isMounted) channelRef.current = channel;
    };

    setup();

    return () => {
      isMounted = false;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [childId, fetchAll]);

  return { spending, saving, loading, refresh: fetchAll };
}
