import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../App';
import type { ParentTabParamList } from './ParentTabNavigator';
import { useSelectedChild } from '../../context/SelectedChildContext';
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
  useParentWeeklyReport,
  type WeeklyActivityBar,
  type WeeklyCoinFlow,
  type WeeklySuggestion,
  type GrowthMoment,
} from '../../hooks/useParentWeeklyReport';
import type { TaskCategory } from '../../types/database';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<ParentTabParamList, 'Weekly'>,
  StackNavigationProp<RootStackParamList>
>;

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------

function ChevLeftIcon({ size = 14, color = ParentColors.ink700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChevRightIcon({ size = 14, color = ParentColors.ink700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SparkleIcon({ size = 14, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z"
        stroke={color} strokeWidth={1.8} strokeLinejoin="round"
      />
    </Svg>
  );
}

function SunIcon({ size = 14, color = ParentColors.ink700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth={1.8} />
      <Path
        d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        stroke={color} strokeWidth={1.8} strokeLinecap="round"
      />
    </Svg>
  );
}

function HourglassIcon({ size = 14, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 2h14M5 22h14M6 2c0 7 6 8 6 10s-6 3-6 10M18 2c0 7-6 8-6 10s6 3 6 10"
        stroke={color} strokeWidth={1.8} strokeLinecap="round"
      />
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

function FlagIcon({ size = 14, color = ParentColors.plum500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 21V4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M5 4h11l-2 4 2 4H5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function PlusIcon({ size = 12, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function CheckIcon({ size = 12, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12l5 5L20 7" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SendIcon({ size = 16, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M22 2L11 13" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M22 2L15 22l-4-9-9-4 20-7z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CoinGlyph({ size = 13 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" fill="#F5B800" />
      <Circle cx="12" cy="12" r="7" fill="#D69A00" fillOpacity={0.3} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Task category metadata
// ---------------------------------------------------------------------------

const CAT_META: Record<TaskCategory, { label: string; tint: string; fg: string; icon: React.ReactElement }> = {
  A: { label: '生活自理', tint: '#EAE4D7', fg: ParentColors.ink700, icon: <SunIcon /> },
  B: { label: '家庭本分', tint: '#EAF0EE', fg: ParentColors.teal500, icon: <HourglassIcon /> },
  C: { label: '超出本分', tint: '#FAF1E7', fg: ParentColors.clay500, icon: <StarIcon /> },
  D: { label: '成長里程碑', tint: '#F4EBF0', fg: ParentColors.plum500, icon: <FlagIcon /> },
};

// ---------------------------------------------------------------------------
// SectionHead
// ---------------------------------------------------------------------------

function SectionHead({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionHeadText}>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

// ---------------------------------------------------------------------------
// ActivityBar
// ---------------------------------------------------------------------------

function ActivityBar({ cat, done, total }: WeeklyActivityBar) {
  const meta = CAT_META[cat];
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const barColor =
    pct >= 90 ? ParentColors.success :
    pct >= 60 ? ParentColors.teal400 :
    ParentColors.warn;

  return (
    <View style={styles.activityBarRow}>
      <View style={styles.activityBarHeader}>
        <View style={styles.activityBarLabel}>
          {React.cloneElement(meta.icon, { size: 13, color: meta.fg })}
          <Text style={styles.activityBarName}>{meta.label}</Text>
        </View>
        <Text style={styles.activityBarCount}>
          <Text style={styles.activityBarDone}>{done}</Text>
          <Text style={styles.activityBarTotal}> / {total}</Text>
        </Text>
      </View>
      <View style={styles.activityTrack}>
        <View style={[styles.activityFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// EconCard
// ---------------------------------------------------------------------------

function EconCard({
  label,
  value,
  desc,
  tone,
}: {
  label: string;
  value: number;
  desc: string;
  tone: 'up' | 'down';
}) {
  const accent = tone === 'up' ? ParentColors.success : ParentColors.clay500;
  const sign = tone === 'up' ? '+' : '−';
  return (
    <View style={styles.econCard}>
      <Text style={styles.econLabel}>{label}</Text>
      <View style={styles.econValueRow}>
        <Text style={[styles.econSign, { color: accent }]}>{sign}</Text>
        <Text style={styles.econNum}>{value}</Text>
        <CoinGlyph size={13} />
      </View>
      <Text style={styles.econDesc}>{desc}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SuggestionRow
// ---------------------------------------------------------------------------

function SuggestionRow({
  index,
  suggestion,
  onAction,
}: {
  index: number;
  suggestion: WeeklySuggestion;
  onAction: () => void;
}) {
  return (
    <View style={styles.suggestionRow}>
      <View style={styles.suggestionIndex}>
        <Text style={styles.suggestionIndexText}>{index}</Text>
      </View>
      <View style={styles.suggestionBody}>
        <Text style={styles.suggestionText}>{suggestion.body}</Text>
        <TouchableOpacity style={styles.suggestionAction} onPress={onAction} activeOpacity={0.7}>
          <Text style={styles.suggestionActionText}>{suggestion.actionLabel}</Text>
          <ChevRightIcon size={11} color={ParentColors.teal500} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// MomentItem
// ---------------------------------------------------------------------------

function MomentItem({ moment, isLast }: { moment: GrowthMoment; isLast: boolean }) {
  return (
    <View style={[styles.momentItem, !isLast && styles.momentItemDivider]}>
      <View style={styles.momentDot} />
      <View style={styles.momentContent}>
        <Text style={styles.momentDate}>{moment.dateLabel}</Text>
        <Text style={styles.momentTitle}>{moment.title}</Text>
        {moment.body ? <Text style={styles.momentBody}>{moment.body}</Text> : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// AddMomentModal
// ---------------------------------------------------------------------------

function AddMomentModal({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (title: string, body: string) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle('');
    setBody('');
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave(title, body);
      reset();
      onClose();
    } catch {
      Alert.alert('錯誤', '儲存失敗，請稍後再試');
      setSaving(false);
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

          <View style={styles.modalHeader}>
            <View style={styles.modalIconBox}>
              <StarIcon size={15} color={ParentColors.clay500} />
            </View>
            <View>
              <Text style={styles.modalTitle}>記錄成長時刻</Text>
              <Text style={styles.modalSubtitle}>寫下這週值得記住的事</Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>標題</Text>
          <TextInput
            style={styles.textInput}
            value={title}
            onChangeText={setTitle}
            placeholder="例如：第一次自己決定不看電視先做功課"
            placeholderTextColor={ParentColors.ink300}
            maxLength={60}
          />

          <View style={styles.fieldLabelRow}>
            <Text style={styles.fieldLabel}>備註</Text>
            <Text style={styles.fieldOptional}>選填</Text>
          </View>
          <TextInput
            style={[styles.textInput, styles.textInputMulti]}
            value={body}
            onChangeText={setBody}
            placeholder="可以多寫幾句，幫助日後回顧。"
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
              style={[styles.btnPrimary, (!title.trim() || saving) && styles.btnDisabled]}
              onPress={handleSave}
              activeOpacity={0.7}
              disabled={!title.trim() || saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={styles.btnPrimaryText}>儲存</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ParentWeeklyReportScreen() {
  const navigation = useNavigation<Nav>();
  const { childId } = useSelectedChild();

  const report = useParentWeeklyReport(childId);

  useFocusEffect(useCallback(() => { report.refresh(); }, [report.refresh]));

  const [pickedAffirmation, setPickedAffirmation] = useState<number | null>(null);
  const [addMomentVisible, setAddMomentVisible] = useState(false);

  const handleSuggestionAction = (suggestion: WeeklySuggestion) => {
    if (suggestion.action === 'add_contribution') {
      Alert.alert('新增貢獻型任務', '可以在任務清單頁新增 C 類任務。', [
        { text: '前往任務清單', onPress: () => navigation.navigate('Tasks') },
        { text: '稍後再說', style: 'cancel' },
      ]);
      return;
    }
    if (suggestion.taskId && suggestion.taskName) {
      navigation.navigate('ParentTaskDetail', {
        taskId: suggestion.taskId,
        childId,
        taskName: suggestion.taskName,
      });
      return;
    }
    navigation.navigate('Tasks');
  };

  const handleSendAffirmation = () => {
    if (pickedAffirmation === null) return;
    const text = report.affirmations[pickedAffirmation];
    Alert.alert(
      '傳送肯定語句',
      `傳送給 ${report.childName}：\n\n「${text}」`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '確認傳送',
          onPress: () => {
            setPickedAffirmation(null);
            Alert.alert('已傳送', `${report.childName} 下次開啟 App 時會看到這句話。`);
          },
        },
      ],
    );
  };

  if (report.loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ParentColors.teal500} />
      </View>
    );
  }

  if (report.error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{report.error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={report.refresh}>
          <Text style={styles.retryBtnText}>重新載入</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const net = report.coinFlow.income - report.coinFlow.spend;

  return (
    <View style={styles.root}>
      <ParentTopBar />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ───────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.weekNav}>
            <TouchableOpacity
              style={[styles.navArrow, !report.canGoBack && styles.navArrowDisabled]}
              onPress={report.goBack}
              disabled={!report.canGoBack}
              activeOpacity={0.7}
            >
              <ChevLeftIcon size={14} color={report.canGoBack ? ParentColors.ink700 : ParentColors.ink300} />
            </TouchableOpacity>
            <Text style={styles.weekLabel}>{report.weekLabel}</Text>
            <TouchableOpacity
              style={[styles.navArrow, !report.canGoForward && styles.navArrowDisabled]}
              onPress={report.goForward}
              disabled={!report.canGoForward}
              activeOpacity={0.7}
            >
              <ChevRightIcon size={14} color={report.canGoForward ? ParentColors.ink700 : ParentColors.ink300} />
            </TouchableOpacity>
          </View>
          <Text style={styles.heroTitle}>{report.childName}的這一週</Text>
          <Text style={styles.heroMeta}>
            {report.weekRange} · 共 {report.totalTasks} 件任務
          </Text>
        </View>

        {/* ── AI 觀察 ───────────────────────────────────────── */}
        <View style={styles.aiCard}>
          <View style={styles.aiTag}>
            <SparkleIcon size={10} color="#FFFFFF" />
            <Text style={styles.aiTagText}>AI 觀察</Text>
          </View>
          <Text style={styles.aiQuoteMark}>「</Text>
          <Text style={styles.aiInsightText}>{report.aiInsight}</Text>
          <Text style={styles.aiInsightClose}>」</Text>
          <View style={styles.aiFooter}>
            <Text style={styles.aiFooterText}>
              根據本週 {report.totalTasks} 項任務、{report.checkIns} 次打卡分析
            </Text>
          </View>
        </View>

        {/* ── 任務完成狀況 ──────────────────────────────────── */}
        <SectionHead eyebrow="本週活動" title="任務完成狀況" />
        <View style={styles.card}>
          {report.activity.map(a => (
            <ActivityBar key={a.cat} {...a} />
          ))}
        </View>

        {/* ── 金幣流動 ─────────────────────────────────────── */}
        <SectionHead eyebrow="經濟" title="本週金幣流動" />
        <View style={styles.econRow}>
          <EconCard
            label="收入"
            value={report.coinFlow.income}
            desc={`${report.coinFlow.incomeFrom} 件任務`}
            tone="up"
          />
          <EconCard
            label="支出"
            value={report.coinFlow.spend}
            desc={`${report.coinFlow.spendFrom} 次兌換`}
            tone="down"
          />
        </View>
        <View style={styles.netRow}>
          <Text style={styles.netLabel}>淨累積</Text>
          <View style={styles.netValueRow}>
            <Text style={[styles.netValue, { color: net >= 0 ? ParentColors.teal500 : ParentColors.error }]}>
              {net >= 0 ? '+' : ''}{net}
            </Text>
            <CoinGlyph size={14} />
          </View>
        </View>

        {/* ── AI 建議 ──────────────────────────────────────── */}
        <SectionHead eyebrow="下週" title="AI 給你的 3 個建議" />
        <View style={styles.suggestionsContainer}>
          {report.suggestions.map((s, i) => (
            <SuggestionRow
              key={i}
              index={i + 1}
              suggestion={s}
              onAction={() => handleSuggestionAction(s)}
            />
          ))}
        </View>

        {/* ── 成長時刻 ─────────────────────────────────────── */}
        <SectionHead
          eyebrow="成長時刻"
          title="本週值得記住的事"
          action={
            <TouchableOpacity
              style={styles.addMomentBtn}
              onPress={() => setAddMomentVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.addMomentText}>記錄</Text>
              <PlusIcon size={12} color={ParentColors.teal500} />
            </TouchableOpacity>
          }
        />

        {report.moments.length === 0 ? (
          <View style={styles.emptyMoments}>
            <Text style={styles.emptyMomentsText}>這週還沒有成長時刻紀錄。</Text>
            <Text style={styles.emptyMomentsHint}>點右上角「記錄 +」新增第一條。</Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            <View style={styles.timelineBar} />
            {report.moments.map((m, i) => (
              <MomentItem key={m.id} moment={m} isLast={i === report.moments.length - 1} />
            ))}
          </View>
        )}

        {/* ── 肯定語句 ─────────────────────────────────────── */}
        <SectionHead eyebrow="肯定" title={`挑一句傳給${report.childName}`} />
        <View style={styles.affirmationsContainer}>
          {report.affirmations.map((a, i) => {
            const picked = pickedAffirmation === i;
            return (
              <TouchableOpacity
                key={i}
                style={[styles.affirmationBtn, picked && styles.affirmationBtnPicked]}
                onPress={() => setPickedAffirmation(picked ? null : i)}
                activeOpacity={0.7}
              >
                <View style={[styles.affirmationRadio, picked && styles.affirmationRadioPicked]}>
                  {picked && <CheckIcon size={11} color="#FFFFFF" />}
                </View>
                <Text style={[styles.affirmationText, picked && styles.affirmationTextPicked]}>{a}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.sendBtn, pickedAffirmation === null && styles.btnDisabled]}
          onPress={handleSendAffirmation}
          activeOpacity={0.8}
          disabled={pickedAffirmation === null}
        >
          <SendIcon size={15} color="#FFFFFF" />
          <Text style={styles.sendBtnText}>傳送給 {report.childName}</Text>
        </TouchableOpacity>
      </ScrollView>

      <AddMomentModal
        visible={addMomentVisible}
        onClose={() => setAddMomentVisible(false)}
        onSave={report.addMoment}
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
    paddingHorizontal: ParentSpacing.gutter,
    paddingTop: 8,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.bgCanvas,
    padding: 24,
  },
  errorText: {
    fontSize: ParentFontSizes.pBody,
    color: ParentColors.error,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  retryBtnText: {
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgPrimary,
    fontWeight: ParentFontWeights.semi,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  navArrow: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrowDisabled: {
    opacity: 0.4,
  },
  weekLabel: {
    fontSize: 12,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.ink700,
    fontFamily: ParentFonts.display,
  },
  heroTitle: {
    fontSize: ParentFontSizes.display,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
    lineHeight: ParentFontSizes.display * 1.2,
  },
  heroMeta: {
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
    marginTop: 6,
  },

  // ── AI card ──────────────────────────────────────────────────────────────────
  aiCard: {
    marginTop: 18,
    marginBottom: 4,
    padding: 20,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    ...ParentShadows.card,
    position: 'relative',
  },
  aiTag: {
    position: 'absolute',
    top: -11,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.teal500,
  },
  aiTagText: {
    fontSize: 10.5,
    fontWeight: ParentFontWeights.bold,
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  aiQuoteMark: {
    fontSize: 28,
    color: ParentColors.teal500,
    fontWeight: ParentFontWeights.medium,
    lineHeight: 28,
    marginBottom: -4,
    fontFamily: ParentFonts.display,
  },
  aiInsightText: {
    fontFamily: ParentFonts.display,
    fontSize: 16,
    lineHeight: 26,
    color: ParentColors.ink800,
    letterSpacing: 0.01,
  },
  aiInsightClose: {
    fontSize: 17,
    color: ParentColors.teal500,
    fontFamily: ParentFonts.display,
  },
  aiFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
    borderStyle: 'dashed',
  },
  aiFooterText: {
    fontSize: 11.5,
    color: ParentColors.fgMuted,
    fontStyle: 'italic',
  },

  // ── Section head ─────────────────────────────────────────────────────────────
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 26,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionHeadText: {
    flex: 1,
  },
  sectionEyebrow: {
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  sectionTitle: {
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },

  // ── Card (shared) ─────────────────────────────────────────────────────────────
  card: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    padding: 16,
    gap: 14,
  },

  // ── Activity bar ──────────────────────────────────────────────────────────────
  activityBarRow: {
    gap: 6,
  },
  activityBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activityBarLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  activityBarName: {
    fontSize: 13,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
  },
  activityBarCount: {
    fontSize: 12,
    color: ParentColors.fgMuted,
    fontFamily: ParentFonts.display,
  },
  activityBarDone: {
    color: ParentColors.fgPrimary,
    fontWeight: ParentFontWeights.semi,
  },
  activityBarTotal: {
    color: ParentColors.fgMuted,
  },
  activityTrack: {
    height: 6,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.bgSurfaceWarm,
    overflow: 'hidden',
  },
  activityFill: {
    height: '100%',
    borderRadius: ParentRadii.pill,
  },

  // ── Econ ─────────────────────────────────────────────────────────────────────
  econRow: {
    flexDirection: 'row',
    gap: 10,
  },
  econCard: {
    flex: 1,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    padding: 14,
  },
  econLabel: {
    fontSize: 11,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  econValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    marginTop: 6,
  },
  econSign: {
    fontSize: 18,
    fontWeight: ParentFontWeights.medium,
    fontFamily: ParentFonts.display,
  },
  econNum: {
    fontSize: 26,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },
  econDesc: {
    fontSize: 11.5,
    color: ParentColors.fgMuted,
    marginTop: 2,
  },
  netRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  netLabel: {
    fontSize: 13,
    color: ParentColors.fgMuted,
  },
  netValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  netValue: {
    fontSize: 19,
    fontWeight: ParentFontWeights.medium,
    fontFamily: ParentFonts.display,
  },

  // ── Suggestions ───────────────────────────────────────────────────────────────
  suggestionsContainer: {
    gap: 10,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    padding: 14,
  },
  suggestionIndex: {
    width: 26,
    height: 26,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.teal50,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  suggestionIndexText: {
    fontSize: 13,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.teal500,
    fontFamily: ParentFonts.display,
  },
  suggestionBody: {
    flex: 1,
    minWidth: 0,
  },
  suggestionText: {
    fontSize: 14,
    color: ParentColors.ink800,
    lineHeight: 21,
    marginBottom: 8,
  },
  suggestionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.teal50,
  },
  suggestionActionText: {
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.teal500,
  },

  // ── Growth moments timeline ───────────────────────────────────────────────────
  addMomentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  addMomentText: {
    fontSize: 13,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.teal500,
  },
  emptyMoments: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyMomentsText: {
    fontSize: 14,
    color: ParentColors.fgMuted,
    marginBottom: 4,
  },
  emptyMomentsHint: {
    fontSize: 12,
    color: ParentColors.ink300,
  },
  timeline: {
    position: 'relative',
    paddingLeft: 18,
  },
  timelineBar: {
    position: 'absolute',
    left: 5,
    top: 8,
    bottom: 8,
    width: 1.5,
    backgroundColor: ParentColors.ivory200,
  },
  momentItem: {
    position: 'relative',
    marginBottom: 16,
    flexDirection: 'row',
    gap: 10,
  },
  momentItemDivider: {
    marginBottom: 16,
  },
  momentDot: {
    position: 'absolute',
    left: -18,
    top: 6,
    width: 11,
    height: 11,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 2,
    borderColor: ParentColors.teal500,
  },
  momentContent: {
    flex: 1,
  },
  momentDate: {
    fontSize: 11.5,
    color: ParentColors.fgMuted,
    marginBottom: 2,
  },
  momentTitle: {
    fontSize: 15,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
    lineHeight: 22,
  },
  momentBody: {
    fontSize: 12.5,
    color: ParentColors.fgMuted,
    marginTop: 2,
    lineHeight: 18,
  },

  // ── Affirmations ──────────────────────────────────────────────────────────────
  affirmationsContainer: {
    gap: 8,
    marginBottom: 14,
  },
  affirmationBtn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    padding: 14,
  },
  affirmationBtnPicked: {
    backgroundColor: ParentColors.teal50,
    borderColor: ParentColors.teal500,
  },
  affirmationRadio: {
    width: 22,
    height: 22,
    borderRadius: ParentRadii.pill,
    borderWidth: 2,
    borderColor: ParentColors.ivory300,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  affirmationRadioPicked: {
    backgroundColor: ParentColors.teal500,
    borderColor: ParentColors.teal500,
  },
  affirmationText: {
    flex: 1,
    fontSize: 15,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
    lineHeight: 23,
  },
  affirmationTextPicked: {
    color: ParentColors.teal700,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ParentColors.teal500,
    borderRadius: ParentRadii.md,
    paddingVertical: 14,
    ...ParentShadows.pop,
  },
  sendBtnText: {
    fontSize: 15,
    fontWeight: ParentFontWeights.semi,
    color: '#FFFFFF',
  },

  // ── Modal ─────────────────────────────────────────────────────────────────────
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
    paddingBottom: 32,
    ...ParentShadows.elev,
  },
  modalDragBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: ParentColors.ivory300,
    alignSelf: 'center',
    marginBottom: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 20,
  },
  modalIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FAF1E7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 12,
    marginBottom: 6,
  },
  fieldOptional: {
    fontSize: 11,
    color: ParentColors.ink400,
  },
  textInput: {
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    padding: 12,
    fontSize: 14,
    color: ParentColors.fgPrimary,
    backgroundColor: ParentColors.bgSurface,
  },
  textInputMulti: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: ParentColors.teal500,
    borderRadius: ParentRadii.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: '#FFFFFF',
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: ParentRadii.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },
  btnDisabled: {
    opacity: 0.4,
  },
});
