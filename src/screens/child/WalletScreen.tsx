import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import dayjs from 'dayjs';
import type { RootStackParamList } from '../../../App';
import BottomNav from '../../components/BottomNav';
import { CoinIcon } from '../../components/icons/TaskIcons';
import { Colors } from '../../constants/colors';
import { webMouseDraggableScroll, webScreen } from '../../constants/webStyles';
import { supabase } from '../../lib/supabase';
import { useWallet } from '../../hooks/useWallet';
import type { Transaction } from '../../types/database';
import {
  calculatePatienceBonus,
  calculateWalletTotals,
  summarizeEarnedCoins,
} from './walletMath';

type WalletRoute = RouteProp<RootStackParamList, 'Wallet'>;
type Nav = StackNavigationProp<RootStackParamList, 'Wallet'>;

type LedgerTone = 'earn' | 'spend' | 'interest' | 'adjust';

type LedgerItem = {
  id: string;
  title: string;
  subtitle: string;
  amount: number;
  tone: LedgerTone;
  type: Transaction['type'];
  createdAt: string;
};

type WalletSummary = {
  id: string;
  type: 'spending' | 'saving';
};

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
const GOAL_PRICE = 180;
// Reference mockup copy: 再存 18 枚，就能兌換繪本！ / 今天 +8 枚 / 本週 +56 枚.

function formatNumber(value: number): string {
  return value.toLocaleString('zh-TW');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

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
  if (tx.note?.trim()) return tx.note.trim();
  if (tx.reference_type === 'long_term_goal_milestone') return '連續30天早睡早起';
  if (tx.type === 'interest') return '存錢撲滿長大';
  if (tx.type === 'redeem') return '兌換願望';
  if (tx.type === 'deduct') return '成長幣扣除';
  if (tx.type === 'adjust') return '家長調整';
  return tx.note ?? '成長幣紀錄';
}

function getLedgerSubtitle(tx: Transaction, walletType: 'spending' | 'saving'): string {
  const dateStr = formatLedgerDate(tx.created_at);
  if (tx.type === 'interest') return `${dateStr} · ${walletType === 'saving' ? '已存起來' : '可使用'}`;
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

function CoinSeedIcon({ size = 24 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30">
      <Circle cx={15} cy={15} r={13} fill="#FFD86B" stroke="#E0A500" strokeWidth={1.3} />
      <Circle cx={15} cy={15} r={9.2} fill="#FFC94A" stroke="#FFF0BF" strokeWidth={1.5} />
      <Path d="M15 20.4v-7.7" stroke="#A87800" strokeWidth={2.1} strokeLinecap="round" />
      <Path d="M15 14.6c-4.4-2.3-6.1-1.5-7.1.1 1.7 3.5 4.3 4.1 7.1 1.9" fill="#B88011" />
      <Path d="M15 14.6c4.4-2.3 6.1-1.5 7.1.1-1.7 3.5-4.3 4.1-7.1 1.9" fill="#B88011" />
    </Svg>
  );
}

const COIN_JAR_IMAGE = require('../../../assets/images/child/growbook_jar_leaves_transparent.png');

function CoinJarIllustration({ size = 180 }: { size?: number }) {
  return (
    <Image
      source={COIN_JAR_IMAGE}
      style={{ width: size, height: Math.round(size * 0.9) }}
      resizeMode="contain"
    />
  );
}

function SproutIcon({ size = 82 }: { size?: number }) {
  return (
    <Svg width={size} height={Math.round(size * 0.9)} viewBox="0 0 82 74">
      <Ellipse cx={41} cy={65} rx={28} ry={6} fill="#E3EFD4" />
      <Path d="M41 64V34" stroke="#78AF35" strokeWidth={5} strokeLinecap="round" />
      <Path d="M41 42C20 43 17 26 17 26c19-7 27 5 24 16z" fill="#7DC043" />
      <Path d="M41 37c22-10 32 4 32 4-13 17-29 10-32-4z" fill="#8CCB4F" />
    </Svg>
  );
}

function LockIcon({ size = 76 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 76 76">
      <Rect x={15} y={31} width={46} height={36} rx={9} fill="#D9A84E" />
      <Rect x={19} y={35} width={38} height={28} rx={7} fill="#E1B86D" />
      <Path d="M26 31v-8c0-9 5.6-15 12-15s12 6 12 15v8" fill="none" stroke="#D1A35F" strokeWidth={7} strokeLinecap="round" />
      <Circle cx={38} cy={48} r={5} fill="#9D763C" />
      <Path d="M38 51v9" stroke="#9D763C" strokeWidth={5} strokeLinecap="round" />
    </Svg>
  );
}

function CalendarIcon({ size = 42 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 42 42">
      <Rect x={6} y={8} width={30} height={29} rx={5} fill="#F8FFF2" stroke="#89B955" strokeWidth={2.5} />
      <Path d="M6 16h30" stroke="#89B955" strokeWidth={2.5} />
      <Path d="M14 5v7M28 5v7" stroke="#89B955" strokeWidth={3.5} strokeLinecap="round" />
      {[13, 21, 29].map(x => [22, 30].map(y => <Rect key={`${x}-${y}`} x={x - 3} y={y - 3} width={6} height={6} rx={1.5} fill="#C9DD87" />))}
    </Svg>
  );
}

function LedgerIcon({ title }: { title: string }) {
  if (title.includes('洗碗')) return <DishIcon />;
  if (title.includes('書包')) return <BackpackIcon />;
  if (title.includes('垃圾')) return <TrashIcon />;
  if (title.includes('琴')) return <PianoIcon />;
  if (title.includes('睡') || title.includes('早起')) return <MoonIcon />;
  return <CoinRecordIcon />;
}

function IconBubble({ children }: { children: React.ReactNode }) {
  return <View style={styles.recordIconBubble}>{children}</View>;
}

function DishIcon() {
  return (
    <IconBubble>
      <Svg width={30} height={30} viewBox="0 0 45 45">
        <Circle cx={12} cy={9} r={2.2} fill="#BDE8DD" />
        <Circle cx={27} cy={8} r={1.8} fill="#BDE8DD" />
        <Path d="M12 27h22c-1 7-5 11-11 11s-10-4-11-11z" fill="#8CCB6B" />
        <Rect x={10} y={24} width={25} height={5} rx={2.5} fill="#6AA84E" />
        <Path d="M16 23a8 8 0 0 1 16 0" fill="none" stroke="#B8DCE8" strokeWidth={4} />
      </Svg>
    </IconBubble>
  );
}

function BackpackIcon() {
  return (
    <IconBubble>
      <Svg width={30} height={30} viewBox="0 0 45 45">
        <Path d="M16 15c0-6 13-6 13 0" fill="none" stroke="#F28A2E" strokeWidth={4} strokeLinecap="round" />
        <Rect x={10} y={13} width={25} height={27} rx={7} fill="#77B957" />
        <Rect x={15} y={24} width={15} height={13} rx={3} fill="#F6A441" />
        <Path d="M18 18h9" stroke="#BDE082" strokeWidth={3} strokeLinecap="round" />
      </Svg>
    </IconBubble>
  );
}

function TrashIcon() {
  return (
    <IconBubble>
      <Svg width={30} height={30} viewBox="0 0 45 45">
        <Rect x={12} y={14} width={22} height={25} rx={4} fill="#86B968" />
        <Rect x={10} y={11} width={26} height={5} rx={2.5} fill="#6FA64F" />
        <Path d="M18 10h10M18 20v13M23 20v13M28 20v13" stroke="#DDEBC7" strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </IconBubble>
  );
}

function PianoIcon() {
  return (
    <IconBubble>
      <Svg width={30} height={30} viewBox="0 0 45 45">
        <Rect x={10} y={9} width={25} height={30} rx={2} fill="#746094" />
        <Rect x={13} y={15} width={19} height={20} fill="#FFFFFF" />
        <Path d="M17 15v20M23 15v20M29 15v20" stroke="#C7B9DF" strokeWidth={1.5} />
        <Rect x={16} y={15} width={3} height={12} fill="#2E2340" />
        <Rect x={24} y={15} width={3} height={12} fill="#2E2340" />
      </Svg>
    </IconBubble>
  );
}

function MoonIcon() {
  return (
    <IconBubble>
      <Svg width={30} height={30} viewBox="0 0 45 45">
        <Path d="M29 7c-7 3-11 9-11 16s5 13 12 15c-2 2-6 3-9 3-10 0-18-8-18-18S11 5 21 5c3 0 6 1 8 2z" fill="#FFD86B" />
        <Path d="M33 12l1.5 3 3 .6-2.2 2.3.4 3.2-2.7-1.5-2.8 1.5.5-3.2-2.3-2.3 3.1-.6z" fill="#F5B800" />
      </Svg>
    </IconBubble>
  );
}

function CoinRecordIcon() {
  return (
    <IconBubble>
      <CoinSeedIcon size={26} />
    </IconBubble>
  );
}

export default function WalletScreen() {
  const route = useRoute<WalletRoute>();
  const navigation = useNavigation<Nav>();
  const { height } = useWindowDimensions();
  const { childId } = route.params;

  const { spending, saving, loading: walletLoading, refresh: refreshWallet } = useWallet(childId);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [depositVisible, setDepositVisible] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [depositAmount, setDepositAmount] = useState(10);

  const walletSummaries = useMemo<WalletSummary[]>(() => {
    const items: WalletSummary[] = [];
    if (spending) items.push({ id: spending.id, type: 'spending' });
    if (saving) items.push({ id: saving.id, type: 'saving' });
    return items;
  }, [saving, spending]);

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
            completionTitleMap.set(completion.id, taskNameMap.get(completion.task_id) ?? '完成任務');
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
          type: tx.type,
          createdAt: tx.created_at,
        } satisfies LedgerItem;
      });

      setLedger(items);
    } catch (err) {
      console.error('[WalletScreen] loadLedger error:', err);
      Alert.alert('成長幣資料載入失敗', err instanceof Error ? err.message : '請稍後再試');
    } finally {
      setLoadingLedger(false);
    }
  }, [walletSummaries]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger, childId]);

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
  const {
    totalBalance,
    spendingBalance: availableBalance,
    savingBalance: patienceBalance,
  } = calculateWalletTotals(spendingBalance, savingBalance);
  const isLoading = walletLoading || loadingLedger;
  const maxDeposit = Math.max(0, availableBalance);
  const depositBonus = calculatePatienceBonus(depositAmount, savingInterestRate);
  const canDeposit = maxDeposit > 0 && depositAmount > 0 && !depositing;

  const { todayEarned, weekEarned } = summarizeEarnedCoins(
    ledger.map(item => ({ amount: item.amount, type: item.type, createdAt: item.createdAt })),
  );

  const remainingForGoal = Math.max(0, GOAL_PRICE - totalBalance);
  const goalCopy = remainingForGoal > 0
    ? `再存 ${formatNumber(remainingForGoal)} 枚，就能兌換繪本！`
    : '已經可以兌換繪本！';
  const heroSubCopy = patienceBalance > 0
    ? `可使用 ${formatNumber(availableBalance)} 枚｜耐心罐 ${formatNumber(patienceBalance)} 枚`
    : '今天又靠近願望一點！';

  function openDepositSheet() {
    const suggested = maxDeposit >= 20 ? 20 : maxDeposit;
    setDepositAmount(suggested);
    setDepositVisible(true);
  }

  function changeDepositAmount(nextAmount: number) {
    setDepositAmount(Math.round(clamp(nextAmount, 0, maxDeposit)));
  }

  async function handleConfirmDeposit() {
    const amount = Math.round(clamp(depositAmount, 0, maxDeposit));
    if (!spending || amount <= 0) {
      Alert.alert('還不能存幣', '先完成任務拿到可使用的成長幣吧！');
      return;
    }

    setDepositing(true);
    try {
      const { error: spendingError } = await supabase
        .from('wallets')
        .update({ balance: spending.balance - amount })
        .eq('id', spending.id);

      if (spendingError) throw spendingError;

      let savingWalletId = saving?.id ?? null;

      if (savingWalletId) {
        const { error: savingError } = await supabase
          .from('wallets')
          .update({ balance: (saving?.balance ?? 0) + amount })
          .eq('id', savingWalletId);

        if (savingError) throw savingError;
      } else {
        const { data: newSaving, error: createSavingError } = await supabase
          .from('wallets')
          .insert({
            child_id: childId,
            wallet_type: 'saving',
            balance: amount,
            interest_rate: savingInterestRate,
          })
          .select('id')
          .single();

        if (createSavingError) throw createSavingError;
        if (!newSaving) throw new Error('建立耐心罐失敗');
        savingWalletId = newSaving.id;
      }

      if (!savingWalletId) throw new Error('找不到耐心罐');

      const createdAt = new Date().toISOString();
      const { error: txError } = await supabase.from('transactions').insert([
        {
          wallet_id: spending.id,
          amount,
          type: 'deduct',
          reference_type: 'saving_deposit',
          note: '放進耐心罐',
          created_at: createdAt,
        },
        {
          wallet_id: savingWalletId,
          amount,
          type: 'adjust',
          reference_type: 'saving_deposit',
          note: '放進耐心罐',
          created_at: createdAt,
        },
      ]);

      if (txError) throw txError;

      setDepositVisible(false);
      await Promise.all([refreshWallet(), loadLedger()]);
    } catch (err) {
      console.error('[WalletScreen] deposit error:', err);
      Alert.alert('存幣失敗', err instanceof Error ? err.message : '請稍後再試');
    } finally {
      setDepositing(false);
    }
  }
  // Every card gets a FIXED height as a share of the screen (hero 20% /
  // wallet 15% / stat 10%), and every font + icon inside scales off that
  // height. Result: the same proportions on every phone, and wrapping can
  // never grow a fixed-height card.
  const heroHeight = clamp(Math.round(height * 0.2), 132, 188);
  const miniHeight = clamp(Math.round(height * 0.15), 100, 150);
  const statHeight = clamp(Math.round(height * 0.1), 66, 100);

  const heroAmountSize = Math.round(heroHeight * 0.24);
  const heroKickerSize = Math.round(heroHeight * 0.11);
  const heroUnitSize = Math.round(heroHeight * 0.105);
  // 副標「今天又靠近願望一點」與目標小卡「再存 18 枚…」固定 13，跟「拿來換願望」同級
  const heroSubSize = 13;
  const heroChipSize = 13;
  const heroJarSize = Math.round(heroHeight * 0.92);

  const miniTitleSize = Math.round(miniHeight * 0.14);
  const miniAmountSize = Math.round(miniHeight * 0.26);
  const miniMetaSize = Math.round(miniHeight * 0.11);
  const miniIconSize = Math.round(miniHeight * 0.46);
  const savingLockSize = Math.round(miniHeight * 0.24);

  const statTextSize = Math.round(statHeight * 0.19);
  const statCoinSize = Math.round(statHeight * 0.46);
  const statCalSize = Math.round(statHeight * 0.42);

  return (
    <View style={[webScreen, styles.screen]}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={[styles.scroll, webMouseDraggableScroll]}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.leaf500}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <Text style={styles.pageTitle}>我的成長幣</Text>
            <View style={styles.recordPill}>
              <CalendarIcon size={24} />
              <Text style={styles.recordPillText}>紀錄</Text>
            </View>
          </View>

          <View style={[styles.heroCard, { height: heroHeight }]}>
            <View style={styles.heroCopy}>
              <Text style={[styles.heroKicker, { fontSize: heroKickerSize }]}>我有</Text>
              <Text
                style={[styles.heroAmount, { fontSize: heroAmountSize, lineHeight: heroAmountSize + 2 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {formatNumber(totalBalance)}
              </Text>
              <Text style={[styles.heroUnit, { fontSize: heroUnitSize }]}>枚成長幣</Text>
              <Text
                style={[styles.heroSub, { fontSize: heroSubSize }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {heroSubCopy}
              </Text>
              <View style={styles.goalChip}>
                <Text
                  style={[styles.goalChipText, { fontSize: heroChipSize }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {goalCopy}
                </Text>
              </View>
            </View>
            <View style={[styles.jarWrap, { width: heroJarSize }]}>
              <CoinJarIllustration size={heroJarSize} />
            </View>
          </View>

          <View style={styles.walletGrid}>
            <View style={[styles.miniCard, styles.availableCard, { height: miniHeight }]}>
              <View style={styles.miniCopy}>
                <Text style={[styles.miniTitle, { fontSize: miniTitleSize }]} numberOfLines={1} adjustsFontSizeToFit>可使用</Text>
                <Text style={[styles.miniAmount, { fontSize: miniAmountSize, lineHeight: miniAmountSize + 2 }]} numberOfLines={1} adjustsFontSizeToFit>{formatNumber(availableBalance)}</Text>
                <Text style={[styles.miniMeta, { fontSize: miniMetaSize }]} numberOfLines={2}>拿來換願望</Text>
              </View>
              <SproutIcon size={miniIconSize} />
            </View>

            <TouchableOpacity
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel="開始存幣"
              onPress={openDepositSheet}
              style={[styles.miniCard, styles.savingCard, styles.savingCardPressable, { height: miniHeight }]}
            >
              <View style={styles.miniCopy}>
                <Text style={[styles.miniTitle, { fontSize: miniTitleSize }]} numberOfLines={1} adjustsFontSizeToFit>已存起來</Text>
                <Text style={[styles.miniAmount, { fontSize: miniAmountSize, lineHeight: miniAmountSize + 2 }]} numberOfLines={1} adjustsFontSizeToFit>{formatNumber(patienceBalance)}</Text>
                <View style={styles.depositPill}>
                  <Text style={styles.depositPillText}>＋ 存一些</Text>
                </View>
              </View>
              <View style={styles.savingLockWrap}>
                <LockIcon size={savingLockSize} />
              </View>
            </TouchableOpacity>
          </View>

          <View style={[styles.statCard, { height: statHeight }]}>
            <View style={styles.statBlock}>
              <CoinSeedIcon size={statCoinSize} />
              <Text style={[styles.statText, { fontSize: statTextSize }]} numberOfLines={1} adjustsFontSizeToFit>
                {`今天 +${formatNumber(todayEarned)} 枚`}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <CalendarIcon size={statCalSize} />
              <Text style={[styles.statText, { fontSize: statTextSize }]} numberOfLines={1} adjustsFontSizeToFit>
                {`本週 +${formatNumber(weekEarned)} 枚`}
              </Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionSprout}>🌱</Text>
            <Text style={styles.sectionTitle}>最近的紀錄</Text>
          </View>

          {isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="large" color={Colors.leaf500} />
              <Text style={styles.loadingText}>成長幣正在整理中...</Text>
            </View>
          ) : ledger.length === 0 ? (
            <View style={styles.stateCard}>
              <Text style={styles.emptyTitle}>還沒有紀錄</Text>
              <Text style={styles.emptySub}>完成一次任務，就會看到成長幣進出。</Text>
            </View>
          ) : (
            <View style={styles.ledgerCard}>
              {ledger.slice(0, 5).map((item, index, list) => {
                const isPositive = item.amount >= 0;
                const isLast = index === list.length - 1;
                return (
                  <View key={item.id} style={[styles.ledgerRow, !isLast && styles.ledgerDivider]}>
                    <LedgerIcon title={item.title} />
                    <View style={styles.ledgerMid}>
                      <Text style={styles.ledgerTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.ledgerSub}>{item.subtitle}</Text>
                    </View>
                    <Text style={[styles.ledgerAmount, isPositive ? styles.ledgerAmountPos : styles.ledgerAmountNeg]}>
                      {isPositive ? '+' : '-'}{formatNumber(Math.abs(item.amount))}
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

        <Modal
          visible={depositVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setDepositVisible(false)}
        >
          <Pressable style={styles.sheetBackdrop} onPress={() => setDepositVisible(false)} />
          <View style={styles.sheetWrap}>
            <View style={styles.depositSheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>把一些成長幣放進耐心罐</Text>
              <Text style={styles.sheetSub}>你現在有 {formatNumber(availableBalance)} 枚可以使用</Text>

              <Text style={styles.depositQuestion}>想存多少？</Text>
              <View style={styles.amountStepper}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="少存一點"
                  style={[styles.stepperBtn, depositAmount <= 0 && styles.stepperBtnDisabled]}
                  disabled={depositAmount <= 0}
                  onPress={() => changeDepositAmount(depositAmount - 10)}
                >
                  <Text style={styles.stepperBtnText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.depositAmountText}>{formatNumber(depositAmount)} 枚</Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="多存一點"
                  style={[styles.stepperBtn, depositAmount >= maxDeposit && styles.stepperBtnDisabled]}
                  disabled={depositAmount >= maxDeposit}
                  onPress={() => changeDepositAmount(depositAmount + 10)}
                >
                  <Text style={styles.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.presetRow}>
                {[20, 50, maxDeposit].map((amount, index) => (
                  <TouchableOpacity
                    key={`${amount}-${index}`}
                    accessibilityRole="button"
                    style={styles.presetBtn}
                    onPress={() => changeDepositAmount(amount)}
                    disabled={maxDeposit <= 0}
                  >
                    <Text style={styles.presetBtnText}>{index === 2 ? '全部存起來' : `存 ${amount} 枚`}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.previewCard}>
                <Text style={styles.previewIntro}>放進耐心罐，慢慢長大</Text>
                <Text style={styles.previewLabel}>放 7 天後</Text>
                <Text style={styles.previewText}>
                  {formatNumber(depositAmount)} 枚 → {formatNumber(depositAmount + depositBonus)} 枚
                </Text>
                <Text style={styles.previewNote}>現在拿回也沒關係，只是這次不會有耐心加碼。</Text>
              </View>

              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.confirmDepositBtn, !canDeposit && styles.confirmDepositBtnDisabled]}
                disabled={!canDeposit}
                onPress={handleConfirmDeposit}
              >
                <Text style={styles.confirmDepositText}>{depositing ? '放進去中...' : '放進耐心罐'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#FFF9EB',
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 126,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 18,
  },
  pageTitle: {
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
    color: Colors.ink900,
    lineHeight: 32,
  },
  recordPill: {
    minWidth: 86,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  recordPillText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.ink900,
  },
  heroCard: {
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 18,
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 5,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  heroKicker: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.ink700,
  },
  heroAmount: {
    fontWeight: '900',
    color: Colors.ink900,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.ink700,
    marginBottom: 2,
  },
  heroSub: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ink500,
    marginBottom: 4,
  },
  goalChip: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#C9DD9F',
    backgroundColor: '#F3FAE7',
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  goalChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.leaf700,
    lineHeight: 17,
  },
  jarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  miniCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1.4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    overflow: 'hidden',
  },
  miniCopy: {
    flex: 1,
    minWidth: 0,
  },
  availableCard: {
    backgroundColor: '#F8FDEE',
    borderColor: '#D6E7B8',
  },
  savingCard: {
    backgroundColor: '#FFF8EA',
    borderColor: '#F1D9A5',
    position: 'relative',
  },
  savingCardPressable: {
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  miniTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink700,
    marginBottom: 2,
  },
  miniAmount: {
    fontSize: 34,
    fontWeight: '900',
    color: Colors.ink900,
    lineHeight: 38,
    fontVariant: ['tabular-nums'],
  },
  miniMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink500,
    lineHeight: 18,
  },
  savingLockWrap: {
    position: 'absolute',
    right: 10,
    bottom: 9,
    opacity: 0.82,
  },
  depositPill: {
    alignSelf: 'flex-start',
    marginTop: 7,
    borderRadius: 16,
    backgroundColor: Colors.leaf700,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  depositPillText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 16,
  },
  statCard: {
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 20,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  statBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  statDivider: {
    width: 1.5,
    height: 40,
    marginHorizontal: 6,
    borderRadius: 1,
    backgroundColor: Colors.borderSoft,
  },
  statText: {
    flexShrink: 1,
    fontSize: 20,
    fontWeight: '600',
    color: Colors.ink900,
    lineHeight: 25,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingLeft: 4,
  },
  sectionSprout: {
    fontSize: 22,
    lineHeight: 26,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.ink900,
    lineHeight: 24,
  },
  ledgerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 2,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 4,
  },
  ledgerRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
  },
  ledgerDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
  },
  recordIconBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFF8EA',
    borderWidth: 1,
    borderColor: '#F1E4C7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ledgerMid: {
    flex: 1,
    minWidth: 0,
  },
  ledgerTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.ink900,
    lineHeight: 18,
  },
  ledgerSub: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: '600',
    color: Colors.ink500,
    lineHeight: 15,
  },
  ledgerAmount: {
    minWidth: 44,
    textAlign: 'right',
    fontSize: 16,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  ledgerAmountPos: {
    color: Colors.gold700,
  },
  ledgerAmountNeg: {
    color: Colors.coral600,
  },
  stateCard: {
    minHeight: 170,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink500,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.ink700,
  },
  emptySub: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ink500,
    textAlign: 'center',
    lineHeight: 21,
  },
  bottomPad: {
    height: 8,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(38, 31, 24, 0.32)',
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  depositSheet: {
    borderRadius: 28,
    backgroundColor: '#FFFDF8',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E8DCC7',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: Colors.ink900,
    lineHeight: 27,
  },
  sheetSub: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink500,
    lineHeight: 20,
  },
  depositQuestion: {
    marginTop: 18,
    fontSize: 15,
    fontWeight: '900',
    color: Colors.ink700,
  },
  amountStepper: {
    marginTop: 10,
    height: 58,
    borderRadius: 20,
    backgroundColor: '#F8FDEE',
    borderWidth: 1.5,
    borderColor: '#D6E7B8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: {
    opacity: 0.35,
  },
  stepperBtnText: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.leaf700,
    lineHeight: 28,
  },
  depositAmountText: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.ink900,
    fontVariant: ['tabular-nums'],
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  presetBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 18,
    backgroundColor: '#FFF8EA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  presetBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.gold700,
  },
  previewCard: {
    marginTop: 14,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 14,
  },
  previewIntro: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '800',
    color: Colors.leaf700,
    lineHeight: 18,
  },
  previewLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.ink500,
  },
  previewText: {
    marginTop: 3,
    fontSize: 24,
    fontWeight: '900',
    color: Colors.ink900,
    fontVariant: ['tabular-nums'],
  },
  previewNote: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.ink500,
    lineHeight: 19,
  },
  confirmDepositBtn: {
    marginTop: 14,
    minHeight: 52,
    borderRadius: 22,
    backgroundColor: Colors.leaf700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDepositBtnDisabled: {
    opacity: 0.42,
  },
  confirmDepositText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});

export const walletScreenStyles = styles;
