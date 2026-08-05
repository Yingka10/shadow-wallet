// Shadow Wallet · 家長端 — 單一孩子的完整資料
//
// ─────────────────────────────────────────────────────────────────────────
// 為什麼要獨立成一支 hook：
//
// 建立任務抽屜需要 `{ id, nickname, birthDate, familyId }` —— 年齡會決定
// 可選的任務與獎勵政策，所以 birth_date 不是可省略的欄位。
//
// 首頁的 `useParentDashboard` 與任務管理頁的 `useParentTaskList` 都已經
// 查過 `children`，**但兩者查的都是「目前選中的孩子」**。首頁的「指派任務」
// 允許指派給另一個孩子，而側欄的 `ChildOption` 只有 `{ id, nickname }` ——
// 那份清單餵不出 birthDate。
//
// 所以這裡把 `children` 的單列查詢抽成獨立一支：呼叫端已經有的孩子就直接
// 重用（不要多打一次 DB），只有「另一個孩子」才走這裡。
//
// ⚠️ 這支 hook **不進 SelectedChildContext**。把 birth_date 塞進全域選中
//    狀態，等於讓「暫時指派給另一個孩子」變成「切換整個家長端的孩子」——
//    家長按下取消之後，整頁的資料都已經換過去了。
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Child } from '../types/database';

export type ChildDetailsData = {
  child: Child | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

/**
 * 取一個孩子的完整 `children` 列。
 *
 * `childId` 傳 `null` 或空字串 = 現在不需要（例如抽屜沒開）——
 * 不查、不 loading、不報錯。空字串一定要擋：送出 `id=eq.` 會讓 Postgres
 * 以 22P02 回 400，畫面停在「資料載入失敗」而不是等資料進來
 * （與 `useParentTaskList` 同一道防線）。
 *
 * @param childId `children.id`；不需要時傳 null。
 */
export function useChildDetails(childId: string | null): ChildDetailsData {
  const [child, setChild] = useState<Child | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 這一次請求的號碼。回來時對不上就丟掉。
   *
   * 這裡比別的清單查詢更需要它：抽屜拿到的是**哪一個孩子**決定了任務會被
   * 指派給誰。家長連續切換目標孩子時，先送出的那一次若晚回來並蓋掉狀態，
   * 抽屜就會帶著上一個孩子去建立任務 —— 畫面上完全看不出來。
   */
  const requestTokenRef = useRef(0);

  const fetchChild = useCallback(async () => {
    const token = ++requestTokenRef.current;

    if (!childId) {
      setChild(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('children')
        .select('*')
        .eq('id', childId)
        .single();
      if (queryError) throw queryError;
      if (token !== requestTokenRef.current) return;
      setChild(data);
    } catch (err) {
      console.error('[useChildDetails] error:', err);
      if (token !== requestTokenRef.current) return;
      // 舊資料要清掉：留著的話畫面會拿一個「上一個孩子」繼續用。
      setChild(null);
      setError('資料載入失敗，請稍後再試');
    } finally {
      if (token === requestTokenRef.current) setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    void fetchChild();
  }, [fetchChild]);

  return { child, loading, error, refresh: fetchChild };
}
