import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import type { ParentProposalCardData } from '../../../../lib/childProposal/types';
import type { ParentProposalMaterialEdits } from '../../../../lib/childProposal/types';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentShadows,
  ParentSpacing,
} from '../../../../constants/parentTheme';
import { presentParentProposal } from './parentProposalPresentation';
import { ParentProposalEditSheet, supportsMaterialEditing } from './ParentProposalEditSheet';
import { ParentProposalUnsuitableSheet } from './ParentProposalUnsuitableSheet';
import { ParentSharedTermsSheet } from './ParentSharedTermsSheet';
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  FootprintIcon,
  GiftIcon,
  Illustration,
  InfoIcon,
  PencilIcon,
} from './homeIcons';
import type { ChildPlanningSharedTerms } from '../../../../lib/childPlanning/sharedTerms';

// 桌面才把「確認」「調整」並排；窄 viewport 疊成一欄——與其他 parent tablet 畫面同一個門檻（見 ParentTaskManagementTablet 等）。
const DESKTOP_ROW_MIN_WIDTH = 768;

type Props = {
  childName: string;
  proposals: ParentProposalCardData[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onConfirm: (card: ParentProposalCardData) => void;
  confirmingProposalId: string | null;
  confirmError: string | null;
  successMessage: string | null;
  onRevise?: (card: ParentProposalCardData, edits: ParentProposalMaterialEdits) => Promise<boolean> | boolean | void;
  /**
   * P1-A4B1：家長提出家庭共同條件。**不是** onRevise 的別名 ——
   * 那一支是 P0 的 material edit，這一支的終點是 needs_child_review。
   */
  onProposeTerms?: (
    card: ParentProposalCardData,
    terms: ChildPlanningSharedTerms,
  ) => Promise<boolean> | boolean | void;
  onCloseProposal?: (card: ParentProposalCardData, reason: string) => Promise<boolean> | boolean | void;
  actingProposalId?: string | null;
  actionError?: string | null;
};

// 小綠圓 badge：兩段之間的「第 1 步 / 第 2 步」要一眼看得出是流程，
// 不是文件的 outline 編號。放大的裸數字做不到這件事（試過，讀起來像目錄）。
function SectionBadge({ number }: { number: number }) {
  return (
    <View style={styles.sectionBadge}>
      <Text style={styles.sectionBadgeText}>{number}</Text>
    </View>
  );
}

// 「每完成一次，+10 成長幣」——只有數字那一小段染低彩度金，其餘走正文色。
// 金是這張卡唯一允許的暖色 accent，面積一旦放大，家長會以為幣值是這份提案的重點。
// 只認 `+N` 這種正式約定的寫法；「建議：每次完成 10 成長幣」還沒定案，不給 accent。
const COIN_AMOUNT_PATTERN = /\+\d+(?=\s*成長幣)/;

function PlanFactValue({ value }: { value: string }) {
  const match = COIN_AMOUNT_PATTERN.exec(value);
  if (!match) return <Text style={styles.planFactValue}>{value}</Text>;
  const start = match.index;
  return (
    <Text style={styles.planFactValue}>
      {value.slice(0, start)}
      <Text style={styles.coinAccent}>{match[0]}</Text>
      {value.slice(start + match[0].length)}
    </Text>
  );
}

function PlanFact({
  icon, label, value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.planFact}>
      <View style={styles.factIconBubble}>{icon}</View>
      <View style={styles.planFactCopy}>
        <Text style={styles.factLabel}>{label}</Text>
        <PlanFactValue value={value} />
      </View>
    </View>
  );
}

/**
 * PARENT-PROPOSAL-V3：一張卡片是一個決策介面，不是巢狀卡片堆疊。
 *
 * ── surface hierarchy（V3 的重點，別再退回 V2）─────────────────────────
 *   卡片本體是**白的**。上一版整張卡鋪暖米色，結果是：頁面本來就偏暖，
 *   再壓一整塊黃灰上去，內容全黏成一坨、整頁像紙本表單。
 *   「這是一份提案」不靠把卡染色來講，靠的是三件事：
 *     1. A 帶的極淡 sage tint（tintProposal）—— 標示「這一段是孩子說的」
 *     2. 右上角低權重狀態 chip —— 標示提案走到哪一步
 *     3. 綠色圓 badge 的流程編號 —— 標示 1→2 的順序
 *   有色面積只准出現在 A 帶與 C 帶，B 帶維持白底。再多就會變回有色紙。
 *
 * ── 顏色紀律 ────────────────────────────────────────────────────
 *   標題字走暖炭黑（ink800/fgPrimary），**不要**大面積深綠中文字。
 *   綠只留給：badge、eyebrow、引號、icon bubble、primary 按鈕。
 *   唯一允許的暖色 accent 是幣值數字的 coinMuted，且只在 `+N` 那幾個字。
 *   leaf（done 綠）不准挪來當裝飾色——那個色只講「已完成」。
 *
 * 三個帶（band）：
 *   A｜孩子的聲音 — 原話與動機（淡 sage）
 *   B｜GrowBook 幫忙整理 — compact icon facts，理由收合在次要區塊（白）
 *   C｜Decision Zone — 一個問句 + primary／secondary／tertiary（淡 sage）
 *
 * ⚠️ B 的 eyebrow 永遠是「GrowBook 整理」＋副標「幫你整理成可以開始的版本」，
 *    不論走哪條 route——確認之前不能叫它「家庭約定」，那個名字要等家長真的
 *    按下確認才成立。
 * ⚠️ eyebrow 刻意壓到「GrowBook」+ 兩個中文字：DMSans 沒有中文字符，中文會掉回
 *    系統字體，同一行裡的中英基線與字重對不齊。字體沒換之前，靠縮短混排長度
 *    把落差藏起來——所以別再把中文字加回這一行。
 * ⚠️ Primary CTA 的文字用 card.confirmLabel（由 presentParentProposal 依
 *    route 決定），不要在這裡寫死——P1 是「確認這份約定」，legacy 是
 *    「確認這個計畫」，兩者语意不同，不能合併成一顆字。
 * ⚠️ Secondary 的「想調整一下」底層可能是 P0 的 onRevise 或 P1 的
 *    onProposeTerms，取決於 card 走哪條路徑——這裡只統一視覺上的字，
 *    不合併底層 RPC。
 * ⚠️ preferred_time 沒值時 formatPreferredTime 仍會回「還沒決定」（給
 *    調整表單的 diff 用）——這裡要看的是原始欄位有沒有值，不是格式化後
 *    的字串是不是空，否則每張卡都會冒出一句「還沒決定」。
 */
export function ParentProposalSection({
  childName,
  proposals,
  loading,
  error,
  onRetry,
  onConfirm,
  confirmingProposalId,
  confirmError,
  successMessage,
  onRevise,
  onProposeTerms,
  onCloseProposal,
  actingProposalId = null,
  actionError = null,
}: Props) {
  const [editCard, setEditCard] = useState<ParentProposalCardData | null>(null);
  const [closeCard, setCloseCard] = useState<ParentProposalCardData | null>(null);
  const [termsCard, setTermsCard] = useState<ParentProposalCardData | null>(null);
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});
  const { width: windowWidth } = useWindowDimensions();
  const isDesktopWidth = windowWidth >= DESKTOP_ROW_MIN_WIDTH;
  const cards = useMemo(
    () => proposals.slice(0, 3).map(item => ({
      source: item,
      view: presentParentProposal(item, childName),
    })),
    [childName, proposals],
  );

  if (!loading && !error && !successMessage && !confirmError && cards.length === 0) return null;

  return (
    <View style={styles.section} testID="parent-proposal-section">
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>需要一起看看</Text>
        <Text style={styles.sectionMeta}>孩子自己提出的新想法</Text>
      </View>

      {successMessage && <Text style={styles.successText}>{successMessage}</Text>}
      {confirmError && <Text style={styles.errorText}>{confirmError}</Text>}
      {actionError && <Text style={styles.errorText}>{actionError}</Text>}

      {loading && cards.length === 0 ? (
        <View style={styles.stateCard}>
          <ActivityIndicator size="small" color={ParentColors.accent} />
          <Text style={styles.stateText}>正在看看孩子的新想法…</Text>
        </View>
      ) : error && cards.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>孩子的新想法暫時讀不到</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.8}>
            <Text style={styles.retryText}>再試一次</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.cardList}>
          {cards.map(({ source, view: card }) => {
            const reasoningKey = source.currentPlanVersion?.id;
            const reasoningIsExpanded = reasoningKey
              ? expandedReasoning[reasoningKey] === true
              : false;
            const reasoningLines = [card.planSummary, card.rhythmCopy, card.childPlan?.shape]
              .filter((value): value is string => Boolean(value));
            const completionDescription = card.completionDescription;
            const hasReasoning = reasoningLines.length > 0 || Boolean(completionDescription);
            const reasoningToggleText = reasoningIsExpanded ? '收合' : '為什麼這樣整理？';
            // 原始欄位，不是格式化後的字串——後者永遠是 truthy（沒值時回「還沒決定」）。
            const hasPreferredTime = Boolean(source.currentPlanVersion?.preferred_time);
            // 低權重狀態 pill 的字——只簡化 child_plan 這個「已經想好怎麼做」的狀態，
            // 其他狀態（等孩子看看／孩子想再聊聊…）語意不同，維持 statusLabel 原字。
            const statusPillText = card.state === 'child_plan' ? '孩子已確認' : card.statusLabel;

            const decisionHeading =
              card.state === 'fresh_ai' || card.state === 'child_plan'
                ? `這樣開始，適合${childName}嗎？`
                : card.state === 'child_revisit'
                  ? '要再一起調整哪裡？'
                  : card.state === 'child_plan_needs_terms'
                    ? '還有幾件事要一起說定'
                    : card.state === 'child_agreed_pending_terms'
                      ? '他說這些安排可以'
                      : null;

            const adjustLabel = '想調整一下';
            const onAdjust = card.canProposeTerms && onProposeTerms
              ? () => setTermsCard(source)
              : card.canRevise && onRevise && supportsMaterialEditing(source)
                ? () => setEditCard(source)
                : null;

            return (
              <View key={card.id} style={styles.card} testID="parent-proposal-card">
                {/* A｜孩子的聲音 —— 卡片裡唯一帶 tint 的敘事區 */}
                <View style={styles.childVoiceBand} testID={`proposal-child-voice-${card.id}`}>
                  <View style={styles.bandHead}>
                    {/* 具名比「孩子提出」有用：講的是誰送來的，不是重複下面的段名。 */}
                    <Text style={styles.originEyebrow}>{childName}提出</Text>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusPillText}>{statusPillText}</Text>
                    </View>
                  </View>
                  <View style={styles.bandHeadLeft}>
                    <SectionBadge number={1} />
                    <Text style={styles.bandEyebrow}>孩子的聲音</Text>
                  </View>
                  <View style={styles.childVoiceRow}>
                    <View style={styles.quoteRow}>
                      <Text style={styles.quoteMark}>“</Text>
                      <Text style={styles.goalText}>{card.goal}</Text>
                    </View>
                    {/* 這顆插圖只有兩種尺寸是對的：夠大到一眼是插畫，或者不要。
                        卡在中間（quote 右邊一顆小盆栽）縮圖之後只剩一個黃綠點。
                        往右上靠 + 壓不透明度，讓它退成角落的裝飾，不跟大標搶位置。 */}
                    <View style={styles.voiceArt} pointerEvents="none">
                      <Illustration kind="tipPlant" size={112} />
                    </View>
                  </View>
                  {card.motivation && (
                    <View style={styles.detailBlock}>
                      <Text style={styles.detailLabel}>為什麼想做</Text>
                      <Text style={styles.voiceMotivation}>{card.motivation}</Text>
                    </View>
                  )}
                </View>

                {/* B｜GrowBook 幫忙整理成可以開始的版本 */}
                {card.planTitle ? (
                  <View style={styles.planBand} testID={`proposal-plan-${card.id}`}>
                    <View style={styles.planBandHead}>
                      <View style={styles.bandHeadLeft}>
                        <SectionBadge number={2} />
                        <Text style={styles.bandEyebrow}>GrowBook 整理</Text>
                      </View>
                      <Text style={styles.bandSubEyebrow}>幫你整理成可以開始的版本</Text>
                    </View>
                    <Text style={styles.planTitleText}>{card.planTitle}</Text>
                    <View style={styles.planFacts}>
                      {card.planCadence && (
                        <PlanFact
                          icon={<CalendarIcon size={18} />}
                          label="這一段的節奏"
                          value={card.planCadence}
                        />
                      )}
                      {card.estimatedTime && (
                        <PlanFact
                          icon={<ClockIcon size={18} />}
                          label="每次投入"
                          value={card.estimatedTime}
                        />
                      )}
                      {card.nextStep && (
                        <PlanFact
                          icon={<FootprintIcon size={18} />}
                          label="今天第一步"
                          value={card.nextStep}
                        />
                      )}
                      {card.rewardSuggestion && (
                        <PlanFact
                          icon={<GiftIcon size={18} color={ParentColors.pine400} />}
                          label={card.rewardSuggestionLabel ?? '回饋'}
                          value={card.rewardSuggestion}
                        />
                      )}
                      {hasPreferredTime && card.preferredTime && (
                        <PlanFact
                          icon={<ClockIcon size={18} />}
                          label="適合時間"
                          value={card.preferredTime}
                        />
                      )}
                    </View>
                    {hasReasoning && (
                      <>
                        <TouchableOpacity
                          style={styles.reasoningToggle}
                          accessibilityRole="button"
                          accessibilityLabel={`${reasoningToggleText}「${card.goal}」的整理理由`}
                          accessibilityState={{ expanded: reasoningIsExpanded }}
                          onPress={() => reasoningKey && setExpandedReasoning(current => ({
                            ...current,
                            [reasoningKey]: current[reasoningKey] !== true,
                          }))}
                          activeOpacity={0.72}
                        >
                          <View style={styles.reasoningToggleLeft}>
                            {/* 星星是另一套語彙（收藏／推薦）。這裡要講的是「補充說明」。 */}
                            <InfoIcon size={15} color={ParentColors.fgMuted} />
                            <Text style={styles.reasoningToggleText}>{reasoningToggleText}</Text>
                          </View>
                          <View style={reasoningIsExpanded ? styles.chevronExpanded : undefined}>
                            <ChevronDownIcon size={14} color={ParentColors.fgMuted} />
                          </View>
                        </TouchableOpacity>
                        {reasoningIsExpanded && (
                          <View style={styles.reasoningBody}>
                            {completionDescription && (
                              <View style={styles.detailBlock}>
                                <Text style={styles.detailLabel}>怎樣算完成</Text>
                                <Text style={styles.reasoningText}>{completionDescription}</Text>
                              </View>
                            )}
                            {reasoningLines.map(line => (
                              <Text key={line} style={styles.reasoningText}>{line}</Text>
                            ))}
                          </View>
                        )}
                      </>
                    )}
                  </View>
                ) : null}

                {/* C｜Decision Zone —— primary／secondary／tertiary 三種不同視覺權重 */}
                <View style={styles.decisionBand} testID={`proposal-decision-${card.id}`}>
                  {decisionHeading && <Text style={styles.decisionTitle}>{decisionHeading}</Text>}
                  {confirmingProposalId === card.id || actingProposalId === card.id ? (
                    <View style={styles.confirmingRow}>
                      <ActivityIndicator size="small" color={ParentColors.accent} />
                      <Text style={styles.detailText}>{confirmingProposalId === card.id ? '正在建立共同計畫…' : '正在保存你們的決定…'}</Text>
                    </View>
                  ) : (
                    <View style={styles.actions}>
                      <View style={[styles.primaryRow, !isDesktopWidth && styles.primaryRowStacked]}>
                        {card.canConfirm && (
                          <TouchableOpacity
                            testID={`proposal-confirm-${card.id}`}
                            style={[styles.confirmButton, isDesktopWidth && styles.confirmButtonFlex]}
                            onPress={() => onConfirm(source)}
                            activeOpacity={0.8}
                          >
                            <CheckIcon size={16} />
                            <Text style={styles.confirmButtonText}>{card.confirmLabel}</Text>
                          </TouchableOpacity>
                        )}
                        {onAdjust && (
                          <TouchableOpacity
                            testID={`proposal-adjust-${card.id}`}
                            style={[styles.secondaryButton, isDesktopWidth && styles.secondaryButtonFlex]}
                            onPress={onAdjust}
                            activeOpacity={0.8}
                          >
                            <PencilIcon size={15} />
                            <Text style={styles.secondaryButtonText}>{adjustLabel}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      {card.sharedDecisions.length > 0 && (
                        <Text style={styles.waitingText}>
                          還要一起說定：{card.sharedDecisions.join('、')}
                        </Text>
                      )}
                      {card.enrichmentRequiredCopy && (
                        <Text style={styles.waitingText} testID={`enrichment-required-${card.id}`}>
                          {card.enrichmentRequiredCopy}
                        </Text>
                      )}
                      {card.waitingMessage && <Text style={styles.waitingText}>{card.waitingMessage}</Text>}
                      {onCloseProposal && (
                        <TouchableOpacity
                          testID={`proposal-unsuitable-${card.id}`}
                          style={styles.tertiaryButton}
                          onPress={() => setCloseCard(source)}
                          activeOpacity={0.6}
                        >
                          <Text style={styles.tertiaryButtonText}>現在不適合</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
      {editCard && (
        <ParentProposalEditSheet
          visible
          card={editCard}
          saving={actingProposalId === editCard.proposal.id}
          error={actionError}
          onClose={() => setEditCard(null)}
          onSave={async edits => {
            const completed = await onRevise?.(editCard, edits);
            if (completed === true) setEditCard(null);
          }}
        />
      )}
      {termsCard && (
        <ParentSharedTermsSheet
          visible
          card={termsCard}
          saving={actingProposalId === termsCard.proposal.id}
          error={actionError}
          onClose={() => setTermsCard(null)}
          onSubmit={async terms => {
            const completed = await onProposeTerms?.(termsCard, terms);
            if (completed === true) setTermsCard(null);
          }}
        />
      )}
      <ParentProposalUnsuitableSheet
        visible={closeCard !== null}
        saving={closeCard !== null && actingProposalId === closeCard.proposal.id}
        error={actionError}
        onClose={() => setCloseCard(null)}
        onSubmit={async reason => {
          if (!closeCard) return;
          const completed = await onCloseProposal?.(closeCard, reason);
          if (completed === true) setCloseCard(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: ParentSpacing[3] },
  sectionHead: { gap: ParentSpacing[1] },
  sectionTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  sectionMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
  },
  stateCard: {
    minHeight: 72,
    padding: ParentSpacing[4],
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[3],
  },
  stateText: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  retryButton: {
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[2],
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.borderMedium,
  },
  retryText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.accent,
  },
  cardList: { gap: ParentSpacing[3] },
  // ONE PRIMARY SURFACE：整張卡只有一層外框，band 之間靠 tint 邊界分段，不是巢狀卡片。
  // 卡片是白的——padding 下放到各 band，tint 才能鋪滿整條、不留白邊。
  // 圓角同時寫在卡與首尾 band 上（不用 overflow:hidden，那會在 iOS 吃掉陰影）。
  card: {
    borderRadius: ParentRadii.xl,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
    ...ParentShadows.card,
  },
  childVoiceBand: {
    gap: ParentSpacing[4],
    paddingHorizontal: ParentSpacing.cardPadLg,
    paddingTop: ParentSpacing[5],
    // 「為什麼想做」下面不留跟上緣一樣的空——有色帶的下緣多留白，會把它撐成一張子卡。
    paddingBottom: ParentSpacing[4],
    backgroundColor: ParentColors.tintProposal,
    borderTopLeftRadius: ParentRadii.xl,
    borderTopRightRadius: ParentRadii.xl,
  },
  bandHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: ParentSpacing[3],
  },
  bandHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[2],
  },
  // 誰送來的——比段名再低一階，只是個署名。
  originEyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.pine300,
  },
  sectionBadge: {
    width: 26,
    height: 26,
    borderRadius: ParentRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.accent,
  },
  sectionBadgeText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.onSidebar,
  },
  bandEyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pBody,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.accent,
    textTransform: 'none',
  },
  bandSubEyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
    marginLeft: 26 + ParentSpacing[2],   // 對齊 badge 右邊的 eyebrow
  },
  // 低權重 chip——在 sage tint 上要靠白底浮起來，tintPine 會糊進背景。
  statusPill: {
    paddingHorizontal: ParentSpacing[3],
    paddingVertical: ParentSpacing[1],
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  statusPillText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.pine400,
  },
  detailBlock: { gap: ParentSpacing[1] },
  detailLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
  },
  childVoiceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: ParentSpacing[3],
  },
  // 負 margin 把插圖頂進段名那一行留下的空白、並貼近卡片右緣：垂直置中會讓它
  // 剛好卡在大標旁邊，變成「漂浮的一顆盆栽」。pointerEvents 已在 JSX 關掉。
  voiceArt: {
    opacity: 0.8,
    marginTop: -ParentSpacing[4],
    marginRight: -ParentSpacing[2],
  },
  quoteRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ParentSpacing[2],
  },
  // 只有引號吃品牌綠——句子本身是正文，不是裝飾。
  quoteMark: {
    fontFamily: ParentFonts.display,
    fontSize: 44,
    lineHeight: 40,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.pine300,
  },
  // headline 走暖炭黑。整段深綠中文字在暖底上會顯得又厚又老派（V2 踩過）。
  goalText: {
    flex: 1,
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.display,
    fontWeight: ParentFontWeights.black,
    lineHeight: 40,
    color: ParentColors.ink800,
  },
  voiceMotivation: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.base,
    lineHeight: 24,
    color: ParentColors.fgSecondary,
  },
  detailText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 21,
    color: ParentColors.fgSecondary,
  },
  // B 帶維持白底——三段裡唯一沒有 tint 的區塊，讀起來才是「整理過的內容」。
  planBand: {
    gap: ParentSpacing[5],
    paddingHorizontal: ParentSpacing.cardPadLg,
    paddingVertical: ParentSpacing[6],
  },
  planBandHead: { gap: ParentSpacing[1] },
  planTitleText: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h2,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  planFacts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: ParentSpacing[6],
    rowGap: ParentSpacing[5],
  },
  // 2×2 一致格：每格同 basis，不再有「wide」特例，對齊感才穩定。
  planFact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[3],
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 0,
  },
  // 淡 sage 圓底：四個 icon 走同一套 forest/sage，不要一格突然換成橘色 —— 那會讓
  // 家長以為幣值是這份提案的重點。每格不再各自加框，靠 gap 分開就夠。
  factIconBubble: {
    width: 34,
    height: 34,
    borderRadius: ParentRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.tintPine,
  },
  planFactCopy: { flex: 1, minWidth: 0, gap: 1 },
  factLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
  },
  planFactValue: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.semi,
    lineHeight: 23,
    color: ParentColors.fgPrimary,
  },
  coinAccent: { color: ParentColors.coinMuted },
  // 真正的 accordion affordance：icon + 文字在左，chevron 在右，展開時轉向。
  // 上緣壓一條 hairline，不然它會被讀成一行被遺忘的 footer。
  reasoningToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    minHeight: 46,
    paddingTop: ParentSpacing[1],
    borderTopWidth: 1,
    borderTopColor: ParentColors.hairline,
  },
  reasoningToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[2],
  },
  reasoningToggleText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.accent,
  },
  chevronExpanded: { transform: [{ rotate: '180deg' }] },
  reasoningBody: {
    gap: ParentSpacing[2],
    paddingTop: ParentSpacing[2],
    borderTopWidth: 1,
    borderTopColor: ParentColors.hairline,
  },
  reasoningText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 21,
    color: ParentColors.fgMuted,
  },
  // C｜Decision Zone —— 只有這一小段再上一次極淡 sage，把「你要做決定」框起來。
  // borderTop 留著：planBand 不存在時（GrowBook 還沒整理完）兩塊 tint 會直接相接。
  decisionBand: {
    // 問句與按鈕之間要有一段真的空白：貼太近，整段會讀成一列 toolbar 而不是決策。
    gap: ParentSpacing[6],
    paddingHorizontal: ParentSpacing.cardPadLg,
    paddingTop: ParentSpacing[5],
    paddingBottom: ParentSpacing[5],
    backgroundColor: ParentColors.tintDecision,
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
    borderBottomLeftRadius: ParentRadii.xl,
    borderBottomRightRadius: ParentRadii.xl,
  },
  decisionTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.xl,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ParentSpacing[2],
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[4],
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.accent,
  },
  confirmButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.bold,
    color: '#FFFFFF',
  },
  confirmingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ParentSpacing[2],
  },
  actions: { gap: ParentSpacing[3] },
  // 桌面：confirm／adjust 並排（約 60/40）。窄 viewport 疊成一欄。
  primaryRow: {
    flexDirection: 'row',
    gap: ParentSpacing[3],
  },
  primaryRowStacked: { flexDirection: 'column' },
  confirmButtonFlex: { flexBasis: '60%', flexGrow: 1 },
  secondaryButtonFlex: { flexBasis: '38%', flexGrow: 1 },
  // Secondary：白底 + sage 描邊 + forest 文字。灰米色描邊在 sage tint 上會消失，
  // 而且會讀成 disabled——這顆是真的可以按的第二條路。
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ParentSpacing[2],
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[4],
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.pine200,
    backgroundColor: ParentColors.bgSurface,
  },
  secondaryButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.accent,
  },
  // Tertiary：純文字連結，沒有邊框、沒有底色 —— 三顆按鈕不該同一個視覺權重。
  tertiaryButton: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: ParentSpacing[1],
  },
  tertiaryButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
  },
  waitingText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
  },
  successText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.success,
  },
  errorText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.error,
  },
});
