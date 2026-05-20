import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import dayjs from 'dayjs';
import type { RootStackParamList } from '../../../App';
import BottomNav from '../../components/BottomNav';
import { CoinIcon, TargetIcon, WalletIcon, WaveIcon } from '../../components/icons/TaskIcons';
import { Colors } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { useWallet } from '../../hooks/useWallet';
import type { Transaction } from '../../types/database';

type WalletRoute = RouteProp<RootStackParamList, 'Wallet'>;
type Nav = StackNavigationProp<RootStackParamList, 'Wallet'>;

type ChildData = {
  nickname: string;
};

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

function formatLedgerDate(createdAt: string): string {
  const now = dayjs();
  const created = dayjs(createdAt);
  const diffDays = now.startOf('day').diff(created.startOf('day'), 'day');

  if (diffDays <= 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays} 天前`;
  return created.format('M/D');
}

function getLedgerTitle(tx: Transaction, taskName?: string): string {
  if (tx.reference_type === 'task_completion' && taskName) {
    return taskName;
  }

  if (tx.reference_type === 'long_term_goal_milestone') {
    return '長期目標獎勵';
  }

  if (tx.type === 'interest') {
    return '利息入帳';
  }

  if (tx.type === 'redeem') {
    return '兌換願望';
  }

  if (tx.type === 'deduct') {
    return '扣除金幣';
  }

  if (tx.type === 'adjust') {
    return '家長調整';
  }

  return tx.note ?? '撲滿紀錄';
}

function getLedgerTone(tx: Transaction): LedgerTone {
  if (tx.type === 'redeem' || tx.type === 'deduct') return 'spend';
  if (tx.type === 'interest') return 'interest';
  if (tx.type === 'adjust') return 'adjust';
  return 'earn';
}

function getLedgerAmount(tx: Transaction): number {
  if (tx.type === 'redeem' || tx.type === 'deduct') {
    return -Math.abs(tx.amount);
  }

  return tx.amount;
}

export default function WalletScreen() {
  const route = useRoute<WalletRoute>();
  const navigation = useNavigation<Nav>();
  const { childId } = route.params;

  const { spending, saving, loading: walletLoading, refresh: refreshWallet } = useWallet(childId);
  const [child, setChild] = useState<ChildData | null>(null);
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
    void loadChild();
  }, [childId]);

  useEffect(() => {
    void loadLedger();
  }, [walletSummaries, childId]);

  async function loadChild() {
    try {
      const { data, error } = await supabase
        .from('children')
        .select('nickname')
        .eq('id', childId)
        .single();

      if (error) throw error;
      if (data) {
        setChild({ nickname: data.nickname });
      }
    } catch (err) {
      console.error('[WalletScreen] loadChild error:', err);
    }
  }

  const loadLedger = useCallback(async () => {
    setLoadingLedger(true);
    try {
      const walletIds = walletSummaries.map(item => item.id);
      if (walletIds.length === 0) {
        setLedger([]);
        return;
      }

      const { data: transactionRows, error: transactionError } = await supabase
        .from('transactions')
        .select('id, wallet_id, amount, type, reference_id, reference_type, note, created_at')
        .in('wallet_id', walletIds)
        .order('created_at', { ascending: false })
        .limit(12);

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
        const transaction = row as Transaction;
        const taskName = transaction.reference_id
          ? completionTitleMap.get(transaction.reference_id)
          : undefined;

        const amount = getLedgerAmount(transaction);

        return {
          id: transaction.id,
          title: getLedgerTitle(transaction, taskName),
          subtitle: formatLedgerDate(transaction.created_at),
          amount,
          tone: getLedgerTone(transaction),
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
      await Promise.all([refreshWallet(), loadLedger(), loadChild()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadChild, loadLedger, refreshWallet]);

  const spendingBalance = spending?.balance ?? 0;
  const savingBalance = saving?.balance ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>早安，{child?.nickname ?? '小探險家'}！</Text>
          <Text style={styles.greetSub}>把金幣收進撲滿，再慢慢長大。</Text>
        </View>
        <TouchableOpacity
          style={styles.headerChip}
          onPress={() => navigation.navigate('Home', { childId })}
          activeOpacity={0.85}
        >
          <CoinIcon size={24} />
          <Text style={styles.headerChipText}>{formatNumber(spendingBalance)}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.coral500} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroBadgeText}>我的撲滿</Text>
          <View style={styles.heroValueRow}>
            <View style={styles.heroIconWrap}>
              <CoinIcon size={36} />
            </View>
            <Text style={styles.heroValue}>{formatNumber(spendingBalance)}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconWrap}>
              <WalletIcon size={24} />
            </View>
            <Text style={styles.summaryValue}>{formatNumber(spendingBalance)}</Text>
            <Text style={styles.summaryLabel}>花用撲滿</Text>
            <Text style={styles.summaryMeta}>可直接拿來換願望</Text>
          </View>

          <View style={[styles.summaryCard, styles.summaryCardSaving]}>
            <View style={styles.summaryIconWrapSaving}>
              <TargetIcon size={24} />
            </View>
            <Text style={styles.summaryValue}>{formatNumber(savingBalance)}</Text>
            <Text style={styles.summaryLabel}>存錢撲滿</Text>
            <Text style={styles.summaryMeta}>
              {saving ? `利息 ${saving.interest_rate}%` : '還沒有存錢目標'}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>最近的紀錄</Text>
            <WaveIcon />
          </View>

          {walletLoading || loadingLedger ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color={Colors.coral500} />
              <Text style={styles.loadingText}>撲滿正在整理中…</Text>
            </View>
          ) : ledger.length > 0 ? (
            <View style={styles.ledgerCard}>
              {ledger.map(item => {
                const isPositive = item.amount >= 0;

                return (
                  <View key={item.id} style={styles.ledgerRow}>
                    <View
                      style={[
                        styles.ledgerIconWrap,
                        item.tone === 'earn' && styles.ledgerIconEarn,
                        item.tone === 'spend' && styles.ledgerIconSpend,
                        item.tone === 'interest' && styles.ledgerIconInterest,
                        item.tone === 'adjust' && styles.ledgerIconAdjust,
                      ]}
                    >
                      {item.tone === 'spend' ? (
                        <WalletIcon size={22} color={Colors.coral600} />
                      ) : item.tone === 'interest' ? (
                        <TargetIcon size={22} color={Colors.gold700} />
                      ) : (
                        <CoinIcon size={22} />
                      )}
                    </View>

                    <View style={styles.ledgerMid}>
                      <Text style={styles.ledgerTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.ledgerSub}>{item.subtitle}</Text>
                    </View>

                    <Text style={[styles.ledgerAmount, isPositive ? styles.ledgerAmountPos : styles.ledgerAmountNeg]}>
                      {isPositive ? '+' : '-'}{formatNumber(Math.abs(item.amount))}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <WalletIcon size={32} />
              </View>
              <Text style={styles.emptyTitle}>還沒有紀錄</Text>
              <Text style={styles.emptySub}>完成一次任務，就會看到金幣進出。</Text>
            </View>
          )}
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>

      <BottomNav
        activeTab="wallet"
        onTabPress={tab => {
          if (tab === 'home') {
            navigation.navigate('Home', { childId });
          } else if (tab === 'wish') {
            navigation.navigate('Wish', { childId });
          } else if (tab === 'profile') {
            navigation.navigate('Profile', { childId });
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgCanvas,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'rgba(255, 248, 238, 0.88)',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 14,
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 18,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontWeight: '800',
    fontSize: 22,
    color: Colors.ink900,
    lineHeight: 26,
  },
  greetSub: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink500,
    marginTop: 2,
  },
  headerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.bgSurface,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: 999,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 3,
  },
  headerChipText: {
    fontWeight: '800',
    fontSize: 16,
    color: Colors.gold700,
  },
  heroCard: {
    backgroundColor: Colors.gold100,
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
    marginBottom: 14,
    minHeight: 150,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.coral600,
    textAlign: 'center',
    marginBottom: 12,
  },
  heroValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroValue: {
    fontSize: 44,
    fontWeight: '800',
    color: Colors.gold700,
    lineHeight: 48,
    fontVariant: ['tabular-nums'],
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.bgSurface,
    borderRadius: 20,
    padding: 16,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 3,
  },
  summaryCardSaving: {
    backgroundColor: Colors.cream100,
  },
  summaryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Colors.gold100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  summaryIconWrapSaving: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Colors.cream50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.ink900,
    fontVariant: ['tabular-nums'],
    marginBottom: 2,
  },
  summaryLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink700,
  },
  summaryMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink500,
    marginTop: 4,
    lineHeight: 16,
  },
  section: {
    marginBottom: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.ink900,
  },
  loadingCard: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 20,
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink500,
  },
  ledgerCard: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(95, 60, 30, 0.08)',
  },
  ledgerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ledgerIconEarn: {
    backgroundColor: Colors.gold100,
  },
  ledgerIconSpend: {
    backgroundColor: Colors.coral100,
  },
  ledgerIconInterest: {
    backgroundColor: Colors.cream100,
  },
  ledgerIconAdjust: {
    backgroundColor: Colors.sky100,
  },
  ledgerMid: {
    flex: 1,
    minWidth: 0,
  },
  ledgerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.ink900,
    lineHeight: 21,
  },
  ledgerSub: {
    fontSize: 12,
    fontWeight: '600',
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
  emptyState: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink900,
  },
  emptySub: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink500,
    textAlign: 'center',
    lineHeight: 18,
  },
  bottomPad: {
    height: 20,
  },
});