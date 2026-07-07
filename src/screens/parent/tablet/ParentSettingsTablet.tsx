// Shadow Wallet · Parent Tablet — 設定
// 「管理 > 設定」整頁。分五區：家庭與孩子 / 回饋方式 / 願望與獎勵規則 / 記錄與回顧 / 帳錄與隱私。
// 混合資料：孩子/家庭/餘額顯示真實值；開關為畫面本地狀態（暫不落 DB）。
// width >= 768 時由 ParentSettings route render；手機仍用 ParentSettingsScreen。

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import dayjs from 'dayjs';
import type { RootStackParamList } from '../../../../App';
import { useSelectedChild } from '../../../context/SelectedChildContext';
import { supabase } from '../../../lib/supabase';
import type { AgeGroup } from '../../../types/database';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentSpacing,
} from '../../../constants/parentTheme';
import { webTabletScreen } from '../../../constants/webStyles';
import { ParentSidebar, type ManageSection } from './ParentSidebar';

// ─────────────────────────────────────────────────────────────────────────────
// Icons — 小線稿，一律走 token 顏色
// ─────────────────────────────────────────────────────────────────────────────

type IconProps = { size?: number; color?: string };
const ic = ParentColors.fgSecondary;

const UserIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={1.7} />
    <Path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
  </Svg>
);
const UsersIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={9} cy={8} r={3.2} stroke={color} strokeWidth={1.7} />
    <Path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    <Path d="M16 5.2A3.2 3.2 0 0117 11m1 9c0-3 .5-5-2-6.4" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
  </Svg>
);
const SmileIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.7} />
    <Path d="M8.5 14c.8 1.2 2 2 3.5 2s2.7-.8 3.5-2M9 9.5h.01M15 9.5h.01" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);
const HeartIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 20s-7-4.3-7-9.3A3.7 3.7 0 0112 8a3.7 3.7 0 017 2.7c0 5-7 9.3-7 9.3z" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
  </Svg>
);
const GiftIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M19 12v8H5v-8M3 8h18v4H3zM12 8v12" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M12 8H8.5a2 2 0 010-4C10.5 4 12 8 12 8zm0 0h3.5a2 2 0 000-4C13.5 4 12 8 12 8z" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
  </Svg>
);
const CoinIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={1.7} />
    <Path d="M12 7.5l1.2 2.5 2.7.3-2 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.9 2.7-.3z" fill={color} />
  </Svg>
);
const ClockIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={1.7} />
    <Path d="M12 7v5l3 1.8" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const DocIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const SparkleIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 3l1.5 5 5 1.5-5 1.5L12 16l-1.5-5-5-1.5 5-1.5zM18 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
  </Svg>
);
const UserPlusIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={10} cy={8} r={3.6} stroke={color} strokeWidth={1.7} />
    <Path d="M3.5 20c0-3.6 3-6.4 6.5-6.4M17 8v6M14 11h6" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
  </Svg>
);
const TagIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 4h7l9 9-7 7-9-9z" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
    <Circle cx={8.5} cy={8.5} r={1.3} fill={color} />
  </Svg>
);
const ShieldIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 3l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V6z" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
    <Path d="M9 12l2 2 4-4" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const BellIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const CalendarIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM4 9h16M8 3v4M16 3v4" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const ChatIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1H9l-4 3V6a1 1 0 011-1z" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
  </Svg>
);
const DownloadIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 3v11m0 0l-4-4m4 4l4-4M5 19h14" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const TrashIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const InfoIcon = ({ size = 16, color = ic }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.7} />
    <Path d="M12 11v5M12 8h.01" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);
const ChevronRightIcon = ({ size = 16, color = ParentColors.ink300 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const LockIcon = ({ size = 15, color = ParentColors.fgMuted }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={5} y={11} width={14} height={9} rx={2} stroke={color} strokeWidth={1.7} />
    <Path d="M8 11V7.5a4 4 0 018 0V11" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
  </Svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// Row primitives
// ─────────────────────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Switch
      value={on}
      onValueChange={onChange}
      trackColor={{ false: ParentColors.stone200, true: ParentColors.accent }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={ParentColors.stone200}
    />
  );
}

type RowProps = {
  icon: React.ReactNode;
  label: string;
  value?: string;
  right?: React.ReactNode;
  chev?: boolean;
  lock?: boolean;
  danger?: boolean;
  isLast?: boolean;
  onPress?: () => void;
};

function SettingRow({ icon, label, value, right, chev, lock, danger, isLast, onPress }: RowProps) {
  return (
    <TouchableOpacity
      style={[s.row, !isLast && s.rowDivider]}
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={s.rowIcon}>{icon}</View>
      <Text style={[s.rowLabel, danger && s.rowLabelDanger]}>{label}</Text>
      {value ? <Text style={s.rowValue} numberOfLines={1}>{value}</Text> : null}
      {right}
      {lock ? <LockIcon /> : null}
      {chev ? <ChevronRightIcon /> : null}
    </TouchableOpacity>
  );
}

const SECTION_TINTS = [
  ParentColors.tintLeaf,
  ParentColors.tintClay,
  ParentColors.tintGold,
  ParentColors.tintPine,
  ParentColors.tintPlum,
];

function SectionCard({
  index,
  icon,
  title,
  children,
}: {
  index: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.sectionCard}>
      <View style={s.sectionHead}>
        <View style={[s.sectionIcon, { backgroundColor: SECTION_TINTS[index % SECTION_TINTS.length] }]}>
          {icon}
        </View>
        <Text style={s.sectionTitle}>{index + 1}. {title}</Text>
      </View>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────

const AGE_GROUP_MODE: Record<AgeGroup, string> = {
  '2-4': '2-4 歲親子共記模式',
  '4-6': '4-6 歲引導回報模式',
  '6-9': '6-9 歲自主回報模式',
  '9-12': '9-12 歲自主管理模式',
};

type FamilyInfo = {
  age: number | null;
  ageGroup: AgeGroup | null;
  caregivers: number;
  email: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export default function ParentSettingsTablet() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();

  const { childId, childName, allChildren, setSelectedChild } = useSelectedChild();
  const selectedChildName = childName || allChildren.find((c) => c.id === childId)?.nickname || '孩子';

  const [info, setInfo] = useState<FamilyInfo>({ age: null, ageGroup: null, caregivers: 0, email: '' });

  // 回饋方式開關（本地狀態）
  const [coinOn, setCoinOn] = useState(true);
  const [timeOn, setTimeOn] = useState(true);
  const [lifeLogOn, setLifeLogOn] = useState(true);
  const [monthlyOn, setMonthlyOn] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const email = user?.email ?? '';
        let caregivers = 0;
        if (user) {
          const { data: parent } = await supabase
            .from('parents')
            .select('family_id')
            .eq('user_id', user.id)
            .single();
          if (parent?.family_id) {
            const { count } = await supabase
              .from('parents')
              .select('id', { count: 'exact', head: true })
              .eq('family_id', parent.family_id);
            caregivers = count ?? 0;
          }
        }

        let age: number | null = null;
        let ageGroup: AgeGroup | null = null;
        if (childId) {
          const { data: child } = await supabase
            .from('children')
            .select('birth_date, age_group')
            .eq('id', childId)
            .single();
          if (child) {
            ageGroup = child.age_group;
            if (child.birth_date) {
              age = dayjs().diff(dayjs(child.birth_date), 'year');
            }
          }
        }

        if (alive) setInfo({ age, ageGroup, caregivers, email });
      } catch (err) {
        console.error('[ParentSettingsTablet] load error:', err);
      }
    })();
    return () => { alive = false; };
  }, [childId]);

  // 設定是疊在 ParentTab 之上的 stack 頁；離開時要「navigate 回 ParentTab 並指定 tab」，
  // 這會把設定頁 pop 掉、同時切到目標分頁。直接 navigate('Dashboard') 只會切底下的 tab、
  // 設定頁仍蓋在最上層 → 看起來卡住回不去。
  const goToTab = useCallback((screen: string, params?: object) => {
    (navigation.navigate as (name: string, options?: object) => void)('ParentTab', { screen, params });
  }, [navigation]);
  const handleNavigateHome = useCallback(() => goToTab('Dashboard'), [goToTab]);
  const handleNavigateWeekly = useCallback(() => goToTab('Weekly'), [goToTab]);
  const handleNavigateManage = useCallback((section?: ManageSection | 'settings') => {
    if (section === 'settings') return; // 已在設定
    goToTab('Manage', { initialSection: section ?? 'tasks' });
  }, [goToTab]);
  const handleAddChild = useCallback(() => navigation.navigate('AddChild'), [navigation]);

  const confirmDelete = useCallback(() => {
    Alert.alert('刪除孩子帳號', '刪除後無法復原，確定要刪除嗎？', [
      { text: '取消', style: 'cancel' },
      { text: '刪除', style: 'destructive' },
    ]);
  }, []);

  if (width < 768) return null;

  const childDataValue =
    info.ageGroup != null
      ? `${info.age != null ? `${info.age} 歲 · ` : ''}${AGE_GROUP_MODE[info.ageGroup]}`
      : '尚未設定';
  const modeLabel = info.ageGroup != null ? AGE_GROUP_MODE[info.ageGroup] : '依孩子年齡自動判定';

  return (
    <View style={webTabletScreen}>
      <View style={s.columns}>
        <ParentSidebar
          activeTab="manage"
          activeManageSection="settings"
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
              <Text style={s.eyebrow}>設定</Text>
              <Text style={s.title}>設定</Text>
              <Text style={s.subtitle}>調整我們家使用 GrowBook 的方式</Text>
            </View>
            <View style={s.headerNote}>
              <InfoIcon size={13} color={ParentColors.fgMuted} />
              <Text style={s.headerNoteText}>
                系統會依孩子年齡與你的設定，自動調整任務與介面複雜度。
              </Text>
            </View>
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            <SectionCard index={0} icon={<UsersIcon />} title="家庭與孩子">
              <SettingRow icon={<UserIcon />} label={`${selectedChildName}的資料`} value={childDataValue} chev onPress={() => {}} />
              <SettingRow icon={<UsersIcon />} label="共同照顧者" value={`${info.caregivers || 1} 位`} chev onPress={() => {}} />
              <SettingRow icon={<SmileIcon />} label="頭像與暱稱" value="已設定" chev isLast onPress={() => {}} />
            </SectionCard>

            <SectionCard index={1} icon={<HeartIcon />} title="回饋方式">
              <SettingRow icon={<GiftIcon />} label="新增任務預設回饋" value="生活紀錄" chev onPress={() => {}} />
              <SettingRow icon={<CoinIcon />} label="成長幣" right={<Toggle on={coinOn} onChange={setCoinOn} />} />
              <SettingRow icon={<ClockIcon />} label="時間儲蓄" right={<Toggle on={timeOn} onChange={setTimeOn} />} />
              <SettingRow icon={<DocIcon />} label="生活紀錄" right={<Toggle on={lifeLogOn} onChange={setLifeLogOn} />} isLast />
            </SectionCard>

            <SectionCard index={2} icon={<SparkleIcon />} title="願望與獎勵規則">
              <SettingRow icon={<SparkleIcon />} label="AI 幣值建議" value="已開啟" chev onPress={() => {}} />
              <SettingRow icon={<UserPlusIcon />} label="孩子可提出願望" value="已開啟" chev onPress={() => {}} />
              <SettingRow icon={<TagIcon />} label="願望類型範圍" value="親子活動、實體物品、3C 時間" chev onPress={() => {}} />
              <SettingRow icon={<ShieldIcon />} label="願望需家長確認後加入清單" value="固定開啟" lock isLast />
            </SectionCard>

            <SectionCard index={3} icon={<ClockIcon />} title="記錄與回顧">
              <SettingRow icon={<BellIcon />} label="提醒模式" value="低打擾模式" chev onPress={() => {}} />
              <SettingRow icon={<CalendarIcon />} label="週報整理時間" value="週日晚上" chev onPress={() => {}} />
              <SettingRow icon={<DocIcon />} label="月報" right={<Toggle on={monthlyOn} onChange={setMonthlyOn} />} />
              <SettingRow icon={<ChatIcon />} label="待一起聊聊的願望提醒" value="於下次週報前顯示" chev isLast onPress={() => {}} />
            </SectionCard>

            <SectionCard index={4} icon={<UserIcon />} title="帳錄與隱私">
              <SettingRow icon={<UserIcon />} label="家長帳號" value={info.email || '—'} chev onPress={() => {}} />
              <SettingRow icon={<DownloadIcon />} label="家庭資料匯出" value="可下載" chev onPress={() => {}} />
              <SettingRow icon={<ShieldIcon />} label="隱私與使用說明" chev onPress={() => {}} />
              <SettingRow icon={<TrashIcon color={ParentColors.error} />} label="刪除孩子帳號" danger chev isLast onPress={confirmDelete} />
            </SectionCard>

            <View style={s.infoCard}>
              <View style={s.infoHead}>
                <View style={s.infoIcon}>
                  <InfoIcon size={15} color={ParentColors.fgSecondary} />
                </View>
                <Text style={s.infoTitle}>系統自動調整說明</Text>
              </View>
              <View style={s.infoList}>
                <InfoBullet text="系統會依孩子年齡自動調整任務與介面複雜度" />
                <InfoBullet text={`目前模式：${modeLabel}`} />
                <InfoBullet text="家長仍可在任務與獎勵設定中調整家庭規則" />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

function InfoBullet({ text }: { text: string }) {
  return (
    <View style={s.bulletRow}>
      <View style={s.bulletDot} />
      <Text style={s.bulletText}>{text}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  columns: { flex: 1, flexDirection: 'row', width: '100%' },
  screen: { flex: 1, minWidth: 0, backgroundColor: ParentColors.bgCanvas },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: ParentSpacing[6],
    paddingHorizontal: ParentSpacing[8],
    paddingVertical: ParentSpacing[5],
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  headerText: { gap: 3, flexShrink: 1 },
  eyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgMuted,
    letterSpacing: 0.14,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h1,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  subtitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
  },
  headerNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    maxWidth: 300,
    paddingTop: 6,
    flexShrink: 0,
  },
  headerNoteText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    lineHeight: 17,
    flexShrink: 1,
  },

  scroll: { flex: 1 },
  scrollContent: {
    padding: ParentSpacing[8],
    paddingTop: ParentSpacing[6],
    paddingBottom: ParentSpacing[10],
    gap: ParentSpacing[5],
    maxWidth: 920,
    width: '100%',
  },

  // Section card
  sectionCard: {
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.xl,
    paddingHorizontal: ParentSpacing[6],
    paddingTop: ParentSpacing[5],
    paddingBottom: ParentSpacing[2],
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[3],
    paddingBottom: ParentSpacing[4],
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  sectionBody: {},

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[3],
    paddingVertical: ParentSpacing[4],
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  rowIcon: {
    width: 26,
    alignItems: 'center',
    flexShrink: 0,
  },
  rowLabel: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pBody,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    minWidth: 0,
  },
  rowLabelDanger: {
    color: ParentColors.error,
  },
  rowValue: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
    flexShrink: 1,
    textAlign: 'right',
    maxWidth: 320,
  },

  // Info card
  infoCard: {
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.xl,
    padding: ParentSpacing[6],
    gap: ParentSpacing[4],
  },
  infoHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[3],
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: ParentColors.bgSurfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  infoList: {
    gap: ParentSpacing[3],
    paddingLeft: 2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ParentSpacing[3],
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: ParentColors.done,
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgSecondary,
    lineHeight: 21,
  },
});
