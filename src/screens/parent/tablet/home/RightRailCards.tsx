// Shadow Wallet · Parent Tablet Home — 右欄卡片（v14 理想圖）
// 小提醒（本地靜態語句輪播，不假裝 AI）／本週小結（用畫面上已有的真實數據組句，
// 資料不足整卡隱藏）／一鍵任務包 promo（功能未做 → onPress 由呼叫端 stub）。

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import dayjs from 'dayjs';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentShadows,
} from '../../../../constants/parentTheme';
import { Illustration } from './homeIcons';

// ─────────────────────────────────────────────────────────────────────────────
// 小提醒 —— 靜態教養語句，依日期輪播（誠實：不是 AI 生成）
// ─────────────────────────────────────────────────────────────────────────────

const TIPS: { line1: string; line2: string }[] = [
  { line1: '鼓勵比責備更有力量，', line2: '穩定的陪伴是孩子最好的成長養分。' },
  { line1: '孩子回報做完，先謝謝他說了，', line2: '準確度可以之後再慢慢校準。' },
  { line1: '任務量比完成率更值得看，', line2: '太滿的清單會磨掉動力。' },
  { line1: '兌換目標訂得到得了，', line2: '孩子才會相信努力有用。' },
  { line1: '一週一次就好，', line2: '和孩子一起回頭看看走了多遠。' },
];

export function TipCard() {
  // 依日期輪播（dayOfYear 需另拉 plugin，用日期數字取模就夠）
  const idx = Number(dayjs().format('YYYYMMDD')) % TIPS.length;
  const chosen = TIPS[idx] ?? TIPS[0];

  return (
    <View style={s.card}>
      <View style={s.rowBetween}>
        <View style={s.tipTextCol}>
          <Text style={s.cardTitle}>小提醒</Text>
          <Text style={s.tipBody}>{chosen.line1}{'\n'}{chosen.line2}</Text>
        </View>
        <Illustration kind="tipPlant" size={52} />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 本週小結 —— 真實數據組句；lines 空就整卡不渲染
// ─────────────────────────────────────────────────────────────────────────────

export function buildWeekDigestLines({
  doneToday,
  totalToday,
  longTermItems,
}: {
  doneToday: number;
  totalToday: number;
  longTermItems: { name: string; progressPct: number }[];
}): string[] {
  const lines: string[] = [];

  const going = longTermItems.filter(i => i.progressPct > 0);
  const notStarted = longTermItems.filter(i => i.progressPct === 0);
  if (going.length > 0) {
    lines.push(`「${going[0].name}」持續進行中（${going[0].progressPct}%）。`);
  }
  if (notStarted.length > 0) {
    lines.push(`「${notStarted[0].name}」還沒開始，可以和孩子一起討論調整方式。`);
  }
  if (totalToday > 0) {
    lines.push(`今天完成 ${doneToday} / ${totalToday} 項任務。`);
  }
  return lines;
}

export function WeekDigestCard({
  lines,
  onOpenWeekly,
}: {
  lines: string[];
  onOpenWeekly: () => void;
}) {
  if (lines.length === 0) return null;

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>本週小結</Text>
      <Text style={s.digestBody}>{lines.join('\n')}</Text>
      <TouchableOpacity style={s.outlineBtn} onPress={onOpenWeekly} activeOpacity={0.75}>
        <Text style={s.outlineBtnText}>查看週報</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 一鍵任務包 promo —— 功能下一階段補（docs/parent-home-next-phase.md）
// ─────────────────────────────────────────────────────────────────────────────

export function TaskPackCard({ onPress }: { onPress: () => void }) {
  return (
    <View style={[s.card, s.packCard]}>
      <View style={s.rowBetween}>
        <View style={s.tipTextCol}>
          <Text style={s.packKicker}>想讓任務更有動力？</Text>
          <Text style={s.packTitle}>試試「一鍵任務包」</Text>
          <Text style={s.packSub}>AI 幫你快速建立適合的任務組合！</Text>
          <TouchableOpacity style={s.packBtn} onPress={onPress} activeOpacity={0.75}>
            <Text style={s.packBtnText}>去試試看</Text>
          </TouchableOpacity>
        </View>
        <Illustration kind="taskPackWand" size={56} />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    padding: 16,
    marginTop: 14,
    ...ParentShadows.card,
    shadowOpacity: 0.06,
    shadowRadius: 18,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tipTextCol: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pBody,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    marginBottom: 6,
  },
  tipBody: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 20,
    color: ParentColors.fgSecondary,
  },
  digestBody: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 21,
    color: ParentColors.fgSecondary,
    marginBottom: 12,
  },
  outlineBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: ParentColors.borderMedium,
    borderRadius: ParentRadii.sm,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  outlineBtnText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  packCard: {
    backgroundColor: ParentColors.bgHero,
    borderColor: ParentColors.borderSoft,
  },
  packKicker: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    marginBottom: 2,
  },
  packTitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    marginBottom: 3,
  },
  packSub: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 17,
    color: ParentColors.fgSecondary,
    marginBottom: 10,
  },
  packBtn: {
    alignSelf: 'flex-start',
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderMedium,
    borderRadius: ParentRadii.sm,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  packBtnText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
});
