import React, { useEffect, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../App';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import { webMouseDraggableScroll, webScreen } from '../../constants/webStyles';
import BottomNav from '../../components/BottomNav';
import { CoinIcon, HourglassIcon, SparkleIcon, StarIcon, TargetIcon } from '../../components/icons/TaskIcons';

type ProfileRoute = RouteProp<RootStackParamList, 'Profile'>;
type Nav = StackNavigationProp<RootStackParamList, 'Profile'>;

type ChildData = {
  nickname: string;
  ageGroup: string;
  birthDate: string;
};

type WalletData = {
  id: string;
  balance: number;
  walletType: string;
};

type CompletionStat = {
  completedCount: number;
  totalCount: number;
};

type ReviewData = {
  weeklyEarned: number;
  unredeemedMinutes: number;
  highlight: string;
};

export default function ProfileScreen() {
  const route = useRoute<ProfileRoute>();
  const navigation = useNavigation<Nav>();
  const { childId } = route.params;

  const [child, setChild] = useState<ChildData | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [stats, setStats] = useState<CompletionStat>({ completedCount: 0, totalCount: 0 });
  const [review, setReview] = useState<ReviewData>({
    weeklyEarned: 0,
    unredeemedMinutes: 0,
    highlight: '這週開始養成習慣囉，繼續保持就會越來越穩定！',
  });
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    void loadData();
  }, [childId]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: childData, error: childErr } = await supabase
        .from('children')
        .select('nickname, age_group, birth_date')
        .eq('id', childId)
        .single();

      if (childErr) throw childErr;
      if (childData) {
        setChild({
          nickname: childData.nickname,
          ageGroup: childData.age_group,
          birthDate: childData.birth_date,
        });
      }

      const { data: walletData, error: walletErr } = await supabase
        .from('wallets')
        .select('id, balance, wallet_type')
        .eq('child_id', childId)
        .eq('wallet_type', 'spending')
        .single();

      if (walletErr) throw walletErr;
      if (walletData) {
        setWallet({
          id: walletData.id,
          balance: walletData.balance,
          walletType: walletData.wallet_type,
        });
      }

      const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [timeSavingsRes, weeklyEarnRes, weeklyReportRes] = await Promise.all([
        supabase.from('time_savings').select('minutes_saved, is_redeemed').eq('child_id', childId),
        walletData
          ? supabase
              .from('transactions')
              .select('amount')
              .eq('wallet_id', walletData.id)
              .eq('type', 'earn')
              .gte('created_at', sevenDaysAgoIso)
          : Promise.resolve({ data: [] as { amount: number }[], error: null }),
        supabase
          .from('weekly_reports')
          .select('motivation_observation, praise_content')
          .eq('child_id', childId)
          .order('week_start', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (timeSavingsRes.error) throw timeSavingsRes.error;
      if (weeklyEarnRes.error) throw weeklyEarnRes.error;

      const unredeemedMinutes = (timeSavingsRes.data ?? []).reduce((sum, item) => {
        if (item.is_redeemed) return sum;
        return sum + item.minutes_saved;
      }, 0);
      const weeklyEarned = (weeklyEarnRes.data ?? []).reduce((sum, tx) => sum + tx.amount, 0);
      const highlight =
        weeklyReportRes.data?.motivation_observation?.trim() ||
        weeklyReportRes.data?.praise_content?.trim() ||
        '這週的努力有被看見，繼續朝目標前進！';

      setReview({ weeklyEarned, unredeemedMinutes, highlight });

      const today = new Date().toISOString().split('T')[0];
      const { data: completions, error: compErr } = await supabase
        .from('task_completions')
        .select('id')
        .eq('child_id', childId)
        .gte('completed_at', today)
        .lt('completed_at', new Date(Date.now() + 86400000).toISOString().split('T')[0]);

      if (!compErr) {
        const { data: tasks } = await supabase
          .from('child_tasks')
          .select('id')
          .eq('child_id', childId)
          .eq('is_active', true);

        setStats({
          completedCount: completions?.length ?? 0,
          totalCount: tasks?.length ?? 0,
        });
      }
    } catch (err) {
      console.error('[ProfileScreen] loadData error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[ProfileScreen] signOut error:', err);
    } finally {
      setLoggingOut(false);
    }
    navigation.reset({ index: 0, routes: [{ name: 'ChildLogin' }] });
  }

  function calculateAge(birthDate: string): number {
    const birth = new Date(birthDate);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
    return age;
  }

  function formatBirthDate(birthDate: string): string {
    const date = new Date(birthDate);
    if (Number.isNaN(date.getTime())) return birthDate;
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }

  function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 11) return '早安';
    if (hour < 18) return '午安';
    return '晚安';
  }

  function getProgressPct(done: number, total: number): number {
    if (total <= 0) return 0;
    return Math.min(100, Math.round((done / total) * 100));
  }

  if (loading) {
    return (
      <View style={[webScreen, styles.screen]}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.leaf500} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const age = child ? calculateAge(child.birthDate) : 0;
  const progressPct = getProgressPct(stats.completedCount, stats.totalCount);
  const greeting = getGreeting();
  const ageGroup = child?.ageGroup ?? '6-9';
  const birthDateLabel = child ? formatBirthDate(child.birthDate) : '--';
  const nickname = child?.nickname ?? '小小勇者';
  const coinBalance = wallet?.balance ?? 0;

  return (
    <View style={[webScreen, styles.screen]}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={[styles.scroll, webMouseDraggableScroll]}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 頁面標題列 */}
          <View style={styles.headerRow}>
            <Text style={styles.pageTitle}>我的成長</Text>
            <View style={styles.coinPill}>
              <CoinIcon size={20} />
              <Text style={styles.coinPillText}>{coinBalance}</Text>
            </View>
          </View>

          {/* 打招呼卡 */}
          <View style={styles.profileCard}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarLetter}>{nickname.charAt(0)}</Text>
            </View>
            <View style={styles.profileTextCol}>
              <Text style={styles.profileName}>{greeting}，{nickname}</Text>
              <Text style={styles.profileSub}>今天也一起把任務完成吧！</Text>
            </View>
          </View>

          {/* 今日進度 hero */}
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroIconWrap}>
                <TargetIcon size={28} />
              </View>
              <View style={styles.heroTextCol}>
                <Text style={styles.heroKicker}>今日進度</Text>
                <Text style={styles.heroTitle}>
                  {stats.completedCount} / {stats.totalCount > 0 ? stats.totalCount : '--'} 任務完成
                </Text>
              </View>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>{progressPct}%</Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            </View>
            <Text style={styles.heroHint}>
              {progressPct === 100
                ? '今天全部達成，超厲害！'
                : stats.totalCount === 0
                ? '今天還沒有分配任務'
                : `再完成 ${Math.max(0, stats.totalCount - stats.completedCount)} 件就收工`}
            </Text>
          </View>

          {/* 數據小卡 */}
          <View style={styles.metricsRow}>
            <View style={[styles.miniCard, styles.miniCoin]}>
              <View style={styles.miniIconPlate}>
                <CoinIcon size={20} />
              </View>
              <Text style={styles.miniAmount}>{coinBalance}</Text>
              <Text style={styles.miniLabel}>目前金幣</Text>
            </View>
            <View style={[styles.miniCard, styles.miniAge]}>
              <View style={styles.miniIconPlate}>
                <HourglassIcon size={20} />
              </View>
              <Text style={styles.miniAmount}>{age}</Text>
              <Text style={styles.miniLabel}>現在年齡</Text>
            </View>
          </View>

          {/* 本週回顧 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>本週回顧</Text>
            <View style={styles.card}>
              <View style={styles.reviewTopRow}>
                <View style={styles.sparkleWrap}>
                  <SparkleIcon size={18} />
                </View>
                <View style={styles.reviewTextCol}>
                  <Text style={styles.reviewLabel}>本週亮點</Text>
                  <Text style={styles.reviewHighlight}>{review.highlight}</Text>
                </View>
              </View>

              <View style={styles.reviewStatsRow}>
                <View style={styles.reviewStatChip}>
                  <CoinIcon size={16} />
                  <Text style={styles.reviewStatText}>+{review.weeklyEarned} 金幣</Text>
                </View>
                <View style={styles.reviewStatChip}>
                  <HourglassIcon size={16} />
                  <Text style={styles.reviewStatText}>{review.unredeemedMinutes} 分鐘儲蓄</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.wishButton}
                onPress={() => navigation.navigate('Wish', { childId })}
                activeOpacity={0.82}
              >
                <StarIcon size={16} />
                <Text style={styles.wishButtonText}>去看看願望清單</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 個人資訊 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>個人資訊</Text>
            <View style={styles.card}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>暱稱</Text>
                <Text style={styles.infoValue}>{nickname}</Text>
              </View>
              <View style={styles.hairline} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>出生日期</Text>
                <Text style={styles.infoValue}>{birthDateLabel}</Text>
              </View>
              <View style={styles.hairline} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>年齡分組</Text>
                <View style={styles.ageChip}>
                  <Text style={styles.ageChipText}>{ageGroup}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* 帳號管理 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>帳號管理</Text>
            <View style={styles.card}>
              <Text style={styles.logoutHint}>登出後需要重新登入才能回來</Text>
              <TouchableOpacity
                style={[styles.logoutButton, loggingOut && styles.logoutButtonDisabled]}
                onPress={handleLogout}
                disabled={loggingOut}
                activeOpacity={0.82}
              >
                {loggingOut ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.logoutButtonText}>↩ 登出帳號</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        <BottomNav
          activeTab="profile"
          onTabPress={tab => {
            if (tab === 'home') navigation.navigate('Home', { childId });
            else if (tab === 'wallet') navigation.navigate('Wallet', { childId });
            else if (tab === 'wish') navigation.navigate('Wish', { childId });
            else if (tab !== 'profile') Alert.alert('功能開發中', '即將推出！');
          }}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: Colors.bgCanvas,
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
    gap: 14,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 頁首
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.ink900,
    lineHeight: 32,
  },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.bgSurface,
    borderRadius: 999,
    paddingLeft: 8,
    paddingRight: 14,
    paddingVertical: 7,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  coinPillText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.gold700,
    fontVariant: ['tabular-nums'],
  },

  // 打招呼卡
  profileCard: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 3,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: Colors.leaf100,
    borderWidth: 1.5,
    borderColor: Colors.leaf300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.leaf600,
  },
  profileTextCol: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.ink900,
    lineHeight: 26,
  },
  profileSub: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink500,
    marginTop: 2,
  },

  // 今日進度 hero
  heroCard: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 24,
    padding: 18,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 5,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Colors.leaf50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.leaf200,
  },
  heroTextCol: {
    flex: 1,
  },
  heroKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.leaf600,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink900,
  },
  heroBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.leaf50,
    borderWidth: 1,
    borderColor: Colors.leaf200,
  },
  heroBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.leaf700,
  },
  progressTrack: {
    marginTop: 14,
    height: 10,
    borderRadius: 999,
    backgroundColor: Colors.leaf50,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.leaf500,
  },
  heroHint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink500,
  },

  // 數據小卡
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  miniCard: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 2,
  },
  miniCoin: {
    backgroundColor: Colors.cream100,
  },
  miniAge: {
    backgroundColor: Colors.leaf50,
  },
  miniIconPlate: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  miniAmount: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.ink900,
    fontVariant: ['tabular-nums'],
  },
  miniLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink500,
    marginTop: 2,
  },

  // 共用 section
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.ink500,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginLeft: 2,
  },
  card: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 2,
  },

  // 週回顧
  reviewTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  sparkleWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.cream200,
  },
  reviewTextCol: {
    flex: 1,
    gap: 3,
  },
  reviewLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.leaf600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reviewHighlight: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ink700,
    lineHeight: 20,
  },
  reviewStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  reviewStatChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.bgSurfaceWarm,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.hairline,
  },
  reviewStatText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink700,
    flex: 1,
  },
  wishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 999,
    backgroundColor: Colors.redeemButton,
    borderWidth: 1,
    borderColor: Colors.redeemButtonBorder,
  },
  wishButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.redeemButtonText,
  },

  // 個人資訊
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 46,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.ink500,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink900,
  },
  hairline: {
    height: 1,
    backgroundColor: Colors.hairline,
  },
  ageChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.leaf50,
    borderWidth: 1,
    borderColor: Colors.leaf200,
  },
  ageChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.leaf700,
  },

  // 帳號管理
  logoutHint: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink500,
  },
  logoutButton: {
    height: 50,
    borderRadius: 999,
    backgroundColor: Colors.leaf500,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.shadowLeaf,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
  },
  logoutButtonDisabled: {
    opacity: 0.55,
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
