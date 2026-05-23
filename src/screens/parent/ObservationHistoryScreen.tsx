import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../../App';
import type { ParentObservation } from '../../types/database';
import {
  ParentColors,
  ParentFontSizes,
  ParentFontWeights,
  ParentSpacing,
  ParentRadii,
  ParentFonts,
} from '../../constants/parentTheme';

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Taipei';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

const OBS_LABELS: Record<string, string> = {
  noaction: '今天沒有完成',
  quality: '完成了，但狀況不太理想',
  bonus: '今天表現特別好，值得肯定',
  other: '其他想記錄的事',
};

const OBS_COLORS: Record<string, { bg: string; fg: string }> = {
  noaction: { bg: '#FDF2E7', fg: ParentColors.warn },
  quality: { bg: '#EAF0EE', fg: ParentColors.teal500 },
  bonus: { bg: '#E8F2E6', fg: ParentColors.success },
  other: { bg: ParentColors.bgSurfaceWarm, fg: ParentColors.fgMuted },
};

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ChevLeftIcon({ size = 20, color = ParentColors.ink700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type Nav = StackNavigationProp<RootStackParamList, 'ObservationHistory'>;

export default function ObservationHistoryScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ObservationHistory'>>();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { taskId, childId, taskName } = route.params;

  const [observations, setObservations] = useState<ParentObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('parent_observations')
        .select('*')
        .eq('task_id', taskId)
        .eq('child_id', childId)
        .order('created_at', { ascending: false });

      if (err) {
        console.error('[ObservationHistoryScreen] fetch error:', err);
        setError('載入失敗，請稍後再試');
      } else {
        setObservations(data ?? []);
      }
      setLoading(false);
    };
    void fetch();
  }, [taskId, childId]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Nav bar */}
      <View style={[styles.navBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          style={styles.backNavBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevLeftIcon size={22} color={ParentColors.ink700} />
          <Text style={styles.backNavLabel}>返回</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>觀察紀錄</Text>
        <View style={styles.navSpacer} />
      </View>

      {/* Task name row */}
      <View style={styles.taskNameRow}>
        <Text style={styles.taskNameText} numberOfLines={1}>{taskName}</Text>
        {!loading && !error && (
          <Text style={styles.countText}>{observations.length} 筆</Text>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={ParentColors.teal500} style={styles.loader} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : observations.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>還沒有任何觀察紀錄</Text>
            <Text style={styles.emptyBody}>
              在任務詳情頁點「記錄觀察」，就能把日常的小狀況記下來。
            </Text>
          </View>
        ) : (
          observations.map((obs, idx) => {
            const colorSet = OBS_COLORS[obs.obs_type] ?? OBS_COLORS.other;
            const dt = dayjs(obs.created_at).tz(TZ);
            const isFirst = idx === 0;
            return (
              <View key={obs.id} style={[styles.card, !isFirst && styles.cardBorder]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.typePill, { backgroundColor: colorSet.bg }]}>
                    <Text style={[styles.typePillText, { color: colorSet.fg }]}>
                      {OBS_LABELS[obs.obs_type] ?? obs.obs_type}
                    </Text>
                  </View>
                  <Text style={styles.dateText}>{dt.format('M/D HH:mm')}</Text>
                </View>
                {obs.note ? (
                  <Text style={styles.noteText}>{obs.note}</Text>
                ) : null}
                {obs.reward_adj ? (
                  <Text style={styles.adjText}>獎勵調整：{obs.reward_adj}</Text>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: ParentColors.bgCanvas,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ParentSpacing.gutter,
    paddingBottom: 10,
    backgroundColor: ParentColors.bgCanvas,
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  backNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    minWidth: 64,
  },
  backNavLabel: {
    fontSize: 15,
    color: ParentColors.ink700,
    fontFamily: ParentFonts.body,
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },
  navSpacer: {
    minWidth: 64,
  },
  taskNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ParentSpacing.gutter,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgCanvas,
  },
  taskNameText: {
    flex: 1,
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
    marginRight: 8,
  },
  countText: {
    fontSize: 12,
    color: ParentColors.fgMuted,
    fontWeight: ParentFontWeights.medium,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: ParentSpacing.gutter,
    paddingBottom: 40,
  },
  loader: {
    marginTop: 48,
  },
  errorText: {
    textAlign: 'center',
    marginTop: 48,
    fontSize: ParentFontSizes.pBody,
    color: ParentColors.error,
  },
  emptyBox: {
    alignItems: 'center',
    marginTop: 64,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: ParentFontSizes.pBody,
    color: ParentColors.fgMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: ParentRadii.lg,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    padding: 14,
    marginBottom: 10,
  },
  cardBorder: {
    // individual card already has marginBottom; kept for potential override
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  typePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: ParentRadii.pill,
    flexShrink: 1,
    marginRight: 8,
  },
  typePillText: {
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
  },
  dateText: {
    fontSize: 11,
    color: ParentColors.fgMuted,
    flexShrink: 0,
  },
  noteText: {
    fontSize: 14,
    color: ParentColors.fgPrimary,
    lineHeight: 20,
    marginBottom: 4,
  },
  adjText: {
    fontSize: 12,
    color: ParentColors.fgMuted,
    marginTop: 2,
  },
});
