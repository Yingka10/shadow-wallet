import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import type { RootStackParamList } from '../../../App';
import BottomNav from '../../components/BottomNav';
import WishTreeComponent from '../../components/WishTreeComponent';
import WishModalComponent from '../../components/WishModalComponent';
import { CoinIcon } from '../../components/icons/TaskIcons';
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
  reward_type: string;
};

type TabKey = 'privilege' | 'item';

function formatNumber(value: number): string {
  return value.toLocaleString('zh-TW');
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
  const [saving, setSaving] = useState(false);
  const [wishModalVisible, setWishModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('privilege');
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const balance = spending?.balance ?? 0;

  const filteredWishes = useMemo(() => {
    return wishes.filter(item => item.child_id === null || item.child_id === childId);
  }, [childId, wishes]);

  const privilegeList = useMemo(
    () => filteredWishes.filter(w => w.reward_type === 'privilege'),
    [filteredWishes],
  );
  const itemList = useMemo(
    () => filteredWishes.filter(w => w.reward_type !== 'privilege'),
    [filteredWishes],
  );

  const displayList = useMemo(() => {
    const list = activeTab === 'privilege' ? privilegeList : itemList;
    return [...list].sort((a, b) => {
      const aReady = a.parent_approved && a.coin_cost > 0 && balance >= a.coin_cost;
      const bReady = b.parent_approved && b.coin_cost > 0 && balance >= b.coin_cost;
      if (aReady && !bReady) return -1;
      if (!aReady && bReady) return 1;
      return 0;
    });
  }, [activeTab, privilegeList, itemList, balance]);

  useEffect(() => {
    void loadChild();
  }, [childId]);

  const loadWishes = useCallback(async (familyId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reward_items')
        .select('id, name, coin_cost, added_by, parent_approved, created_at, child_id, is_active, reward_type')
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
            reward_type: row.reward_type ?? 'item',
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

  // ── 預留：改為家長審核流程時取消這段註解 ────────────────────────────
  // const handleRedeemWithParentApproval = useCallback(
  //   async (item: WishItem) => {
  //     try {
  //       const { error } = await supabase.from('redemption_requests').insert({
  //         family_id: child?.familyId,
  //         child_id: childId,
  //         name: item.name,
  //         coin_cost: item.coin_cost,
  //         status: 'pending',
  //       });
  //       if (error) throw error;
  //       Alert.alert('申請送出！', '等爸媽確認後就可以換了 🎉');
  //     } catch (err) {
  //       console.error('[WishScreen] handleRedeemWithParentApproval error:', err);
  //       Alert.alert('送出失敗', err instanceof Error ? err.message : '請稍後再試');
  //     }
  //   },
  //   [child, childId],
  // );
  // ─────────────────────────────────────────────────────────────────────

  const handleRedeem = useCallback(
    (item: WishItem) => {
      Alert.alert(
        '確認兌換',
        `確定要用 ${formatNumber(item.coin_cost)} 枚金幣換「${item.name}」嗎？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '確定兌換',
            style: 'default',
            onPress: async () => {
              try {
                const { data, error } = await supabase.rpc('redeem_wish', {
                  p_child_id: childId,
                  p_item_id:  item.id,
                  p_cost:     item.coin_cost,
                });

                if (error) throw error;

                const result = data as { ok?: boolean; error?: string };

                if (result.error === 'already_redeemed') {
                  Alert.alert('已兌換', '這個願望已經換過了喔！');
                  return;
                }
                if (result.error === 'insufficient_balance') {
                  Alert.alert('金幣不足', '金幣數量不夠喔！');
                  return;
                }

                await Promise.all([
                  refreshWallet(),
                  child?.familyId ? loadWishes(child.familyId) : Promise.resolve(),
                ]);

                Alert.alert('兌換成功！', `「${item.name}」換到了！記得去找爸媽領取喔 🎉`);
              } catch (err) {
                console.error('[WishScreen] handleRedeem error:', err);
                Alert.alert('兌換失敗', err instanceof Error ? err.message : '請稍後再試');
              }
            },
          },
        ],
      );
    },
    [child, childId, loadWishes, refreshWallet],
  );

  const handleWishModalSubmit = useCallback(
    async (wishText: string) => {
      if (!child) {
        Alert.alert('資料還在載入', '請稍後再試');
        return;
      }

      if (!wishText.trim()) {
        Alert.alert('請說出或輸入願望', '例如：去書店挑一本繪本');
        return;
      }

      setSaving(true);
      try {
        const { error } = await supabase.from('reward_items').insert({
          family_id: child.familyId,
          child_id: childId,
          name: wishText.trim(),
          reward_type: 'item',
          coin_cost: 0,
          added_by: 'child',
          parent_approved: false,
          is_active: true,
        });

        if (error) throw error;

        if (child?.familyId) {
          await loadWishes(child.familyId);
        }

        Alert.alert('許願成功！', '許願樹已經收到你的願望了 ✨');
      } catch (err) {
        console.error('[WishScreen] handleWishModalSubmit error:', err);
        Alert.alert('許願失敗', err instanceof Error ? err.message : '請稍後再試');
      } finally {
        setSaving(false);
      }
    },
    [child, childId, loadWishes],
  );

  function WishCard({ item }: { item: WishItem }) {
    const isReady = item.parent_approved && item.coin_cost > 0 && balance >= item.coin_cost;
    const isPending = item.added_by === 'child' && !item.parent_approved;
    const isPrivilege = item.reward_type === 'privilege';
    const emoji = isPrivilege ? '👑' : '🎁';

    return (
      <View
        style={[
          styles.card,
          isReady && styles.cardReady,
          !isReady && !isPending && styles.cardDimmed,
        ]}
      >
        <View style={styles.cardRow}>
          {/* 名稱（含 emoji icon） */}
          <Text style={styles.cardName} numberOfLines={1} ellipsizeMode="tail">
            {emoji} {item.name}
          </Text>

          {/* 金幣 */}
          <View style={[styles.coinBadge, !item.parent_approved && styles.coinBadgeDim]}>
            <CoinIcon size={11} />
            <Text style={[styles.coinBadgeText, !item.parent_approved && styles.coinBadgeTextDim]}>
              {item.coin_cost > 0 ? formatNumber(item.coin_cost) : '?'}
            </Text>
          </View>

          {/* 兌換 / 取消 按鈕 */}
          {isReady ? (
            <TouchableOpacity
              style={styles.btnRedeem}
              onPress={() => handleRedeem(item)}
              activeOpacity={0.8}
            >
              <Text style={styles.btnRedeemText}>兌換</Text>
            </TouchableOpacity>
          ) : isPending ? (
            <TouchableOpacity
              style={styles.btnCancel}
              onPress={() => handleRemoveWish(item.id)}
              activeOpacity={0.75}
            >
              <Text style={styles.btnCancelText}>取消</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }

  function renderWishCard(item: WishItem) {
    return <WishCard key={item.id} item={item} />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* 許願樹 Hero 區域 */}
      <View style={styles.treeSection}>
        {/* 金幣餘額 chip */}
        <TouchableOpacity
          style={styles.coinChip}
          onPress={() => navigation.navigate('Wallet', { childId })}
          activeOpacity={0.85}
        >
          <CoinIcon size={18} />
          <Text style={styles.coinChipText}>{formatNumber(balance)}</Text>
        </TouchableOpacity>

        {/* 裝飾背景泡泡 */}
        <View style={styles.treeDecoration}>
          <View style={styles.pebble1} />
          <View style={styles.pebble2} />
          <View style={styles.pebble3} />
        </View>

        <Text style={styles.treeTitle}>✨ 許願樹</Text>
        <WishTreeComponent onPress={() => setWishModalVisible(true)} size={150} />

        <TouchableOpacity
          style={styles.wishBtn}
          onPress={() => setWishModalVisible(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.wishBtnText}>🌟 許一個願望</Text>
        </TouchableOpacity>
      </View>

      {/* 列表區域 */}
      <View style={styles.listSection}>
        {/* Tab 切換 */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'privilege' && styles.tabActive]}
            onPress={() => setActiveTab('privilege')}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabText, activeTab === 'privilege' && styles.tabTextActive]}>
              👑 特權
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'item' && styles.tabActive]}
            onPress={() => setActiveTab('item')}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabText, activeTab === 'item' && styles.tabTextActive]}>
              🎁 獎品
            </Text>
          </TouchableOpacity>
        </View>

        {/* 卡片列表 */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.coral500}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {loading || walletLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🌱</Text>
              <Text style={styles.emptyText}>載入中⋯</Text>
            </View>
          ) : displayList.length > 0 ? (
            <View style={styles.cardList}>
              {displayList.map(item => renderWishCard(item))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>
                {activeTab === 'privilege' ? '👑' : '🎁'}
              </Text>
              <Text style={styles.emptyTitle}>
                {activeTab === 'privilege' ? '還沒有特權' : '願望池是空的'}
              </Text>
              <Text style={styles.emptyText}>
                {activeTab === 'privilege'
                  ? '點上面的許願樹，告訴它你想要什麼特權吧！'
                  : '快去點上面的許願樹，許下你的第一個願望！'}
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => setWishModalVisible(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.emptyBtnText}>
                  {activeTab === 'privilege' ? '👑 許一個特權' : '🌟 許一個願望'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.bottomPad} />
        </ScrollView>
      </View>

      <BottomNav
        activeTab="wish"
        onTabPress={tab => {
          if (tab === 'home') navigation.navigate('Home', { childId });
          else if (tab === 'wallet') navigation.navigate('Wallet', { childId });
          else if (tab === 'profile') navigation.navigate('Profile', { childId });
        }}
      />

      <WishModalComponent
        visible={wishModalVisible}
        onClose={() => setWishModalVisible(false)}
        onSubmit={handleWishModalSubmit}
        childNickname={child?.nickname ?? '小寶貝'}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgCanvas,
  },

  /* ── Tree hero ── */
  treeSection: {
    backgroundColor: Colors.bgSurfaceWarm,
    paddingTop: 12,
    paddingBottom: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.borderSoft,
    position: 'relative',
    overflow: 'hidden',
  },
  treeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6a8040',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  coinChip: {
    position: 'absolute',
    top: 14,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.bgSurface,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 11,
    borderRadius: 999,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
    zIndex: 10,
  },
  coinChipText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.gold700,
  },
  treeDecoration: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  } as never,
  pebble1: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(160,200,80,0.07)',
    top: -30,
    left: -25,
  },
  pebble2: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(160,200,80,0.06)',
    bottom: -10,
    right: 15,
  },
  pebble3: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(245,184,0,0.05)',
    top: 10,
    left: '40%',
  },
  wishBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 24,
    backgroundColor: Colors.coral500,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  wishBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  /* ── List section ── */
  listSection: {
    flex: 1,
    backgroundColor: Colors.bgCanvas,
    paddingTop: 12,
  },

  /* ── Tabs ── */
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    alignItems: 'center',
    backgroundColor: Colors.bgSurface,
  },
  tabActive: {
    backgroundColor: Colors.coral500,
    borderColor: Colors.coral500,
  },
  tabText: {
    fontSize: 13,
    color: Colors.ink500,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  /* ── Scroll + cards ── */
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  cardList: {
    gap: 10,
  },

  /* ── Card ── */
  card: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  cardReady: {
    borderWidth: 1,
    borderColor: Colors.gold300,
    shadowColor: Colors.shadowGold,
    shadowOpacity: 0.18,
  },
  cardDimmed: {
    opacity: 0.42,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink900,
  },
  coinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.gold100,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 7,
    flexShrink: 0,
  },
  coinBadgeDim: {
    backgroundColor: Colors.cream200,
  },
  coinBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.gold700,
  },
  coinBadgeTextDim: {
    color: Colors.ink300,
  },

  /* ── Action buttons ── */
  btnRedeem: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.gold100,
    borderWidth: 1,
    borderColor: Colors.gold300,
    flexShrink: 0,
  },
  btnRedeemText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.gold700,
  },
  btnCancel: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(240,140,106,0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(240,140,106,0.25)',
    flexShrink: 0,
  },
  btnCancelText: {
    fontSize: 11,
    color: Colors.coral600,
  },

  /* ── Empty state ── */
  emptyState: {
    paddingVertical: 44,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.ink700,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.ink500,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyBtn: {
    paddingVertical: 11,
    paddingHorizontal: 30,
    borderRadius: 24,
    backgroundColor: Colors.coral500,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
  },
  emptyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  bottomPad: {
    height: 20,
  },
});
