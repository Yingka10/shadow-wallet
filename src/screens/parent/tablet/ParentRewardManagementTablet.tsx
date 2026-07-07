import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import dayjs from 'dayjs';
import type { RootStackParamList } from '../../../../App';
import { useSelectedChild } from '../../../context/SelectedChildContext';
import { supabase } from '../../../lib/supabase';
import { useParentTaskList } from '../../../hooks/useParentTaskList';
import {
  getAiResult,
  useParentRedemption,
  type ChildWishItem,
  type ParentProposal,
  type RedemptionRequest,
} from '../../../hooks/useParentRedemption';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentShadows,
  ParentSpacing,
} from '../../../constants/parentTheme';
import { webTabletScreen } from '../../../constants/webStyles';
import { ParentSidebar, type ManageSection } from './ParentSidebar';
import { ManageTabBar } from './ManageTabBar';
import { CheckSquareIcon, PlusIcon } from './home/homeIcons';

export type RewardManageTab = 'pending' | 'active' | 'completed' | 'ended';
type RewardCategory = 'item' | 'family' | 'screen' | 'reading' | 'event' | 'custom';

const TABS: Array<{ id: RewardManageTab; label: string; focus: string }> = [
  { id: 'pending', label: '待處理', focus: '現在需要家長回應什麼？' },
  { id: 'active', label: '進行中', focus: '孩子現在正朝哪些目標累積？' },
  { id: 'completed', label: '已完成', focus: '哪些願望真的被完成與兌現？' },
  { id: 'ended', label: '已結束', focus: '哪些願望已經有結果、不再繼續？' },
];

const CATEGORY_META: Record<RewardCategory, { label: string; tint: string; color: string }> = {
  item: { label: '實體物品', tint: ParentColors.tintClay, color: ParentColors.clay500 },
  family: { label: '親子活動', tint: ParentColors.tintPlum, color: ParentColors.plum500 },
  screen: { label: '3C 時間', tint: ParentColors.tintAmber, color: ParentColors.amber700 },
  reading: { label: '選書／閱讀', tint: ParentColors.tintLeaf, color: ParentColors.leaf700 },
  event: { label: '特別活動', tint: ParentColors.tintGold, color: ParentColors.gold700 },
  custom: { label: '自訂願望', tint: ParentColors.tintPine, color: ParentColors.pine400 },
};

type ActiveReward = {
  id: string;
  name: string;
  coinCost: number;
  createdAt: string;
  source: 'parent' | 'child';
  category: RewardCategory;
};

function inferRewardCategory(name: string): RewardCategory {
  if (/電影|公園|一起|親子|散步|遊樂/.test(name)) return 'family';
  if (/Switch|3C|時間|遊戲|分鐘|手機|平板/.test(name)) return 'screen';
  if (/書|漫畫|閱讀|故事/.test(name)) return 'reading';
  if (/餐|吃|旅行|活動|展覽/.test(name)) return 'event';
  if (/樂高|卡牌|玩具|盒|車/.test(name)) return 'item';
  return 'custom';
}

function formatDate(value?: string | null) {
  if (!value) return '最近';
  return dayjs(value).format('M/D');
}

function childNameFor(childId: string | null | undefined, fallback: string, allChildren: Array<{ id: string; nickname: string }>) {
  if (!childId) return fallback;
  return allChildren.find(c => c.id === childId)?.nickname ?? fallback;
}

function coinLabel(cost: number) {
  return `${cost} 枚成長幣`;
}

function KebabIcon({ color = ParentColors.pine500, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={5} r={1.7} fill={color} />
      <Circle cx={12} cy={12} r={1.7} fill={color} />
      <Circle cx={12} cy={19} r={1.7} fill={color} />
    </Svg>
  );
}

function GiftLineIcon({ size = 24, color = ParentColors.clay500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 12v9H4v-9M3 7h18v5H3V7zM12 21V7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 7H8a2.2 2.2 0 110-4c2.6 0 4 4 4 4zM12 7h4a2.2 2.2 0 100-4c-2.6 0-4 4-4 4z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CategoryGlyph({ category, size = 38 }: { category: RewardCategory; size?: number }) {
  const color = CATEGORY_META[category].color;
  if (category === 'family') {
    return (
      <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <Rect x={8} y={14} width={32} height={22} rx={5} stroke={color} strokeWidth={2.4} />
        <Path d="M15 14l5-7M28 14l5-7M16 26h16M16 31h10" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
    );
  }
  if (category === 'screen') {
    return (
      <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <Path d="M14 30l-4 5M34 30l4 5" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
        <Rect x={8} y={16} width={32} height={16} rx={6} stroke={color} strokeWidth={2.4} />
        <Path d="M17 24h7M20.5 20.5v7M31 23.5h.1M35 25.5h.1" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
    );
  }
  if (category === 'reading') {
    return (
      <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <Path d="M24 15c-3-3-7-4-13-3v24c6-1 10 0 13 3 3-3 7-4 13-3V12c-6-1-10 0-13 3zM24 15v24" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  if (category === 'event') {
    return (
      <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <Circle cx={18} cy={24} r={9} stroke={color} strokeWidth={2.4} />
        <Path d="M32 14v22M37 14v22M32 25h5" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
    );
  }
  if (category === 'custom') {
    return (
      <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <Path d="M24 8l4.8 9.7 10.7 1.6-7.7 7.5 1.8 10.6L24 32.3l-9.6 5.1 1.8-10.6-7.7-7.5 10.7-1.6L24 8z" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  return <GiftLineIcon size={size} color={color} />;
}

function CategoryThumb({ category }: { category: RewardCategory }) {
  const meta = CATEGORY_META[category];
  return (
    <View style={[s.thumb, { backgroundColor: meta.tint }]} accessibilityLabel={`類型圖示：${meta.label}`}>
      <CategoryGlyph category={category} />
    </View>
  );
}

function FilterPill({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <View style={[s.filterPill, active && s.filterPillActive]}>
      <Text style={[s.filterText, active && s.filterTextActive]}>{label}</Text>
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={s.emptyState}>
      <Text style={s.emptyStateText}>{text}</Text>
    </View>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={s.sectionHeader}>
      <View style={s.sectionMark} />
      <View style={s.sectionTextCol}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function PendingWishCard({
  wish,
  childName,
  onApprove,
}: {
  wish: ChildWishItem;
  childName: string;
  onApprove: (id: string) => void;
}) {
  const category = inferRewardCategory(wish.name);
  const suggestedLow = Math.max(20, Math.round((wish.coin_cost * 0.75) / 5) * 5);
  const suggestedHigh = Math.max(suggestedLow + 10, Math.round((wish.coin_cost * 1.05) / 5) * 5);
  return (
    <View style={s.pendingCard}>
      <CategoryThumb category={category} />
      <View style={s.pendingMain}>
        <View style={s.rowTitleLine}>
          <Text style={s.cardTitle}>{wish.name}</Text>
          <View style={s.softBadge}>
            <Text style={s.softBadgeText}>等待家長確認</Text>
          </View>
        </View>
        <Text style={s.metaText}>{childName}｜提交時間：{formatDate(wish.created_at)}</Text>
        <Text style={s.noteLabel}>孩子想說</Text>
        <Text style={s.quoteText}>我想把它放進自己的獎勵清單</Text>
        <View style={s.aiPill}>
          <Text style={s.aiPillText}>AI 建議：{suggestedLow}-{suggestedHigh} 枚成長幣</Text>
        </View>
      </View>
      <View style={s.pendingActions}>
        <TouchableOpacity style={s.primarySmallButton} onPress={() => onApprove(wish.id)} activeOpacity={0.8}>
          <Text style={s.primarySmallButtonText}>加入獎勵清單</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.secondarySmallButton} activeOpacity={0.75}>
          <Text style={s.secondarySmallButtonText}>先聊聊／不加入</Text>
        </TouchableOpacity>
        <KebabIcon />
      </View>
    </View>
  );
}

function PendingRequestCard({
  request,
  childName,
  onApprove,
  onReject,
}: {
  request: RedemptionRequest;
  childName: string;
  onApprove: (id: string, adjustedCoins?: number) => void;
  onReject: (id: string) => void;
}) {
  const category = inferRewardCategory(request.name);
  const ai = getAiResult(request);
  return (
    <View style={s.pendingCard}>
      <CategoryThumb category={category} />
      <View style={s.pendingMain}>
        <View style={s.rowTitleLine}>
          <Text style={s.cardTitle}>{request.name}</Text>
          <View style={s.softBadge}>
            <Text style={s.softBadgeText}>兌換待確認</Text>
          </View>
        </View>
        <Text style={s.metaText}>{childName}｜提交時間：{formatDate(request.created_at)}｜{coinLabel(request.coin_cost)}</Text>
        <Text style={s.noteLabel}>孩子想說</Text>
        <Text style={s.quoteText}>{request.description || '想兌換這個已累積的目標'}</Text>
        <View style={s.aiPill}>
          <Text style={s.aiPillText}>
            AI 參考：{ai.suggestedCoins ? `${ai.suggestedCoins} 枚成長幣` : ai.reason}
          </Text>
        </View>
      </View>
      <View style={s.pendingActions}>
        <TouchableOpacity
          style={s.primarySmallButton}
          onPress={() => onApprove(request.id, ai.suggestedCoins ?? undefined)}
          activeOpacity={0.8}
        >
          <Text style={s.primarySmallButtonText}>核准兌換</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.secondarySmallButton} onPress={() => onReject(request.id)} activeOpacity={0.75}>
          <Text style={s.secondarySmallButtonText}>先聊聊／退回</Text>
        </TouchableOpacity>
        <KebabIcon />
      </View>
    </View>
  );
}

function ActiveRewardRow({
  reward,
  walletBalance,
}: {
  reward: ActiveReward;
  walletBalance: number;
}) {
  const current = Math.min(walletBalance, reward.coinCost);
  const remaining = Math.max(0, reward.coinCost - current);
  const pct = reward.coinCost > 0 ? Math.round((current / reward.coinCost) * 100) : 0;
  const meta = CATEGORY_META[reward.category];
  return (
    <View style={s.activeCard}>
      <CategoryThumb category={reward.category} />
      <View style={s.activeMain}>
        <View style={s.rowTitleLine}>
          <Text style={s.cardTitle}>{reward.name}</Text>
          <View style={[s.categoryBadge, { backgroundColor: meta.tint }]}>
            <Text style={[s.categoryBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <Text style={s.metaText}>
          {coinLabel(reward.coinCost)}｜已累積 {current} 枚｜還差 {remaining} 枚
        </Text>
        <View style={s.progressRow}>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${pct}%` }]} />
          </View>
          <Text style={s.progressText}>{pct}%</Text>
        </View>
      </View>
      <View style={s.activeSide}>
        <Text style={s.dateText}>{reward.source === 'child' ? '孩子加入' : '設定於'} {formatDate(reward.createdAt)}</Text>
        <TouchableOpacity style={s.editButton} activeOpacity={0.75}>
          <Text style={s.editButtonText}>編輯</Text>
        </TouchableOpacity>
        <KebabIcon />
      </View>
    </View>
  );
}

function HistoryRow({
  item,
  childName,
  kind,
}: {
  item: RedemptionRequest;
  childName: string;
  kind: 'completed' | 'ended';
}) {
  const category = inferRewardCategory(item.name);
  const meta = CATEGORY_META[category];
  const date = item.reviewed_at ?? item.created_at;
  const statusLabel = kind === 'completed'
    ? item.status === 'approved' ? '已兌換' : '已完成'
    : '未加入';
  return (
    <View style={s.historyRow}>
      <CategoryThumb category={category} />
      <View style={s.historyMain}>
        <View style={s.rowTitleLine}>
          <Text style={s.cardTitle}>{item.name}</Text>
          <View style={[s.categoryBadge, { backgroundColor: meta.tint }]}>
            <Text style={[s.categoryBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <Text style={s.metaText}>
          {coinLabel(item.adjusted_coins ?? item.coin_cost)}｜{formatDate(date)} {kind === 'completed' ? '已兌換' : '結束'}｜{childName}
        </Text>
        <Text style={s.reasonText}>
          {kind === 'completed'
            ? `已完成：${item.parent_note || '依照約定安排或兌換'}`
            : `原因：${item.parent_note || '討論後這次不加入獎勵清單'}`}
        </Text>
      </View>
      <View style={[s.statusPill, kind === 'ended' && s.statusPillMuted]}>
        <Text style={[s.statusPillText, kind === 'ended' && s.statusPillTextMuted]}>{statusLabel}</Text>
        {kind === 'completed' ? <CheckSquareIcon size={14} color={ParentColors.leaf700} /> : null}
      </View>
      <KebabIcon />
    </View>
  );
}

export default function ParentRewardManagementTablet() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { childId, childName, allChildren, setSelectedChild } = useSelectedChild();
  const [activeTab, setActiveTab] = useState<RewardManageTab>('pending');
  const [walletBalance, setWalletBalance] = useState(0);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const { child, loading: childLoading, refresh: refreshChild } = useParentTaskList(childId);
  const {
    pendingRequests,
    parentProposals,
    history,
    childWishes,
    loading: redemptionLoading,
    error,
    fetchAll,
    approveRequest,
    rejectRequest,
    approveChildWish,
  } = useParentRedemption(child?.family_id ?? null);

  const selectedChildName = childName || allChildren.find(c => c.id === childId)?.nickname || '孩子';

  const refreshWallet = useCallback(async () => {
    if (!childId) return;
    const { data, error: walletError } = await supabase
      .from('wallets')
      .select('balance')
      .eq('child_id', childId)
      .eq('wallet_type', 'spending')
      .maybeSingle();
    if (!walletError) {
      setWalletBalance(Number(data?.balance ?? 0));
    }
  }, [childId]);

  useFocusEffect(
    useCallback(() => {
      if (!childId) return;
      void refreshChild();
      void fetchAll();
      void refreshWallet();
    }, [childId, fetchAll, refreshChild, refreshWallet]),
  );

  useEffect(() => {
    void refreshWallet();
  }, [refreshWallet]);

  const visibleChildWishes = useMemo(
    () => childWishes.filter(wish => !wish.child_id || wish.child_id === childId),
    [childId, childWishes],
  );
  const pendingWishes = useMemo(
    () => visibleChildWishes.filter(wish => !wish.parent_approved),
    [visibleChildWishes],
  );
  const pendingRedemptions = useMemo(
    () => pendingRequests.filter(req => req.child_id === childId),
    [childId, pendingRequests],
  );
  const activeRewards = useMemo<ActiveReward[]>(() => {
    const fromParent = parentProposals
      .filter(item => !item.child_id || item.child_id === childId)
      .map((item: ParentProposal) => ({
        id: `parent-${item.id}`,
        name: item.name,
        coinCost: item.coin_cost,
        createdAt: item.created_at,
        source: 'parent' as const,
        category: inferRewardCategory(item.name),
      }));
    const fromChild = visibleChildWishes
      .filter(item => item.parent_approved)
      .map((item: ChildWishItem) => ({
        id: `child-${item.id}`,
        name: item.name,
        coinCost: item.coin_cost,
        createdAt: item.created_at,
        source: 'child' as const,
        category: inferRewardCategory(item.name),
      }));
    return [...fromParent, ...fromChild].sort((a, b) => a.coinCost - b.coinCost);
  }, [childId, parentProposals, visibleChildWishes]);
  const completedRecent = useMemo(
    () => history.filter(item =>
      item.child_id === childId &&
      item.status === 'approved' &&
      dayjs(item.reviewed_at ?? item.created_at).isAfter(dayjs().subtract(6, 'month')),
    ),
    [childId, history],
  );
  const completedOlder = useMemo(
    () => history.filter(item =>
      item.child_id === childId &&
      item.status === 'approved' &&
      !dayjs(item.reviewed_at ?? item.created_at).isAfter(dayjs().subtract(6, 'month')),
    ).length,
    [childId, history],
  );
  const endedRecent = useMemo(
    () => history.filter(item =>
      item.child_id === childId &&
      item.status === 'rejected' &&
      dayjs(item.reviewed_at ?? item.created_at).isAfter(dayjs().subtract(90, 'day')),
    ),
    [childId, history],
  );
  const endedOlder = useMemo(
    () => history.filter(item =>
      item.child_id === childId &&
      item.status === 'rejected' &&
      !dayjs(item.reviewed_at ?? item.created_at).isAfter(dayjs().subtract(90, 'day')),
    ).length,
    [childId, history],
  );
  const counts: Record<RewardManageTab, number> = {
    pending: pendingWishes.length + pendingRedemptions.length,
    active: activeRewards.length,
    completed: completedRecent.length,
    ended: endedRecent.length,
  };

  const handleNavigateHome = useCallback(() => {
    navigation.navigate('Dashboard' as never);
  }, [navigation]);

  const handleNavigateWeekly = useCallback(() => {
    navigation.navigate('Weekly' as never);
  }, [navigation]);

  const handleNavigateManage = useCallback((section?: ManageSection | 'settings') => {
    if (section === 'settings') {
      navigation.navigate('ParentSettings');
      return;
    }
    (navigation.navigate as (name: string, params?: object) => void)('Manage', {
      initialSection: section ?? 'rewards',
    });
  }, [navigation]);

  const handleAddChild = useCallback(() => {
    navigation.navigate('AddChild');
  }, [navigation]);

  const handleNewReward = useCallback(() => {
    Alert.alert('新增獎勵', '新增獎勵表單會接在這個入口。');
  }, []);

  const handleApproveWish = useCallback(async (id: string) => {
    setActionMessage(null);
    try {
      await approveChildWish(id);
      await fetchAll();
      setActionMessage('已加入獎勵清單');
    } catch {
      setActionMessage('目前無法加入，請稍後再試');
    }
  }, [approveChildWish, fetchAll]);

  const handleApproveRequest = useCallback(async (id: string, adjustedCoins?: number) => {
    setActionMessage(null);
    try {
      await approveRequest(id, adjustedCoins);
      await fetchAll();
      setActionMessage('已核准兌換');
    } catch {
      setActionMessage('目前無法核准，請稍後再試');
    }
  }, [approveRequest, fetchAll]);

  const handleRejectRequest = useCallback(async (id: string) => {
    setActionMessage(null);
    try {
      await rejectRequest(id, '先保留，和孩子討論後再決定');
      await fetchAll();
      setActionMessage('已先保留，之後可再和孩子討論');
    } catch {
      setActionMessage('目前無法退回，請稍後再試');
    }
  }, [fetchAll, rejectRequest]);

  if (width < 768) return null;

  const loading = childLoading || redemptionLoading || childId === '';

  return (
    <View style={webTabletScreen}>
      <View style={s.columns}>
        <ParentSidebar
          activeTab="manage"
          activeManageSection="rewards"
          allChildren={allChildren}
          childId={childId}
          setSelectedChild={setSelectedChild}
          pendingCounts={{}}
          onNavigateHome={handleNavigateHome}
          onNavigateWeekly={handleNavigateWeekly}
          onNavigateManage={handleNavigateManage}
          onAddChild={handleAddChild}
        />
        <View style={[s.screen, { paddingBottom: insets.bottom }]}>
          <View style={s.header}>
            <View style={s.headerText}>
              <Text style={s.eyebrow}>家長設定</Text>
              <Text style={s.title}>{selectedChildName}的獎勵管理</Text>
              <Text style={s.subtitle}>把孩子想要的事，整理成可討論、可累積的目標</Text>
            </View>
            <TouchableOpacity style={s.primaryButton} onPress={handleNewReward} activeOpacity={0.8}>
              <PlusIcon size={18} color={ParentColors.onSidebar} />
              <Text style={s.primaryButtonText}>新增獎勵</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            <ManageTabBar tabs={TABS} activeTab={activeTab} counts={counts} onChange={setActiveTab} />
            <Text style={s.focusText}>{TABS.find(tab => tab.id === activeTab)?.focus}</Text>
            {actionMessage ? <Text style={s.actionMessage}>{actionMessage}</Text> : null}

            {loading ? (
              <View style={s.centerBox}>
                <ActivityIndicator size="large" color={ParentColors.accent} />
              </View>
            ) : error ? (
              <View style={s.centerBox}>
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : (
              <>
                {activeTab === 'pending' && (
                  <View style={s.stack}>
                    <SectionTitle title="待確認" subtitle="孩子提出的獎勵願望，等待你確認是否加入清單。" />
                    {pendingWishes.map(wish => (
                      <PendingWishCard
                        key={wish.id}
                        wish={wish}
                        childName={childNameFor(wish.child_id, selectedChildName, allChildren)}
                        onApprove={handleApproveWish}
                      />
                    ))}
                    {pendingRedemptions.map(request => (
                      <PendingRequestCard
                        key={request.id}
                        request={request}
                        childName={childNameFor(request.child_id, selectedChildName, allChildren)}
                        onApprove={handleApproveRequest}
                        onReject={handleRejectRequest}
                      />
                    ))}
                    <SectionTitle title="待一起聊聊" subtitle="先保留願望，找個合適的時間再一起討論。" />
                    {counts.pending === 0 ? <EmptyState text="目前沒有需要處理的獎勵願望" /> : null}
                  </View>
                )}

                {activeTab === 'active' && (
                  <View style={s.stack}>
                    <View style={s.filterRow}>
                      <FilterPill label="距離兌換最近" active />
                      <FilterPill label="最近加入" />
                      <FilterPill label="幣值由低到高" />
                    </View>
                    {activeRewards.map(reward => (
                      <ActiveRewardRow key={reward.id} reward={reward} walletBalance={walletBalance} />
                    ))}
                    {activeRewards.length === 0 ? <EmptyState text="目前沒有進行中的獎勵目標" /> : null}
                  </View>
                )}

                {activeTab === 'completed' && (
                  <View style={s.stack}>
                    <View style={s.filterRow}>
                      <FilterPill label="最近 6 個月" active />
                      <FilterPill label="今年" />
                      <FilterPill label="更早紀錄" />
                    </View>
                    <SectionTitle title="最近完成的目標" subtitle="完成的目標會保留紀錄，方便家長回看哪些獎勵對孩子最有意義。" />
                    <View style={s.historyPanel}>
                      {completedRecent.map(item => (
                        <HistoryRow
                          key={item.id}
                          item={item}
                          childName={childNameFor(item.child_id, selectedChildName, allChildren)}
                          kind="completed"
                        />
                      ))}
                      {completedRecent.length === 0 ? <EmptyState text="最近 6 個月還沒有完成紀錄" /> : null}
                    </View>
                    <TouchableOpacity style={s.olderButton} activeOpacity={0.75}>
                      <Text style={s.olderButtonText}>查看較早紀錄{completedOlder > 0 ? `（${completedOlder}）` : ''}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {activeTab === 'ended' && (
                  <View style={s.stack}>
                    <View style={s.filterWrap}>
                      <FilterPill label="全部" active />
                      <FilterPill label="未加入" />
                      <FilterPill label="孩子取消" />
                      <FilterPill label="改為其他目標" />
                      <FilterPill label="已過期" />
                    </View>
                    <View style={s.filterRow}>
                      <FilterPill label="最近 90 天" active />
                      <FilterPill label="今年" />
                      <FilterPill label="查看較早紀錄" />
                    </View>
                    <SectionTitle title="已有結果的願望" subtitle="這些願望已經有結果，不會繼續加入獎勵清單。" />
                    <View style={s.historyPanel}>
                      {endedRecent.map(item => (
                        <HistoryRow
                          key={item.id}
                          item={item}
                          childName={childNameFor(item.child_id, selectedChildName, allChildren)}
                          kind="ended"
                        />
                      ))}
                      {endedRecent.length === 0 ? <EmptyState text="最近 90 天沒有已結束的願望" /> : null}
                    </View>
                    <TouchableOpacity style={s.olderButton} activeOpacity={0.75}>
                      <Text style={s.olderButtonText}>查看較早紀錄{endedOlder > 0 ? `（${endedOlder}）` : ''}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <Text style={s.footerNote}>
                  小提醒：願望清單可以同時包含物品、活動、時間與共同體驗。
                </Text>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  columns: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
  },
  screen: {
    flex: 1,
    minWidth: 0,
    backgroundColor: ParentColors.bgCanvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: ParentSpacing[6],
    paddingHorizontal: ParentSpacing[8],
    paddingTop: ParentSpacing[8],
    paddingBottom: ParentSpacing[4],
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  eyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgMuted,
  },
  title: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h1,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pBody,
    color: ParentColors.fgSecondary,
  },
  primaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.pine500,
    ...ParentShadows.pop,
  },
  primaryButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.onSidebar,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: ParentSpacing[8],
    paddingBottom: ParentSpacing[10],
  },
  focusText: {
    marginTop: ParentSpacing[3],
    marginBottom: ParentSpacing[5],
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
  },
  actionMessage: {
    marginBottom: ParentSpacing[4],
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pine500,
  },
  stack: {
    gap: ParentSpacing[4],
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: ParentSpacing[3],
  },
  filterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: ParentSpacing[3],
  },
  filterPill: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  filterPillActive: {
    borderColor: ParentColors.pine500,
    backgroundColor: ParentColors.pine50,
  },
  filterText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },
  filterTextActive: {
    color: ParentColors.pine500,
    fontWeight: ParentFontWeights.bold,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[3],
    marginTop: ParentSpacing[2],
  },
  sectionMark: {
    width: 18,
    height: 18,
    borderRadius: ParentRadii.sm,
    borderWidth: 2,
    borderColor: ParentColors.pending,
  },
  sectionTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  sectionTitle: {
    fontFamily: ParentFonts.display,
    fontSize: 22,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.fgPrimary,
  },
  sectionSubtitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 20,
    color: ParentColors.fgSecondary,
  },
  pendingCard: {
    minHeight: 168,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[5],
    padding: ParentSpacing[5],
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.lg,
    backgroundColor: ParentColors.bgSurface,
    ...ParentShadows.card,
  },
  activeCard: {
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[5],
    padding: ParentSpacing[4],
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.lg,
    backgroundColor: ParentColors.bgSurface,
    ...ParentShadows.card,
  },
  thumb: {
    width: 116,
    height: 116,
    borderRadius: ParentRadii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    flexShrink: 0,
  },
  pendingMain: {
    flex: 1,
    minWidth: 0,
    gap: ParentSpacing[2],
  },
  activeMain: {
    flex: 1,
    minWidth: 0,
    gap: ParentSpacing[2],
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: ParentSpacing[3],
  },
  cardTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.xl,
    lineHeight: 26,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.fgPrimary,
  },
  metaText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 20,
    color: ParentColors.fgSecondary,
  },
  noteLabel: {
    marginTop: ParentSpacing[2],
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgMuted,
  },
  quoteText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 20,
    color: ParentColors.fgSecondary,
  },
  softBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.tintGold,
  },
  softBadgeText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.amber700,
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: ParentRadii.pill,
  },
  categoryBadgeText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.bold,
  },
  aiPill: {
    alignSelf: 'flex-start',
    marginTop: ParentSpacing[2],
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.tintPine,
  },
  aiPillText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pine500,
  },
  pendingActions: {
    minWidth: 280,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: ParentSpacing[3],
  },
  primarySmallButton: {
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.pine500,
  },
  primarySmallButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.onSidebar,
  },
  secondarySmallButton: {
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.pine500,
    backgroundColor: ParentColors.bgSurface,
  },
  secondarySmallButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pine500,
  },
  activeSide: {
    minWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: ParentSpacing[4],
  },
  dateText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  editButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: ParentRadii.sm,
    borderWidth: 1,
    borderColor: ParentColors.pine500,
  },
  editButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pine500,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[4],
  },
  progressTrack: {
    flex: 1,
    height: 9,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.bgSurfaceWarm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.leaf700,
  },
  progressText: {
    width: 44,
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  historyPanel: {
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.lg,
    overflow: 'hidden',
    backgroundColor: ParentColors.bgSurface,
    ...ParentShadows.card,
  },
  historyRow: {
    minHeight: 118,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[4],
    padding: ParentSpacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ParentColors.borderSoft,
  },
  historyMain: {
    flex: 1,
    minWidth: 0,
    gap: ParentSpacing[2],
  },
  reasonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 20,
    color: ParentColors.fgSecondary,
  },
  statusPill: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[2],
    paddingHorizontal: 16,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.tintLeaf,
  },
  statusPillMuted: {
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  statusPillText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.leaf700,
  },
  statusPillTextMuted: {
    color: ParentColors.fgSecondary,
  },
  olderButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  olderButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pine500,
  },
  emptyState: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  emptyStateText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
  },
  centerBox: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.error,
  },
  footerNote: {
    marginTop: ParentSpacing[8],
    textAlign: 'center',
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
  },
});

export const parentRewardManagementTabletStyles = s;
