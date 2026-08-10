import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
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
import GrassGroundScene from '../../components/child/GrassGroundScene';
import WishModalComponent, { type WishSubmitPayload } from '../../components/WishModalComponent';
import ProgressBar from '../../components/child/ProgressBar';
import { CoinIcon } from '../../components/icons/TaskIcons';
import { BookIcon, MovieIcon, CardIcon, ComicIcon, BasketIcon, GiftIcon } from '../../components/icons/WishIcons';
import { Colors } from '../../constants/colors';
import { webMouseDraggableScroll, webScreen } from '../../constants/webStyles';
import { supabase } from '../../lib/supabase';
import { useWallet } from '../../hooks/useWallet';
import { redeemWishItem } from './redeemWish';

type WishRoute = RouteProp<RootStackParamList, 'Wish'>;
type Nav = StackNavigationProp<RootStackParamList, 'Wish'>;

type ChildData = {
  familyId: string;
  nickname: string;
  ageGroup: string;
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
  const [redeemItem, setRedeemItem] = useState<WishItem | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('item');
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const balance = spending?.balance ?? 0;
  const redeemConfirmVisible = redeemItem !== null;

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
        .select('family_id, nickname, age_group')
        .eq('id', childId)
        .single();

      if (error) throw error;
      if (data) setChild({ familyId: data.family_id, nickname: data.nickname, ageGroup: data.age_group ?? '6-9' });
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


  const handleRedeem = useCallback((item: WishItem) => {
    setRedeemError(null);
    setRedeemItem(item);
  }, []);

  const confirmRedeem = useCallback(async () => {
    if (!redeemItem || redeeming) return;

    const item = redeemItem;
    setRedeeming(true);
    setRedeemError(null);
    try {
      const result = await redeemWishItem({
        childId,
        itemId: item.id,
        cost: item.coin_cost,
      });

      if (!result.ok) {
        if (result.error === 'already_redeemed') {
          setRedeemError('這個願望已經換過了喔！');
        } else if (result.error === 'insufficient_balance') {
          setRedeemError('成長幣不夠兌換這個願望，再存一下吧！');
        } else {
          setRedeemError(result.error);
        }
        return;
      }

      setRedeemItem(null);
      setWishes(prev => prev.filter(w => w.id !== item.id));

      await Promise.all([
        refreshWallet(),
        child?.familyId ? loadWishes(child.familyId) : Promise.resolve(),
      ]);

      Alert.alert('兌換成功！', `「${item.name}」換到了！記得去找爸媽領取喔 🎉`);
    } catch (err) {
      console.error('[WishScreen] confirmRedeem error:', err);
      setRedeemError(err instanceof Error ? err.message : '請稍後再試');
    } finally {
      setRedeeming(false);
    }
  }, [child?.familyId, childId, loadWishes, redeemItem, redeeming, refreshWallet]);

  const handleWishModalSubmit = useCallback(
    async (payload: WishSubmitPayload) => {
      if (!child) {
        Alert.alert('資料還在載入', '請稍後再試');
        return;
      }
      if (!payload.wishText.trim()) {
        Alert.alert('請說出或輸入願望', '例如：去書店挑一本繪本');
        return;
      }

      setSaving(true);
      try {
        const { error } = await supabase.from('reward_items').insert({
          family_id: child.familyId,
          child_id: childId,
          // 顯示用的是 AI 濃縮過的短標題，不是孩子的原句——
          // 「我想要去朋友家玩」在畫面上只會看到「去朋友家玩」。
          name: payload.shortTitle.trim() || payload.wishText.trim(),
          reward_type: payload.wishType,
          coin_cost: 0,
          added_by: 'child',
          parent_approved: false,
          is_active: true,
          child_reason: payload.reason,
          ai_summary: payload.summary,
          ai_suggested_coins: payload.suggestedCoins,
          confirm_needed: payload.confirmNeeded,
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
    // 舊資料裡有些願望是「已核可」但 coin_cost 還停在 0（P0-2 修好之前核可的），
    // 這種狀態當成「還沒定價」處理——不然下面的 shortfall 會算出負數，
    // 顯示成「再存 -140」這種看起來像壞掉的畫面。
    const isPending = (item.added_by === 'child' && !item.parent_approved) || item.coin_cost <= 0;
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
              <Pressable
                testID={`redeem-button-${item.id}`}
                style={({ pressed }) => [styles.btnRedeem, pressed && styles.btnRedeemPressed]}
                onPress={() => handleRedeem(item)}
              >
                {({ pressed }) => (
                  <Text style={[styles.btnRedeemText, pressed && styles.btnRedeemTextPressed]}>兌換</Text>
                )}
              </Pressable>
            ) : (
              <View style={styles.btnSave}>
                <Text style={styles.btnSaveText}>再存 {formatNumber(shortfall)}</Text>
              </View>
            )}
          </View>
        </View>

        {!isPending && (
          <View style={styles.cardProgressWrap}>
            <ProgressBar pct={pct} height={6} from={Colors.progressGreen} to={Colors.leaf600} track={Colors.cream200} />
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

          {/* 大樹＋草地＋許願按鈕 —— 草地視覺延伸到按鈕 */}
          <View style={styles.treeScene}>
            <View style={styles.treeSceneGround} pointerEvents="none">
              <GrassGroundScene height={150} />
            </View>
            <WishTreeComponent
              onPress={() => setWishModalVisible(true)}
              size={165}
              hasRipeFruit={ripeFruitItem !== null}
            />
            <Pressable
              style={({ pressed }) => [styles.wishBtn, pressed && styles.wishBtnPressed]}
              onPress={() => setWishModalVisible(true)}
              disabled={saving}
            >
              <Text style={styles.wishBtnText}>✨ 許一個願望</Text>
            </Pressable>
          </View>
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
              <Pressable
                style={({ pressed }) => [styles.emptyBtn, pressed && styles.emptyBtnPressed]}
                onPress={() => setWishModalVisible(true)}
              >
                <Text style={styles.emptyBtnText}>
                  {activeTab === 'privilege' ? '許一個特權' : '許一個願望'}
                </Text>
              </Pressable>
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

      <Modal
        visible={redeemConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!redeeming) setRedeemItem(null);
        }}
      >
        <View style={styles.redeemModalBackdrop} testID="redeem-confirm-modal">
          <View style={styles.redeemModalCard}>
            <Text style={styles.redeemModalTitle}>確認兌換</Text>
            <Text style={styles.redeemModalText}>
              要用 {redeemItem ? formatNumber(redeemItem.coin_cost) : 0} 枚成長幣兌換
              「{redeemItem?.name ?? ''}」嗎？
            </Text>
            {redeemError && (
              <Text style={styles.redeemErrorText} testID="redeem-error-message">
                {redeemError}
              </Text>
            )}
            <View style={styles.redeemModalActions}>
              <Pressable
                style={({ pressed }) => [styles.redeemCancelBtn, pressed && styles.redeemCancelBtnPressed]}
                onPress={() => setRedeemItem(null)}
                disabled={redeeming}
              >
                <Text style={styles.redeemCancelText}>取消</Text>
              </Pressable>
              <Pressable
                testID="redeem-confirm-button"
                style={({ pressed }) => [
                  styles.redeemConfirmBtn,
                  pressed && styles.redeemConfirmBtnPressed,
                  redeeming && styles.redeemConfirmBtnDisabled,
                ]}
                onPress={confirmRedeem}
                disabled={redeeming}
              >
                <Text style={styles.redeemConfirmText}>{redeeming ? '兌換中' : '確認兌換'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <WishModalComponent
        visible={wishModalVisible}
        onClose={() => setWishModalVisible(false)}
        onSubmit={handleWishModalSubmit}
        childNickname={child?.nickname ?? '小寶貝'}
        ageGroup={child?.ageGroup ?? '6-9'}
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
    paddingBottom: 4,
    alignItems: 'center',
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 4,
    paddingHorizontal: 20,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.leaf600,
    letterSpacing: 0.3,
  },

  // 樹的場景區 —— 樹＋草坡直接浮在頁面漸層上，不再用卡片包框
  // （2026-07-07 使用者回報過兩次：不要淺綠色框框）。
  treeScene: {
    width: '100%',
    height: 290,
    marginTop: 6,
    marginBottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 16,
    gap: 10,
  },
  treeSceneGround: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 210,
    justifyContent: 'flex-end',
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
    color: Colors.coinGold,
  },
  ripeBubble: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 0,
    marginBottom: 4,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    maxWidth: '85%',
  },
  ripeBubbleText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.ink700,
    textAlign: 'center',
  },
  wishBtn: {
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 28,
    backgroundColor: Colors.wishPrimary,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  wishBtnPressed: {
    backgroundColor: Colors.wishPrimaryPressed,
  },
  wishBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // ── 列表區 ─────────────────────────────────────────────────
  listSection: {
    flex: 1,
    paddingTop: 14,
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
    backgroundColor: Colors.tabGreen,
    borderColor: Colors.leaf600,
  },
  segTabText: {
    fontSize: 13,
    fontWeight: '800',
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
  // BottomNav 在 web 上是 position:absolute 貼底浮動的，不會自然推開 ScrollView 的內容，
  // 沒有這段 padding 最後一張卡會被蓋住（使用者 2026-07-07 回報）。
  scrollContentWithNav: {
    paddingBottom: 120,
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
    fontWeight: '900',
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
    fontWeight: '700',
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
    borderWidth: 1,
    borderColor: Colors.redeemButtonBorder,
    backgroundColor: Colors.redeemButton,
  },
  btnRedeemPressed: {
    backgroundColor: Colors.redeemButtonPressed,
  },
  btnRedeemText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.redeemButtonText,
  },
  btnRedeemTextPressed: {
    color: Colors.redeemButtonPressedText,
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
    fontWeight: '700',
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
    fontWeight: '900',
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
    backgroundColor: Colors.wishPrimary,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
  },
  emptyBtnPressed: {
    backgroundColor: Colors.wishPrimaryPressed,
  },
  emptyBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },

  // ── 兌換確認 ───────────────────────────────────────────────
  redeemModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(59, 42, 30, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  redeemModalCard: {
    width: '100%',
    maxWidth: 330,
    backgroundColor: Colors.bgSurface,
    borderRadius: 22,
    padding: 18,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 7,
  },
  redeemModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.textBrown,
    textAlign: 'center',
    marginBottom: 8,
  },
  redeemModalText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink700,
    textAlign: 'center',
    lineHeight: 21,
  },
  redeemErrorText: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Colors.cream100,
    color: Colors.error,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
  },
  redeemModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  redeemCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.borderMedium,
    alignItems: 'center',
    backgroundColor: Colors.bgSurface,
  },
  redeemCancelBtnPressed: {
    backgroundColor: Colors.cream100,
  },
  redeemCancelText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.ink700,
  },
  redeemConfirmBtn: {
    flex: 1.25,
    paddingVertical: 11,
    borderRadius: 18,
    alignItems: 'center',
    backgroundColor: Colors.wishPrimary,
  },
  redeemConfirmBtnPressed: {
    backgroundColor: Colors.wishPrimaryPressed,
  },
  redeemConfirmBtnDisabled: {
    opacity: 0.65,
  },
  redeemConfirmText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
  },

  bottomPad: {
    height: 24,
  },
});
