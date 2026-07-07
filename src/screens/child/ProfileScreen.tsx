import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../App';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import { webFullHeight, webMouseDraggableScroll, webScreen } from '../../constants/webStyles';
import BottomNav from '../../components/BottomNav';
import { CheckIcon, CoinIcon, HourglassIcon, SparkleIcon, StarIcon, TargetIcon, WaveIcon } from '../../components/icons/TaskIcons';

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

  useEffect(() => {
    void loadData();
  }, [childId]);

  async function loadData() {
    setLoading(true);
    try {
      // Load child data
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

      // Load wallet (spending wallet)
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

      setReview({
        weeklyEarned,
        unredeemedMinutes,
        highlight,
      });

      // Load task completion stats
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

  function handleLogout() {
    navigation.reset({ index: 0, routes: [{ name: 'ChildLogin' }] });
  }

  function calculateAge(birthDate: string): number {
    const birth = new Date(birthDate);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age -= 1;
    }
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

  function getProgressPct(completedCount: number, totalCount: number): number {
    if (totalCount <= 0) return 0;
    return Math.min(100, Math.round((completedCount / totalCount) * 100));
  }

  if (loading) {
    return (
      <View style={webScreen}>
        <SafeAreaView style={[styles.safe, webFullHeight]} edges={['top']}>
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.coral500} />
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
  const reviewBadges = [
    {
      label: progressPct === 100 ? '今日全達成' : '今日有進度',
      bg: progressPct === 100 ? Colors.sage100 : Colors.sky100,
      fg: progressPct === 100 ? Colors.sage600 : Colors.sky600,
    },
    {
      label: review.weeklyEarned >= 80 ? '本週金幣衝刺' : '穩定累積中',
      bg: Colors.cream100,
      fg: Colors.gold700,
    },
    {
      label: review.unredeemedMinutes >= 60 ? '時間小管家' : '時間存摺起步',
      bg: Colors.coral100,
      fg: Colors.coral700,
    },
  ];

  return (
    <View style={webScreen}>
      <SafeAreaView style={[styles.safe, webFullHeight]} edges={['top']}>
        <ScrollView
          style={[styles.scroll, webMouseDraggableScroll]}
          contentContainerStyle={[styles.content, styles.contentWithNav]}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.headerCard}>
          <View style={styles.headerMain}>
            <View style={styles.avatarWrap}>
              <Text style={styles.avatarText}>{nickname.charAt(0)}</Text>
            </View>
            <View style={styles.headerTextCol}>
              <Text style={styles.greeting}>{greeting}，{nickname}</Text>
              <Text style={styles.greetSub}>今天也一起把任務完成吧！</Text>
            </View>
          </View>
          <View style={styles.coinPill}>
            <CoinIcon size={24} />
            <Text style={styles.coinPillText}>{coinBalance}</Text>
          </View>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroIconWrap}>
              <TargetIcon size={34} />
            </View>
            <View style={styles.heroTopText}>
              <Text style={styles.heroLabel}>今日進度</Text>
              <Text style={styles.heroTitle}>
                {stats.completedCount} / {stats.totalCount > 0 ? stats.totalCount : '--'} 任務完成
              </Text>
            </View>
            <View style={styles.heroPctPill}>
              <Text style={styles.heroPctText}>{progressPct}%</Text>
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

        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, { backgroundColor: Colors.cream100 }]}>
            <View style={styles.metricIconPlate}>
              <CoinIcon size={22} />
            </View>
            <Text style={styles.metricValue}>{coinBalance}</Text>
            <Text style={styles.metricLabel}>目前金幣</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: Colors.sky100 }]}>
            <View style={styles.metricIconPlate}>
              <HourglassIcon size={22} />
            </View>
            <Text style={styles.metricValue}>{age}</Text>
            <Text style={styles.metricLabel}>現在年齡</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>本週回顧</Text>
            <WaveIcon />
          </View>

          <View style={styles.reviewPanel}>
            <View style={styles.reviewTopRow}>
              <View style={styles.reviewSparkleWrap}>
                <SparkleIcon size={20} />
              </View>
              <View style={styles.reviewTopTextCol}>
                <Text style={styles.reviewTitle}>本週亮點</Text>
                <Text style={styles.reviewHighlight}>{review.highlight}</Text>
              </View>
            </View>

            <View style={styles.reviewStatsRow}>
              <View style={styles.reviewStatChip}>
                <CoinIcon size={18} />
                <Text style={styles.reviewStatText}>+{review.weeklyEarned} 金幣</Text>
              </View>
              <View style={styles.reviewStatChip}>
                <HourglassIcon size={18} />
                <Text style={styles.reviewStatText}>{review.unredeemedMinutes} 分鐘儲蓄</Text>
              </View>
            </View>

            <View style={styles.badgeRow}>
              {reviewBadges.map(badge => (
                <View key={badge.label} style={[styles.badgeChip, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.reviewActionButton}
              onPress={() => navigation.navigate('Wish', { childId })}
              activeOpacity={0.85}
            >
              <StarIcon size={18} />
              <Text style={styles.reviewActionText}>去看看願望清單</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>個人資訊</Text>
            <WaveIcon />
          </View>

          <View style={styles.infoPanel}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>暱稱</Text>
              <Text style={styles.infoValue}>{nickname}</Text>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>出生日期</Text>
              <Text style={styles.infoValue}>{birthDateLabel}</Text>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>年齡分組</Text>
              <View style={styles.ageGroupChip}>
                <Text style={styles.ageGroupChipText}>{ageGroup}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>帳號管理</Text>
            <WaveIcon />
          </View>

          <View style={styles.actionPanel}>
            <View style={styles.actionHintRow}>
              <View style={styles.actionHintIcon}>
                <CheckIcon size={14} color={Colors.sage600} />
              </View>
              <Text style={styles.actionHintText}>登出後需要重新登入才能回來</Text>
            </View>

            <TouchableOpacity
              style={[styles.logoutButton, loggingOut && styles.logoutButtonDisabled]}
              onPress={handleLogout}
              disabled={loggingOut}
              activeOpacity={0.8}
            >
              {loggingOut ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Text style={styles.logoutButtonIcon}>↩</Text>
                  <Text style={styles.logoutButtonText}>登出帳號</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

        {/* Bottom Nav */}
        <BottomNav
          activeTab="profile"
          onTabPress={tab => {
            if (tab === 'home') {
              navigation.navigate('Home', { childId });
            } else if (tab === 'wallet') {
              navigation.navigate('Wallet', { childId });
            } else if (tab === 'wish') {
              navigation.navigate('Wish', { childId });
            } else if (tab !== 'profile') {
              Alert.alert('功能開發中', '即將推出！');
            }
          }}
        />
      </SafeAreaView>
    </View>
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
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 110,
    gap: 14,
  },
  contentWithNav: {
    paddingBottom: 140,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerCard: {
    backgroundColor: 'rgba(255, 248, 238, 0.85)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(95, 60, 30, 0.08)',
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.coral100,
    borderWidth: 1,
    borderColor: Colors.coral300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.coral700,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.ink900,
    lineHeight: 29,
  },
  greetSub: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ink500,
    marginTop: 1,
  },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.bgSurface,
    borderRadius: 999,
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(95, 60, 30, 0.06)',
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 2,
  },
  coinPillText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.gold700,
  },

  heroCard: {
    backgroundColor: Colors.cream100,
    borderRadius: 24,
    padding: 18,
    shadowColor: Colors.shadowGold,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(245, 184, 0, 0.35)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.bgSurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTopText: {
    flex: 1,
    minWidth: 0,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.coral600,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  heroTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: Colors.ink900,
    lineHeight: 24,
  },
  heroPctPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: 'rgba(95, 60, 30, 0.10)',
  },
  heroPctText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.ink700,
  },
  progressTrack: {
    marginTop: 12,
    height: 14,
    borderRadius: 999,
    backgroundColor: Colors.bgSurface,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.gold500,
  },
  heroHint: {
    marginTop: 9,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink700,
  },

  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(95, 60, 30, 0.08)',
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 2,
  },
  metricIconPlate: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.ink900,
    lineHeight: 30,
  },
  metricLabel: {
    fontSize: 12,
    color: Colors.ink500,
    fontWeight: '700',
  },

  reviewPanel: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(95, 60, 30, 0.10)',
    padding: 14,
    gap: 12,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 2,
  },
  reviewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reviewSparkleWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(95, 60, 30, 0.08)',
  },
  reviewTopTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  reviewTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.coral600,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  reviewHighlight: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink700,
    lineHeight: 20,
  },
  reviewStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  reviewStatChip: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: Colors.bgSurfaceWarm,
    borderWidth: 1,
    borderColor: 'rgba(95, 60, 30, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reviewStatText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: Colors.ink700,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badgeChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(95, 60, 30, 0.08)',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  reviewActionButton: {
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: Colors.coral100,
    borderWidth: 1,
    borderColor: Colors.coral300,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  reviewActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.coral700,
  },

  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.ink700,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  infoPanel: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(95, 60, 30, 0.10)',
    paddingHorizontal: 14,
    paddingVertical: 2,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 52,
    gap: 12,
  },
  infoDivider: {
    height: 1,
    backgroundColor: 'rgba(95, 60, 30, 0.08)',
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink500,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink900,
  },
  ageGroupChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.sage100,
    borderWidth: 1,
    borderColor: Colors.sage400,
  },
  ageGroupChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.sage600,
  },

  actionPanel: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(95, 60, 30, 0.10)',
    padding: 14,
    gap: 12,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 2,
  },
  actionHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionHintIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.sage100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionHintText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink500,
  },

  logoutButton: {
    backgroundColor: Colors.coral500,
    minHeight: 50,
    borderRadius: 999,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  logoutButtonDisabled: {
    opacity: 0.6,
  },
  logoutButtonIcon: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
