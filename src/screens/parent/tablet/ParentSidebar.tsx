// Shadow Wallet · Parent Tablet — 共用左側欄
// 三個 tab（首頁／週報／管理）共用同一份深綠側欄：GrowBook 品牌 + 孩子切換器 +
// 主要功能導航（含「管理」收合子選單）+ 底部品牌小卡。
// 原本只存在於 ParentHomeTablet.tsx，這次抽成獨立元件讓 Weekly/Manage 也能用。

import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import {
  ParentColors,
  ParentSpacing,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
} from '../../../constants/parentTheme';
import {
  ChevronDownIcon,
  PlusIcon,
  HomeNavIcon,
  ChartNavIcon,
  GearNavIcon,
  Illustration,
} from './home/homeIcons';

export type ChildOption = { id: string; nickname: string };

/** 管理子選單的目標區塊（對應 ParentManageTablet 的 collapsible sections） */
export type ManageSection = 'tasks' | 'rewards' | 'history';

export type ParentSidebarActiveTab = 'home' | 'weekly' | 'manage';

const MANAGE_SUB_ITEMS: { label: string; key: ManageSection | 'settings' }[] = [
  { label: '任務管理', key: 'tasks' },
  { label: '獎勵管理', key: 'rewards' },
  { label: '帳本紀錄', key: 'history' },
  { label: '設定',     key: 'settings' },
];

const CHILD_AVATAR_TINTS = [ParentColors.clay500, ParentColors.sage500, ParentColors.plum500];

// 品牌小樹 icon —— 側欄品牌行用，鎖定樣式＝提案 artifact .p-brand svg
function BrandTreeIcon() {
  return (
    <Svg width={13} height={15} viewBox="0 0 16 18">
      <Path d="M7 11.5v5" stroke="#C9A05C" strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={8} cy={6.5} r={4.6} fill="#8FC65C" />
      <Circle cx={4.6} cy={8.6} r={3} fill="#7CB84A" />
      <Circle cx={11.4} cy={8.6} r={3} fill="#6BA63C" />
      <Circle cx={10.6} cy={5} r={1.5} fill="#F2A93B" />
    </Svg>
  );
}

/**
 * 左側欄 —— 暖松品牌欄（v14 理想圖）：GrowBook 品牌 + 孩子切換器 + 主要功能導航
 * （含「管理」收合子選單）+ 底部品牌小卡。
 * 選中孩子＝白色 14% 疊色；徽章＝該孩子待處理事項數（申請審核用，不是分數/餘額)。
 * `activeTab` 決定「主要功能」哪一項顯示為選中，讓首頁/週報/管理三個畫面都能共用。
 */
export function ParentSidebar({
  activeTab,
  allChildren,
  childId,
  setSelectedChild,
  pendingCounts,
  onNavigateHome,
  onNavigateWeekly,
  onNavigateManage,
  onAddChild,
}: {
  activeTab: ParentSidebarActiveTab;
  allChildren: ChildOption[];
  childId: string;
  setSelectedChild: (c: ChildOption) => void;
  pendingCounts: Record<string, number>;
  onNavigateHome: () => void;
  onNavigateWeekly: () => void;
  onNavigateManage: (section?: ManageSection | 'settings') => void;
  onAddChild: () => void;
}) {
  const [manageOpen, setManageOpen] = useState(false);
  const [promoVisible, setPromoVisible] = useState(true);

  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarBrand}>
        <BrandTreeIcon />
        <Text style={styles.sidebarBrandText}>GrowBook</Text>
      </View>
      <Text style={styles.sidebarBrandSub}>成長帳本</Text>

      <Text style={styles.sidebarKicker}>孩子</Text>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.sidebarChildList}>
        {allChildren.map((c, i) => {
          const active = c.id === childId;
          const count = pendingCounts[c.id] ?? 0;
          return (
            <TouchableOpacity
              key={c.id}
              style={[styles.pick, active && styles.pickActive]}
              onPress={() => setSelectedChild(c)}
              activeOpacity={0.7}
            >
              <View style={[styles.pickAvatar, { backgroundColor: CHILD_AVATAR_TINTS[i % CHILD_AVATAR_TINTS.length] }]}>
                <Text style={styles.pickAvatarText}>{c.nickname.charAt(0)}</Text>
              </View>
              <Text style={[styles.pickName, active && styles.pickNameActive]} numberOfLines={1}>
                {c.nickname}
              </Text>
              {count > 0 && (
                <View style={styles.pickBadge}>
                  <Text style={styles.pickBadgeText}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={styles.addChildBtn} onPress={onAddChild} activeOpacity={0.7}>
          <PlusIcon size={13} color={ParentColors.onSidebarMuted} />
          <Text style={styles.addChildText}>新增孩子</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.sidebarNav}>
        <Text style={styles.sidebarNavKicker}>主要功能</Text>

        <TouchableOpacity
          style={[styles.sidebarNavItem, activeTab === 'home' && styles.sidebarNavActive]}
          onPress={onNavigateHome}
          activeOpacity={0.75}
        >
          <HomeNavIcon size={17} color={activeTab === 'home' ? ParentColors.onSidebar : ParentColors.onSidebarMuted} />
          <Text style={[styles.sidebarNavText, activeTab === 'home' && styles.sidebarNavTextActive]}>首頁</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sidebarNavItem, activeTab === 'weekly' && styles.sidebarNavActive]}
          onPress={onNavigateWeekly}
          activeOpacity={0.75}
        >
          <ChartNavIcon size={17} color={activeTab === 'weekly' ? ParentColors.onSidebar : ParentColors.onSidebarMuted} />
          <Text style={[styles.sidebarNavText, activeTab === 'weekly' && styles.sidebarNavTextActive]}>週報</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sidebarNavItem, activeTab === 'manage' && styles.sidebarNavActive]}
          onPress={() => setManageOpen(o => !o)}
          activeOpacity={0.75}
        >
          <GearNavIcon size={17} color={activeTab === 'manage' ? ParentColors.onSidebar : ParentColors.onSidebarMuted} />
          <Text style={[styles.sidebarNavText, activeTab === 'manage' && styles.sidebarNavTextActive]}>管理</Text>
          <View style={[styles.sidebarNavChevron, manageOpen && styles.sidebarNavChevronOpen]}>
            <ChevronDownIcon size={13} color={ParentColors.onSidebarMuted} />
          </View>
        </TouchableOpacity>

        {manageOpen && (
          <View style={styles.sidebarSubList}>
            {MANAGE_SUB_ITEMS.map(item => (
              <TouchableOpacity
                key={item.key}
                style={styles.sidebarSubItem}
                onPress={() => onNavigateManage(item.key)}
                activeOpacity={0.7}
              >
                <View style={styles.sidebarSubDot} />
                <Text style={styles.sidebarSubText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {promoVisible && (
        <View style={styles.sidebarPromo}>
          <TouchableOpacity
            style={styles.sidebarPromoClose}
            onPress={() => setPromoVisible(false)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.sidebarPromoCloseText}>×</Text>
          </TouchableOpacity>
          <View style={styles.sidebarPromoRow}>
            <View style={styles.sidebarPromoTextCol}>
              <Text style={styles.sidebarPromoText}>一起陪孩子{'\n'}慢慢長大</Text>
              <Text style={styles.sidebarPromoBrand}>GrowBook</Text>
            </View>
            <Illustration kind="sidebarTree" size={58} />
          </View>
        </View>
      )}
    </View>
  );
}

export const parentSidebarStyles = StyleSheet.create({
  sidebar: {
    flexBasis: '18%',
    minWidth: 156,
    maxWidth: 220,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: ParentColors.bgSidebar,
    paddingHorizontal: ParentSpacing[3],
    paddingTop: ParentSpacing[5],
    paddingBottom: ParentSpacing[4],
  },
  sidebarBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sidebarBrandText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.onSidebarMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sidebarBrandSub: {
    fontFamily: ParentFonts.display,
    fontSize: 16,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.onSidebar,
    marginTop: 5,
    marginBottom: 18,
  },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    marginBottom: 2,
  },
  pickActive: {
    backgroundColor: ParentColors.pickActiveBg,
  },
  pickAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pickAvatarText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.bold,
    color: '#fff',
  },
  pickName: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.onSidebarMuted,
  },
  pickNameActive: {
    color: ParentColors.onSidebar,
  },
  pickBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: ParentColors.amber300,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pickBadgeText: {
    fontFamily: ParentFonts.body,
    fontSize: 10.5,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.bgSidebar,
  },
  sidebarKicker: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.onSidebarFaint,
    marginBottom: 6,
  },
  sidebarChildList: {
    flexGrow: 0,
    flexShrink: 1,
  },
  addChildBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: ParentColors.sidebarDashed,
    marginTop: 8,
  },
  addChildText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.onSidebarMuted,
  },
  sidebarNav: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    paddingTop: 14,
    marginTop: 16,
    marginBottom: 18,
    gap: 6,
  },
  sidebarNavKicker: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    fontWeight: ParentFontWeights.bold,
    color: 'rgba(255, 255, 255, 0.52)',
    marginBottom: 2,
  },
  sidebarNavItem: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  sidebarNavActive: {
    backgroundColor: ParentColors.navActiveBg,
  },
  sidebarNavText: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: 'rgba(255, 255, 255, 0.68)',
  },
  sidebarNavTextActive: {
    color: ParentColors.onSidebar,
    fontWeight: ParentFontWeights.bold,
  },
  sidebarNavChevron: {
    flexShrink: 0,
  },
  sidebarNavChevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  sidebarSubList: {
    paddingLeft: 30,
    gap: 2,
    marginTop: -2,
  },
  sidebarSubItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 34,
    borderRadius: 9,
    paddingHorizontal: 10,
  },
  sidebarSubDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: ParentColors.onSidebarFaint,
  },
  sidebarSubText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.onSidebarMuted,
  },
  sidebarPromo: {
    marginTop: 'auto',
    backgroundColor: ParentColors.sidebarCardBg,
    borderRadius: 14,
    padding: 12,
  },
  sidebarPromoClose: {
    position: 'absolute',
    top: 6,
    right: 10,
    zIndex: 1,
  },
  sidebarPromoCloseText: {
    fontSize: 14,
    lineHeight: 16,
    color: ParentColors.onSidebarMuted,
  },
  sidebarPromoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sidebarPromoTextCol: {
    flex: 1,
    minWidth: 0,
  },
  sidebarPromoText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    lineHeight: 19,
    color: ParentColors.onSidebar,
  },
  sidebarPromoBrand: {
    fontFamily: ParentFonts.body,
    fontSize: 10.5,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.onSidebarFaint,
    marginTop: 4,
  },
});

const styles = parentSidebarStyles;
