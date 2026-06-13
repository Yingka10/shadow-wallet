import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { useSelectedChild, type ChildOption } from '../context/SelectedChildContext';
import {
  ParentColors,
  ParentFontSizes,
  ParentFontWeights,
  ParentSpacing,
  ParentRadii,
  ParentFonts,
  ParentShadows,
} from '../constants/parentTheme';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ChevDownIcon({ color = ParentColors.ink700 }: { color?: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function BellIcon({ color = ParentColors.ink700 }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M13.73 21a2 2 0 0 1-3.46 0"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function SunIcon({ color = ParentColors.ink700 }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        stroke={color} strokeWidth={1.8} strokeLinecap="round"
      />
    </Svg>
  );
}

function CheckIcon({ color = ParentColors.teal500 }: { color?: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12l5 5L20 7" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// ChildAvatar — single initial on teal circle
// ---------------------------------------------------------------------------

const PALETTE = [
  { bg: ParentColors.teal400,  text: '#FFFFFF' },
  { bg: ParentColors.clay500,  text: '#FFFFFF' },
  { bg: ParentColors.plum500,  text: '#FFFFFF' },
  { bg: ParentColors.sage500,  text: '#FFFFFF' },
];

function ChildAvatar({
  child,
  allChildren,
  size = 32,
}: {
  child: ChildOption;
  allChildren: ChildOption[];
  size?: number;
}) {
  const idx = allChildren.findIndex(c => c.id === child.id);
  const { bg, text } = PALETTE[idx % PALETTE.length];
  const initial = child.nickname.charAt(0);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { color: text, fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ChildSwitcherModal
// ---------------------------------------------------------------------------

function ChildSwitcherModal({
  visible,
  onClose,
  allChildren,
  selectedId,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  allChildren: ChildOption[];
  selectedId: string;
  onSelect: (child: ChildOption) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.dropdown, { top: 56 + insets.top }]}>
        <Text style={styles.dropdownTitle}>切換孩子</Text>
        {allChildren.map(child => {
          const active = child.id === selectedId;
          return (
            <TouchableOpacity
              key={child.id}
              style={[styles.childOption, active && styles.childOptionActive]}
              onPress={() => { onSelect(child); onClose(); }}
              activeOpacity={0.7}
            >
              <ChildAvatar child={child} allChildren={allChildren} size={38} />
              <Text style={[styles.childOptionName, active && styles.childOptionNameActive]}>
                {child.nickname}
              </Text>
              {active && <CheckIcon />}
            </TouchableOpacity>
          );
        })}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// ParentTopBar — main export
// ---------------------------------------------------------------------------

export function ParentTopBar({
  onNotificationsPress,
  onSettingsPress,
}: {
  onNotificationsPress?: () => void;
  onSettingsPress?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { childId, childName, allChildren, setSelectedChild, loadingChildren } = useSelectedChild();
  const [showSwitcher, setShowSwitcher] = useState(false);

  const canSwitch = allChildren.length > 1;
  const currentChild: ChildOption = { id: childId, nickname: childName };

  return (
    <>
      <View style={[styles.bar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          style={styles.childSelector}
          onPress={() => canSwitch && setShowSwitcher(true)}
          activeOpacity={canSwitch ? 0.7 : 1}
          disabled={!canSwitch && allChildren.length === 0}
        >
          {loadingChildren ? (
            <ActivityIndicator size="small" color={ParentColors.teal500} />
          ) : allChildren.length === 0 ? (
            <Text style={styles.noChildText}>尚未選擇孩子</Text>
          ) : (
            <>
              <ChildAvatar child={currentChild} allChildren={allChildren} size={28} />
              <Text style={styles.childName}>{childName}</Text>
              {canSwitch && <ChevDownIcon color={ParentColors.teal500} />}
            </>
          )}
        </TouchableOpacity>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={onNotificationsPress}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <BellIcon color={ParentColors.ink700} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={onSettingsPress}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <SunIcon color={ParentColors.ink700} />
          </TouchableOpacity>
        </View>
      </View>

      <ChildSwitcherModal
        visible={showSwitcher}
        onClose={() => setShowSwitcher(false)}
        allChildren={allChildren}
        selectedId={childId}
        onSelect={setSelectedChild}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ParentSpacing.gutter,
    paddingBottom: 10,
    backgroundColor: ParentColors.bgCanvas,
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  childSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.teal50,
  },
  childName: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.teal700,
    fontFamily: ParentFonts.display,
    maxWidth: 80,
  },
  noChildText: {
    fontSize: 13,
    color: ParentColors.fgMuted,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: ParentFontWeights.bold,
  },

  // Modal
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,27,23,0.35)',
  },
  dropdown: {
    position: 'absolute',
    left: ParentSpacing.gutter,
    right: ParentSpacing.gutter,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 6,
    ...ParentShadows.elev,
  },
  dropdownTitle: {
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginLeft: 10,
    marginBottom: 8,
    marginTop: 4,
  },
  childOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  childOptionActive: {
    backgroundColor: ParentColors.teal50,
  },
  childOptionName: {
    flex: 1,
    fontSize: 16,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },
  childOptionNameActive: {
    color: ParentColors.teal700,
    fontWeight: ParentFontWeights.semi,
  },
});
