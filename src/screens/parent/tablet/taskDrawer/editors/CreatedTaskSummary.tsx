// Shadow Wallet · Parent Tablet — 建立成功摘要
//
// 為什麼建立完不直接關掉抽屜：
//
// 家長剛做完一連串選擇，抽屜「唰」地關掉之後，畫面上唯一的變化是列表多了一列。
// 那一列不會說明這個任務怎麼安排、完成後會發生什麼 —— 也就是家長剛剛設定的東西
// 全部消失在一行標題裡。所以停一下，把「你剛剛建立了什麼」講完整再走。
//
// 所有內容都從**已送出的 command** 產生，沒有任何一項是重新猜的。
// 也不顯示 taskId / relatedIds：那是給偵錯用的，對家長沒有意義。

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentSpacing,
} from '../../../../../constants/parentTheme';
import { variantFormLabel, type TaskPresetFamily, type TaskPresetVariant } from '../taskCatalog';
import { WEEKDAYS } from '../taskDraft';
import type { CreateParentTaskCommand } from '../taskPersistence/types';
import { PresetGlyph } from '../drawerIcons';

function weekdayText(days: number[] | undefined): string | undefined {
  if (!days || days.length === 0) return undefined;
  if (days.length === 7) return '每天';
  return WEEKDAYS.filter(d => days.includes(d.value))
    .map(d => `週${d.label}`)
    .join('、');
}

/** 「何時做」的一句話。三種排程模式各有自己的說法，不硬湊成同一句。 */
function scheduleText(command: CreateParentTaskCommand): string | undefined {
  const { schedule } = command;
  if (schedule.mode === 'one_time') {
    return schedule.scheduledDate ? `${schedule.scheduledDate} 完成一次` : undefined;
  }
  if (schedule.mode === 'weekly_frequency') {
    return schedule.weeklyFrequency ? `每週約 ${schedule.weeklyFrequency} 次` : undefined;
  }
  return weekdayText(schedule.recurrenceDays);
}

/**
 * 「完成後會怎樣」的一句話。
 *
 * coin_eligible 講金額，其餘講它實際被看見的方式 ——
 * 不發幣的任務寫「0 枚成長幣」等於告訴家長這件事一文不值。
 */
function rewardText(command: CreateParentTaskCommand): string {
  const { decision } = command.reward;

  if (decision.eligibility === 'allowed' && decision.rewardPolicy === 'coin_eligible') {
    return `完成後可獲得 ${decision.coin.finalAmount} 枚成長幣`;
  }
  switch (decision.rewardPolicy) {
    case 'family_contribution':
      return '會記錄在本週的家庭參與中';
    case 'progress_only':
      return '完成後會累積進度，並在回顧時一起看見';
    case 'record_only':
      return '完成後會留下紀錄，不發成長幣';
    default:
      // blocked 的決策根本走不到建立成功（finalize 與 RPC 各擋一次）。
      return '完成後會留下紀錄';
  }
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value || !value.trim()) return null;
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

export function CreatedTaskSummary({
  family,
  variant,
  command,
}: {
  family: TaskPresetFamily;
  variant: TaskPresetVariant;
  command: CreateParentTaskCommand;
}) {
  const isLongTerm = command.task.durationType === 'long_term';
  const isRole = command.task.planMode === 'family_role';
  const durationDays = command.plan?.durationDays ?? command.schedule.durationDays;

  const periodText = durationDays
    ? `${durationDays} 天${
        command.schedule.endDate ? `（${command.schedule.startDate} 至 ${command.schedule.endDate}）` : ''
      }`
    : undefined;

  return (
    <View style={s.stack}>
      <View style={s.head}>
        <PresetGlyph
          kind={family.iconKey}
          category={command.task.purposeCategory}
          size={54}
        />
        <View style={s.headText}>
          <Text style={s.eyebrow}>已建立</Text>
          <Text style={s.title}>{command.task.title}</Text>
          <Text style={s.subtitle}>{variantFormLabel(variant)}</Text>
        </View>
      </View>

      <View style={s.block}>
        <Row label="執行安排" value={scheduleText(command)} />
        {/* 家庭角色講「試行」，其餘長期形式講「計畫」——兩者的心理預期不同。 */}
        {isLongTerm ? <Row label={isRole ? '試行期間' : '計畫期間'} value={periodText} /> : null}
        <Row label="回饋方式" value={rewardText(command)} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  stack: {
    gap: ParentSpacing[3],
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[4],
    paddingHorizontal: ParentSpacing[5],
    paddingVertical: ParentSpacing[5] - 5,
    borderRadius: ParentRadii.lg,
    borderWidth: 1,
    borderColor: ParentColors.pine300,
    backgroundColor: ParentColors.tintPine,
  },
  headText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  eyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.pine500,
  },
  title: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    lineHeight: 26,
  },
  subtitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgSecondary,
  },
  block: {
    paddingHorizontal: ParentSpacing[5],
    paddingVertical: ParentSpacing[5] - 5,
    borderRadius: ParentRadii.lg,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
    gap: ParentSpacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ParentSpacing[4],
  },
  rowLabel: {
    width: 84,
    minWidth: 84,
    flexShrink: 0,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
    lineHeight: 22,
  },
  rowValue: {
    flex: 1,
    minWidth: 0,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    lineHeight: 22,
  },
});
