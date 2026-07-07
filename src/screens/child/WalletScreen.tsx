import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import dayjs from 'dayjs';
import type { RootStackParamList } from '../../../App';
import BottomNav from '../../components/BottomNav';
import GradientBackground from '../../components/child/GradientBackground';
import { CoinIcon } from '../../components/icons/TaskIcons';
import { Colors } from '../../constants/colors';
import { webMouseDraggableScroll, webScreen } from '../../constants/webStyles';
import { supabase } from '../../lib/supabase';
import { useWallet } from '../../hooks/useWallet';
import type { Transaction } from '../../types/database';

type WalletRoute = RouteProp<RootStackParamList, 'Wallet'>;
type Nav = StackNavigationProp<RootStackParamList, 'Wallet'>;

type LedgerTone = 'earn' | 'spend' | 'interest' | 'adjust';

type LedgerItem = {
  id: string;
  title: string;
  subtitle: string;
  amount: number;
  tone: LedgerTone;
};

type WalletSummary = {
  id: string;
  type: 'spending' | 'saving';
};

function formatNumber(value: number): string {
  return value.toLocaleString('zh-TW');
}

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

function formatLedgerDate(createdAt: string): string {
  const now = dayjs();
  const created = dayjs(createdAt);
  const diffDays = now.startOf('day').diff(created.startOf('day'), 'day');

  if (diffDays === 0) return `今天 ${created.format('HH:mm')}`;
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `星期${DAY_NAMES[created.day()]}`;
  return created.format('M/D');
}

function getLedgerTitle(tx: Transaction, taskName?: string): string {
  if (tx.reference_type === 'task_completion' && taskName) return taskName;
  if (tx.reference_type === 'long_term_goal_milestone') return '長期目標獎勵';
  if (tx.type === 'interest') return '利息入帳';
  if (tx.type === 'redeem') return '換到：願望達成';
  if (tx.type === 'deduct') return '扣除金幣';
  if (tx.type === 'adjust') return '家長調整';
  return tx.note ?? '撲滿紀錄';
}

function getLedgerSubtitle(tx: Transaction, walletType: 'spending' | 'saving'): string {
  const dateStr = formatLedgerDate(tx.created_at);
  if (tx.type === 'interest') return `${dateStr} · 存錢撲滿`;
  return dateStr;
}

function getLedgerTone(tx: Transaction): LedgerTone {
  if (tx.type === 'redeem' || tx.type === 'deduct') return 'spend';
  if (tx.type === 'interest') return 'interest';
  if (tx.type === 'adjust') return 'adjust';
  return 'earn';
}

function getLedgerAmount(tx: Transaction): number {
  if (tx.type === 'redeem' || tx.type === 'deduct') return -Math.abs(tx.amount);
  return tx.amount;
}

export default function WalletScreen() {
  const route = useRoute<WalletRoute>();
  const navigation = useNavigation<Nav>();
  const { childId } = route.params;

  const { spending, saving, loading: walletLoading, refresh: refreshWallet } = useWallet(childId);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const walletSummaries = useMemo<WalletSummary[]>(() => {
    const items: WalletSummary[] = [];
    if (spending) items.push({ id: spending.id, type: 'spending' });
    if (saving) items.push({ id: saving.id, type: 'saving' });
    return items;
  }, [saving, spending]);

  useEffect(() => {
    void loadLedger();
  }, [walletSummaries, childId]);

  const loadLedger = useCallback(async () => {
    setLoadingLedger(true);
    try {
      const walletIds = walletSummaries.map(item => item.id);
      if (walletIds.length === 0) {
        setLedger([]);
        return;
      }

      const walletTypeMap = new Map(walletSummaries.map(w => [w.id, w.type]));

      const { data: transactionRows, error: transactionError } = await supabase
        .from('transactions')
        .select('id, wallet_id, amount, type, reference_id, reference_type, note, created_at')
        .in('wallet_id', walletIds)
        .order('created_at', { ascending: false })
        .limit(20);

      if (transactionError) throw transactionError;

      const completionIds = Array.from(
        new Set(
          (transactionRows ?? [])
            .filter(row => row.reference_type === 'task_completion' && row.reference_id)
            .map(row => row.reference_id as string),
        ),
      );

      const completionTitleMap = new Map<string, string>();

      if (completionIds.length > 0) {
        const { data: completionRows, error: completionError } = await supabase
          .from('task_completions')
          .select('id, task_id')
          .in('id', completionIds);

        if (completionError) throw completionError;

        const taskIds = Array.from(new Set((completionRows ?? []).map(row => row.task_id)));

        if (taskIds.length > 0) {
          const { data: taskRows, error: taskError } = await supabase
            .from('tasks')
            .select('id, name')
            .in('id', taskIds);

          if (taskError) throw taskError;

          const taskNameMap = new Map((taskRows ?? []).map(row => [row.id, row.name]));
          for (const completion of completionRows ?? []) {
            completionTitleMap.set(
              completion.id,
              taskNameMap.get(completion.task_id) ?? '完成任務',
            );
          }
        }
      }

      const items = (transactionRows ?? []).map(row => {
        const tx = row as Transaction;
        const taskName = tx.reference_id ? completionTitleMap.get(tx.reference_id) : undefined;
        const walletType = walletTypeMap.get(tx.wallet_id) ?? 'spending';
        return {
          id: tx.id,
          title: getLedgerTitle(tx, taskName),
          subtitle: getLedgerSubtitle(tx, walletType),
          amount: getLedgerAmount(tx),
          tone: getLedgerTone(tx),
        } satisfies LedgerItem;
      });

      setLedger(items);
    } catch (err) {
      console.error('[WalletScreen] loadLedger error:', err);
      Alert.alert('撲滿資料載入失敗', err instanceof Error ? err.message : '請稍後再試');
    } finally {
      setLoadingLedger(false);
    }
  }, [walletSummaries]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshWallet(), loadLedger()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadLedger, refreshWallet]);

  const spendingBalance = spending?.balance ?? 0;
  const savingBalance = saving?.balance ?? 0;
  const savingInterestRate = saving?.interest_rate ?? 5;

  const isLoading = walletLoading || loadingLedger;

  return (
    <View style={webScreen}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <GradientBackground />

        <ScrollView
          style={[styles.scroll, webMouseDraggableScroll]}
          contentContainerStyle={[styles.scrollContent, styles.scrollContentWithNav]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.leaf500}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* 頁標題 */}
        <Text style={styles.pageTitle}>我的撲滿</Text>

        {/* 兩個錢包卡 */}
        <View style={styles.walletRow}>
          {/* 花用撲滿 */}
          <View style={styles.walletCard}>
            <Text style={styles.walletLabel}>花用撲滿</Text>
            <View style={styles.walletAmountRow}>
              <CoinIcon size={22} />
              <Text style={styles.walletAmount}>{formatNumber(spendingBalance)}</Text>
            </View>
            <Text style={styles.walletMeta}>拿來換願望</Text>
          </View>

          {/* 存錢撲滿 */}
          <View style={[styles.walletCard, styles.walletCardSaving]}>
            <Text style={styles.walletLabel}>存錢撲滿</Text>
            <View style={styles.walletAmountRow}>
              <CoinIcon size={22} />
              <Text style={styles.walletAmount}>{formatNumber(savingBalance)}</Text>
            </View>
            <Text style={styles.walletMeta}>
              利息 {savingInterestRate}%・每週日長大
            </Text>
          </View>
        </View>

        {/* 最近紀錄區塊 */}
        <Text style={styles.sectionTitle}>最近的紀錄</Text>

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.leaf500} />
            <Text style={styles.loadingText}>撲滿正在整理中…</Text>
          </View>
        ) : ledger.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>還沒有紀錄</Text>
            <Text style={styles.emptySub}>完成一次任務，就會看到金幣進出。</Text>
          </View>
        ) : (
          <View style={styles.ledgerList}>
            {ledger.map((item, index) => {
              const isPositive = item.amount >= 0;
              const isLast = index === ledger.length - 1;
              return (
                <View
                  key={item.id}
                  style={[styles.ledgerRow, !isLast && styles.ledgerRowBorder]}
                >
                  {/* 圓圈圖示 */}
                  <View
                    style={[
                      styles.circleIcon,
                      isPositive ? styles.circleIconPos : styles.circleIconNeg,
                    ]}
                  >
                    <Text style={styles.circleIconText}>{isPositive ? '+' : '−'}</Text>
                  </View>

                  {/* 標題與副標 */}
                  <View style={styles.ledgerMid}>
                    <Text style={styles.ledgerTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.ledgerSub}>{item.subtitle}</Text>
                  </View>

                  {/* 金額 */}
                  <Text
                    style={[
                      styles.ledgerAmount,
                      isPositive ? styles.ledgerAmountPos : styles.ledgerAmountNeg,
                    ]}
                  >
                    {isPositive ? '+' : '−'}{formatNumber(Math.abs(item.amount))}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

        <BottomNav
          activeTab="wallet"
          onTabPress={tab => {
            if (tab === 'home') navigation.navigate('Home', { childId });
            else if (tab === 'wish') navigation.navigate('Wish', { childId });
            else if (tab === 'profile') navigation.navigate('Profile', { childId });
          }}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  scrollContentWithNav: {
    paddingBottom: 120,
  },

  // ── 頁標題 ──────────────────────────────────────────────────
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.ink900,
    marginBottom: 18,
  },

  // ── 錢包卡片 ────────────────────────────────────────────────
  walletRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  walletCard: {
    flex: 1,
    backgroundColor: Colors.cream50,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 14,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 3,
  },
  walletCardSaving: {
    backgroundColor: Colors.cream100,
  },
  walletLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.ink700,
    marginBottom: 8,
  },
  walletAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  walletAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.ink900,
    fontVariant: ['tabular-nums'],
    lineHeight: 32,
  },
  walletMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.ink500,
    lineHeight: 15,
  },

  // ── 區塊標題 ────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink900,
    marginBottom: 4,
  },

  // ── 交易列表 ────────────────────────────────────────────────
  ledgerList: {
    marginTop: 4,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  ledgerRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
  },
  circleIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  circleIconPos: {
    backgroundColor: Colors.gold500,
  },
  circleIconNeg: {
    backgroundColor: Colors.coral500,
  },
  circleIconText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 24,
  },
  ledgerMid: {
    flex: 1,
    minWidth: 0,
  },
  ledgerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink900,
    lineHeight: 20,
  },
  ledgerSub: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.ink500,
    marginTop: 2,
  },
  ledgerAmount: {
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  ledgerAmountPos: {
    color: Colors.gold700,
  },
  ledgerAmountNeg: {
    color: Colors.coral600,
  },

  // ── 狀態 ───────────────────────────────────────────────────
  loadingWrap: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ink500,
  },
  emptyWrap: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.ink700,
  },
  emptySub: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '500',
    color: Colors.ink500,
    textAlign: 'center',
    lineHeight: 18,
  },

  bottomPad: {
    height: 24,
  },
});
