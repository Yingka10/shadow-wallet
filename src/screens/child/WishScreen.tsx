import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../App';
import BottomNav from '../../components/BottomNav';
import { CoinIcon, StarIcon, WalletIcon } from '../../components/icons/TaskIcons';
import { Colors } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { useWallet } from '../../hooks/useWallet';

type WishRoute = RouteProp<RootStackParamList, 'Wish'>;
type Nav = StackNavigationProp<RootStackParamList, 'Wish'>;

type ChildData = {
  familyId: string;
  nickname: string;
};

type WishItem = {
  id: string;
  name: string;
  coin_cost: number;
  added_by: 'parent' | 'child';
  parent_approved: boolean;
  created_at: string;
  child_id: string | null;
};

function formatNumber(value: number): string {
  return value.toLocaleString('zh-TW');
}

function formatDate(dateStr: string): string {
  const created = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((Date.now() - created.getTime()) / 86400000);
  if (diffDays <= 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays} 天前`;
  return `${created.getMonth() + 1}/${created.getDate()}`;
}

function cleanCostInput(text: string): string {
  return text.replace(/[^0-9]/g, '');
}

export default function WishScreen() {
  const route = useRoute<WishRoute>();
  const navigation = useNavigation<Nav>();
  const { childId } = route.params;

  const { spending, loading: walletLoading, refresh: refreshWallet } = useWallet(childId);
  const [child, setChild] = useState<ChildData | null>(null);
  const [wishes, setWishes] = useState<WishItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState('');
  const [saving, setSaving] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const balance = spending?.balance ?? 0;

  const filteredWishes = useMemo(() => {
    return wishes.filter(item => item.child_id === null || item.child_id === childId);
  }, [childId, wishes]);

  const readyCount = filteredWishes.filter(item => item.parent_approved && item.coin_cost > 0 && balance >= item.coin_cost).length;
  const pendingCount = filteredWishes.filter(item => item.added_by === 'child' && !item.parent_approved).length;

  useEffect(() => {
    void loadChild();
  }, [childId]);

  const loadWishes = useCallback(async (familyId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reward_items')
        .select('id, name, coin_cost, added_by, parent_approved, created_at, child_id, is_active')
        .eq('family_id', familyId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as Array<WishItem & { is_active?: boolean }>;
      setWishes(
        rows
          .filter(row => row.parent_approved || row.added_by === 'child')
          .map(row => ({
            id: row.id,
            name: row.name,
            coin_cost: row.coin_cost,
            added_by: row.added_by,
            parent_approved: row.parent_approved,
            created_at: row.created_at,
            child_id: row.child_id,
          })),
      );
    } catch (err) {
      console.error('[WishScreen] loadWishes error:', err);
      Alert.alert('願望池載入失敗', err instanceof Error ? err.message : '請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!child?.familyId) return;

    let isMounted = true;

    const setupSubscription = async () => {
      await loadWishes(child.familyId);

      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      if (!isMounted) return;

      const channel = supabase
        .channel(`reward_items:child_${childId}`, { config: { broadcast: { self: false } } })
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'reward_items',
            filter: `family_id=eq.${child.familyId}`,
          },
          () => {
            if (isMounted) {
              void loadWishes(child.familyId);
            }
          },
        )
        .subscribe();

      if (isMounted) {
        channelRef.current = channel;
      }
    };

    setupSubscription();

    return () => {
      isMounted = false;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [child?.familyId, childId, loadWishes]);

  async function loadChild() {
    try {
      const { data, error } = await supabase
        .from('children')
        .select('family_id, nickname')
        .eq('id', childId)
        .single();

      if (error) throw error;
      if (data) {
        setChild({ familyId: data.family_id, nickname: data.nickname });
      }
    } catch (err) {
      console.error('[WishScreen] loadChild error:', err);
    }
  }

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshWallet(),
        child?.familyId ? loadWishes(child.familyId) : Promise.resolve(),
        loadChild(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [child?.familyId, loadWishes, refreshWallet]);

  const handleAddWish = useCallback(async () => {
    if (!child) {
      Alert.alert('資料還在載入', '請稍後再試');
      return;
    }

    const wishTitle = title.trim();
    const wishCost = Number.parseInt(cost, 10);

    if (!wishTitle) {
      Alert.alert('請輸入願望名稱', '例如：去書店挑一本繪本');
      return;
    }

    if (!Number.isFinite(wishCost) || wishCost < 1) {
      Alert.alert('金幣數字不正確', '請輸入大於 0 的金幣數');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('reward_items').insert({
        family_id: child.familyId,
        child_id: childId,
        name: wishTitle,
        reward_type: 'item',
        coin_cost: wishCost,
        added_by: 'child',
        parent_approved: false,
        is_active: true,
      });

      if (error) throw error;

      setTitle('');
      setCost('');
      await loadWishes(child.familyId);
    } catch (err) {
      console.error('[WishScreen] handleAddWish error:', err);
      Alert.alert('新增願望失敗', err instanceof Error ? err.message : '請稍後再試');
    } finally {
      setSaving(false);
    }
  }, [child, childId, cost, loadWishes, title]);

  const handleRemoveWish = useCallback(
    async (wishId: string) => {
      try {
        const { error } = await supabase
          .from('reward_items')
          .update({ is_active: false })
          .eq('id', wishId);

        if (error) throw error;

        if (child?.familyId) {
          await loadWishes(child.familyId);
        }
      } catch (err) {
        console.error('[WishScreen] handleRemoveWish error:', err);
        Alert.alert('刪除失敗', err instanceof Error ? err.message : '請稍後再試');
      }
    },
    [child?.familyId, loadWishes],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>願望池</Text>
          <Text style={styles.headerSub}>想要的先放這裡</Text>
        </View>
        <TouchableOpacity
          style={styles.balanceChip}
          onPress={() => navigation.navigate('Wallet', { childId })}
          activeOpacity={0.85}
        >
          <CoinIcon size={24} />
          <Text style={styles.balanceText}>{formatNumber(balance)}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.coral500} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <StarIcon size={22} />
          </View>
          <Text style={styles.heroTitle}>把想要的存起來</Text>
          <Text style={styles.heroSub}>{pendingCount > 0 ? `有 ${pendingCount} 個先等等` : '先寫下來，再慢慢存'}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <WalletIcon size={22} />
            </View>
            <Text style={styles.statValue}>{formatNumber(balance)}</Text>
            <Text style={styles.statLabel}>目前金幣</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <StarIcon size={22} />
            </View>
            <Text style={styles.statValue}>{readyCount}</Text>
            <Text style={styles.statLabel}>可兌換</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>新增願望</Text>
          <Text style={styles.panelSub}>寫一句就好</Text>

          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="例如：去書店挑一本繪本"
            placeholderTextColor={Colors.ink300}
          />

          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.costInput]}
              value={cost}
              onChangeText={text => setCost(cleanCostInput(text))}
              placeholder="金幣數"
              placeholderTextColor={Colors.ink300}
              keyboardType="number-pad"
            />
            <TouchableOpacity style={[styles.addBtn, saving && styles.addBtnDisabled]} onPress={handleAddWish} disabled={saving} activeOpacity={0.85}>
              <Text style={styles.addBtnText}>{saving ? '加入中' : '加入'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>我的願望</Text>
          <Text style={styles.listMeta}>{filteredWishes.length} 個</Text>
        </View>

        {loading || walletLoading ? (
          <View style={styles.loadingCard}>
            <Text style={styles.loadingText}>願望池整理中…</Text>
          </View>
        ) : filteredWishes.length > 0 ? (
          <View style={styles.list}>
            {filteredWishes.map(item => {
              const isReady = item.parent_approved && item.coin_cost > 0 && balance >= item.coin_cost;
              const isPending = item.added_by === 'child' && !item.parent_approved;

              return (
                <View
                  key={item.id}
                  style={[
                    styles.wishCard,
                    isReady && styles.wishCardReady,
                    isPending && styles.wishCardPending,
                  ]}
                >
                  <View style={[styles.wishIconWrap, isReady && styles.wishIconWrapReady]}>
                    <StarIcon size={26} />
                  </View>

                  <View style={styles.wishMid}>
                    <Text style={styles.wishTitle} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.wishSub}>{isPending ? '等爸媽看看' : isReady ? '存夠了，可以換' : `還差 ${Math.max(0, item.coin_cost - balance)} 顆`}</Text>
                  </View>

                  <View style={styles.costPill}>
                    <CoinIcon size={18} />
                    <Text style={styles.costText}>{item.coin_cost || '?'}</Text>
                  </View>

                  {isPending ? (
                    <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemoveWish(item.id)} activeOpacity={0.75} accessibilityLabel="刪除願望">
                      <Text style={styles.removeBtnText}>×</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <StarIcon size={32} />
            </View>
            <Text style={styles.emptyTitle}>還沒有願望</Text>
            <Text style={styles.emptySub}>先寫下一個，再慢慢存。</Text>
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      <BottomNav
        activeTab="wish"
        onTabPress={tab => {
          if (tab === 'home') {
            navigation.navigate('Home', { childId });
          } else if (tab === 'wallet') {
            navigation.navigate('Wallet', { childId });
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.ink900,
    lineHeight: 26,
  },
  headerSub: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink500,
    marginTop: 2,
  },
  balanceChip: {
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
  balanceText: {
    fontWeight: '800',
    fontSize: 16,
    color: Colors.gold700,
  },
  heroCard: {
    backgroundColor: Colors.gold100,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
    marginBottom: 14,
    minHeight: 124,
  },
  heroBadge: {
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.ink900,
    lineHeight: 28,
    textAlign: 'center',
  },
  heroSub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink700,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
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
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Colors.gold100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.ink900,
    fontVariant: ['tabular-nums'],
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink700,
  },
  panel: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 20,
    padding: 16,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
    marginBottom: 14,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink900,
  },
  panelSub: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink500,
    marginTop: 2,
    marginBottom: 12,
  },
  input: {
    backgroundColor: Colors.bgCanvas,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.cream300,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.ink900,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  costInput: {
    flex: 1,
  },
  addBtn: {
    backgroundColor: Colors.coral500,
    borderRadius: 999,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
    shadowColor: Colors.coral700,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 0,
    elevation: 2,
  },
  addBtnDisabled: {
    opacity: 0.6,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink900,
  },
  listMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink500,
  },
  loadingCard: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 20,
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
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
  list: {
    gap: 10,
  },
  wishCard: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
  },
  wishCardReady: {
    backgroundColor: Colors.gold100,
    shadowOpacity: 0.16,
  },
  wishCardPending: {
    backgroundColor: Colors.cream100,
  },
  wishIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.gold100,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  wishIconWrapReady: {
    backgroundColor: Colors.bgSurface,
  },
  wishMid: {
    flex: 1,
    minWidth: 0,
  },
  wishTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.ink900,
    lineHeight: 21,
  },
  wishSub: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink500,
    marginTop: 2,
  },
  costPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.bgSurface,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 10,
    borderRadius: 999,
    flexShrink: 0,
  },
  costText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.gold700,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  removeBtnText: {
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '800',
    color: Colors.ink500,
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