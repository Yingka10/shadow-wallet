// NOTE: This screen requires a `redemption_requests` table in Supabase.
// See src/hooks/useParentRedemption.ts for the CREATE TABLE SQL.
// AI screening is currently mocked based on coin_cost; wire real AI later.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../App';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import dayjsRelativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-tw';
import { supabase } from '../../lib/supabase';
import { ParentTopBar } from '../../components/ParentTopBar';
import {
  ParentColors,
  ParentFontSizes,
  ParentFontWeights,
  ParentSpacing,
  ParentRadii,
  ParentShadows,
  ParentFonts,
} from '../../constants/parentTheme';
import {
  useParentRedemption,
  getAiResult,
  type RedemptionRequest,
  type RedemptionChildInfo,
  type ParentProposal,
  type ChildWishItem,
  type AiVerdict,
} from '../../hooks/useParentRedemption';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(dayjsRelativeTime);
dayjs.locale('zh-tw');

const TZ = 'Asia/Taipei';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = 'pending' | 'proposed' | 'history';

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

function CoinGlyph({ size = 13 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" fill="#F5B800" />
      <Circle cx="12" cy="12" r="7" fill="#D69A00" fillOpacity={0.3} />
    </Svg>
  );
}

function CheckIcon({ size = 15, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12l5 5L20 7" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function XIcon({ size = 15, color = ParentColors.ink700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function PencilIcon({ size = 15, color = ParentColors.clay500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14 4 5 13l-1 5 5-1 9-9" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="m14 4 4 4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function StarIcon({ size = 14, color = ParentColors.clay500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        stroke={color} strokeWidth={1.8} strokeLinejoin="round"
      />
    </Svg>
  );
}

function SparkleIcon({ size = 12, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z"
        stroke={color} strokeWidth={1.8} strokeLinejoin="round"
      />
    </Svg>
  );
}

function PlusIcon({ size = 18, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function GiftIcon({ size = 22, color = ParentColors.ink400 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 12v10H4V12" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M22 7H2v5h20V7z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 22V7" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChevRightIcon({ size = 14, color = ParentColors.ink500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChevLeftIcon({ size = 20, color = ParentColors.ink700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHILD_PALETTE = [
  { bg: '#FAF1E7', fg: ParentColors.clay500 },
  { bg: '#EAF0EE', fg: ParentColors.sage500 },
  { bg: '#F4EBF0', fg: ParentColors.plum500 },
] as const;

function childPalette(children: RedemptionChildInfo[], childId: string) {
  const idx = children.findIndex(c => c.id === childId);
  return CHILD_PALETTE[(idx < 0 ? 0 : idx) % CHILD_PALETTE.length];
}

function childName(children: RedemptionChildInfo[], childId: string): string {
  return children.find(c => c.id === childId)?.nickname ?? '—';
}

function relativeTime(dateStr: string): string {
  return dayjs(dateStr).tz(TZ).fromNow();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return dayjs(dateStr).tz(TZ).format('M/D');
}

// ---------------------------------------------------------------------------
// ChildAvatar
// ---------------------------------------------------------------------------

function ChildAvatar({
  childId,
  allChildren,
  size = 32,
}: {
  childId: string;
  allChildren: RedemptionChildInfo[];
  size?: number;
}) {
  const palette = childPalette(allChildren, childId);
  const name = childName(allChildren, childId);
  const initial = name.charAt(0);
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: palette.bg,
        },
      ]}
    >
      <Text style={[styles.avatarText, { color: palette.fg, fontSize: size * 0.44 }]}>
        {initial}
      </Text>
    </View>
  );
}

function ChildWishCard({
  wish,
  allChildren,
  onConfirm,
}: {
  wish: ChildWishItem;
  allChildren: RedemptionChildInfo[];
  onConfirm: (id: string, coinCost: number) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const ownerName = childName(allChildren, wish.child_id ?? '');
  const isConfirmed = wish.parent_approved;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(wish.id, wish.ai_suggested_coins ?? 40);
    } catch {
      Alert.alert('錯誤', '確認失敗，請稍後再試');
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.childWishCard}>
      <View style={styles.childWishCardTop}>
        <ChildAvatar childId={wish.child_id ?? ''} allChildren={allChildren} size={32} />
        <View style={styles.childWishCardBody}>
          <Text style={styles.childWishOwner}>{ownerName} 的新願望</Text>
          <Text style={styles.childWishName} numberOfLines={1}>{wish.name}</Text>
          <Text style={styles.childWishTime}>{formatDate(wish.created_at)}</Text>
        </View>
        <View style={[styles.childWishStatus, isConfirmed && styles.childWishStatusConfirmed]}>
          <Text style={[styles.childWishStatusText, isConfirmed && styles.childWishStatusTextConfirmed]}>
            {isConfirmed ? '已確認' : '待確認'}
          </Text>
        </View>
      </View>

      <View style={styles.childWishFooter}>
        <View style={styles.childWishCoinRow}>
          <CoinGlyph size={12} />
          <Text style={styles.childWishCoinText}>
            {isConfirmed ? wish.coin_cost : wish.ai_suggested_coins ?? 40} 幣
          </Text>
        </View>
        {!isConfirmed ? (
          <TouchableOpacity
            style={[styles.childWishConfirmBtn, submitting && styles.childWishConfirmBtnDisabled]}
            onPress={handleConfirm}
            activeOpacity={0.75}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.childWishConfirmBtnText}>確認</Text>
            )}
          </TouchableOpacity>
        ) : (
          <Text style={styles.childWishConfirmedNote}>已同步到孩子端</Text>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

function Stepper({
  value,
  onChange,
  step = 5,
  min = 5,
  max = 300,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        style={styles.stepperBtn}
        onPress={() => onChange(Math.max(min, value - step))}
        activeOpacity={0.7}
      >
        <Text style={styles.stepperBtnText}>−</Text>
      </TouchableOpacity>
      <View style={styles.stepperValueRow}>
        <Text style={styles.stepperValue}>{value}</Text>
        <CoinGlyph size={12} />
      </View>
      <TouchableOpacity
        style={styles.stepperBtn}
        onPress={() => onChange(Math.min(max, value + step))}
        activeOpacity={0.7}
      >
        <Text style={styles.stepperBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// AiVerdict tag + color map
// ---------------------------------------------------------------------------

const VERDICT_META: Record<AiVerdict, { label: string; color: string; bg: string }> = {
  ok:   { label: '合理',       color: ParentColors.sage500, bg: '#F4F8EE' },
  high: { label: '幣值偏高，供參考', color: ParentColors.warn, bg: '#FBF1DC' },
};

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconBox}>
        <GiftIcon size={22} color={ParentColors.ink400} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDesc}>{desc}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tab 1 — RedemptionCard
// ---------------------------------------------------------------------------

function RedemptionCard({
  req,
  allChildren,
  onApprove,
  onRequestReject,
}: {
  req: RedemptionRequest;
  allChildren: RedemptionChildInfo[];
  onApprove: (id: string, adjustedCoins?: number) => Promise<void>;
  onRequestReject: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const ai = getAiResult(req);
  const [adjustedCoins, setAdjustedCoins] = useState(ai.suggestedCoins ?? req.coin_cost);
  const verdict = VERDICT_META[ai.verdict];

  const handleApprove = async (coins?: number) => {
    setSubmitting(true);
    try {
      await onApprove(req.id, coins);
    } catch {
      Alert.alert('錯誤', '操作失敗，請稍後再試');
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.card}>
      {/* Card header */}
      <View style={styles.cardHeader}>
        <ChildAvatar childId={req.child_id} allChildren={allChildren} size={32} />
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardChildLabel}>{childName(allChildren, req.child_id)} 許願</Text>
          <Text style={styles.cardTime}>{relativeTime(req.created_at)}</Text>
        </View>
        <View style={styles.aiPassPill}>
          <SparkleIcon size={10} color={ParentColors.teal500} />
          <Text style={styles.aiPassPillText}>已通過 AI 初篩</Text>
        </View>
      </View>

      {/* Wish name */}
      <View style={styles.cardWishSection}>
        <Text style={styles.cardWishName}>{req.name}</Text>
        {req.description ? (
          <Text style={styles.cardWishDesc}>{req.description}</Text>
        ) : null}
      </View>

      {/* Coin value row */}
      <View style={styles.coinRow}>
        <View style={styles.coinBlock}>
          <Text style={styles.coinBlockLabel}>孩子自定幣值</Text>
          <View style={styles.coinValueRow}>
            <Text style={styles.coinNum}>{req.coin_cost}</Text>
            <CoinGlyph size={14} />
          </View>
        </View>
        {ai.suggestedCoins !== null && ai.suggestedCoins !== req.coin_cost && (
          <>
            <ChevRightIcon size={14} color={ParentColors.ink400} />
            <View style={[styles.coinBlock, styles.coinBlockRight]}>
              <Text style={[styles.coinBlockLabel, { color: verdict.color }]}>AI 建議</Text>
              <View style={styles.coinValueRow}>
                <Text style={[styles.coinNum, { color: verdict.color }]}>{ai.suggestedCoins}</Text>
                <CoinGlyph size={14} />
              </View>
            </View>
          </>
        )}
      </View>

      {/* AI verdict */}
      <View style={[styles.aiBox, { backgroundColor: verdict.bg }]}>
        <View style={[styles.aiIconBox, { backgroundColor: verdict.color }]}>
          <SparkleIcon size={11} color="#FFFFFF" />
        </View>
        <View style={styles.aiBoxContent}>
          <View style={styles.aiBoxHeader}>
            <Text style={styles.aiBoxLabel}>AI 初審</Text>
            <View style={[styles.verdictPill, { backgroundColor: verdict.color }]}>
              <Text style={styles.verdictPillText}>{verdict.label}</Text>
            </View>
          </View>
          <Text style={styles.aiReason}>{ai.reason}</Text>
        </View>
      </View>

      {/* Inline adjust panel */}
      {editing && (
        <View style={styles.adjustPanel}>
          <View>
            <Text style={styles.adjustPanelTitle}>調整幣值後核准</Text>
            <Text style={styles.adjustPanelSub}>孩子將以新幣值兌換</Text>
          </View>
          <Stepper value={adjustedCoins} onChange={setAdjustedCoins} step={5} min={5} max={300} />
        </View>
      )}

      {/* Action buttons */}
      {!editing ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnLeft]}
            onPress={() => onRequestReject(req.id)}
            activeOpacity={0.7}
            disabled={submitting}
          >
            <XIcon size={14} color={ParentColors.ink700} />
            <Text style={[styles.actionBtnText, { color: ParentColors.ink700 }]}>駁回</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnMid]}
            onPress={() => setEditing(true)}
            activeOpacity={0.7}
            disabled={submitting}
          >
            <PencilIcon size={14} color={ParentColors.clay500} />
            <Text style={[styles.actionBtnText, { color: ParentColors.clay500 }]}>修改幣值</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleApprove()}
            activeOpacity={0.7}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator size="small" color={ParentColors.teal500} />
              : <>
                  <CheckIcon size={14} color={ParentColors.teal500} />
                  <Text style={[styles.actionBtnText, { color: ParentColors.teal500 }]}>核准</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnLeft, { flex: 1 }]}
            onPress={() => setEditing(false)}
            activeOpacity={0.7}
            disabled={submitting}
          >
            <XIcon size={14} color={ParentColors.ink500} />
            <Text style={[styles.actionBtnText, { color: ParentColors.ink500 }]}>取消</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { flex: 2 }]}
            onPress={() => handleApprove(adjustedCoins)}
            activeOpacity={0.7}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator size="small" color={ParentColors.teal500} />
              : <>
                  <CheckIcon size={14} color={ParentColors.teal500} />
                  <Text style={[styles.actionBtnText, { color: ParentColors.teal500 }]}>
                    以 {adjustedCoins} 幣核准
                  </Text>
                </>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tab 1 — PendingTab
// ---------------------------------------------------------------------------

function PendingTab({
  requests,
  childWishes,
  allChildren,
  onApprove,
  onRequestReject,
  onConfirmWish,
}: {
  requests: RedemptionRequest[];
  childWishes: ChildWishItem[];
  allChildren: RedemptionChildInfo[];
  onApprove: (id: string, adjustedCoins?: number) => Promise<void>;
  onRequestReject: (id: string) => void;
  onConfirmWish: (id: string, coinCost: number) => Promise<void>;
}) {
  const pendingChildWishes = childWishes.filter(w => w.is_active && !w.parent_approved);

  if (requests.length === 0 && pendingChildWishes.length === 0) {
    return (
      <EmptyState
        title="目前沒有待確認項目"
        desc="孩子的新願望與兌換申請都會即時出現在這裡"
      />
    );
  }
  return (
    <View style={styles.tabContent}>
      {pendingChildWishes.length > 0 && (
        <View style={styles.childWishSection}>
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>孩子新願望</Text>
            <Text style={styles.sectionCount}>{pendingChildWishes.length}</Text>
          </View>
          <View style={styles.childWishList}>
            {pendingChildWishes.map(wish => (
              <ChildWishCard
                key={wish.id}
                wish={wish}
                allChildren={allChildren}
                onConfirm={onConfirmWish}
              />
            ))}
          </View>
        </View>
      )}

      {requests.map(req => (
        <RedemptionCard
          key={req.id}
          req={req}
          allChildren={allChildren}
          onApprove={onApprove}
          onRequestReject={onRequestReject}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — ProposalCard
// ---------------------------------------------------------------------------

function ProposalCard({
  proposal,
  allChildren,
  onRemove,
}: {
  proposal: ParentProposal;
  allChildren: RedemptionChildInfo[];
  onRemove: (id: string) => void;
}) {
  const targetChild = proposal.child_id
    ? allChildren.find(c => c.id === proposal.child_id)
    : null;

  return (
    <View style={styles.proposalCard}>
      <View style={styles.proposalCardTop}>
        <View style={styles.proposalCardLeft}>
          <Text style={styles.proposalName}>{proposal.name}</Text>
          <View style={styles.proposalMeta}>
            {targetChild ? (
              <View style={styles.proposalChildRow}>
                <ChildAvatar childId={targetChild.id} allChildren={allChildren} size={18} />
                <Text style={styles.proposalChildName}>{targetChild.nickname}</Text>
              </View>
            ) : (
              <Text style={styles.proposalChildName}>所有孩子</Text>
            )}
          </View>
        </View>
        <View style={styles.proposalCoinCol}>
          <View style={styles.proposalCoinRow}>
            <Text style={styles.proposalCoinNum}>{proposal.coin_cost}</Text>
            <CoinGlyph size={13} />
          </View>
          <TouchableOpacity
            style={styles.proposalRemoveBtn}
            onPress={() => onRemove(proposal.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.proposalRemoveText}>移除</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.proposalPillRow}>
        <View style={styles.openPill}>
          <Text style={styles.openPillText}>願望池中</Text>
        </View>
        <Text style={styles.proposalDate}>
          {formatDate(proposal.created_at)} 加入
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — ProposedTab
// ---------------------------------------------------------------------------

function ProposedTab({
  proposals,
  allChildren,
  onAdd,
  onRemove,
}: {
  proposals: ParentProposal[];
  allChildren: RedemptionChildInfo[];
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <View style={styles.tabContent}>
      {/* Add button */}
      <TouchableOpacity style={styles.addProposalBtn} onPress={onAdd} activeOpacity={0.7}>
        <View style={styles.addProposalIcon}>
          <PlusIcon size={18} color={ParentColors.teal500} />
        </View>
        <View style={styles.addProposalText}>
          <Text style={styles.addProposalTitle}>新增提案獎勵</Text>
          <Text style={styles.addProposalSub}>放入孩子的願望池，他們會看到</Text>
        </View>
        <ChevRightIcon size={14} color={ParentColors.ink400} />
      </TouchableOpacity>

      <Text style={styles.proposedHint}>
        家長提案的獎勵會出現在孩子的願望池，可以用來引導行為或在特別日子加碼。
      </Text>

      {proposals.length === 0 ? (
        <EmptyState
          title="還沒有提案獎勵"
          desc="點上方按鈕新增，讓孩子在許願池看到你的提案"
        />
      ) : (
        proposals.map(p => (
          <ProposalCard
            key={p.id}
            proposal={p}
            allChildren={allChildren}
            onRemove={onRemove}
          />
        ))
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — HistoryRow
// ---------------------------------------------------------------------------

function HistoryRow({
  rec,
  allChildren,
  divider,
}: {
  rec: RedemptionRequest;
  allChildren: RedemptionChildInfo[];
  divider: boolean;
}) {
  const isApproved = rec.status === 'approved';
  const finalCoins = rec.adjusted_coins ?? rec.coin_cost;

  return (
    <View style={[styles.historyRow, divider && styles.historyRowDivider]}>
      <ChildAvatar childId={rec.child_id} allChildren={allChildren} size={32} />
      <View style={styles.historyRowContent}>
        <Text style={styles.historyName} numberOfLines={1}>{rec.name}</Text>
        <Text style={styles.historyMeta}>
          {formatDate(rec.reviewed_at)} · {childName(allChildren, rec.child_id)}
        </Text>
      </View>
      <View style={styles.historyRight}>
        <View style={styles.historyCoinRow}>
          <Text style={styles.historyCoinNum}>{finalCoins}</Text>
          <CoinGlyph size={11} />
        </View>
        <View style={[
          styles.statusPill,
          { backgroundColor: isApproved ? '#E8F2E6' : ParentColors.bgSurfaceWarm },
        ]}>
          <Text style={[
            styles.statusPillText,
            { color: isApproved ? ParentColors.success : ParentColors.fgMuted },
          ]}>
            {isApproved ? '已核准' : '已駁回'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — HistoryTab
// ---------------------------------------------------------------------------

function HistoryTab({
  records,
  allChildren,
}: {
  records: RedemptionRequest[];
  allChildren: RedemptionChildInfo[];
}) {
  if (records.length === 0) {
    return (
      <EmptyState
        title="還沒有兌換紀錄"
        desc="核准或駁回的申請會在這裡保留紀錄"
      />
    );
  }
  return (
    <View style={styles.historyCard}>
      {records.map((r, i) => (
        <HistoryRow
          key={r.id}
          rec={r}
          allChildren={allChildren}
          divider={i < records.length - 1}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// RejectModal
// ---------------------------------------------------------------------------

function RejectModal({
  visible,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setNote('');
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleConfirm = async () => {
    if (!note.trim()) {
      Alert.alert('請填寫原因', '請給孩子一句說明，讓他知道為什麼這次不行。');
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(note);
      reset();
      onClose();
    } catch {
      Alert.alert('錯誤', '操作失敗，請稍後再試');
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={handleClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalDragBar} />

          <View style={styles.modalHeaderRow}>
            <View style={styles.modalIconBox}>
              <XIcon size={16} color={ParentColors.error} />
            </View>
            <View>
              <Text style={styles.modalTitle}>說明一下原因</Text>
              <Text style={styles.modalSubtitle}>孩子會看到這段話，請盡量說清楚</Text>
            </View>
          </View>

          <TextInput
            style={styles.rejectInput}
            value={note}
            onChangeText={setNote}
            placeholder="例：這個願望太貴了，我們先存更多幣再來討論。"
            placeholderTextColor={ParentColors.ink300}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.btnSecondary} onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.btnSecondaryText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnDanger, submitting && styles.btnDisabled]}
              onPress={handleConfirm}
              activeOpacity={0.7}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={styles.btnPrimaryText}>確認駁回</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// AddProposalModal — full-screen page layout
// ---------------------------------------------------------------------------

const COIN_PRESETS = [20, 40, 60, 100];

const NAME_SUGGESTIONS = [
  { t: '週末去公園野餐', c: 30 },
  { t: '挑一本繪本帶回家', c: 45 },
  { t: '看一場電影', c: 60 },
  { t: '自己挑晚餐菜色', c: 25 },
  { t: '額外 30 分鐘故事', c: 15 },
];

const REASON_OPTIONS = [
  { id: 'encourage', label: '加碼鼓勵', desc: '本週表現好，多給一個甜頭' },
  { id: 'guide',     label: '引導行為', desc: '想用它換來某個習慣或目標' },
  { id: 'celebrate', label: '特別日子', desc: '生日 / 節日 / 里程碑' },
  { id: 'other',     label: '其他',     desc: '自由發揮' },
] as const;

const EXPIRY_OPTIONS = ['本週日前', '本月底', '兩週內', '無期限'] as const;

function AddProposalModal({
  visible,
  onClose,
  onConfirm,
  allChildren,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (data: { name: string; coin_cost: number; child_id: string | null }) => Promise<void>;
  allChildren: RedemptionChildInfo[];
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [coins, setCoins] = useState(40);
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
  const [reason, setReason] = useState<string>('encourage');
  const [expiry, setExpiry] = useState<string>('本週日前');
  const [submitting, setSubmitting] = useState(false);

  const canSave = name.trim().length > 0;

  const reset = () => {
    setName('');
    setDesc('');
    setCoins(40);
    setSelectedChildIds([]);
    setReason('encourage');
    setExpiry('本週日前');
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleConfirm = async () => {
    if (!canSave) return;
    setSubmitting(true);
    try {
      const child_id = selectedChildIds.length === 1 ? selectedChildIds[0] : null;
      await onConfirm({ name: name.trim(), coin_cost: coins, child_id });
      reset();
      onClose();
    } catch {
      Alert.alert('錯誤', '新增失敗，請稍後再試');
      setSubmitting(false);
    }
  };

  const toggleChild = (id: string) => {
    setSelectedChildIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const coinHint =
    coins <= 20 ? '較易達成' :
    coins <= 50 ? '中等門檻' :
    coins <= 100 ? '需要存一陣子' : '較大目標';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={[styles.proposalScreen, { backgroundColor: ParentColors.bgCanvas }]}>
        {/* ── Nav bar ─────────────────────────────────────────── */}
        <View style={[styles.proposalNavBar, { paddingTop: insets.top + 4 }]}>
          <TouchableOpacity
            style={styles.proposalNavBack}
            onPress={handleClose}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ChevLeftIcon size={22} color={ParentColors.ink700} />
            <Text style={styles.proposalNavBackText}>返回</Text>
          </TouchableOpacity>
          <Text style={styles.proposalNavTitle}>新增提案</Text>
          <View style={styles.proposalNavSpacer} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.proposalScroll}
          >
            {/* ── Header ────────────────────────────────────── */}
            <View style={styles.proposalHeader}>
              <Text style={styles.proposalEyebrow}>新增提案</Text>
              <Text style={styles.proposalTitle}>放一個獎勵到願望池</Text>
              <Text style={styles.proposalHeaderMeta}>
                這不是孩子自己許的願 — 你可以用它鼓勵特定行為，或在特別的日子加碼。
              </Text>
            </View>

            {/* ── 獎勵名稱 ─────────────────────────────────── */}
            <View style={styles.formGroup}>
              <View style={styles.formLabelRow}>
                <Text style={styles.formLabel}>獎勵名稱</Text>
                <Text style={styles.formHint}>孩子會看到這個名稱</Text>
              </View>
              <TextInput
                style={styles.formInput}
                value={name}
                onChangeText={setName}
                placeholder="例：週末去公園野餐"
                placeholderTextColor={ParentColors.ink300}
              />
              <View style={styles.suggestionRow}>
                {NAME_SUGGESTIONS.map(s => (
                  <TouchableOpacity
                    key={s.t}
                    style={[styles.suggestionChip, name === s.t && styles.suggestionChipActive]}
                    onPress={() => { setName(s.t); setCoins(s.c); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.suggestionChipText, name === s.t && styles.suggestionChipTextActive]}>
                      {s.t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── 補充說明 ─────────────────────────────────── */}
            <View style={styles.formGroup}>
              <View style={styles.formLabelRow}>
                <Text style={styles.formLabel}>補充說明</Text>
                <Text style={styles.formHint}>選填，給孩子的一句話</Text>
              </View>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={desc}
                onChangeText={setDesc}
                placeholder="例：本週很認真完成練琴，加碼鼓勵你！"
                placeholderTextColor={ParentColors.ink300}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />
            </View>

            {/* ── 兌換金幣 ─────────────────────────────────── */}
            <View style={styles.formGroup}>
              <View style={styles.formLabelRow}>
                <Text style={styles.formLabel}>兌換金幣</Text>
                <Text style={styles.formHint}>孩子需要花多少金幣才能換到</Text>
              </View>
              <View style={styles.coinPickerCard}>
                <View style={styles.coinPickerLeft}>
                  <View style={styles.coinIconBox}>
                    <CoinGlyph size={20} />
                  </View>
                  <View>
                    <Text style={styles.coinPickerNum}>{coins}
                      <Text style={styles.coinPickerUnit}> 枚金幣</Text>
                    </Text>
                    <Text style={styles.coinPickerHint}>{coinHint}</Text>
                  </View>
                </View>
                <Stepper value={coins} onChange={setCoins} step={5} min={5} max={300} />
              </View>
              <View style={styles.coinPresets}>
                {COIN_PRESETS.map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.coinPresetBtn, coins === p && styles.coinPresetBtnActive]}
                    onPress={() => setCoins(p)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.coinPresetText, coins === p && styles.coinPresetTextActive]}>
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── 放給哪些孩子 ─────────────────────────────── */}
            {allChildren.length > 0 && (
              <View style={styles.formGroup}>
                <View style={styles.formLabelRow}>
                  <Text style={styles.formLabel}>放給哪些孩子</Text>
                  <Text style={styles.formHint}>不選則放給所有孩子</Text>
                </View>
                {allChildren.map(c => {
                  const on = selectedChildIds.includes(c.id);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.childCard, on && styles.childCardActive]}
                      onPress={() => toggleChild(c.id)}
                      activeOpacity={0.7}
                    >
                      <ChildAvatar childId={c.id} allChildren={allChildren} size={32} />
                      <Text style={styles.childCardName}>{c.nickname}</Text>
                      <View style={[styles.childCardCheck, on && styles.childCardCheckActive]}>
                        {on && <CheckIcon size={14} color="#FFFFFF" />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── 提案動機 ─────────────────────────────────── */}
            <View style={styles.formGroup}>
              <View style={styles.formLabelRow}>
                <Text style={styles.formLabel}>提案動機</Text>
                <Text style={styles.formHint}>幫 AI 理解你的用意</Text>
              </View>
              <View style={styles.reasonGrid}>
                {REASON_OPTIONS.map(o => {
                  const on = reason === o.id;
                  return (
                    <TouchableOpacity
                      key={o.id}
                      style={[styles.reasonBtn, on && styles.reasonBtnActive]}
                      onPress={() => setReason(o.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.reasonLabel, on && styles.reasonLabelActive]}>{o.label}</Text>
                      <Text style={[styles.reasonDesc, on && styles.reasonDescActive]}>{o.desc}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── 有效期限 ─────────────────────────────────── */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>有效期限</Text>
              <View style={styles.expiryRow}>
                {EXPIRY_OPTIONS.map(o => (
                  <TouchableOpacity
                    key={o}
                    style={[styles.expiryChip, expiry === o && styles.expiryChipActive]}
                    onPress={() => setExpiry(o)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.expiryChipText, expiry === o && styles.expiryChipTextActive]}>{o}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── 預覽 ─────────────────────────────────────── */}
            <View style={styles.formGroup}>
              <Text style={styles.previewLabel}>預覽 — 孩子看到的樣子</Text>
              <View style={styles.previewCard}>
                <View style={styles.previewTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.previewParentPill}>
                      <Text style={styles.previewParentPillText}>爸媽提案</Text>
                    </View>
                    <Text style={styles.previewName} numberOfLines={2}>
                      {name || '提案標題會出現在這裡'}
                    </Text>
                    {desc ? (
                      <Text style={styles.previewDesc} numberOfLines={2}>{desc}</Text>
                    ) : null}
                  </View>
                  <View style={styles.previewCoinBlock}>
                    <View style={styles.previewCoinRow}>
                      <Text style={styles.previewCoinNum}>{coins}</Text>
                      <CoinGlyph size={14} />
                    </View>
                    <Text style={styles.previewExpiry}>{expiry}</Text>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* ── Footer ───────────────────────────────────────── */}
          <View style={[styles.proposalFooter, { paddingBottom: insets.bottom + 8 }]}>
            <TouchableOpacity style={styles.btnSecondary} onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.btnSecondaryText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, (!canSave || submitting) && styles.btnDisabled, { flex: 2 }]}
              onPress={handleConfirm}
              activeOpacity={0.7}
              disabled={!canSave || submitting}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <>
                    <CheckIcon size={15} color="#FFFFFF" />
                    <Text style={styles.btnPrimaryText}>放入願望池</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ParentRedemptionScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [loadingFamily, setLoadingFamily] = useState(true);

  const {
    pendingRequests,
    parentProposals,
    history,
    children,
    childWishes,
    recentChildWish,
    clearRecentChildWish,
    loading,
    error,
    fetchAll,
    approveRequest,
    rejectRequest,
    approveChildWish,
    addParentProposal,
    removeParentProposal,
  } = useParentRedemption(familyId);

  const [activeTab, setActiveTab] = useState<TabId>('pending');
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [addProposalVisible, setAddProposalVisible] = useState(false);
  const pendingChildWishCount = useMemo(
    () => childWishes.filter(wish => wish.is_active && !wish.parent_approved).length,
    [childWishes],
  );

  // Load family on mount
  useEffect(() => {
    async function loadFamily() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('parents')
          .select('family_id')
          .eq('user_id', user.id)
          .single();
        if (data?.family_id) setFamilyId(data.family_id);
      } catch (err) {
        console.error('[ParentRedemptionScreen] loadFamily error:', err);
      } finally {
        setLoadingFamily(false);
      }
    }
    loadFamily();
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleApprove = useCallback(async (id: string, adjustedCoins?: number) => {
    await approveRequest(id, adjustedCoins);
    await fetchAll();
  }, [approveRequest, fetchAll]);

  const handleReject = useCallback(async (note: string) => {
    if (!rejectTargetId) return;
    await rejectRequest(rejectTargetId, note);
    setRejectTargetId(null);
    await fetchAll();
  }, [rejectTargetId, rejectRequest, fetchAll]);

  const handleAddProposal = useCallback(async (data: {
    name: string;
    coin_cost: number;
    child_id: string | null;
  }) => {
    await addParentProposal(data);
    await fetchAll();
  }, [addParentProposal, fetchAll]);

  const handleConfirmWish = useCallback(async (wishId: string, coinCost: number) => {
    await approveChildWish(wishId, coinCost);
    clearRecentChildWish();
    await fetchAll();
  }, [approveChildWish, clearRecentChildWish, fetchAll]);

  const handleRemoveProposal = useCallback(async (id: string) => {
    Alert.alert('移除提案', '確定要從願望池移除這個提案嗎？', [
      { text: '取消', style: 'cancel' },
      {
        text: '移除',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeParentProposal(id);
            await fetchAll();
          } catch {
            Alert.alert('錯誤', '移除失敗，請稍後再試');
          }
        },
      },
    ]);
  }, [removeParentProposal, fetchAll]);

  if (loadingFamily) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ParentColors.teal500} />
      </View>
    );
  }

  const TABS: { id: TabId; label: string; count: number }[] = [
    { id: 'pending',  label: '待審核',   count: pendingRequests.length + pendingChildWishCount },
    { id: 'proposed', label: '家長提案', count: parentProposals.length },
    { id: 'history',  label: '紀錄',     count: history.length },
  ];

  return (
    <View style={styles.root}>
      <ParentTopBar onSettingsPress={() => navigation.navigate('ParentSettings')} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.headerEyebrow}>兌換審核</Text>
          <Text style={styles.headerDisplay}>
            {pendingRequests.length + pendingChildWishCount > 0
              ? `有 ${pendingRequests.length + pendingChildWishCount} 件等你看看`
              : '暫無待審申請'
            }
          </Text>
          <Text style={styles.headerMeta}>孩子新願望與 AI 初審申請都會即時同步到這裡</Text>

          {recentChildWish && (
            <View style={styles.syncBanner}>
              <View style={styles.syncBannerIcon}>
                <StarIcon size={14} color="#FFFFFF" />
              </View>
              <View style={styles.syncBannerText}>
                <Text style={styles.syncBannerTitle}>收到孩子新願望</Text>
                <Text style={styles.syncBannerSub} numberOfLines={2}>
                  {childName(children, recentChildWish.child_id ?? '')} · {recentChildWish.name} · {recentChildWish.ai_suggested_coins ?? 40} 幣
                </Text>
              </View>
              <TouchableOpacity
                style={styles.syncBannerAction}
                onPress={() => {
                  setActiveTab('pending');
                  clearRecentChildWish();
                }}
                activeOpacity={0.75}
              >
                <Text style={styles.syncBannerActionText}>查看</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* AI screening banner */}
          <View style={styles.aiBanner}>
            <View style={styles.aiBannerIcon}>
              <SparkleIcon size={14} color="#FFFFFF" />
            </View>
            <View style={styles.aiBannerText}>
              <Text style={styles.aiBannerTitle}>AI 已協助過濾明顯不合理的申請</Text>
              <Text style={styles.aiBannerSub}>幣值太高、重複提案——AI 直接告訴孩子原因</Text>
            </View>
          </View>
        </View>

        {/* ── Tab bar (sticky) ───────────────────────────────────── */}
        <View style={styles.tabBarWrapper}>
          <View style={styles.tabBar}>
            {TABS.map(tab => {
              const active = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.tabBtn, active && styles.tabBtnActive]}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                  <View style={[styles.tabCount, active && styles.tabCountActive]}>
                    <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>
                      {tab.count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Tab content ────────────────────────────────────────── */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={ParentColors.teal500} />
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchAll} activeOpacity={0.7}>
              <Text style={styles.retryBtnText}>重試</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {activeTab === 'pending' && (
              <PendingTab
                requests={pendingRequests}
                childWishes={childWishes}
                allChildren={children}
                onApprove={handleApprove}
                onRequestReject={id => setRejectTargetId(id)}
                onConfirmWish={handleConfirmWish}
              />
            )}
            {activeTab === 'proposed' && (
              <ProposedTab
                proposals={parentProposals}
                allChildren={children}
                onAdd={() => setAddProposalVisible(true)}
                onRemove={handleRemoveProposal}
              />
            )}
            {activeTab === 'history' && (
              <HistoryTab records={history} allChildren={children} />
            )}
          </>
        )}
      </ScrollView>

      <RejectModal
        visible={rejectTargetId !== null}
        onClose={() => setRejectTargetId(null)}
        onConfirm={handleReject}
      />

      <AddProposalModal
        visible={addProposalVisible}
        onClose={() => setAddProposalVisible(false)}
        onConfirm={handleAddProposal}
        allChildren={children}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ParentColors.bgCanvas,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 48,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.bgCanvas,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: ParentSpacing.gutter,
    paddingTop: 14,
    paddingBottom: 14,
  },
  headerEyebrow: {
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  headerDisplay: {
    fontSize: ParentFontSizes.display,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
    lineHeight: ParentFontSizes.display * 1.2,
    marginBottom: 4,
  },
  headerMeta: {
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
    marginBottom: 14,
  },

  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginBottom: 14,
    backgroundColor: '#F6F1E4',
    borderWidth: 1,
    borderColor: '#E6D7B5',
    borderRadius: ParentRadii.md,
  },
  syncBannerIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: ParentColors.clay500,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  syncBannerText: {
    flex: 1,
    minWidth: 0,
  },
  syncBannerTitle: {
    fontSize: 12.5,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  syncBannerSub: {
    fontSize: 11,
    color: ParentColors.fgMuted,
    marginTop: 1,
  },
  syncBannerAction: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  syncBannerActionText: {
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },

  childWishSection: {
    gap: 10,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  sectionCount: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.bgSurfaceWarm,
    color: ParentColors.ink500,
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    textAlign: 'center',
  },
  childWishList: {
    gap: 10,
  },

  // ── AI banner ─────────────────────────────────────────────────────────────
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: ParentColors.teal50,
    borderWidth: 1,
    borderColor: ParentColors.teal100,
    borderRadius: ParentRadii.md,
  },
  aiBannerIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: ParentColors.teal500,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  aiBannerText: {
    flex: 1,
  },
  aiBannerTitle: {
    fontSize: 12.5,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  aiBannerSub: {
    fontSize: 11,
    color: ParentColors.fgMuted,
    marginTop: 1,
  },

  // ── Tab bar ───────────────────────────────────────────────────────────────
  tabBarWrapper: {
    paddingHorizontal: ParentSpacing.gutter,
    paddingVertical: 6,
    backgroundColor: ParentColors.bgCanvas,
  },
  tabBar: {
    flexDirection: 'row',
    padding: 3,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderRadius: ParentRadii.pill,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: ParentRadii.pill,
  },
  tabBtnActive: {
    backgroundColor: ParentColors.bgSurface,
    ...ParentShadows.card,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgMuted,
  },
  tabLabelActive: {
    color: ParentColors.fgPrimary,
    fontWeight: ParentFontWeights.semi,
  },
  tabCount: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: ParentRadii.pill,
  },
  tabCountActive: {
    backgroundColor: ParentColors.teal50,
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.ink400,
  },
  tabCountTextActive: {
    color: ParentColors.teal500,
  },

  // ── Tab content wrapper ───────────────────────────────────────────────────
  tabContent: {
    paddingHorizontal: ParentSpacing.gutter,
    paddingTop: 12,
    gap: 12,
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
  },
  errorBox: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.error,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },

  // ── Child avatar ──────────────────────────────────────────────────────────
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontWeight: ParentFontWeights.bold,
  },

  // ── Stepper ───────────────────────────────────────────────────────────────
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: ParentRadii.sm,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    fontSize: 18,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    lineHeight: 20,
  },
  stepperValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minWidth: 54,
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: 16,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },

  // ── Redemption card ───────────────────────────────────────────────────────
  card: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    overflow: 'hidden',
    ...ParentShadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    paddingBottom: 8,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardChildLabel: {
    fontSize: 13,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  cardTime: {
    fontSize: 11,
    color: ParentColors.fgMuted,
    marginTop: 1,
  },
  aiPassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.teal50,
  },
  aiPassPillText: {
    fontSize: 10.5,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.teal500,
  },
  cardWishSection: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  cardWishName: {
    fontSize: 20,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
    lineHeight: 26,
    marginBottom: 4,
  },
  cardWishDesc: {
    fontSize: 13,
    color: ParentColors.fgMuted,
    fontStyle: 'italic',
    lineHeight: 19,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: ParentColors.ivory300,
  },

  // ── Coin value row ────────────────────────────────────────────────────────
  coinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 12,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderRadius: 12,
  },
  coinBlock: {
    flex: 1,
  },
  coinBlockRight: {
    alignItems: 'flex-end',
  },
  coinBlockLabel: {
    fontSize: 10.5,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  coinValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  coinNum: {
    fontSize: 22,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },

  // ── AI verdict box ────────────────────────────────────────────────────────
  aiBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 10,
    borderRadius: 12,
  },
  aiIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  aiBoxContent: {
    flex: 1,
  },
  aiBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  aiBoxLabel: {
    fontSize: 11.5,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    letterSpacing: 0.3,
  },
  verdictPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: ParentRadii.pill,
  },
  verdictPillText: {
    fontSize: 10.5,
    fontWeight: ParentFontWeights.semi,
    color: '#FFFFFF',
  },
  aiReason: {
    fontSize: 12.5,
    color: ParentColors.fgSecondary,
    lineHeight: 18,
  },

  // ── Adjust panel ──────────────────────────────────────────────────────────
  adjustPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 12,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.teal200,
    borderRadius: 12,
  },
  adjustPanelTitle: {
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  adjustPanelSub: {
    fontSize: 11,
    color: ParentColors.fgMuted,
    marginTop: 1,
  },

  // ── Action row ────────────────────────────────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 13,
  },
  actionBtnLeft: {
    borderRightWidth: 1,
    borderRightColor: ParentColors.borderSoft,
  },
  actionBtnMid: {
    borderRightWidth: 1,
    borderRightColor: ParentColors.borderSoft,
  },
  actionBtnText: {
    fontSize: 13.5,
    fontWeight: ParentFontWeights.semi,
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 16,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    marginHorizontal: ParentSpacing.gutter,
    marginTop: 12,
  },
  emptyIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: ParentColors.bgSurfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
    marginBottom: 4,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13,
    color: ParentColors.fgMuted,
    lineHeight: 19,
    textAlign: 'center',
  },

  // ── Proposal card ─────────────────────────────────────────────────────────
  proposalCard: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    ...ParentShadows.card,
  },
  proposalCardTop: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  proposalCardLeft: {
    flex: 1,
  },
  proposalName: {
    fontSize: 17,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
    lineHeight: 22,
    marginBottom: 4,
  },

  // ── Child wish cards ─────────────────────────────────────────────────────
  childWishCard: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    padding: 14,
    ...ParentShadows.card,
  },
  childWishCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  childWishCardBody: {
    flex: 1,
    minWidth: 0,
  },
  childWishOwner: {
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
    marginBottom: 3,
  },
  childWishName: {
    fontSize: 17,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
    lineHeight: 23,
  },
  childWishTime: {
    marginTop: 4,
    fontSize: 11,
    color: ParentColors.fgMuted,
  },
  childWishStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.ivory200,
  },
  childWishStatusConfirmed: {
    backgroundColor: '#E8F2E6',
  },
  childWishStatusText: {
    fontSize: 10.5,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.ink500,
  },
  childWishStatusTextConfirmed: {
    color: ParentColors.success,
  },
  childWishFooter: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  childWishCoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  childWishCoinText: {
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.ink500,
  },
  childWishConfirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.teal500,
  },
  childWishConfirmBtnDisabled: {
    opacity: 0.6,
  },
  childWishConfirmBtnText: {
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: '#FFFFFF',
  },
  childWishConfirmedNote: {
    fontSize: 12,
    color: ParentColors.success,
    fontWeight: ParentFontWeights.semi,
  },
  proposalMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  proposalChildRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  proposalChildName: {
    fontSize: 12,
    color: ParentColors.fgMuted,
  },
  proposalCoinCol: {
    alignItems: 'flex-end',
    gap: 6,
  },
  proposalCoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  proposalCoinNum: {
    fontSize: 20,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },
  proposalRemoveBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: ParentRadii.sm,
    backgroundColor: 'rgba(181,85,47,0.08)',
  },
  proposalRemoveText: {
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.error,
  },
  proposalPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  openPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.teal50,
  },
  openPillText: {
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.teal500,
  },
  proposalDate: {
    fontSize: 11,
    color: ParentColors.ink400,
  },
  addProposalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: ParentColors.teal300,
  },
  addProposalIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: ParentColors.teal50,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  addProposalText: {
    flex: 1,
  },
  addProposalTitle: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  addProposalSub: {
    fontSize: 11.5,
    color: ParentColors.fgMuted,
    marginTop: 1,
  },
  proposedHint: {
    fontSize: 12,
    color: ParentColors.fgMuted,
    lineHeight: 18,
    paddingHorizontal: 4,
  },

  // ── History ───────────────────────────────────────────────────────────────
  historyCard: {
    marginHorizontal: ParentSpacing.gutter,
    marginTop: 12,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  historyRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  historyRowContent: {
    flex: 1,
    minWidth: 0,
  },
  historyName: {
    fontSize: 14,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
  },
  historyMeta: {
    fontSize: 11.5,
    color: ParentColors.fgMuted,
    marginTop: 1,
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  historyCoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  historyCoinNum: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: ParentRadii.pill,
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: ParentFontWeights.semi,
  },

  // ── Modals (shared) ───────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,27,23,0.42)',
  },
  modalSheet: {
    backgroundColor: ParentColors.bgSurface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 28,
    maxHeight: '70%',
    ...ParentShadows.elev,
  },
  modalSheetTall: {
    maxHeight: '88%',
  },
  modalDragBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: ParentColors.ivory300,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 16,
  },
  modalIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(181,85,47,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  modalIconBoxTeal: {
    backgroundColor: ParentColors.teal50,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },
  modalSubtitle: {
    fontSize: 12,
    color: ParentColors.fgMuted,
    marginTop: 2,
    lineHeight: 17,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: ParentColors.teal500,
    borderRadius: ParentRadii.md,
    paddingVertical: 13,
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: '#FFFFFF',
  },
  btnSecondary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.bgSurface,
    borderRadius: ParentRadii.md,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },
  btnDanger: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.error,
    borderRadius: ParentRadii.md,
    paddingVertical: 13,
  },
  btnDisabled: {
    opacity: 0.45,
  },

  // ── Reject modal ──────────────────────────────────────────────────────────
  rejectInput: {
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    padding: 12,
    fontSize: 14,
    color: ParentColors.fgPrimary,
    backgroundColor: ParentColors.bgSurface,
    minHeight: 88,
    lineHeight: 22,
  },

  // ── Add proposal modal ────────────────────────────────────────────────────
  formLabel: {
    fontSize: 12.5,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    marginBottom: 8,
    marginTop: 14,
  },
  formRequired: {
    color: ParentColors.error,
  },
  formOptional: {
    color: ParentColors.fgMuted,
    fontWeight: ParentFontWeights.regular,
  },
  formInput: {
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    padding: 12,
    fontSize: 14,
    color: ParentColors.fgPrimary,
    backgroundColor: ParentColors.bgSurface,
  },
  coinPickerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
  },
  coinPickerLeft: {
    gap: 2,
  },
  coinPickerNum: {
    fontSize: 24,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },
  coinPickerHint: {
    fontSize: 11.5,
    color: ParentColors.fgMuted,
  },
  coinPresets: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  coinPresetBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.bgSurfaceWarm,
    alignItems: 'center',
  },
  coinPresetBtnActive: {
    backgroundColor: ParentColors.teal500,
  },
  coinPresetText: {
    fontSize: 13,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
    fontFamily: ParentFonts.display,
  },
  coinPresetTextActive: {
    color: '#FFFFFF',
  },
  childSelector: {
    gap: 8,
  },
  childSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  childSelectorBtnActive: {
    borderColor: ParentColors.teal500,
    backgroundColor: ParentColors.teal50,
  },
  childSelectorText: {
    fontSize: 14,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
  },
  childSelectorTextActive: {
    color: ParentColors.teal500,
    fontWeight: ParentFontWeights.semi,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
  },
  previewCard: {
    padding: 14,
    backgroundColor: '#FFFBF3',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F0E4C4',
    marginBottom: 4,
  },
  previewParentPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: ParentRadii.pill,
    backgroundColor: '#FAF1E7',
    marginBottom: 6,
  },
  previewParentPillText: {
    fontSize: 10.5,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.clay500,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  previewName: {
    flex: 1,
    fontSize: 17,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
    lineHeight: 22,
  },
  previewCoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  previewCoinNum: {
    fontSize: 20,
    fontWeight: ParentFontWeights.medium,
    color: '#A87800',
    fontFamily: ParentFonts.display,
  },

  // ── New Proposal Screen ───────────────────────────────────────────────────
  proposalScreen: {
    flex: 1,
  },
  proposalNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ParentSpacing.gutter,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgCanvas,
  },
  proposalNavBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    minWidth: 64,
  },
  proposalNavBackText: {
    fontSize: 15,
    color: ParentColors.ink700,
    fontFamily: ParentFonts.body,
  },
  proposalNavTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },
  proposalNavSpacer: {
    minWidth: 64,
  },
  proposalScroll: {
    paddingHorizontal: ParentSpacing.gutter,
    paddingBottom: 24,
  },
  proposalHeader: {
    paddingTop: 14,
    paddingBottom: 18,
  },
  proposalEyebrow: {
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  proposalTitle: {
    fontSize: ParentFontSizes.display,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
    lineHeight: ParentFontSizes.display * 1.22,
  },
  proposalHeaderMeta: {
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
    marginTop: 6,
    lineHeight: 18,
  },
  proposalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: ParentSpacing.gutter,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgCanvas,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  formHint: {
    fontSize: 11,
    color: ParentColors.ink400,
  },
  formTextArea: {
    minHeight: 68,
    textAlignVertical: 'top',
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  suggestionChipActive: {
    backgroundColor: ParentColors.teal500,
    borderColor: ParentColors.teal500,
  },
  suggestionChipText: {
    fontSize: 12.5,
    color: ParentColors.ink700,
    fontWeight: ParentFontWeights.medium,
  },
  suggestionChipTextActive: {
    color: '#FFFFFF',
  },
  coinIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FFF8E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinPickerUnit: {
    fontSize: 12,
    color: ParentColors.fgMuted,
    fontWeight: ParentFontWeights.regular,
    fontFamily: ParentFonts.body,
  },
  childCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
    marginBottom: 8,
  },
  childCardActive: {
    borderColor: ParentColors.teal500,
    backgroundColor: ParentColors.teal50,
  },
  childCardName: {
    flex: 1,
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },
  childCardCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: ParentColors.ivory300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childCardCheckActive: {
    backgroundColor: ParentColors.teal500,
    borderColor: ParentColors.teal500,
  },
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reasonBtn: {
    width: '48%',
    padding: 12,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  reasonBtnActive: {
    backgroundColor: ParentColors.ink900,
    borderColor: ParentColors.ink900,
  },
  reasonLabel: {
    fontSize: 13,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  reasonLabelActive: {
    color: '#FFFFFF',
  },
  reasonDesc: {
    fontSize: 11,
    color: ParentColors.fgMuted,
    marginTop: 2,
  },
  reasonDescActive: {
    color: 'rgba(255,255,255,0.72)',
  },
  expiryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  expiryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  expiryChipActive: {
    backgroundColor: ParentColors.teal500,
    borderColor: ParentColors.teal500,
  },
  expiryChipText: {
    fontSize: 13,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.ink700,
    fontFamily: ParentFonts.display,
  },
  expiryChipTextActive: {
    color: '#FFFFFF',
  },
  previewTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    justifyContent: 'space-between',
  },
  previewDesc: {
    fontSize: 12.5,
    color: ParentColors.fgMuted,
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 18,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: ParentColors.ivory300,
  },
  previewCoinBlock: {
    alignItems: 'flex-end',
  },
  previewExpiry: {
    fontSize: 11,
    color: ParentColors.fgMuted,
    marginTop: 3,
  },
});
