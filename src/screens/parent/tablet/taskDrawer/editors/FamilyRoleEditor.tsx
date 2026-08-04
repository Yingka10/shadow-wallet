// Shadow Wallet · Parent Tablet — 家庭角色編輯器
//
// 產品語意：孩子在一段期間內承擔一個清楚的家庭角色，試行與回顧後，
// 再決定繼續、換角色或結束。不是一般固定家事，也不是可賺幣的長期挑戰。
//
// 硬規則：rewardPolicy 固定 family_contribution、completionPolicy 固定
// review_and_continue，畫面不出現成長幣、時間儲蓄、金額或幣值調整。
//
// 語氣：共同生活、承擔一小部分、說清楚範圍、可以重新協商。
// 不使用服從、聽話、連續成功、中斷歸零這類說法。

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
import type { TaskPresetFamily, TaskPresetVariant } from '../taskCatalog';
import {
  DRAFT_FALLBACKS,
  FAMILY_ROLE_CONTRIBUTION_ITEMS,
  FAMILY_ROLE_ENDING_INTRO,
  FAMILY_ROLE_ENDING_NOTE,
  FAMILY_ROLE_ENDING_OPTIONS,
  FAMILY_ROLE_SAFETY_EXPAND_LABEL,
  FAMILY_ROLE_SAFETY_POLICY,
  FAMILY_ROLE_SAFETY_SUMMARY,
  FAMILY_ROLE_SAFETY_TITLE,
  SUPPORT_LEVEL_OPTIONS,
  dateStringPlusDays,
  familyRoleCopy,
  localDateWithOffset,
  type FamilyRoleDraft,
  type TaskDraftValidationErrors,
} from '../taskDraft';
import { EditorField, EditorHeader, EditorSection } from './EditorSection';
import {
  AutoGrowTextInput,
  CompactOptionGrid,
  DraftTextInput,
  DurationPicker,
  FieldLabel,
  HelperText,
  PolicyNotice,
  ReadOnlyOutcomeList,
  ResponsibilityListEditor,
  StartDatePicker,
  SupportLevelPicker,
  ToggleRow,
  ValidationMessage,
  WeekdayPicker,
} from './EditorControls';
import {
  CUSTOM_DURATION_DAY_CHOICES,
  CUSTOM_ROLE_EMPTY_RESPONSIBILITIES_HELPER,
  CUSTOM_ROLE_NAME_LABEL,
  CUSTOM_ROLE_NAME_PLACEHOLDER,
  CUSTOM_TASK_BADGE,
} from '../customTask/customTaskCopy';

export function FamilyRoleEditor({
  family,
  variant,
  draft,
  childName,
  errors,
  showErrors,
  onChange,
  onRequestRoleChange,
}: {
  /** preset 的家族與版本。**自訂任務兩者都是 undefined。** */
  family?: TaskPresetFamily;
  variant?: TaskPresetVariant;
  draft: FamilyRoleDraft;
  childName: string;
  errors: TaskDraftValidationErrors;
  showErrors: boolean;
  onChange: (next: FamilyRoleDraft) => void;
  /**
   * 換角色會重建責任項目。若家長已改過責任內容，呼叫端要先走既有的
   * discard 確認，不可無聲覆蓋 —— 所以這裡只「請求」，不自己套用。
   */
  onRequestRoleChange: (roleOptionId: string) => void;
}) {
  const copy = familyRoleCopy(family?.id);
  const err = (key: string) =>
    showErrors ? (errors as Record<string, string | undefined>)[key] : undefined;

  const patch = (partial: Partial<FamilyRoleDraft>) => onChange({ ...draft, ...partial });

  const roleGroup = variant?.optionGroups[0];
  const reviewDate = dateStringPlusDays(draft.startDate, draft.firstReviewAfterDays);
  const enabledCount = draft.responsibilityItems.filter(item => item.enabled).length;
  const overSoftLimit = enabledCount > DRAFT_FALLBACKS.responsibilitySoftLimit;

  // 同一句安全提醒不要在政策段與 variant 段各出現一次。
  const extraSafetyNotes = (variant?.safetyNotes ?? []).filter(
    note => !FAMILY_ROLE_SAFETY_POLICY.includes(note),
  );

  return (
    <View style={s.stack}>
      <EditorHeader
        title={family?.title ?? draft.title}
        meta={`${variant?.label ?? CUSTOM_TASK_BADGE}｜家庭角色｜試行 ${draft.durationDays} 天`}
      />

      {/* ── A. 選擇角色 ──────────────────────────────────────────────── */}
      <EditorSection
        title="選擇角色"
        helper="角色應是共同生活中的一小部分，不是替大人包辦整套家務。"
      >
        <EditorField>
          <FieldLabel>希望孩子參與的家庭角色</FieldLabel>
          <AutoGrowTextInput
            value={draft.originalExpectation}
            onChangeText={v => patch({ originalExpectation: v })}
            placeholder={`例如：希望${childName}能負責一項清楚的家庭分工。`}
            accessibilityLabel="家長期待"
          />
        </EditorField>

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

        {roleGroup ? (
          <EditorField>
            <FieldLabel required>{roleGroup.label}</FieldLabel>
            {/* 角色標籤都在七個字以內，兩欄可以一次看完六個選項。 */}
            <CompactOptionGrid
              options={roleGroup.options}
              selectedIds={draft.roleOptionId ? [draft.roleOptionId] : []}
              selection="single"
              onToggle={optionId => onRequestRoleChange(optionId)}
              hasError={!!err('roleOptionId')}
              groupLabel={roleGroup.label}
            />
            <ValidationMessage>{err('roleOptionId')}</ValidationMessage>

            {draft.roleOptionId === 'other' ? (
              <>
                <DraftTextInput
                  value={draft.customRoleValue ?? ''}
                  onChangeText={v => patch({ customRoleValue: v })}
                  placeholder="請填寫角色名稱"
                  errorText={err('customRoleValue')}
                  accessibilityLabel="自訂角色名稱"
                />
                <ValidationMessage>{err('customRoleValue')}</ValidationMessage>
              </>
            ) : null}
          </EditorField>
        ) : (
          /*
            自訂任務沒有角色清單可選 —— 那不是「清單還沒載入」，
            是這種來源本來就沒有。所以直接給一個輸入框，
            而不是把家長留在一個空的選單前面。
          */
          <EditorField>
            <FieldLabel required>{CUSTOM_ROLE_NAME_LABEL}</FieldLabel>
            <DraftTextInput
              value={draft.customRoleValue ?? ''}
              onChangeText={v => patch({ customRoleValue: v })}
              placeholder={CUSTOM_ROLE_NAME_PLACEHOLDER}
              errorText={err('customRoleValue')}
              accessibilityLabel={CUSTOM_ROLE_NAME_LABEL}
            />
            <ValidationMessage>{err('customRoleValue')}</ValidationMessage>
          </EditorField>
        )}
      </EditorSection>

      {/* ── B. 說清楚負責範圍 ────────────────────────────────────────── */}
      <EditorSection variant="plain" title="說清楚負責範圍" helper="範圍越具體，孩子越知道自己做到哪裡就算完成。">
        <EditorField>
          <FieldLabel required>負責的具體內容</FieldLabel>
          <HelperText>
            {roleGroup
              ? '可以改文字或關掉，建議留 2–4 項，最多 5 項。'
              : CUSTOM_ROLE_EMPTY_RESPONSIBILITIES_HELPER}
          </HelperText>
          {/*
            preset：還沒選角色時給一句說明（選了就會帶出建議項目）。
            自訂：永遠不會有建議項目，所以直接開放新增 ——
            顯示「先選一個角色」等於指向一個不存在的選單。
          */}
          {roleGroup && draft.responsibilityItems.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyText}>先選一個角色，就會帶出建議的負責內容。</Text>
            </View>
          ) : (
            <ResponsibilityListEditor
              items={draft.responsibilityItems}
              maxItems={DRAFT_FALLBACKS.maxResponsibilityItems}
              onChange={items => patch({ responsibilityItems: items })}
            />
          )}
          <ValidationMessage>{err('responsibilityItems')}</ValidationMessage>
          {overSoftLimit ? (
            <PolicyNotice tone="warn">
              一次負責超過四項時，範圍容易變得模糊。可以先留下最清楚的幾項。
            </PolicyNotice>
          ) : null}
        </EditorField>

        <EditorField>
          <FieldLabel required>負責範圍</FieldLabel>
          <HelperText>
            說清楚在哪裡、負責哪些東西，避免只寫「整理客廳」或「照顧寵物」。
          </HelperText>
          <AutoGrowTextInput
            value={draft.scopeDescription}
            onChangeText={v => patch({ scopeDescription: v })}
            placeholder="例如：只負責客廳玩具籃與旁邊的一小塊區域。"
            errorText={err('scopeDescription')}
            minHeight={70}
            accessibilityLabel="負責範圍"
          />
          <ValidationMessage>{err('scopeDescription')}</ValidationMessage>
        </EditorField>

        {/*
          八條禁止事項全文攤開是一大片琥珀色，視覺重量遠高於它在流程中的份量。
          改成摘要 + 可展開：內容一個字都沒少，validator 也完全沒動。
        */}
        <PolicyNotice
          tone="warn"
          title={FAMILY_ROLE_SAFETY_TITLE}
          details={FAMILY_ROLE_SAFETY_POLICY}
          expandLabel={FAMILY_ROLE_SAFETY_EXPAND_LABEL}
        >
          {FAMILY_ROLE_SAFETY_SUMMARY}
        </PolicyNotice>
        {extraSafetyNotes.map(note => (
          <PolicyNotice key={note} tone="warn">{note}</PolicyNotice>
        ))}
      </EditorSection>

      {/* ── C. 試行安排 ──────────────────────────────────────────────── */}
      <EditorSection variant="plain" title="試行安排" helper="先試一段時間，過程中都可以一起調整。">
        <EditorField>
          <FieldLabel required>執行日</FieldLabel>
          <HelperText>至少選一天。</HelperText>
          <WeekdayPicker
            value={draft.recurrenceDays}
            onChange={days => patch({ recurrenceDays: days })}
          />
          <ValidationMessage>{err('recurrenceDays')}</ValidationMessage>
        </EditorField>

        <EditorField>
          <FieldLabel required>試行期間</FieldLabel>
          <DurationPicker
            value={draft.durationDays}
            choices={
              variant?.defaultDraft.durationDayChoices
              ?? CUSTOM_DURATION_DAY_CHOICES.family_role
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
          <FieldLabel required>家長一開始怎麼協助</FieldLabel>
          <SupportLevelPicker
            value={draft.supportLevel}
            options={SUPPORT_LEVEL_OPTIONS}
            onChange={level => patch({ supportLevel: level })}
          />
          <ValidationMessage>{err('supportLevel')}</ValidationMessage>
        </EditorField>

        <EditorField>
          <FieldLabel required>可以跳過或重新討論的情況</FieldLabel>
          <AutoGrowTextInput
            value={draft.exceptionDescription}
            onChangeText={v => patch({ exceptionDescription: v })}
            errorText={err('exceptionDescription')}
            minHeight={70}
            accessibilityLabel="例外情況"
          />
          <ValidationMessage>{err('exceptionDescription')}</ValidationMessage>
        </EditorField>
      </EditorSection>

      {/* ── D. 家庭貢獻與回顧 ────────────────────────────────────────── */}
      <EditorSection variant="plain" title="家庭貢獻與回顧" helper="這段參與怎麼被看見，以及期滿後要一起決定什麼。">
        <EditorField>
          <ToggleRow
            label="第一次回顧"
            description={
              reviewDate
                ? `第一次回顧日：${reviewDate}（第 ${draft.firstReviewAfterDays} 天）`
                : `第 ${draft.firstReviewAfterDays} 天`
            }
            value={draft.firstReviewAfterDays > 0}
            onChange={on =>
              patch({
                firstReviewAfterDays: on ? DRAFT_FALLBACKS.familyRoleFirstReviewDays : 0,
              })
            }
          />
          <ValidationMessage>{err('firstReviewAfterDays')}</ValidationMessage>
          <ToggleRow
            label="週末一起回顧"
            description="週末看一下這個角色是不是還合適"
            value={draft.weekendReviewEnabled}
            onChange={on => patch({ weekendReviewEnabled: on })}
          />
        </EditorField>

        <EditorField>
          <FieldLabel>家庭貢獻如何被看見</FieldLabel>
          <View style={s.fixedList}>
            {FAMILY_ROLE_CONTRIBUTION_ITEMS.map(item => (
              <View key={item} style={s.fixedRow}>
                <View style={s.fixedDot} />
                <Text style={s.fixedRowText}>{item}</Text>
              </View>
            ))}
          </View>
          <View style={s.fixedPolicyRow}>
            <Text style={s.fixedPolicyText}>家庭貢獻</Text>
            <Text style={s.fixedPolicyNote}>家庭角色固定不發成長幣</Text>
          </View>
          <ValidationMessage>{err('rewardPolicy')}</ValidationMessage>
        </EditorField>

        <EditorField>
          <FieldLabel required>貢獻紀錄說明</FieldLabel>
          <AutoGrowTextInput
            value={draft.contributionDescription}
            onChangeText={v => patch({ contributionDescription: v })}
            errorText={err('contributionDescription')}
            minHeight={70}
            accessibilityLabel="貢獻紀錄說明"
          />
          <ValidationMessage>{err('contributionDescription')}</ValidationMessage>
        </EditorField>

        <EditorField>
          <FieldLabel>期間結束後</FieldLabel>
          {/*
            這四項不是現在要做的選擇。原本用 disabled chip 呈現，
            看起來就是四顆該按卻按不動的按鈕，家長會以為自己漏填了東西。
          */}
          <ReadOnlyOutcomeList
            intro={FAMILY_ROLE_ENDING_INTRO}
            items={FAMILY_ROLE_ENDING_OPTIONS}
          />
          <HelperText>{FAMILY_ROLE_ENDING_NOTE}</HelperText>
        </EditorField>
      </EditorSection>
    </View>
  );
}

const s = StyleSheet.create({
  stack: { gap: ParentSpacing[4] },
  emptyBox: {
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: ParentSpacing[4],
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: ParentColors.borderMedium,
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  emptyText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 22,
    textAlign: 'center',
    color: ParentColors.fgMuted,
  },
  fixedList: { gap: ParentSpacing[2] },
  fixedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ParentSpacing[2],
  },
  fixedDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 9,
    backgroundColor: ParentColors.pine400,
    flexShrink: 0,
  },
  fixedRowText: {
    flex: 1,
    minWidth: 0,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 22,
    color: ParentColors.fgSecondary,
  },
  fixedPolicyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: ParentSpacing[3],
    minHeight: 44,
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[2],
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.tintPine,
  },
  fixedPolicyText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pine500,
  },
  fixedPolicyNote: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgSecondary,
  },
});
