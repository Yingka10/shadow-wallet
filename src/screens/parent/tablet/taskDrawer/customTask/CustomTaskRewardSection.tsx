// Shadow Wallet · Parent Tablet — 自訂任務的回饋方式選單
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支**不做任何政策判斷**。
//
// 「哪些回饋方式可以用」由 evaluateCustomTaskRewardOptions 決定，
// 「現在建不建得出來」由 canFinalizeRewardOption 決定。兩者都是純函式，
// 呼叫端算好之後把結果交給這裡畫。
//
// 沒有把它們搬進元件裡的理由很具體：家庭參與能不能發成長幣，是一條
// 同時寫在 domain、命令、RPC 三層的規則。在 React 裡再判斷一次，
// 等於第四份 —— 而 UI 那一份會是最先被改壞、最晚被發現的。
//
// 沒有獨立的「回饋方式 Step 4」：回饋屬於這份任務的內容，不是流程的一站。
// 拆成獨立步驟會讓家長在還沒看到完整安排之前先決定要不要發幣。
// ─────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentSpacing,
} from '../../../../../constants/parentTheme';
import type { RewardPolicy } from '../taskCatalog';
import { useDisplayMode } from '../displayMode';
import {
  canFinalizeRewardOption,
  type RewardOptionPresentation,
} from './customTaskRewardOptions';
import { REWARD_OPTION_COPY, REWARD_SECTION_COPY, rewardUnavailableCopy } from './customTaskCopy';

/*
  Helper 與錯誤訊息在這裡自己畫，不從 EditorControls 借。

  借的話會形成 EditorControls → CustomTaskRewardSection → EditorControls 的
  循環相依 —— ES module 不會報錯，但初始化順序一變就是一個 undefined 元件，
  而那種錯誤通常只在 production bundle 裡出現。
*/
function SectionHelper({ children }: { children: string }) {
  return <Text style={s.helper}>{children}</Text>;
}

function SectionError({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <Text style={s.error} accessibilityRole="alert">
      {children}
    </Text>
  );
}

/** recommended 排前面。其餘維持 domain 給的順序，不另外重排。 */
function orderOptions(options: readonly RewardOptionPresentation[]): RewardOptionPresentation[] {
  const recommended = options.filter(o => o.availability === 'recommended');
  const rest = options.filter(o => o.availability !== 'recommended');
  return [...recommended, ...rest];
}

export function CustomTaskRewardSection({
  options,
  selected,
  error,
  onChange,
}: {
  options: readonly RewardOptionPresentation[];
  selected: RewardPolicy;
  error?: string;
  onChange: (policy: RewardPolicy) => void;
}) {
  const displayMode = useDisplayMode();
  /** 家長點了一個需要確認的選項，但還沒按「確定使用」。 */
  const [pending, setPending] = useState<RewardPolicy | null>(null);

  const ordered = orderOptions(options);

  return (
    <View style={s.stack}>
      {/*
        「怎麼被看見」而不是「回饋方式」。

        後者問的是設定，前者問的是家長真正在決定的事：這件事完成之後，
        孩子的投入會以什麼形式被記下來。四個選項的差別本來就在這裡，
        不在「要不要發幣」。
      */}
      <Text style={s.sectionTitle}>{REWARD_SECTION_COPY.title}</Text>

      {ordered.map(option => {
        const selectable = canFinalizeRewardOption(option);
        const copy = REWARD_OPTION_COPY[option.rewardPolicy];

        // 一般使用模式：選不了的直接不列。
        // 家長不需要知道有一個他用不到的選項存在 —— 那只會變成一個
        // 「為什麼我不能用」的問題，而答案是一段幣值政策的內部狀態。
        if (!selectable && displayMode !== 'development') return null;

        if (!selectable) {
          return (
            <View
              key={option.rewardPolicy}
              style={[s.row, s.rowDisabled]}
              accessibilityRole="radio"
              accessibilityState={{ selected: false, disabled: true }}
              accessibilityLabel={copy.title}
            >
              <View style={s.radio} />
              <View style={s.text}>
                <Text style={[s.title, s.titleDisabled]}>{copy.title}</Text>
                {/* 原因寫成人話。這裡不會印出任何 reason code。 */}
                <Text style={s.reason}>{rewardUnavailableCopy(option)}</Text>
              </View>
            </View>
          );
        }

        const isSelected = selected === option.rewardPolicy;
        const needsConfirmation = option.availability === 'available_with_confirmation';
        const isPending = pending === option.rewardPolicy;

        return (
          <View key={option.rewardPolicy} style={s.group}>
            <Pressable
              style={({ pressed }) => [
                s.row,
                isSelected && s.rowSelected,
                pressed && !isSelected && s.rowPressed,
              ]}
              onPress={() => {
                if (isSelected) return;
                if (needsConfirmation) {
                  setPending(option.rewardPolicy);
                  return;
                }
                setPending(null);
                onChange(option.rewardPolicy);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, checked: isSelected }}
              accessibilityLabel={copy.title}
              accessibilityHint={copy.description}
            >
              <View style={[s.radio, isSelected && s.radioOn]}>
                {isSelected ? <View style={s.radioDot} /> : null}
              </View>
              <View style={s.text}>
                <View style={s.titleRow}>
                  <Text style={[s.title, isSelected && s.titleSelected]}>{copy.title}</Text>
                  {option.availability === 'recommended' ? (
                    <Text style={s.badge}>{REWARD_SECTION_COPY.recommendedBadge}</Text>
                  ) : null}
                </View>
                <Text style={s.description}>{copy.description}</Text>
              </View>
            </Pressable>

            {/*
              需要確認的選項不會因為點一下就套用。
              目前唯一會走到這裡的是「家庭參與 ＋ 成長幣」，而它在幣值政策
              補上 B 類數字之前都不是 selectable —— 所以正式畫面現在看不到這一段。
            */}
            {isPending && !isSelected ? (
              <View style={s.confirm}>
                <Text style={s.confirmTitle}>{REWARD_SECTION_COPY.confirmTitle}</Text>
                <Text style={s.confirmBody}>{option.description}</Text>
                <View style={s.confirmActions}>
                  <Pressable
                    style={s.confirmPrimary}
                    onPress={() => {
                      setPending(null);
                      onChange(option.rewardPolicy);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={REWARD_SECTION_COPY.confirmAccept}
                  >
                    <Text style={s.confirmPrimaryText}>{REWARD_SECTION_COPY.confirmAccept}</Text>
                  </Pressable>
                  <Pressable
                    style={s.confirmGhost}
                    onPress={() => setPending(null)}
                    accessibilityRole="button"
                    accessibilityLabel={REWARD_SECTION_COPY.confirmCancel}
                  >
                    <Text style={s.confirmGhostText}>{REWARD_SECTION_COPY.confirmCancel}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        );
      })}

      <SectionHelper>{REWARD_SECTION_COPY.helper}</SectionHelper>
      <SectionError>{error}</SectionError>
    </View>
  );
}

const s = StyleSheet.create({
  stack: { gap: ParentSpacing[2] },
  group: { gap: ParentSpacing[2] },
  sectionTitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  helper: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 19,
    color: ParentColors.fgMuted,
  },
  error: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 19,
    color: ParentColors.error,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ParentSpacing[3],
    minHeight: 56,
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[3],
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  rowSelected: {
    borderColor: ParentColors.pine500,
    borderWidth: 2,
    backgroundColor: ParentColors.tintPine,
    paddingHorizontal: ParentSpacing[4] - 1,
    paddingVertical: ParentSpacing[3] - 1,
  },
  rowPressed: { backgroundColor: ParentColors.bgSurfaceWarm },
  rowDisabled: { opacity: 0.6, backgroundColor: ParentColors.bgSurfaceWarm },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: ParentColors.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  radioOn: { borderColor: ParentColors.pine500 },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: ParentColors.pine500,
  },
  text: { flex: 1, minWidth: 0, gap: 3 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: ParentSpacing[2],
  },
  title: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  titleSelected: { color: ParentColors.pine500 },
  titleDisabled: { color: ParentColors.fgMuted },
  badge: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.pine400,
  },
  description: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 20,
    color: ParentColors.fgSecondary,
  },
  reason: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 20,
    color: ParentColors.fgMuted,
  },
  confirm: {
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[3],
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.pine300,
    backgroundColor: ParentColors.tintPine,
    gap: ParentSpacing[2],
  },
  confirmTitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pine500,
  },
  confirmBody: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 20,
    color: ParentColors.fgSecondary,
  },
  confirmActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: ParentSpacing[2],
  },
  confirmPrimary: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: ParentSpacing[4],
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.pine500,
  },
  confirmPrimaryText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.onSidebar,
  },
  confirmGhost: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: ParentSpacing[4],
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  confirmGhostText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
});
