import React from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';

type TabId = 'home' | 'wallet' | 'wish' | 'profile';

interface BottomNavProps {
  activeTab?: TabId;
  onTabPress?: (tab: TabId) => void;
}

type GlyphProps = {
  active: boolean;
};

function HomeGlyph({ active }: GlyphProps) {
  const roof = active ? Colors.leaf500 : '#9EC46A';
  const wall = active ? '#A7CF62' : '#C6DCA2';
  return (
    <Svg width={26} height={26} viewBox="0 0 30 30">
      <Path d="M5 14.2 15 5l10 9.2v10.5a1.8 1.8 0 0 1-1.8 1.8h-5.1v-7h-6.2v7H6.8A1.8 1.8 0 0 1 5 24.7z" fill={wall} />
      <Path d="M3.7 14.5 15 4.1l11.3 10.4" fill="none" stroke={roof} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M19.2 7.7h3.6v5.1" stroke={roof} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

function GrowthCoinGlyph({ active }: GlyphProps) {
  return (
    <Svg width={26} height={26} viewBox="0 0 31 31">
      <Circle cx={15.5} cy={15.5} r={12.5} fill={active ? '#FFD86B' : '#FFE9A8'} stroke="#E2A01B" strokeWidth={1.4} />
      <Circle cx={15.5} cy={15.5} r={9} fill="#FFC94A" stroke="#F8E59A" strokeWidth={1.4} />
      <Path d="M15.5 19.8v-7.1" stroke="#A87800" strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M15.5 14.3c-4.1-2.2-5.7-1.4-6.7.1 1.6 3.3 4 3.9 6.7 1.8" fill="#C28B13" />
      <Path d="M15.5 14.3c4.1-2.2 5.7-1.4 6.7.1-1.6 3.3-4 3.9-6.7 1.8" fill="#C28B13" />
    </Svg>
  );
}

function WishTreeGlyph({ active }: GlyphProps) {
  return (
    <Svg width={26} height={26} viewBox="0 0 31 31">
      <Ellipse cx={15.5} cy={25.8} rx={8.8} ry={2.4} fill="#DDEBC7" />
      <Rect x={13.4} y={15.1} width={4.2} height={10.7} rx={1.8} fill="#9B6A35" />
      <Circle cx={15.5} cy={10.5} r={7.7} fill={active ? Colors.leaf500 : '#8FBE59'} />
      <Circle cx={10.2} cy={14.8} r={5.2} fill="#79A941" />
      <Circle cx={20.8} cy={14.5} r={5.4} fill="#75A33D" />
      <Circle cx={19.8} cy={9.2} r={2.2} fill="#A8D477" />
    </Svg>
  );
}

function ProfileGlyph({ active }: GlyphProps) {
  const hair = active ? '#7B4B22' : '#9A7249';
  return (
    <Svg width={26} height={26} viewBox="0 0 31 31">
      <Circle cx={15.5} cy={15.5} r={12.8} fill="#FFE6C9" />
      <Path d="M6.7 15.7c.2-7.2 4.5-10.5 9.1-10.5 4.7 0 8.8 3.4 8.8 10.5-4.8-1.6-11.9-5.4-14-1.8-1.1 1.9-2.6 2-3.9 1.8z" fill={hair} />
      <Circle cx={11.5} cy={16.9} r={1.1} fill="#4F321F" />
      <Circle cx={19.5} cy={16.9} r={1.1} fill="#4F321F" />
      <Path d="M11.8 21.1c2.1 2 5.3 2 7.4 0" stroke="#D56F52" strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx={8.6} cy={19.5} r={1.5} fill="#F8B49B" opacity={0.75} />
      <Circle cx={22.4} cy={19.5} r={1.5} fill="#F8B49B" opacity={0.75} />
    </Svg>
  );
}

const TABS: {
  id: TabId;
  label: string;
  Glyph: React.ComponentType<GlyphProps>;
  activeColor: string;
}[] = [
  { id: 'home', label: '首頁', Glyph: HomeGlyph, activeColor: Colors.leaf700 },
  { id: 'wallet', label: '成長幣', Glyph: GrowthCoinGlyph, activeColor: Colors.gold700 },
  { id: 'wish', label: '許願樹', Glyph: WishTreeGlyph, activeColor: Colors.leaf700 },
  { id: 'profile', label: '我的', Glyph: ProfileGlyph, activeColor: Colors.ink700 },
];

export default function BottomNav({ activeTab = 'home', onTabPress }: BottomNavProps) {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  return (
    <View
      testID="bottom-nav"
      style={[
        styles.nav,
        isWeb && styles.navWeb,
        { paddingBottom: 8 + Math.max(insets.bottom, 0) },
      ]}
      accessibilityRole="tablist"
    >
      {TABS.map(({ id, label, Glyph, activeColor }) => {
        const isActive = activeTab === id;
        return (
          <TouchableOpacity
            key={id}
            style={styles.tab}
            onPress={() => onTabPress?.(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
            activeOpacity={0.78}
          >
            <View style={[styles.iconSlot, isActive && styles.iconSlotActive]}>
              <Glyph active={isActive} />
            </View>
            <Text style={[styles.label, isActive && styles.labelActive, isActive && { color: activeColor }]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.navBg,
    borderTopWidth: 1,
    borderTopColor: Colors.hairline,
    paddingTop: 7,
  },
  navWeb: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 46,
  },
  iconSlot: {
    width: 32,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlotActive: {
    transform: [{ translateY: -0.5 }],
  },
  label: {
    fontSize: 11,
    color: Colors.ink500,
    fontWeight: '600',
    lineHeight: 14,
  },
  labelActive: {
    fontWeight: '800',
  },
});

export const bottomNavStyles = styles;
