import React from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';

type TabId = 'home' | 'wallet' | 'wish' | 'profile';

interface BottomNavProps {
  activeTab?: TabId;
  onTabPress?: (tab: TabId) => void;
}

function HomeGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20">
      <Path d="M3 9.5 10 3l7 6.5V17h-5v-4h-4v4H3z" fill={color} />
    </Svg>
  );
}

function WalletGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20">
      <Circle cx={10} cy={10} r={7} fill="none" stroke={color} strokeWidth={2} />
      <Circle cx={10} cy={10} r={2.5} fill={color} />
    </Svg>
  );
}

function WishGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20">
      <Circle cx={10} cy={7} r={4} fill="none" stroke={color} strokeWidth={2} />
      <Rect x={8.8} y={10} width={2.4} height={7} rx={1.2} fill={color} />
    </Svg>
  );
}

function ProfileGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20">
      <Circle cx={10} cy={7} r={3.4} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M4 17c.8-3 3-4.5 6-4.5s5.2 1.5 6 4.5" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

const TABS: { id: TabId; label: string; Glyph: React.ComponentType<{ color: string }> }[] = [
  { id: 'home',    label: '首頁',  Glyph: HomeGlyph },
  { id: 'wallet',  label: '撲滿',  Glyph: WalletGlyph },
  { id: 'wish',    label: '許願樹', Glyph: WishGlyph },
  { id: 'profile', label: '我的',  Glyph: ProfileGlyph },
];

/**
 * 底部 tab —— 鎖定樣式＝提案 artifact .g-nav：半透明奶油底貼齊底部、髮絲線分隔，
 * 沒有浮動卡片/圓角/陰影/選中底色塊，選中只靠圖示+文字變珊瑚色（孩子端唯一保留珊瑚的地方）。
 */
export default function BottomNav({ activeTab = 'home', onTabPress }: BottomNavProps) {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  return (
    <View
      testID="bottom-nav"
      style={[
        styles.nav,
        isWeb && styles.navWeb,
        { paddingBottom: 12 + Math.max(insets.bottom, 0) },
      ]}
      accessibilityRole="tablist"
    >
      {TABS.map(({ id, label, Glyph }) => {
        const isActive = activeTab === id;
        const color = isActive ? Colors.cta : Colors.ink300;
        return (
          <TouchableOpacity
            key={id}
            style={styles.tab}
            onPress={() => onTabPress?.(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
          >
            <Glyph color={color} />
            <Text style={[styles.label, isActive && styles.labelActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    backgroundColor: Colors.navBg,
    borderTopWidth: 1,
    borderTopColor: Colors.hairline,
    paddingTop: 10,
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
    gap: 3,
  },
  label: {
    fontSize: 10,
    color: Colors.ink500,
  },
  labelActive: {
    color: Colors.ctaText,
    fontWeight: '800',
  },
});
