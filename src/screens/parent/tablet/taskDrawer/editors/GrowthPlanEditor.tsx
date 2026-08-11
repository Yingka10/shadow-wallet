// Shadow Wallet · Parent Tablet — 成長計畫編輯器
//
// 四個區塊：家長期待 → 適齡起點 → 最終採用版本 → 回饋與回顧。
// 「適齡起點」的內容來自 catalog 與 draftLabels 的固定產品文案，**不是 AI 輸出**，
// 畫面上不得出現 AI 字樣。

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
import type { OptionGroup, TaskPresetFamily, TaskPresetVariant } from '../taskCatalog';
import {
  CHILD_PROPOSAL_HINT,
  DRAFT_FALLBACKS,
  MINUTE_CHOICES,
  PREFERRED_TIME_OPTIONS,
  LOCAL_ONLY_REMINDER,
  REMINDER_OPTIONS,
  dateStringPlusDays,
  growthPlanCopy,
  localDateWithOffset,
  type GrowthPlanDraft,
  type TaskDraftValidationErrors,
} from '../taskDraft';
import { EditorField, EditorHeader, EditorSection } from './EditorSection';
import {
  AutoGrowTextInput,
  DraftTextInput,
  DurationPicker,
  FieldLabel,
  HelperText,
  OptionGroupField,
  LocalOnlyNotice,
  MinutePicker,
  PolicyNotice,
  RewardPolicyChips,
  SelectableChip,
  SelectableRow,
  StartDatePicker,
  ToggleRow,
  ValidationMessage,
  WeekdayPicker,
} from './EditorControls';
import { CUSTOM_DURATION_DAY_CHOICES, CUSTOM_TASK_BADGE } from '../customTask/customTaskCopy';

export function GrowthPlanEditor({
  family,
  variant,
  draft,
  childName,
  ageGroup,
  errors,
  showErrors,
  minuteCustomText,
  onMinuteCustomTextChange,
  onChange,
}: {
  /** preset 的家族與版本。**自訂任務兩者都是 undefined。** */
  family?: TaskPresetFamily;
  variant?: TaskPresetVariant;
  draft: GrowthPlanDraft;
  childName: string;
  /** 決定政策算不算得出幣值；沒有孩子資料時為 undefined。 */
  ageGroup?: string;
  errors: TaskDraftValidationErrors;
  /** 只有按過「預覽最終版本」之後才把錯誤顯示出來，避免一進畫面滿江紅。 */
  showErrors: boolean;
  minuteCustomText: string;
  onMinuteCustomTextChange: (v: string) => void;
  onChange: (next: GrowthPlanDraft) => void;
}) {
  const copy = growthPlanCopy(family?.id);
  const err = (key: keyof TaskDraftValidationErrors | string) =>
    showErrors ? (errors as Record<string, string | undefined>)[key as string] : undefined;

  const patch = (partial: Partial<GrowthPlanDraft>) => onChange({ ...draft, ...partial });

  const toggleOption = (group: OptionGroup, optionId: string) => {
    const current = draft.selectedOptions[group.id] ?? [];
    const next =
      group.selection === 'single'
        ? current.includes(optionId) ? [] : [optionId]
        : current.includes(optionId)
          ? current.filter(id => id !== optionId)
          : [...current, optionId];
    patch({ selectedOptions: { ...draft.selectedOptions, [group.id]: next } });
  };

  const reviewDate = dateStringPlusDays(draft.startDate, draft.firstReviewAfterDays);
  // preset 看家族掛在哪些瀏覽分類；自訂任務沒有家族，直接看它的目的。
  const canBeChildChallenge = family
    ? family.browseCategories.includes('autonomous_challenge')
    : draft.purposeCategory === 'autonomous_challenge';

  return (
    <View style={s.stack}>
      <EditorHeader
        title={family?.title ?? draft.title}
        meta={`${variant?.label ?? CUSTOM_TASK_BADGE}｜成長計畫｜建議 ${
          variant?.defaultDraft.durationDays ?? draft.durationDays
        } 天`}
      />

      {/* ── A. 家長原始期待 ──────────────────────────────────────────── */}
      <EditorSection
        title="家長原始期待"
        helper="先寫下你希望這個計畫帶來什麼改變，系統不會直接覆蓋這段內容。"
      >
        <EditorField>
          <AutoGrowTextInput
            value={draft.originalExpectation}
            onChangeText={v => patch({ originalExpectation: v })}
            placeholder="例如：希望能慢慢找到自己願意持續的節奏。"
            accessibilityLabel="家長原始期待"
          />
        </EditorField>
      </EditorSection>

      {/* ── B. 適齡起點（產品文案，非 AI） ───────────────────────────── */}
      <EditorSection title="適齡起點" helper="依孩子年齡與這個主題整理的起始建議，可以直接改。">
        <View style={s.suggestionCard}>
          <Text style={s.suggestionName}>{copy.suggestionName}</Text>
          <Text style={s.suggestionBody}>{copy.suggestionArrangement(childName)}</Text>

          <View style={s.reasonList}>
            {copy.suggestionReasons.map(reason => (
              <View key={reason} style={s.reasonRow}>
                <View style={s.reasonDot} />
                <Text style={s.reasonText}>{reason}</Text>
              </View>
            ))}
          </View>

          {/*
            期間、第一週可調整、和孩子一起決定都收成 chip。
            這三件事原本各自是一整句，和上面的說明講的是同一件事。
          */}
          <View style={s.suggestionMetaRow}>
            <View style={s.metaChip}>
              <Text style={s.metaChipText}>
                {variant?.defaultDraft.durationDays ?? draft.durationDays} 天
              </Text>
            </View>
            <View style={s.metaChip}>
              <Text style={s.metaChipText}>第一週可調整</Text>
            </View>
            {variant?.requiresChildChoice ? (
              <View style={s.metaChip}>
                <Text style={s.metaChipText}>和孩子一起決定</Text>
              </View>
            ) : null}
          </View>
        </View>
      </EditorSection>

      {/* ── C. 最終採用版本 ──────────────────────────────────────────── */}
      <EditorSection variant="plain" title="最終採用版本" helper="這是實際會建立的內容，隨時可以再調整。">
        <EditorField>
          <FieldLabel required>計畫名稱</FieldLabel>
          <DraftTextInput
            value={draft.title}
            onChangeText={v => patch({ title: v })}
            errorText={err('title')}
            accessibilityLabel="計畫名稱"
          />
          <ValidationMessage>{err('title')}</ValidationMessage>
        </EditorField>

        {(variant?.optionGroups ?? []).map(group => (
          <OptionGroupField
            key={group.id}
            group={group}
            selectedIds={draft.selectedOptions[group.id] ?? []}
            customValue={draft.customOptionValues[group.id] ?? ''}
            onToggle={optionId => toggleOption(group, optionId)}
            onCustomChange={v =>
              patch({ customOptionValues: { ...draft.customOptionValues, [group.id]: v } })
            }
            optionError={err(`option:${group.id}`)}
            customError={err(`customOption:${group.id}`)}
          />
        ))}

        <EditorField>
          <FieldLabel required>每週執行日</FieldLabel>
          <HelperText>至少選一天。之後仍可以依實際狀況調整。</HelperText>
          <WeekdayPicker
            value={draft.recurrenceDays}
            onChange={days => patch({ recurrenceDays: days })}
          />
          <ValidationMessage>{err('recurrenceDays')}</ValidationMessage>
        </EditorField>

        {copy.showMinutes ? (
          <EditorField>
            <FieldLabel>每次時間</FieldLabel>
            {copy.allowNoMinutes ? (
              <HelperText>這個主題的投入時間常不固定，也可以不設定分鐘數。</HelperText>
            ) : null}
            <MinutePicker
              value={draft.minutesPerSession}
              choices={MINUTE_CHOICES}
              allowNone={copy.allowNoMinutes}
              onChange={m =>
                patch(
                  m === undefined
                    ? { minutesPerSession: undefined }
                    : { minutesPerSession: m },
                )
              }
              customText={minuteCustomText}
              onCustomTextChange={onMinuteCustomTextChange}
              error={err('minutesPerSession')}
            />
          </EditorField>
        ) : null}

        <EditorField>
          <FieldLabel>適合時段</FieldLabel>
          <View style={s.chipRow}>
            {PREFERRED_TIME_OPTIONS.map(option => (
              <SelectableChip
                key={option.id}
                label={option.label}
                selected={draft.preferredTime === option.id}
                onPress={() => patch({ preferredTime: option.id })}
              />
            ))}
          </View>
          {draft.preferredTime === 'custom' ? (
            <>
              <DraftTextInput
                value={draft.preferredTimeCustom ?? ''}
                onChangeText={v => patch({ preferredTimeCustom: v })}
                placeholder="例如：週三社團結束後"
                errorText={err('preferredTimeCustom')}
                accessibilityLabel="自訂時段"
              />
              <ValidationMessage>{err('preferredTimeCustom')}</ValidationMessage>
            </>
          ) : null}
        </EditorField>

        <EditorField>
          <FieldLabel required>計畫期間</FieldLabel>
          <DurationPicker
            value={draft.durationDays}
            choices={
              variant?.defaultDraft.durationDayChoices
              ?? CUSTOM_DURATION_DAY_CHOICES.growth_plan
            }
            onChange={days => patch({ durationDays: days })}
          />
          <ValidationMessage>{err('durationDays')}</ValidationMessage>
        </EditorField>

        <EditorField>
          <FieldLabel required>開始日期</FieldLabel>
          <StartDatePicker
            value={draft.startDate}
            onChange={v => patch({ startDate: v })}
            todayValue={localDateWithOffset(0)}
            tomorrowValue={localDateWithOffset(1)}
            error={err('startDate')}
          />
        </EditorField>

        <EditorField>
          <FieldLabel>提醒方式</FieldLabel>
          <View style={s.chipRow}>
            {REMINDER_OPTIONS.map(option => (
              <SelectableChip
                key={option.id}
                label={option.label}
                selected={draft.reminderMode === option.id}
                onPress={() => patch({ reminderMode: option.id })}
              />
            ))}
          </View>
          <LocalOnlyNotice>{LOCAL_ONLY_REMINDER}</LocalOnlyNotice>
        </EditorField>
      </EditorSection>

      {/* ── D. 回饋與回顧 ────────────────────────────────────────────── */}
      <EditorSection variant="plain" title="回饋與回顧" helper="決定這個計畫怎麼被看見，以及什麼時候一起檢視。">
        <EditorField>
          <ToggleRow
            label="第一週回顧"
            description={
              reviewDate
                ? `第一次回顧日：${reviewDate}（第 ${draft.firstReviewAfterDays} 天）`
                : `第 ${draft.firstReviewAfterDays} 天`
            }
            value={draft.firstReviewAfterDays > 0}
            onChange={on =>
              patch({ firstReviewAfterDays: on ? DRAFT_FALLBACKS.firstReviewDays : 0 })
            }
          />
          <ToggleRow
            label="週末一起回顧"
            description="週末花幾分鐘確認時間與難度是否合適"
            value={draft.weekendReviewEnabled}
            onChange={on => patch({ weekendReviewEnabled: on })}
          />
        </EditorField>

        <EditorField>
          <FieldLabel required>里程碑</FieldLabel>
          <HelperText>可以改文字、關掉不需要的，或自己新增，至少保留一個。</HelperText>
          <View style={s.milestoneList}>
            {draft.milestones.map((milestone, index) => (
              <View key={milestone.id} style={s.milestoneRow}>
                <View style={s.milestoneIndex}>
                  <Text style={s.milestoneIndexText}>{index + 1}</Text>
                </View>
                <View style={s.milestoneMain}>
                  <DraftTextInput
                    value={milestone.title}
                    onChangeText={v => {
                      const next = [...draft.milestones];
                      next[index] = { ...milestone, title: v };
                      patch({ milestones: next });
                    }}
                    accessibilityLabel={`第 ${index + 1} 個里程碑`}
                  />
                  {milestone.targetDay ? (
                    <Text style={s.milestoneDay}>約第 {milestone.targetDay} 天</Text>
                  ) : null}
                </View>
                <SelectableChip
                  label={milestone.enabled ? '使用中' : '已關閉'}
                  selected={milestone.enabled}
                  onPress={() => {
                    const next = [...draft.milestones];
                    next[index] = { ...milestone, enabled: !milestone.enabled };
                    patch({ milestones: next });
                  }}
                />
              </View>
            ))}
          </View>
          <ValidationMessage>{err('milestones')}</ValidationMessage>

          {draft.milestones.length < DRAFT_FALLBACKS.maxMilestones ? (
            <SelectableChip
              label="新增一個里程碑"
              selected={false}
              onPress={() =>
                patch({
                  milestones: [
                    ...draft.milestones,
                    {
                      id: `custom-${Date.now()}`,
                      title: '',
                      isEditable: true,
                      enabled: true,
                    },
                  ],
                })
              }
            />
          ) : null}
        </EditorField>

        <EditorField>
          <FieldLabel required>怎樣算完成</FieldLabel>
          <AutoGrowTextInput
            value={draft.completionDescription}
            onChangeText={v => patch({ completionDescription: v })}
            errorText={err('completionDescription')}
            minHeight={70}
            accessibilityLabel="怎樣算完成"
          />
          <ValidationMessage>{err('completionDescription')}</ValidationMessage>
        </EditorField>

        <EditorField>
          {/* 自訂任務的區塊標題由 CustomTaskRewardSection 自己畫（「怎麼被看見」），
              這裡再加一行「回饋方式」會變成兩個標題疊在一起。 */}
          {variant ? <FieldLabel>回饋方式</FieldLabel> : null}
          <RewardPolicyChips
            variant={variant}
            draft={draft}
            ageGroup={ageGroup}
            error={err('rewardPolicy')}
            onChange={policy => patch({ rewardPolicy: policy })}
          />
        </EditorField>

        {canBeChildChallenge ? <PolicyNotice>{CHILD_PROPOSAL_HINT}</PolicyNotice> : null}

        {variant?.policyFlags?.map(flag => (
          <PolicyNotice key={flag} tone="warn">{flag}</PolicyNotice>
        ))}
      </EditorSection>
    </View>
  );
}

const s = StyleSheet.create({
  stack: {
    gap: ParentSpacing[4],
  },

  suggestionCard: {
    padding: ParentSpacing[4],
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.tintLeaf,
    gap: ParentSpacing[2],
  },
  suggestionName: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.leaf700,
    lineHeight: 22,
  },
  suggestionBody: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 22,
    color: ParentColors.fgSecondary,
  },
  reasonList: {
    gap: 6,
    marginTop: 2,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ParentSpacing[2],
  },
  reasonDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
    backgroundColor: ParentColors.leaf500,
    flexShrink: 0,
  },
  reasonText: {
    flex: 1,
    minWidth: 0,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 20,
    color: ParentColors.fgSecondary,
  },
  metaChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: ParentRadii.sm,
    backgroundColor: ParentColors.bgSurface,
  },
  metaChipText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },
  suggestionMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ParentSpacing[2],
    marginTop: 2,
  },
  suggestionMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  suggestionChildNote: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.leaf700,
    lineHeight: 20,
  },

  optionList: {
    gap: ParentSpacing[2],
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ParentSpacing[2],
  },

  milestoneList: {
    gap: ParentSpacing[2],
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ParentSpacing[3],
  },
  milestoneIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.tintPine,
    marginTop: 10,
    flexShrink: 0,
  },
  milestoneIndexText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pine500,
  },
  milestoneMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  milestoneDay: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
});
