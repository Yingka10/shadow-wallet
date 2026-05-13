import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { HomeIcon, SparkleIcon, WalletIcon, StarIcon } from './icons/TaskIcons';

type TabId = 'home' | 'wallet' | 'wish' | 'profile';

interface BottomNavProps {
  activeTab?: TabId;
  onTabPress?: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string; Icon: React.ComponentType<{ size?: number; color?: string }> }[] = [
  { id: 'home',    label: '首頁', Icon: HomeIcon },
  { id: 'wallet',  label: '撲滿', Icon: WalletIcon },
  { id: 'wish',    label: '願望', Icon: StarIcon },
  { id: 'profile', label: '個人', Icon: SparkleIcon },
];

export default function BottomNav({ activeTab = 'home', onTabPress }: BottomNavProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.nav}>
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <TouchableOpacity
              key={id}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onTabPress?.(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={label}
            >
              <Icon
                size={24}
                color={isActive ? '#FFFFFF' : Colors.ink500}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.bgCanvas,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  nav: {
    backgroundColor: 'rgba(255, 248, 238, 0.92)',
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    gap: 6,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 18,
  },
  tabActive: {
    backgroundColor: Colors.coral500,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.ink500,
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
});
