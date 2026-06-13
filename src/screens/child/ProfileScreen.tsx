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
import { webFullHeight } from '../../constants/webStyles';
import BottomNav from '../../components/BottomNav';
import { CoinIcon, WaveIcon } from '../../components/icons/TaskIcons';

type ProfileRoute = RouteProp<RootStackParamList, 'Home'>;
type Nav = StackNavigationProp<RootStackParamList, 'Home'>;

type ChildData = {
  nickname: string;
  ageGroup: string;
  birthDate: string;
};

type WalletData = {
  balance: number;
  walletType: string;
};

type CompletionStat = {
  completedCount: number;
  totalCount: number;
};

export default function ProfileScreen() {
  const route = useRoute<ProfileRoute>();
  const navigation = useNavigation<Nav>();
  const { childId } = route.params;

  const [child, setChild] = useState<ChildData | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [stats, setStats] = useState<CompletionStat>({ completedCount: 0, totalCount: 0 });
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
        .select('balance, wallet_type')
        .eq('child_id', childId)
        .eq('wallet_type', 'spending')
        .single();

      if (walletErr) throw walletErr;
      if (walletData) {
        setWallet({
          balance: walletData.balance,
          walletType: walletData.wallet_type,
        });
      }

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
    return now.getFullYear() - birth.getFullYear();
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, webFullHeight]} edges={['top']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.coral500} />
        </View>
      </SafeAreaView>
    );
  }

  const age = child ? calculateAge(child.birthDate) : 0;

  return (
    <SafeAreaView style={[styles.safe, webFullHeight]} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
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

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {/* Coin Card */}
          <View style={styles.statCard}>
            <View style={styles.statIconWrapper}>
              <CoinIcon size={32} />
            </View>
            <Text style={styles.statValue}>{wallet?.balance ?? 0}</Text>
            <Text style={styles.statLabel}>目前幣數</Text>
          </View>

          {/* Age Card */}
          <View style={styles.statCard}>
            <View style={styles.statIconWrapper}>
              <Text style={styles.ageIcon}>🎂</Text>
            </View>
            <Text style={styles.statValue}>{age}</Text>
            <Text style={styles.statLabel}>歲</Text>
          </View>

          {/* Tasks Card */}
          <View style={styles.statCard}>
            <View style={styles.statIconWrapper}>
              <Text style={styles.taskIcon}>✓</Text>
            </View>
            <Text style={styles.statValue}>
              {stats.completedCount} / {stats.totalCount}
            </Text>
            <Text style={styles.statLabel}>今日完成</Text>
          </View>

          {/* Age Group Card */}
          <View style={styles.statCard}>
            <View style={styles.statIconWrapper}>
              <Text style={styles.ageGroupIcon}>📊</Text>
            </View>
            <Text style={styles.statValue}>{child?.ageGroup}</Text>
            <Text style={styles.statLabel}>年齡組</Text>
          </View>
        </View>

        {/* Info Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>個人資訊</Text>
            <WaveIcon />
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>昵稱</Text>
              <Text style={styles.infoValue}>{child?.nickname}</Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>出生日期</Text>
              <Text style={styles.infoValue}>{child?.birthDate}</Text>
            </View>
          </View>
        </View>

        {/* Action Section */}
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
              <Text style={styles.actionHintText}>回到選擇畫面，可切換其他帳號</Text>
            </View>

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.8}
            >
              <Text style={styles.logoutButtonIcon}>↩</Text>
              <Text style={styles.logoutButtonText}>切換帳號</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Bottom Nav */}
      <BottomNav
        activeTab="profile"
        onTabPress={tab => {
          if (tab === 'home') {
            navigation.navigate('Home', { childId });
          } else if (tab !== 'profile') {
            Alert.alert('功能開發中', '即將推出！');
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.ink900,
    marginBottom: 4,
  },
  greetSub: {
    fontSize: 14,
    color: Colors.ink500,
  },

  // Stats Grid
  statsGrid: {
    paddingHorizontal: 12,
    marginBottom: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '48%',
    backgroundColor: Colors.bgSurface,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  statIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  ageIcon: {
    fontSize: 24,
  },
  taskIcon: {
    fontSize: 20,
    color: Colors.sage600,
    fontWeight: '800',
  },
  ageGroupIcon: {
    fontSize: 24,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink900,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.ink500,
    fontWeight: '500',
  },

  // Section
  section: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink900,
  },

  // Info Card
  infoCard: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink500,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink900,
  },

  // Action Button
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  logoutButton: {
    backgroundColor: Colors.coral500,
  },
  logoutIcon: {
    fontSize: 18,
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Hint
  hint: {
    marginTop: 8,
    paddingHorizontal: 12,
  },
  hintText: {
    fontSize: 12,
    color: Colors.ink500,
    fontStyle: 'italic',
  },

  // Bottom Pad
  bottomPad: {
    height: 80,
  },
});
