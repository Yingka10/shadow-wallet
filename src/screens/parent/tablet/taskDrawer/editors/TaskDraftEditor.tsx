// Shadow Wallet · Parent Tablet — Step 2 editor router
//
// 依 draft.editorKind 分派到對應 editor。刻意不把 recurring / one_time 套進
// GrowthPlanEditor —— 欄位需求不同，硬套會產生錯誤的必填與無意義的里程碑。
//
// 這裡用窮盡 switch + assertNever，不留 placeholder 分支：
// catalog 目前 36 個 variant 全部有正式 editor，未來新增 editorKind 卻忘了接，
// 應該在編譯期報錯，而不是在執行期靜靜掉進一個「下一階段完成」的畫面。

import React from 'react';
import type { TaskPresetFamily, TaskPresetVariant } from '../taskCatalog';
import { assertNever, type TaskDraft, type TaskDraftValidationErrors } from '../taskDraft';
import { GrowthPlanEditor } from './GrowthPlanEditor';
import { ShortSupportEditor } from './ShortSupportEditor';
import { RecurringTaskEditor } from './RecurringTaskEditor';
import { FamilyRoleEditor } from './FamilyRoleEditor';
import { OneTimeTaskEditor } from './OneTimeTaskEditor';

export function TaskDraftEditor({
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
  onRequestRoleChange,
}: {
  /**
   * preset 的家族與版本。**自訂任務兩者都是 undefined。**
   *
   * 五支 editor 因此全部改成 optional —— 而不是為自訂任務捏一組假的
   * family / variant 傳進來。假資料會一路帶到草稿、命令與資料庫，
   * 而「這筆任務從哪來」在那之後就永遠答錯了。
   */
  family?: TaskPresetFamily;
  variant?: TaskPresetVariant;
  draft: TaskDraft;
  childName: string;
  /**
   * 孩子的年齡段。回饋方式選單要靠它問政策「這筆任務算不算得出幣值」。
   * 短期支援與家庭角色的回饋是固定的，不需要，所以只往需要的三支傳。
   */
  ageGroup?: string;
  errors: TaskDraftValidationErrors;
  showErrors: boolean;
  minuteCustomText: string;
  onMinuteCustomTextChange: (v: string) => void;
  onChange: (next: TaskDraft) => void;
  /** 家庭角色換角色會重建責任項目，需經呼叫端判斷是否要先確認。 */
  onRequestRoleChange: (roleOptionId: string) => void;
}) {
  switch (draft.editorKind) {
    case 'growth_plan':
      return (
        <GrowthPlanEditor
          family={family}
          variant={variant}
          draft={draft}
          childName={childName}
          ageGroup={ageGroup}
          errors={errors}
          showErrors={showErrors}
          minuteCustomText={minuteCustomText}
          onMinuteCustomTextChange={onMinuteCustomTextChange}
          onChange={onChange}
        />
      );

    case 'short_support':
      return (
        <ShortSupportEditor
          family={family}
          variant={variant}
          draft={draft}
          errors={errors}
          showErrors={showErrors}
          onChange={onChange}
        />
      );

    case 'recurring':
      return (
        <RecurringTaskEditor
          family={family}
          variant={variant}
          draft={draft}
          childName={childName}
          ageGroup={ageGroup}
          errors={errors}
          showErrors={showErrors}
          minuteCustomText={minuteCustomText}
          onMinuteCustomTextChange={onMinuteCustomTextChange}
          onChange={onChange}
        />
      );

    case 'family_role':
      return (
        <FamilyRoleEditor
          family={family}
          variant={variant}
          draft={draft}
          childName={childName}
          errors={errors}
          showErrors={showErrors}
          onChange={onChange}
          onRequestRoleChange={onRequestRoleChange}
        />
      );

    case 'one_time':
      return (
        <OneTimeTaskEditor
          family={family}
          variant={variant}
          draft={draft}
          childName={childName}
          ageGroup={ageGroup}
          errors={errors}
          showErrors={showErrors}
          minuteCustomText={minuteCustomText}
          onMinuteCustomTextChange={onMinuteCustomTextChange}
          onChange={onChange}
        />
      );

    default:
      return assertNever(draft);
  }
}
