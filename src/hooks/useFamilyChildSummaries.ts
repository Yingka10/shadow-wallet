import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { taipeiDayRange } from '../lib/taipeiDate';

/** Per-child snapshot used by the dashboard sidebar roster. */
export type ChildSummary = {
  doneToday: number;
  totalToday: number;
  balance: number;
};

export type FamilyChildSummaries = {
  /** Keyed by child_id. Children with no data fall back to zeros at the call site. */
  summaries: Record<string, ChildSummary>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

/**
 * Loads a lightweight today-summary (done / total tasks + spending balance) for
 * every child in a family, so the sidebar roster can show each child at a glance.
 *
 * Mirrors useParentDashboard's counting: totalToday = active assigned tasks,
 * doneToday = today's completions, balance = spending wallet balance.
 *
 * @param childIds - all children to summarise (typically the family roster).
 */
export function useFamilyChildSummaries(childIds: string[]): FamilyChildSummaries {
  const [summaries, setSummaries] = useState<Record<string, ChildSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable dependency so the effect only re-runs when the set of ids changes.
  const idsKey = [...childIds].sort().join(',');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = idsKey ? idsKey.split(',') : [];
      if (ids.length === 0) {
        setSummaries({});
        setLoading(false);
        return;
      }

      // Taipei-day UTC bounds so completions made during Taipei 00:00–08:00 are
      // counted for today rather than being lost to a UTC-midnight cast.
      const { startIso, endIso } = taipeiDayRange();

      // ── Batched queries across all children ────────────────────────────────
      const [ctRes, completionsRes, walletsRes] = await Promise.all([
        supabase.from('child_tasks').select('child_id, task_id').in('child_id', ids).eq('is_active', true),
        supabase.from('task_completions')
          .select('child_id')
          .in('child_id', ids)
          .gte('completed_at', startIso)
          .lt('completed_at', endIso),
        supabase.from('wallets')
          .select('child_id, balance')
          .in('child_id', ids)
          .eq('wallet_type', 'spending'),
      ]);

      if (ctRes.error) throw ctRes.error;
      if (completionsRes.error) throw completionsRes.error;
      if (walletsRes.error) throw walletsRes.error;

      const assignedTaskIds = Array.from(new Set((ctRes.data ?? []).map(r => r.task_id)));
      const activeTaskRes = assignedTaskIds.length > 0
        ? await supabase.from('tasks').select('id').in('id', assignedTaskIds).eq('is_active', true)
        : { data: [] as { id: string }[], error: null };
      if (activeTaskRes.error) throw activeTaskRes.error;

      const activeTaskIds = new Set((activeTaskRes.data ?? []).map(t => t.id));

      // totalToday per child = assigned tasks that are still active.
      const totalByChild: Record<string, number> = {};
      for (const row of ctRes.data ?? []) {
        if (activeTaskIds.has(row.task_id)) {
          totalByChild[row.child_id] = (totalByChild[row.child_id] ?? 0) + 1;
        }
      }

      const doneByChild: Record<string, number> = {};
      for (const row of completionsRes.data ?? []) {
        doneByChild[row.child_id] = (doneByChild[row.child_id] ?? 0) + 1;
      }

      const balanceByChild: Record<string, number> = {};
      for (const row of walletsRes.data ?? []) {
        balanceByChild[row.child_id] = row.balance ?? 0;
      }

      const next: Record<string, ChildSummary> = {};
      for (const id of ids) {
        next[id] = {
          doneToday: doneByChild[id] ?? 0,
          totalToday: totalByChild[id] ?? 0,
          balance: balanceByChild[id] ?? 0,
        };
      }
      setSummaries(next);
    } catch (err) {
      console.error('[useFamilyChildSummaries] error:', err);
      setError('資料載入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
    // idsKey is the stable representation of childIds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { summaries, loading, error, refresh: fetchAll };
}
