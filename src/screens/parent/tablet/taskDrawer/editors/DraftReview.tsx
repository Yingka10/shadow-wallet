// Shadow Wallet · Parent Tablet — 草稿唯讀預覽
//
// 把 draft 攤開來讓家長確認，沒有任何寫入。「確認建立」在 PresetTaskDrawer 的 footer。
//
// 這裡多做一件事：顯示**真正會送出的那份回饋決策**。
// 「回饋方式：可獲得成長幣」只說了政策名稱，沒說會拿到幾枚 ——
// 家長在按下建立之前看不到金額，等於在確認一份自己沒看過的內容。

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
import {
  COMPLETION_LABEL,
  PURPOSE_LABEL,
  variantFormLabel,
  type TaskPresetFamily,
  type TaskPresetVariant,
} from '../taskCatalog';
import {
  FAMILY_ROLE_CONTRIBUTION_ITEMS,
  FAMILY_ROLE_ENDING_INTRO,
  FAMILY_ROLE_ENDING_OPTIONS,
  FAMILY_ROLE_SAFETY_EXPAND_LABEL,
  FAMILY_ROLE_SAFETY_POLICY,
  FAMILY_ROLE_SAFETY_SUMMARY,
  FAMILY_ROLE_SAFETY_TITLE,
  LOCAL_ONLY_SCHEDULED_DATE,
  LOCAL_ONLY_WEEKLY_FREQUENCY,
  ONE_TIME_SUPPORT_OPTIONS,
  PREFERRED_TIME_OPTIONS,
  RECURRING_TIME_OPTIONS,
  REMINDER_OPTIONS,
  REWARD_POLICY_SHORT_LABEL,
  SUPPORT_LEVEL_OPTIONS,
  SUPPORT_TIME_OPTIONS,
  WEEKDAYS,
  dateStringPlusDays,
  isFamilyRoleDraft,
  isGrowthPlanDraft,
  isOneTimeDraft,
  isRecurringDraft,
  isShortSupportDraft,
  type TaskDraft,
} from '../taskDraft';
import { PresetGlyph } from '../drawerIcons';
import { useShowsImplementationNotes } from '../displayMode';
import type { TaskRewardDecision } from '../taskReward/types';
import { LocalOnlyNotice, PolicyNotice, ReadOnlyOutcomeList } from './EditorControls';

function weekdayText(days: number[]): string {
  if (days.length === 0) return '尚未選擇';
  if (days.length === 7) return '每天';
  return WEEKDAYS.filter(d => days.includes(d.value))
    .map(d => `週${d.label}`)
    .join('、');
}

function optionText(
  draft: TaskDraft,
  variant: TaskPresetVariant,
): Array<{ label: string; value: string }> {
  return variant.optionGroups.map(group => {
    const selected = draft.selectedOptions[group.id] ?? [];
    const labels = group.options
      .filter(option => selected.includes(option.id))
      .map(option =>
        option.id === 'other' && draft.customOptionValues[group.id]
          ? `其他：${draft.customOptionValues[group.id]}`
          : option.label,
      );
    // 空字串 → Row 直接不渲染。required 的群組進不到預覽（validator 擋著），
    // 非 required 的群組沒選也不該在預覽上留一句「尚未選擇」。
    return { label: group.label, value: labels.join('、') };
  });
}

/** 空值直接不佔一列 —— 預覽不該出現一排「未填寫」。 */
function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value || !value.trim()) return null;
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.block}>
      <Text style={s.blockTitle}>{title}</Text>
      <View style={s.blockBody}>{children}</View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 回饋決策
// ---------------------------------------------------------------------------

/**
 * 不發幣的三種政策各自的說法。
 *
 * 刻意不共用一句「不發成長幣」：三者不發幣的**理由**不同，
 * 而家長要能從這一句話判斷自己是不是選錯了。
 */
const NON_COIN_COPY: Record<
  'record_only' | 'family_contribution' | 'progress_only',
  { title: string; body: string }
> = {
  family_contribution: {
    title: '家庭貢獻',
    body: '這項任務會記錄孩子對共同生活的投入，不發成長幣。',
  },
  record_only: {
    title: '留下完成紀錄',
    body: '完成後保留紀錄，不發成長幣。',
  },
  progress_only: {
    title: '進度與肯定',
    body: '回饋投入、持續與進步，不直接發成長幣。',
  },
};

/**
 * development 模式下可展開的計算依據。
 *
 * 顯示的是「家長語言的欄位」——年齡段、時間分級、每次分鐘。
 * 刻意不印整包 JSON，也不出現 difficultyDelta / base_time_min 這類
 * 政策與資料庫的內部名稱：那些在正式畫面上只會讓人以為系統壞了。
 */
function CalculationBasis({ decision }: { decision: TaskRewardDecision }) {
  const [open, setOpen] = useState(false);
  if (decision.eligibility !== 'allowed' || decision.coin === null) return null;

  const basis = decision.coin.calculationBasis;

  return (
    <View style={s.basis}>
      <Pressable
        onPress={() => setOpen(current => !current)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? '收合計算依據' : '展開計算依據'}
      >
        <Text style={s.basisToggle}>{open ? '收合計算依據' : '查看計算依據'}</Text>
      </Pressable>
      {open ? (
        <View style={s.basisBody}>
          <Row label="年齡段" value={basis.ageGroup} />
          <Row label="時間分級" value={basis.band} />
          <Row
            label="每次時間"
            value={basis.estimatedMinutes ? `${basis.estimatedMinutes} 分鐘` : undefined}
          />
          <Row label="難度" value={basis.difficulty} />
          <Row label="建議幣值" value={`${decision.coin.suggestedAmount} 枚`} />
        </View>
      ) : null}
    </View>
  );
}

export function RewardDecisionBlock({ decision }: { decision: TaskRewardDecision }) {
  const showsImplementationNotes = useShowsImplementationNotes();

  // 正常流程走不到這裡（能力閘門讓家長根本選不到用不了的政策）。
  // 走到的情況是：預覽開著的時候草稿被改到讓能力失效。柔和說明 + 擋住建立，
  // 不是紅色錯誤 —— 家長沒有做錯任何事。
  if (decision.eligibility === 'blocked') {
    return (
      <View style={s.rewardBlocked}>
        <Text style={s.rewardBlockedTitle}>這個回饋方式目前不能使用</Text>
        <Text style={s.rewardBlockedBody}>{decision.explanation}</Text>
        <Text style={s.rewardBlockedHint}>請返回修改，換一種回饋方式或補上需要的設定。</Text>
      </View>
    );
  }

  if (decision.rewardPolicy === 'coin_eligible') {
    const { finalAmount, minAllowed, maxAllowed } = decision.coin;
    return (
      <View style={s.rewardCard}>
        <Text style={s.rewardTitle}>可獲得成長幣</Text>
        <View style={s.rewardAmountRow}>
          <Text style={s.rewardAmount}>{finalAmount}</Text>
          <Text style={s.rewardAmountUnit}>枚</Text>
        </View>
        <Text style={s.rewardBody}>
          政策允許範圍 {minAllowed}–{maxAllowed} 枚
        </Text>
        <Text style={s.rewardBody}>{decision.explanation}</Text>
        <Text style={s.rewardVersion}>幣值政策版本 {decision.rewardPolicyVersion}</Text>
        {showsImplementationNotes ? <CalculationBasis decision={decision} /> : null}
      </View>
    );
  }

  const copy = NON_COIN_COPY[decision.rewardPolicy];
  return (
    <View style={s.rewardCard}>
      <Text style={s.rewardTitle}>{copy.title}</Text>
      {/* 不發幣的政策不顯示任何數字。「0 枚」看起來像賺到 0，不像「這件事不用幣衡量」。 */}
      <Text style={s.rewardBody}>{copy.body}</Text>
      {showsImplementationNotes ? (
        <Text style={s.rewardVersion}>回饋政策版本 {decision.rewardPolicyVersion}</Text>
      ) : null}
    </View>
  );
}

export function DraftReview({
  family,
  variant,
  draft,
  decision,
}: {
  family: TaskPresetFamily;
  variant: TaskPresetVariant;
  draft: TaskDraft;
  /**
   * 等一下真的會送出的那份決策。
   * null = 草稿目前算不出決策（有欄位錯誤），這時不顯示回饋摘要 ——
   * 顯示一份「還沒定案」的金額比不顯示更糟。
   */
  decision: TaskRewardDecision | null;
}) {
  const growth = isGrowthPlanDraft(draft) ? draft : null;
  const support = isShortSupportDraft(draft) ? draft : null;
  const recurring = isRecurringDraft(draft) ? draft : null;
  const role = isFamilyRoleDraft(draft) ? draft : null;
  const once = isOneTimeDraft(draft) ? draft : null;

  const durationDays = growth?.durationDays ?? support?.durationDays ?? role?.durationDays;
  const recurrenceDays =
    growth?.recurrenceDays ?? support?.recurrenceDays ?? recurring?.recurrenceDays
    ?? role?.recurrenceDays ?? [];
  const firstReviewDays =
    growth?.firstReviewAfterDays ?? support?.firstReviewAfterDays
    ?? role?.firstReviewAfterDays ?? 0;
  const reviewDate = dateStringPlusDays(draft.startDate, firstReviewDays);

  const usesWeeklyFrequency = recurring?.scheduleMode === 'weekly_frequency';

  const timeLabel = growth
    ? (growth.preferredTime === 'custom'
        ? growth.preferredTimeCustom || '自訂'
        : PREFERRED_TIME_OPTIONS.find(o => o.id === growth.preferredTime)?.label ?? '')
    : support
      ? (support.supportTime === 'custom'
          ? support.supportTimeCustom || '自訂'
          : SUPPORT_TIME_OPTIONS.find(o => o.id === support.supportTime)?.label ?? '')
      : recurring || once
        ? (() => {
            // 固定任務與單次任務共用同一組時段選項。
            const scheduled = recurring ?? once;
            if (!scheduled) return '';
            if (scheduled.preferredTime === 'custom') {
              return scheduled.preferredTimeCustom || '自訂';
            }
            return RECURRING_TIME_OPTIONS.find(o => o.id === scheduled.preferredTime)?.label ?? '';
          })()
        : '';

  /**
   * 安全提示與政策界線去重。
   * 家庭角色的安全政策已在上方整段列出，同一句就不要在下面再出現一次；
   * policyFlags 與 safetyNotes 若寫了同一句，也只顯示一次。
   */
  const safetyNotes = Array.from(new Set(variant.safetyNotes ?? [])).filter(
    note => !(role && FAMILY_ROLE_SAFETY_POLICY.includes(note)),
  );
  const policyFlags = Array.from(new Set(variant.policyFlags ?? [])).filter(
    flag => !safetyNotes.includes(flag),
  );

  const roleLabel = (() => {
    if (!role) return '';
    if (role.roleOptionId === 'other') return role.customRoleValue || '自訂角色';
    const group = variant.optionGroups[0];
    // 角色是必填，validator 會擋在預覽之前；找不到就留空、不寫「尚未選擇」。
    return group?.options.find(o => o.id === role.roleOptionId)?.label ?? '';
  })();

  return (
    <View style={s.stack}>
      <View style={s.head}>
        <PresetGlyph kind={family.iconKey} category={draft.purposeCategory} size={54} />
        <View style={s.headText}>
          <Text style={s.eyebrow}>預覽（尚未建立）</Text>
          <Text style={s.title}>{draft.title}</Text>
          <Text style={s.subtitle}>
            {PURPOSE_LABEL[draft.purposeCategory]}｜{variantFormLabel(variant)}
          </Text>
        </View>
      </View>

      <Block title="內容">
        {role ? <Row label="角色" value={roleLabel} /> : null}
        {optionText(draft, variant).map(item => (
          <Row key={item.label} label={item.label} value={item.value} />
        ))}
        {support && support.focusOptionIds.length > 0 ? (
          <Row label="本次焦點" value={`${support.focusOptionIds.length} 項`} />
        ) : null}
        {role ? <Row label="負責範圍" value={role.scopeDescription || '未填寫'} /> : null}
        {once ? <Row label="這次要完成" value={once.taskDetails || '未填寫'} /> : null}
        <Row label={role ? '家長期待' : '原始期待'} value={draft.originalExpectation || '未填寫'} />
        {/* 補充說明沒填就不佔一列，避免預覽出現一整排「未填寫」。 */}
        {once && once.notes.trim() ? <Row label="補充說明" value={once.notes} /> : null}
      </Block>

      <Block title="安排">
        {once ? (
          <Row label="安排日期" value={once.scheduledDate} />
        ) : usesWeeklyFrequency ? (
          <Row label="執行頻率" value={`每週約 ${recurring?.weeklyFrequency ?? 0} 次`} />
        ) : (
          <Row label="執行日" value={weekdayText(recurrenceDays)} />
        )}
        {growth || recurring ? (
          <Row
            label="每次時間"
            value={
              (growth ?? recurring)?.minutesPerSession === undefined
                ? '不設定固定分鐘'
                : `${(growth ?? recurring)?.minutesPerSession} 分鐘`
            }
          />
        ) : null}
        {once ? (
          <Row
            label="預估時間"
            value={
              once.estimatedMinutes === undefined
                ? '不設定固定分鐘'
                : `${once.estimatedMinutes} 分鐘`
            }
          />
        ) : null}
        <Row label="時段" value={timeLabel || '未設定'} />
        {durationDays ? (
          <Row label={role ? '試行期間' : '計畫期間'} value={`${durationDays} 天`} />
        ) : null}
        {once ? null : <Row label="開始日期" value={draft.startDate} />}
        <Row
          label="提醒方式"
          value={REMINDER_OPTIONS.find(o => o.id === draft.reminderMode)?.label ?? '不提醒'}
        />
        {recurring ? (
          <Row
            label="定期回顧"
            value={
              recurring.reviewEnabled && recurring.reviewAfterDays
                ? `${recurring.reviewAfterDays} 天後一起看看`
                : '不設定'
            }
          />
        ) : null}
        {growth || support || role ? (
          <Row
            label="第一次回顧"
            value={
              firstReviewDays > 0
                ? `第 ${firstReviewDays} 天${reviewDate ? `（${reviewDate}）` : ''}`
                : '不設定'
            }
          />
        ) : null}
        {role ? (
          <Row
            label="家長協助"
            value={
              SUPPORT_LEVEL_OPTIONS.find(o => o.id === role.supportLevel)?.label ?? '未設定'
            }
          />
        ) : null}
        {once ? (
          <Row
            label="家長協助"
            value={
              ONE_TIME_SUPPORT_OPTIONS.find(o => o.id === once.supportLevel)?.label ?? '未設定'
            }
          />
        ) : null}
      </Block>

      {usesWeeklyFrequency ? (
        <LocalOnlyNotice>{LOCAL_ONLY_WEEKLY_FREQUENCY}</LocalOnlyNotice>
      ) : null}
      {once ? <LocalOnlyNotice>{LOCAL_ONLY_SCHEDULED_DATE}</LocalOnlyNotice> : null}

      {decision ? <RewardDecisionBlock decision={decision} /> : null}

      <Block title="回饋與結束">
        <Row
          label="回饋方式"
          value={REWARD_POLICY_SHORT_LABEL[draft.rewardPolicy] ?? draft.rewardPolicy}
        />
        <Row label="怎麼算結束" value={COMPLETION_LABEL[variant.completionPolicy]} />
        {growth ? <Row label="怎樣算完成" value={growth.completionDescription} /> : null}
        {support ? <Row label="怎樣算逐漸穩定" value={support.successDescription} /> : null}
        {recurring ? <Row label="怎樣算完成" value={recurring.completionDescription} /> : null}
        {once ? <Row label="怎樣算完成" value={once.completionDescription} /> : null}
        {role ? <Row label="貢獻紀錄" value={role.contributionDescription} /> : null}
        {role ? <Row label="可跳過情況" value={role.exceptionDescription} /> : null}
      </Block>

      {role ? (
        <Block title="家庭貢獻如何被看見">
          {FAMILY_ROLE_CONTRIBUTION_ITEMS.map((item, index) => (
            <Row key={item} label={`${index + 1}`} value={item} />
          ))}
        </Block>
      ) : null}

      {/* 與 FamilyRoleEditor 用同一個元件與同一份文案，兩邊不會各說各話。 */}
      {role ? (
        <Block title="期間結束後">
          <ReadOnlyOutcomeList
            intro={FAMILY_ROLE_ENDING_INTRO}
            items={FAMILY_ROLE_ENDING_OPTIONS}
          />
        </Block>
      ) : null}

      {role ? (
        <Block title="負責的具體內容">
          {role.responsibilityItems.filter(item => item.enabled).map((item, index) => (
            <Row key={item.id} label={`${index + 1}`} value={item.text} />
          ))}
        </Block>
      ) : null}

      {growth ? (
        <Block title="里程碑">
          {growth.milestones.filter(m => m.enabled).map((m, index) => (
            <Row
              key={m.id}
              label={`${index + 1}`}
              value={m.targetDay ? `${m.title}（約第 ${m.targetDay} 天）` : m.title}
            />
          ))}
        </Block>
      ) : null}

      {support ? (
        <Block title="支援步驟">
          {support.supportSteps.filter(step => step.enabled).map((step, index) => (
            <Row key={step.id} label={`${index + 1}`} value={step.text} />
          ))}
        </Block>
      ) : null}

      {role ? (
        <PolicyNotice
          tone="warn"
          title={FAMILY_ROLE_SAFETY_TITLE}
          details={FAMILY_ROLE_SAFETY_POLICY}
          expandLabel={FAMILY_ROLE_SAFETY_EXPAND_LABEL}
        >
          {FAMILY_ROLE_SAFETY_SUMMARY}
        </PolicyNotice>
      ) : null}

      {variant.feedbackHint ? <PolicyNotice>{variant.feedbackHint}</PolicyNotice> : null}

      {safetyNotes.map(note => <PolicyNotice key={note}>{note}</PolicyNotice>)}
      {policyFlags.map(flag => (
        <PolicyNotice key={flag} tone="warn">{flag}</PolicyNotice>
      ))}
      {/* 「確認建立尚未開放」的說明放在固定 footer（LOCAL_ONLY_CREATE），
          那裡永遠看得到，不必在內容尾端再講一次。 */}
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
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
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
    color: ParentColors.fgMuted,
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
    // 上下各收 5px；預覽是掃讀畫面，行距比留白重要。
    paddingHorizontal: ParentSpacing[5],
    paddingVertical: ParentSpacing[5] - 5,
    borderRadius: ParentRadii.lg,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
    gap: ParentSpacing[2],
  },
  blockTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  blockBody: {
    gap: ParentSpacing[2],
  },
  // 回饋決策
  /**
   * 用淡松綠底而不是琥珀／金色。
   * 金色會把「這件事值多少幣」變成畫面上最強的訊號，
   * 而抽屜的立場是幣值只是回饋方式之一，不是任務的目的。
   */
  rewardCard: {
    paddingHorizontal: ParentSpacing[5],
    paddingVertical: ParentSpacing[5] - 5,
    borderRadius: ParentRadii.lg,
    borderWidth: 1,
    borderColor: ParentColors.pine300,
    backgroundColor: ParentColors.tintPine,
    gap: ParentSpacing[2],
  },
  rewardTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pine500,
  },
  rewardAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: ParentSpacing[1],
  },
  rewardAmount: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h2,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    lineHeight: 34,
  },
  rewardAmountUnit: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgSecondary,
  },
  rewardBody: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 22,
    color: ParentColors.fgSecondary,
  },
  rewardVersion: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  basis: {
    gap: ParentSpacing[2],
    paddingTop: ParentSpacing[1],
  },
  basisToggle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.pine500,
  },
  basisBody: {
    gap: ParentSpacing[1],
  },
  /** 柔和說明，不是紅色錯誤：家長沒有做錯任何事，是能力在中途失效了。 */
  rewardBlocked: {
    paddingHorizontal: ParentSpacing[5],
    paddingVertical: ParentSpacing[5] - 5,
    borderRadius: ParentRadii.lg,
    borderWidth: 1,
    borderColor: ParentColors.dangerSoftBorder,
    backgroundColor: ParentColors.dangerSoftBg,
    gap: ParentSpacing[2],
  },
  rewardBlockedTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.dangerSoft,
  },
  rewardBlockedBody: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 22,
    color: ParentColors.fgSecondary,
  },
  rewardBlockedHint: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 20,
    color: ParentColors.fgMuted,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ParentSpacing[4],
  },
  rowLabel: {
    width: 84,
    // 標籤最長六個字，給足寬度避免被擠成一字一行。
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
