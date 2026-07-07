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
import GradientBackground from '../../components/child/GradientBackground';
import WishTreeComponent from '../../components/WishTreeComponent';
import WishModalComponent from '../../components/WishModalComponent';
import ProgressBar from '../../components/child/ProgressBar';
import { CoinIcon } from '../../components/icons/TaskIcons';
import { BookIcon, MovieIcon, CardIcon, ComicIcon, BasketIcon, GiftIcon } from '../../components/icons/WishIcons';
import { Colors } from '../../constants/colors';
import { webMouseDraggableScroll, webScreen } from '../../constants/webStyles';
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

type TabKey = 'item' | 'privilege';

function formatNumber(value: number): string {
  return value.toLocaleString('zh-TW');
}

// 願望圖示 —— 依名稱關鍵字猜種類，純展示層判斷，資料庫沒有 icon 欄位
function getWishIconMeta(name: string) {
  if (/繪本|書|閱讀/.test(name)) return { Icon: BookIcon, ...Colors.wishIcon.book };
  if (/電影|片/.test(name)) return { Icon: MovieIcon, ...Colors.wishIcon.movie };
  if (/卡牌|寶可夢|卡片/.test(name)) return { Icon: CardIcon, ...Colors.wishIcon.card };
  if (/漫畫/.test(name)) return { Icon: ComicIcon, ...Colors.wishIcon.comic };
  if (/野餐|公園/.test(name)) return { Icon: BasketIcon, ...Colors.wishIcon.basket };
  return { Icon: GiftIcon, ...Colors.wishIcon.gift };
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
  const [activeTab, setActiveTab] = useState<TabKey>('item');
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const balance = spending?.balance ?? 0;

  const filteredWishes = useMemo(
    () => wishes.filter(item => item.child_id === null || item.child_id === childId),
    [childId, wishes],
  );

  const itemList = useMemo(
    () => filteredWishes.filter(w => w.reward_type !== 'privilege'),
    [filteredWishes],
  );
  const privilegeList = useMemo(
    () => filteredWishes.filter(w => w.reward_type === 'privilege'),
    [filteredWishes],
  );

  const displayList = useMemo(() => {
    const list = activeTab === 'item' ? itemList : privilegeList;
    return [...list].sort((a, b) => {
      const aReady = a.parent_approved && a.coin_cost > 0 && balance >= a.coin_cost;
      const bReady = b.parent_approved && b.coin_cost > 0 && balance >= b.coin_cost;
      if (aReady && !bReady) return -1;
      if (!aReady && bReady) return 1;
      return 0;
    });
  }, [activeTab, itemList, privilegeList, balance]);

  // 第一個可兌換的願望（用來顯示熟果提示泡泡）
  const ripeFruitItem = useMemo(
    () =>
      filteredWishes.find(w => w.parent_approved && w.coin_cost > 0 && balance >= w.coin_cost) ??
      null,
    [filteredWishes, balance],
  );

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
            if (isMounted) void loadWishes(child.familyId);
          },
        )
        .subscribe();

      if (isMounted) channelRef.current = channel;
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
      if (data) setChild({ familyId: data.family_id, nickname: data.nickname });
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
        if (child?.familyId) await loadWishes(child.familyId);
      } catch (err) {
        console.error('[WishScreen] handleRemoveWish error:', err);
        Alert.alert('取消失敗', err instanceof Error ? err.message : '請稍後再試');
      }
    },
    [child?.familyId, loadWishes],
  );

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
                  p_item_id: item.id,
                  p_cost: item.coin_cost,
                });

                if (error) throw error;

                const result = data as { ok?: boolean; error?: string } | null;

                if (result?.error === 'already_redeemed') {
                  Alert.alert('已兌換', '這個願望已經換過了喔！');
                  return;
                }
                if (result?.error === 'insufficient_balance') {
                  Alert.alert('金幣不足', '金幣數量不夠喔，再努力一下！');
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
        if (child?.familyId) await loadWishes(child.familyId);
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

  // ── 單張願望卡片 ────────────────────────────────────────────
  function WishCard({ item }: { item: WishItem }) {
    const isReady = item.parent_approved && item.coin_cost > 0 && balance >= item.coin_cost;
    const isPending = item.added_by === 'child' && !item.parent_approved;
    const saved = Math.max(0, Math.min(balance, item.coin_cost));
    const pct = item.coin_cost > 0 ? (saved / item.coin_cost) * 100 : 0;
    const shortfall = item.coin_cost - balance;
    const { Icon, bg, fg } = getWishIconMeta(item.name);

    return (
      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <View style={[styles.cardIcon, { backgroundColor: bg }]}>
            <Icon size={22} color={fg} />
          </View>

          <View style={styles.cardBody}>
            <Text style={styles.cardName} numberOfLines={1}>
              {item.name}
            </Text>
            {isPending ? (
              <Text style={styles.cardPendingText}>等爸媽定價</Text>
            ) : (
              <Text style={styles.cardSub}>
                已存 <Text style={styles.cardSubSaved}>{formatNumber(saved)}</Text>/
                {formatNumber(item.coin_cost)} 枚
              </Text>
            )}
          </View>

          <View style={styles.cardAction}>
            {isPending ? (
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => handleRemoveWish(item.id)}
                activeOpacity={0.75}
              >
                <Text style={styles.btnCancelText}>取消</Text>
              </TouchableOpacity>
            ) : isReady ? (
              <TouchableOpacity
                style={styles.btnRedeem}
                onPress={() => handleRedeem(item)}
                activeOpacity={0.8}
              >
                <Text style={styles.btnRedeemText}>兌換</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.btnSave}>
                <Text style={styles.btnSaveText}>再存 {formatNumber(shortfall)}</Text>
              </View>
            )}
          </View>
        </View>

        {!isPending && (
          <View style={styles.cardProgressWrap}>
            <ProgressBar pct={pct} height={6} from={Colors.leaf400} to={Colors.leaf600} track={Colors.cream200} />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={webScreen}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <GradientBackground colors={Colors.gradientPageWish} stops={Colors.gradientPageWishStops} />

        {/* ── Hero 許願樹區 ───────────────────────────────────── */}
        <View style={styles.heroSection}>
        {/* 標題列 */}
        <View style={styles.heroHeader}>
          <Text style={styles.heroTitle}>✨ 許願樹</Text>
          <TouchableOpacity
            style={styles.coinChip}
            onPress={() => navigation.navigate('Wallet', { childId })}
            activeOpacity={0.85}
          >
            <CoinIcon size={16} />
            <Text style={styles.coinChipText}>{formatNumber(balance)}</Text>
          </TouchableOpacity>
        </View>

        {/* 大樹 */}
        <WishTreeComponent
          onPress={() => setWishModalVisible(true)}
          size={150}
          hasRipeFruit={ripeFruitItem !== null}
        />

        {/* 熟果提示泡泡 */}
        {ripeFruitItem && (
          <View style={styles.ripeBubble}>
            <Text style={styles.ripeBubbleText}>
              「{ripeFruitItem.name}」熟了，可以兌換囉！
            </Text>
          </View>
        )}

        {/* 許願按鈕 */}
        <TouchableOpacity
          style={styles.wishBtn}
          onPress={() => setWishModalVisible(true)}
          activeOpacity={0.85}
          disabled={saving}
        >
          <Text style={styles.wishBtnText}>✨ 許一個願望</Text>
        </TouchableOpacity>
      </View>

      {/* ── 列表區 ─────────────────────────────────────────── */}
      <View style={styles.listSection}>
        {/* Segmented tabs */}
        <View style={styles.segmentWrap}>
          <TouchableOpacity
            style={[styles.segTab, activeTab === 'item' && styles.segTabActive]}
            onPress={() => setActiveTab('item')}
            activeOpacity={0.75}
          >
            <Text style={[styles.segTabText, activeTab === 'item' && styles.segTabTextActive]}>
              禮物
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segTab, activeTab === 'privilege' && styles.segTabActive]}
            onPress={() => setActiveTab('privilege')}
            activeOpacity={0.75}
          >
            <Text style={[styles.segTabText, activeTab === 'privilege' && styles.segTabTextActive]}>
              特權
            </Text>
          </TouchableOpacity>
        </View>

        {/* 清單 */}
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
          {loading || walletLoading ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>載入中…</Text>
            </View>
          ) : displayList.length > 0 ? (
            <View style={styles.listWrap}>
              {displayList.map(item => (
                <WishCard key={item.id} item={item} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>
                {activeTab === 'privilege' ? '還沒有特權' : '願望池是空的'}
              </Text>
              <Text style={styles.emptyText}>
                {activeTab === 'privilege'
                  ? '點上面的許願樹，許下你想要的特權吧！'
                  : '快去點許願樹，許下你的第一個願望！'}
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => setWishModalVisible(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.emptyBtnText}>
                  {activeTab === 'privilege' ? '許一個特權' : '許一個願望'}
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
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  // ── Hero ───────────────────────────────────────────────────
  heroSection: {
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.leaf600,
    letterSpacing: 0.3,
  },
  coinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.bgSurface,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 11,
    borderRadius: 999,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 3,
  },
  coinChipText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.gold700,
  },
  ripeBubble: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    maxWidth: '85%',
  },
  ripeBubbleText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink700,
    textAlign: 'center',
  },
  wishBtn: {
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 28,
    backgroundColor: Colors.coral500,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  wishBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── 列表區 ─────────────────────────────────────────────────
  listSection: {
    flex: 1,
    paddingTop: 12,
  },

  // ── Segmented control（獨立 pill 並排，非灰底滑動軌）────────
  segmentWrap: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  segTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 20,
    alignItems: 'center',
    backgroundColor: Colors.cream200,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  segTabActive: {
    backgroundColor: Colors.bgSurface,
    borderColor: Colors.leaf600,
  },
  segTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.ink500,
  },
  segTabTextActive: {
    color: Colors.leaf700,
    fontWeight: '800',
  },

  // ── ScrollView ─────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  listWrap: {
    marginTop: 4,
    gap: 12,
  },

  // ── 願望卡片 ───────────────────────────────────────────────
  card: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 18,
    padding: 12,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink900,
    marginBottom: 3,
  },
  cardSub: {
    fontSize: 12.5,
    color: Colors.ink500,
  },
  cardSubSaved: {
    color: Colors.leaf700,
    fontWeight: '800',
  },
  cardPendingText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.bark500,
  },
  cardAction: {
    flexShrink: 0,
    marginLeft: 4,
  },
  cardProgressWrap: {
    marginTop: 10,
  },

  // ── 兌換按鈕 ───────────────────────────────────────────────
  btnRedeem: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.coral500,
  },
  btnRedeemText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },

  // ── 再存 pill ──────────────────────────────────────────────
  btnSave: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.cream200,
  },
  btnSaveText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink500,
  },

  // ── 取消按鈕 ───────────────────────────────────────────────
  btnCancel: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: Colors.borderSoft,
  },
  btnCancelText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink500,
  },

  // ── 空狀態 ─────────────────────────────────────────────────
  emptyWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    paddingHorizontal: 24,
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
    height: 24,
  },
});
