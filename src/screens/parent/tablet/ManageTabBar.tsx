// Shadow Wallet · Parent Tablet — 管理子頁共用分頁列
// 任務管理 / 獎勵管理（以及未來其他管理子頁）共用同一種底線式分頁列：
// 一排文字分頁 + 數量小膠囊，選中＝松綠底線 + 松綠粗字 + 松綠膠囊。
// 抽成共用元件，避免各頁 tab 樣式各走各的。

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  ParentColors,
  ParentFonts,
  ParentFontWeights,
} from '../../../constants/parentTheme';

export type ManageTabItem<T extends string> = { id: T; label: string };

export function ManageTabBar<T extends string>({
  tabs,
  activeTab,
  counts,
  onChange,
}: {
  tabs: ReadonlyArray<ManageTabItem<T>>;
  activeTab: T;
  /** 每個分頁的數量；沒給就不顯示膠囊。 */
  counts?: Partial<Record<T, number>>;
  onChange: (id: T) => void;
}) {
  return (
    <View style={s.tabRow}>
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        const count = counts?.[tab.id];
        return (
          <TouchableOpacity
            key={tab.id}
            style={[s.tabButton, active && s.tabButtonActive]}
            onPress={() => onChange(tab.id)}
            activeOpacity={0.75}
          >
            <Text style={[s.tabLabel, active && s.tabLabelActive]}>{tab.label}</Text>
            {typeof count === 'number' && (
              <View style={[s.tabCount, active && s.tabCountActive]}>
                <Text style={[s.tabCountText, active && s.tabCountTextActive]}>{count}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
    marginBottom: 24,
  },
  tabButton: {
    minWidth: 132,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: ParentColors.pine500,
  },
  tabLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 16,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },
  tabLabelActive: {
    color: ParentColors.pine500,
    fontWeight: ParentFontWeights.bold,
  },
  tabCount: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.bgSurfaceWarm,
    paddingHorizontal: 8,
  },
  tabCountActive: {
    backgroundColor: ParentColors.pine500,
  },
  tabCountText: {
    fontFamily: ParentFonts.mono,
    fontSize: 13,
    color: ParentColors.fgSecondary,
  },
  tabCountTextActive: {
    color: ParentColors.onSidebar,
    fontWeight: ParentFontWeights.bold,
  },
});
