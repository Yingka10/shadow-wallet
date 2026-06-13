import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../App';
import {
  ParentColors,
  ParentSpacing,
  ParentRadii,
  ParentShadows,
} from '../../constants/parentTheme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LockMethod = '密碼' | '手勢' | '不設限';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ArrowLeftIcon({ size = 20, color = ParentColors.ink700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5M12 5l-7 7 7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChevRightIcon({ size = 14, color = ParentColors.ink300 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ShieldFoxIcon({ size = 18, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l7 4.5V12c0 3.5-2.8 6.5-7 8-4.2-1.5-7-4.5-7-8V7.5L12 3z"
        stroke={color} strokeWidth={1.6} strokeLinejoin="round"
        fill={color} fillOpacity={0.18}
      />
      <Path d="M9 11l-1-2M15 11l1-2" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Path d="M9 14.5c0 1.7 1.3 3 3 3s3-1.3 3-3" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

function LockIcon({ size = 18, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="5" y="11" width="14" height="10" rx="2" stroke={color} strokeWidth={1.8} />
      <Path d="M8 11V7a4 4 0 018 0v4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx="12" cy="16" r="1.4" fill={color} />
    </Svg>
  );
}

function GestureIcon({ size = 18, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="6" cy="6" r="2" stroke={color} strokeWidth={1.6} />
      <Circle cx="12" cy="6" r="2" stroke={color} strokeWidth={1.6} />
      <Circle cx="18" cy="6" r="2" stroke={color} strokeWidth={1.6} />
      <Circle cx="6" cy="12" r="2" stroke={color} strokeWidth={1.6} />
      <Circle cx="18" cy="12" r="2" stroke={color} strokeWidth={1.6} />
      <Circle cx="12" cy="18" r="2" stroke={color} strokeWidth={1.6} />
      <Path
        d="M6 6l6 12M12 6l6 12M6 12l6 6"
        stroke={color} strokeWidth={1.2} strokeOpacity={0.4} strokeLinecap="round"
      />
    </Svg>
  );
}

function SunIcon({ size = 18, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={1.8} />
      <Path
        d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        stroke={color} strokeWidth={1.8} strokeLinecap="round"
      />
    </Svg>
  );
}

function UserIcon({ size = 16, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={1.8} />
      <Path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function FlagIcon({ size = 16, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 21V4m0 0h13l-3 5 3 5H4" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function BellIcon({ size = 16, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13.73 21a2 2 0 01-3.46 0" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function SparkleIcon({ size = 16, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l1.5 5 5 1.5-5 1.5L12 16l-1.5-5-5-1.5 5-1.5z"
        stroke={color} strokeWidth={1.6} strokeLinejoin="round"
      />
    </Svg>
  );
}

function HandIcon({ size = 16, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 11V8a2 2 0 00-4 0m0 3V7a2 2 0 00-4 0v4M10 11V5a2 2 0 00-4 0v9l-2-2a2 2 0 00-3 3l4 4a8 8 0 0016 0v-6a2 2 0 00-4 0"
        stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Switch
      value={on}
      onValueChange={onChange}
      trackColor={{ false: ParentColors.ivory300, true: ParentColors.teal400 }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={ParentColors.ivory300}
    />
  );
}

// ---------------------------------------------------------------------------
// SettingRow
// ---------------------------------------------------------------------------

type SettingRowProps = {
  icon?: React.ReactNode;
  label: string;
  sub?: string;
  chev?: boolean;
  right?: React.ReactNode;
  tone?: 'normal' | 'danger';
  isLast?: boolean;
  onPress?: () => void;
};

function SettingRow({ icon, label, sub, chev, right, tone = 'normal', isLast = false, onPress }: SettingRowProps) {
  const isDanger = tone === 'danger';
  return (
    <TouchableOpacity
      style={[styles.settingRow, !isLast && styles.settingRowDivider]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      {icon && (
        <View style={[styles.settingIcon, isDanger && styles.settingIconDanger]}>
          {icon}
        </View>
      )}
      <View style={[styles.settingBody, !icon && styles.settingBodyNoIcon]}>
        <Text style={[styles.settingLabel, isDanger && styles.settingLabelDanger]}>
          {label}
        </Text>
        {sub ? <Text style={styles.settingSub}>{sub}</Text> : null}
      </View>
      {right}
      {chev ? <ChevRightIcon size={14} color={ParentColors.ink300} /> : null}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// SettingGroup
// ---------------------------------------------------------------------------

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.settingGroup}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// LockMethodPicker
// ---------------------------------------------------------------------------

const LOCK_OPTIONS: { id: LockMethod; label: string; sub: string; renderIcon: (color: string) => React.ReactNode }[] = [
  {
    id: '密碼',
    label: '4 位密碼',
    sub: '安全',
    renderIcon: (color) => <LockIcon size={20} color={color} />,
  },
  {
    id: '手勢',
    label: '手勢',
    sub: '輕鬆',
    renderIcon: (color) => <GestureIcon size={20} color={color} />,
  },
  {
    id: '不設限',
    label: '不設限',
    sub: '自由',
    renderIcon: (color) => <SunIcon size={20} color={color} />,
  },
];

function LockMethodPicker({
  value,
  onChange,
}: {
  value: LockMethod;
  onChange: (v: LockMethod) => void;
}) {
  return (
    <View style={styles.lockPicker}>
      {LOCK_OPTIONS.map((o) => {
        const isActive = value === o.id;
        const iconColor = isActive ? ParentColors.teal500 : ParentColors.ink400;
        return (
          <TouchableOpacity
            key={o.id}
            style={[styles.lockOption, isActive && styles.lockOptionActive]}
            onPress={() => onChange(o.id)}
            activeOpacity={0.7}
          >
            {o.renderIcon(iconColor)}
            <Text style={[styles.lockLabel, isActive && styles.lockLabelActive]}>
              {o.label}
            </Text>
            <Text style={styles.lockSub}>{o.sub}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ParentSettingsScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const [lockMethod, setLockMethod] = useState<LockMethod>('密碼');
  const [notifPending, setNotifPending] = useState(true);
  const [notifWeekly, setNotifWeekly] = useState(true);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Entry' }] });
  }

  function confirmLogout() {
    if (Platform.OS === 'web') {
      if (window.confirm('確定要登出嗎？')) void handleLogout();
    } else {
      Alert.alert('確認登出', '確定要登出嗎？', [
        { text: '取消', style: 'cancel' },
        { text: '登出', style: 'destructive', onPress: () => void handleLogout() },
      ]);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Modal header */}
      <View style={styles.modalHeader}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ArrowLeftIcon size={20} color={ParentColors.ink700} />
        </TouchableOpacity>
        <Text style={styles.modalTitle}>設定</Text>
        <View style={styles.backBtnSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.heroSection}>
          <Text style={styles.heroEyebrow}>設定</Text>
          <Text style={styles.heroDisplay}>偏好與裝置</Text>
        </View>

        {/* Child Mode card */}
        <View style={styles.childModeCard}>
          <View style={styles.childModeDecor} />
          <View style={styles.childModeHeader}>
            <View style={styles.childModeIconWrap}>
              <ShieldFoxIcon size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.childModeEyebrow}>Child Mode</Text>
          </View>
          <Text style={styles.childModeTitle}>
            把手機交給孩子時，{'\n'}切換成孩子模式
          </Text>
          <Text style={styles.childModeDesc}>
            切換後，孩子只能看到自己的任務、撲滿、目標。{'\n'}
            無法進入設定，也看不到審核中的兌換申請。
          </Text>
          <TouchableOpacity
            style={styles.childModeBtn}
            onPress={() => navigation.navigate('ChildLogin')}
            activeOpacity={0.85}
          >
            <Text style={styles.childModeBtnText}>立即切換</Text>
            <ChevRightIcon size={13} color={ParentColors.teal500} />
          </TouchableOpacity>
        </View>

        {/* Lock method */}
        <View style={styles.lockSection}>
          <Text style={styles.lockSectionEyebrow}>切換回家長端的驗證方式</Text>
          <LockMethodPicker value={lockMethod} onChange={setLockMethod} />
        </View>

        {/* Settings groups */}
        <View style={styles.groups}>
          <SettingGroup title="家庭成員">
            <SettingRow
              icon={<UserIcon size={16} color={ParentColors.teal500} />}
              label="新增孩子"
              sub="目前 2 位"
              chev
            />
            <SettingRow
              icon={<FlagIcon size={16} color={ParentColors.teal500} />}
              label="管理目標清單"
              sub="3 個進行中"
              chev
              isLast
            />
          </SettingGroup>

          <SettingGroup title="共用裝置">
            <SettingRow
              icon={<LockIcon size={16} color={ParentColors.teal500} />}
              label="切換驗證方式"
              sub={lockMethod}
              chev
            />
            <SettingRow
              icon={<HandIcon size={16} color={ParentColors.teal500} />}
              label="孩子模式停留時限"
              sub="不限制"
              chev
              isLast
            />
          </SettingGroup>

          <SettingGroup title="通知">
            <SettingRow
              icon={<BellIcon size={16} color={ParentColors.teal500} />}
              label="待審申請"
              right={<Toggle on={notifPending} onChange={setNotifPending} />}
            />
            <SettingRow
              icon={<SparkleIcon size={16} color={ParentColors.teal500} />}
              label="每週洞察推播"
              sub="週日早上 9 點"
              right={<Toggle on={notifWeekly} onChange={setNotifWeekly} />}
              isLast
            />
          </SettingGroup>

          <SettingGroup title="帳號">
            <SettingRow
              icon={<UserIcon size={16} color={ParentColors.teal500} />}
              label="個人資料"
              chev
            />
            <SettingRow label="登出" tone="danger" isLast onPress={confirmLogout} />
          </SettingGroup>
        </View>

        <Text style={styles.footer}>影子貨幣錢包 · 家長端 1.0</Text>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: ParentColors.bgCanvas,
  },

  // Modal header
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgCanvas,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnSpacer: {
    width: 38,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: ParentColors.ink900,
    letterSpacing: -0.2,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 48,
  },

  // Hero
  heroSection: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 8,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: ParentColors.ink500,
    marginBottom: 4,
  },
  heroDisplay: {
    fontSize: 26,
    fontWeight: '500',
    color: ParentColors.ink900,
    letterSpacing: -0.5,
    lineHeight: 30,
  },

  // Child Mode card
  childModeCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: ParentColors.teal500,
    borderRadius: 18,
    padding: 20,
    paddingBottom: 18,
    overflow: 'hidden',
    ...ParentShadows.pop,
  },
  childModeDecor: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  childModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  childModeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childModeEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.7)',
  },
  childModeTitle: {
    fontSize: 22,
    fontWeight: '500',
    color: '#FFFFFF',
    lineHeight: 28,
    marginBottom: 8,
  },
  childModeDesc: {
    fontSize: 13.5,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.78)',
    marginBottom: 16,
  },
  childModeBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  childModeBtnText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: ParentColors.teal500,
  },

  // Lock picker
  lockSection: {
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 6,
  },
  lockSectionEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: ParentColors.ink500,
    marginBottom: 10,
  },
  lockPicker: {
    flexDirection: 'row',
    gap: 8,
  },
  lockOption: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'transparent',
  },
  lockOptionActive: {
    backgroundColor: ParentColors.bgSurface,
    borderColor: ParentColors.teal400,
    shadowColor: ParentColors.teal500,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 2,
  },
  lockLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: ParentColors.ink500,
  },
  lockLabelActive: {
    color: ParentColors.teal500,
  },
  lockSub: {
    fontSize: 10.5,
    color: ParentColors.ink400,
  },

  // Setting groups
  groups: {
    paddingHorizontal: 16,
    paddingTop: 22,
  },
  settingGroup: {
    marginBottom: 20,
  },
  groupTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: ParentColors.ink500,
    marginBottom: 8,
    paddingLeft: 4,
  },
  groupCard: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  settingRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  settingIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: ParentColors.bgSurfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  settingIconDanger: {
    backgroundColor: '#FEF2EF',
  },
  settingBody: {
    flex: 1,
    minWidth: 0,
  },
  settingBodyNoIcon: {
    paddingLeft: 2,
  },
  settingLabel: {
    fontSize: 14.5,
    fontWeight: '500',
    color: ParentColors.ink900,
  },
  settingLabelDanger: {
    color: ParentColors.error,
  },
  settingSub: {
    fontSize: 11.5,
    color: ParentColors.ink500,
    marginTop: 1,
  },

  // Footer
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: ParentColors.ink400,
    paddingTop: 24,
    paddingHorizontal: 18,
  },
});
