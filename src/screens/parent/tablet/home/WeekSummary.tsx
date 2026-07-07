// Shadow Wallet · Parent Tablet Home — 本週摘要三格（v14 理想圖）
// 冷白卡＋三格統計：成長幣累積 / 任務完成（含今日進度條）/ 時間儲蓄。
// 資料全部來自 useParentDashboard 已有或本次補上的欄位；沒有的數字不編。

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentShadows,
} from '../../../../constants/parentTheme';
import { IconBubble, CoinIcon, CheckSquareIcon, ClockIcon } from './homeIcons';

export function WeekSummary({
  spendingBalance,
  weekCoinDelta,
  doneToday,
  totalToday,
  weekTimeSavedMin,
}: {
  spendingBalance: number;
  weekCoinDelta: number;
  doneToday: number;
  totalToday: number;
  weekTimeSavedMin: number;
}) {
  const pct = totalToday > 0 ? Math.round((doneToday / totalToday) * 100) : 0;

  return (
    <View style={s.card}>
      <Text style={s.title}>本週摘要</Text>
      <View style={s.row}>

        <View style={s.cell}>
          <IconBubble bg={ParentColors.tintGold}>
            <CoinIcon size={18} color={ParentColors.gold700} />
          </IconBubble>
          <View style={s.cellBody}>
            <Text style={s.cellLabel}>成長幣累積</Text>
            <Text style={s.cellNum}>
              {spendingBalance} <Text style={s.cellUnit}>枚</Text>
            </Text>
            <Text style={s.cellMeta}>
              本週 {weekCoinDelta >= 0 ? `+${weekCoinDelta}` : weekCoinDelta}
            </Text>
          </View>
        </View>

        <View style={s.sep} />

        <View style={s.cell}>
          <IconBubble bg={ParentColors.tintLeaf}>
            <CheckSquareIcon size={18} color={ParentColors.leaf700} />
          </IconBubble>
          <View style={s.cellBody}>
            <Text style={s.cellLabel}>任務完成</Text>
            <Text style={s.cellNum}>
              {doneToday} / {totalToday} <Text style={s.cellUnit}>項</Text>
            </Text>
            <Text style={s.cellMeta}>今日進度</Text>
            <View style={s.track}>
              <View style={[s.fill, { width: `${pct}%` as `${number}%` }]} />
            </View>
          </View>
        </View>

        <View style={s.sep} />

        <View style={s.cell}>
          <IconBubble bg={ParentColors.tintPine}>
            <ClockIcon size={18} color={ParentColors.pine400} />
          </IconBubble>
          <View style={s.cellBody}>
            <Text style={s.cellLabel}>時間儲蓄</Text>
            <Text style={s.cellNum}>
              {weekTimeSavedMin} <Text style={s.cellUnit}>分鐘</Text>
            </Text>
            <Text style={s.cellMeta}>本週累計</Text>
          </View>
        </View>

      </View>
    </View>
  );
}

export const weekSummaryStyles = StyleSheet.create({
  card: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginTop: 16,
    ...ParentShadows.card,
    shadowOpacity: 0.06,
    shadowRadius: 18,
  },
  title: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cell: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  cellBody: {
    flex: 1,
    minWidth: 0,
  },
  cellLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    marginBottom: 3,
  },
  cellNum: {
    fontFamily: ParentFonts.body,
    fontSize: 22,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    letterSpacing: -0.3,
  },
  cellUnit: {
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgSecondary,
  },
  cellMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    marginTop: 3,
  },
  sep: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: ParentColors.borderSoft,
    marginHorizontal: 14,
  },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: ParentColors.stone100,
    marginTop: 6,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: ParentColors.done,
  },
});

const s = weekSummaryStyles;
