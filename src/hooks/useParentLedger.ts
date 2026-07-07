import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { supabase } from '../lib/supabase';
import type { Transaction, TransactionType } from '../types/database';

/**
 * 帳本紀錄用的事件模型。把 transactions 與 time_savings 攤平成同一種「一筆帳」，
 * 讓帳本頁只管畫，不管資料來自哪張表。
 */
export type LedgerKind = 'coin' | 'time' | 'redeem' | 'adjust';

export type LedgerEvent = {
  id: string;
  kind: LedgerKind;
  /** 顯示用金額（一律正數，正負由 kind 決定） */
  amount: number;
  unit: 'coin' | 'min';
  /** 右側類型 chip 文字 */
  chipLabel: string;
  /** 這筆做了什麼（幫忙洗碗 / 兌換：週末電影夜） */
  desc: string;
  /** 狀態·時間 左半（完成回報 / 家長已確認 / 由家長調整） */
  statusLabel: string;
  /** HH:mm */
  time: string;
  createdAt: string;
};

export type LedgerFilter = 'all' | 'coin' | 'time' | 'redeem' | 'adjust';

export type LedgerDayGroup = {
  /** YYYY-MM-DD */
  dateKey: string;
  /** 7/10 */
  dateLabel: string;
  /** 週四 */
  dowLabel: string;
  coinDelta: number;
  minuteDelta: number;
  redeemCount: number;
  events: LedgerEvent[];
};

export type UseParentLedgerResult = {
  balance: number;
  monthNet: number;
  timeSavingTotal: number;
  groups: LedgerDayGroup[];
  loading: boolean;
  refresh: () => void;
};

const DOW_ZH = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

/** 每種 transaction type 對應的帳本語義。sign 為顯示正負；credit 用於淨額計算。 */
const TX_META: Record<
  TransactionType,
  { kind: LedgerKind; chipLabel: string; statusLabel: string; credit: 1 | -1 }
> = {
  earn:     { kind: 'coin',   chipLabel: '成長幣', statusLabel: '完成回報',   credit: 1 },
  interest: { kind: 'adjust', chipLabel: '利息',   statusLabel: '系統結算',   credit: 1 },
  adjust:   { kind: 'adjust', chipLabel: '補記',   statusLabel: '家長調整',   credit: 1 },
  deduct:   { kind: 'adjust', chipLabel: '調整',   statusLabel: '家長調整',   credit: -1 },
  redeem:   { kind: 'redeem', chipLabel: '兌換',   statusLabel: '家長已確認', credit: -1 },
};

function defaultDesc(type: TransactionType): string {
  switch (type) {
    case 'earn':     return '完成任務獲得成長幣';
    case 'redeem':   return '兌換獎勵';
    case 'deduct':   return '成長幣調整';
    case 'adjust':   return '補記調整';
    case 'interest': return '時間儲蓄利息';
  }
}

/**
 * 帳本紀錄 —— 把某個孩子「會影響成長幣、時間儲蓄或兌換」的事件彙整成依日分組的帳本。
 * 資料來源：wallets（餘額）＋ transactions（幣／兌換／調整）＋ time_savings（時間）。
 *
 * @param childId 目前選中的孩子
 * @param filter  類型篩選（全部 / 成長幣 / 時間儲蓄 / 兌換 / 調整補記）
 * @param rangeDays 只看最近 N 天；null＝全部
 */
export function useParentLedger(
  childId: string,
  filter: LedgerFilter,
  rangeDays: number | null,
): UseParentLedgerResult {
  const [balance, setBalance] = useState(0);
  const [monthNet, setMonthNet] = useState(0);
  const [timeSavingTotal, setTimeSavingTotal] = useState(0);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!childId) {
      setEvents([]);
      setBalance(0);
      setMonthNet(0);
      setTimeSavingTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 1) 錢包 —— spending 餘額＝目前成長幣
      const { data: wallets, error: walletErr } = await supabase
        .from('wallets')
        .select('id, wallet_type, balance')
        .eq('child_id', childId);
      if (walletErr) throw walletErr;

      const walletRows = wallets ?? [];
      const spending = walletRows.find((w) => w.wallet_type === 'spending');
      const walletIds = walletRows.map((w) => w.id);
      setBalance(spending?.balance ?? 0);

      // 2) transactions —— 幣 / 兌換 / 調整
      let txns: Transaction[] = [];
      if (walletIds.length > 0) {
        const { data: txData, error: txErr } = await supabase
          .from('transactions')
          .select('id, wallet_id, amount, type, reference_id, reference_type, note, created_at')
          .in('wallet_id', walletIds)
          .order('created_at', { ascending: false });
        if (txErr) throw txErr;
        txns = (txData ?? []) as Transaction[];
      }

      // 3) time_savings —— 時間儲蓄（盡力 join 任務名稱，失敗就用通用描述）
      let timeRows: Array<{
        id: string;
        minutes_saved: number;
        created_at: string;
        taskName?: string | null;
      }> = [];
      {
        const nested = await supabase
          .from('time_savings')
          .select('id, minutes_saved, created_at, task_completions(child_tasks(tasks(name)))')
          .eq('child_id', childId)
          .order('created_at', { ascending: false });
        if (!nested.error && nested.data) {
          timeRows = (nested.data as unknown as Array<Record<string, unknown>>).map((r) => {
            const comp = r.task_completions as { child_tasks?: { tasks?: { name?: string } } } | null;
            return {
              id: String(r.id),
              minutes_saved: Number(r.minutes_saved ?? 0),
              created_at: String(r.created_at),
              taskName: comp?.child_tasks?.tasks?.name ?? null,
            };
          });
        } else {
          const plain = await supabase
            .from('time_savings')
            .select('id, minutes_saved, created_at')
            .eq('child_id', childId)
            .order('created_at', { ascending: false });
          if (plain.error) throw plain.error;
          timeRows = (plain.data ?? []).map((r) => ({
            id: r.id,
            minutes_saved: r.minutes_saved,
            created_at: r.created_at,
          }));
        }
      }

      // ── 攤平成 LedgerEvent ──
      const txEvents: LedgerEvent[] = txns.map((t) => {
        const meta = TX_META[t.type];
        return {
          id: `tx-${t.id}`,
          kind: meta.kind,
          amount: Math.abs(t.amount),
          unit: 'coin',
          chipLabel: meta.chipLabel,
          desc: t.note?.trim() || defaultDesc(t.type),
          statusLabel: meta.statusLabel,
          time: dayjs(t.created_at).format('HH:mm'),
          createdAt: t.created_at,
        };
      });

      const timeEvents: LedgerEvent[] = timeRows.map((r) => ({
        id: `ts-${r.id}`,
        kind: 'time',
        amount: r.minutes_saved,
        unit: 'min',
        chipLabel: '時間儲蓄',
        desc: r.taskName?.trim() || '完成家庭本分任務',
        statusLabel: '完成回報',
        time: dayjs(r.created_at).format('HH:mm'),
        createdAt: r.created_at,
      }));

      const all = [...txEvents, ...timeEvents].sort((a, b) =>
        dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf(),
      );
      setEvents(all);

      // ── 摘要 ──
      const startOfMonth = dayjs().startOf('month');
      const net = txns.reduce((sum, t) => {
        if (!dayjs(t.created_at).isAfter(startOfMonth)) return sum;
        return sum + Math.abs(t.amount) * TX_META[t.type].credit;
      }, 0);
      setMonthNet(net);

      const timeTotal = timeRows.reduce((sum, r) => sum + r.minutes_saved, 0);
      setTimeSavingTotal(timeTotal);
    } catch (err) {
      console.error('[useParentLedger] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // ── 篩選（類型 + 期間）＋依日分組 ──
  const cutoff = rangeDays != null ? dayjs().subtract(rangeDays, 'day') : null;
  const visible = events.filter((e) => {
    if (cutoff && dayjs(e.createdAt).isBefore(cutoff)) return false;
    if (filter === 'all') return true;
    if (filter === 'coin') return e.kind === 'coin';
    if (filter === 'time') return e.kind === 'time';
    if (filter === 'redeem') return e.kind === 'redeem';
    return e.kind === 'adjust';
  });

  const groupMap = new Map<string, LedgerDayGroup>();
  for (const e of visible) {
    const d = dayjs(e.createdAt);
    const dateKey = d.format('YYYY-MM-DD');
    let group = groupMap.get(dateKey);
    if (!group) {
      group = {
        dateKey,
        dateLabel: d.format('M/D'),
        dowLabel: DOW_ZH[d.day()],
        coinDelta: 0,
        minuteDelta: 0,
        redeemCount: 0,
        events: [],
      };
      groupMap.set(dateKey, group);
    }
    group.events.push(e);
    if (e.kind === 'coin' || e.kind === 'adjust') group.coinDelta += e.amount;
    else if (e.kind === 'time') group.minuteDelta += e.amount;
    else if (e.kind === 'redeem') group.redeemCount += 1;
  }
  const groups = Array.from(groupMap.values()).sort((a, b) =>
    dayjs(b.dateKey).valueOf() - dayjs(a.dateKey).valueOf(),
  );

  return { balance, monthNet, timeSavingTotal, groups, loading, refresh: fetchAll };
}
