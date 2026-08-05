// Shadow Wallet · Parent Tablet — 自訂建立流程的狀態規則
//
// ─────────────────────────────────────────────────────────────────────────
// 全部是純函式。抽屜只負責 useState 與畫面，「什麼時候算改過了」、
// 「什麼時候要重建草稿」、「換入口時哪些東西留著」這三件事寫在這裡。
//
// 為什麼不寫在 onPress 裡：這三件事各自有四、五個觸發點（返回、切換入口、
// 關閉、重新選目的……）。散在 handler 裡的話，補上第六個觸發點的人
// 只會照著最近的那一個抄，而那一個未必是對的。
// ─────────────────────────────────────────────────────────────────────────

import type { TaskEditorKind } from './taskDraft';
import type { TaskCreationPath } from './taskCreationRoute';
import type {
  CustomTaskDurationChoice,
  CustomTaskPurposeChoice,
} from './customTask/customTaskContract';

/**
 * 三個基本設定步驟收集到的東西。
 *
 * 刻意與 `CustomTaskIntake`（domain）分開：那一份的每個欄位都是必填的，
 * 因為它描述的是「一份完整的答案」。這一份描述的是「家長填到一半的畫面」，
 * 所以選擇是可為 null 的。混成同一個型別的話，domain 就得處理
 * 「purposeChoice 還沒選」這種它根本不該知道的狀態。
 */
export type CustomIntakeState = {
  title: string;
  originalExpectation: string;
  purposeChoice: CustomTaskPurposeChoice | null;
  durationChoice: CustomTaskDurationChoice | null;
  /**
   * 家長在 needs_confirmation 之後確認要用的 editor。
   * null = 還沒回答，或這個組合本來就不需要確認。
   */
  confirmedEditorKind: TaskEditorKind | null;
};

export const EMPTY_CUSTOM_INTAKE: CustomIntakeState = {
  title: '',
  originalExpectation: '',
  purposeChoice: null,
  durationChoice: null,
  confirmedEditorKind: null,
};

/**
 * 從抽屜外面帶進來的預填。
 *
 * **只有名稱。** 首頁的「最近指派過的」快選是這個型別存在的唯一理由：
 * 家長點一個他上週指派過的任務名稱，不必再打一次字。
 *
 * 刻意不能帶別的：舊任務的 category、幣值、回饋方式、難度、日期，
 * 全部是**舊政策下**算出來的值。把它們帶進新流程等於讓一筆新任務
 * 繼承一組沒有人重新檢查過的設定，而畫面上看起來像是家長自己選的。
 * 名稱不一樣 —— 那是家長自己打的字，沒有政策含意。
 *
 * 名稱進來之後仍然要走完三個基本設定步驟，一步都不跳：預填的是
 * **起點**，不是答案。
 */
export type CustomIntakeSeed = {
  title: string;
};

/**
 * 把外部預填轉成一份自訂流程的初始狀態。
 *
 * 只有空白的名稱 = 沒有預填，回一份全新的空白 intake（而不是一份
 * `title: '   '` 的髒狀態 —— 那會讓 `isCustomIntakeDirty` 以外的地方
 * 開始需要各自 trim）。
 */
export function seededCustomIntake(
  seed: CustomIntakeSeed | null | undefined,
): CustomIntakeState {
  const title = seed?.title.trim() ?? '';
  if (title.length === 0) return EMPTY_CUSTOM_INTAKE;
  return { ...EMPTY_CUSTOM_INTAKE, title };
}

/**
 * 家長在自訂流程裡動過任何東西了嗎。
 *
 * 起點頁不算 dirty —— 那時候還沒有任何內容會被丟掉，
 * 跳一個「要放棄嗎」出來只是在問一個沒有答案的問題。
 */
export function isCustomIntakeDirty(intake: CustomIntakeState): boolean {
  return (
    intake.title.trim().length > 0
    || intake.originalExpectation.trim().length > 0
    || intake.purposeChoice !== null
    || intake.durationChoice !== null
  );
}

/** Step 1 的欄位驗證。期待是選填，只有名稱必填。 */
export function customTitleError(intake: CustomIntakeState): string | undefined {
  return intake.title.trim().length === 0 ? '請填寫任務名稱' : undefined;
}

/**
 * 基本設定的指紋。
 *
 * 用途只有一個：家長從 editor 返回 Step 3、什麼都沒改又按下一步時，
 * **不要重建草稿**。重建等於清掉他在 editor 裡填的所有東西，
 * 而且會換掉 clientRequestId —— 那會讓「重試不會建出第二筆」這件事失效。
 *
 * 只放基本設定的欄位。editor 裡改過的標題不在這裡面，
 * 所以在 editor 改標題不會讓草稿在返回時被判定為過期。
 */
export function customBasicsSignature(intake: CustomIntakeState): string {
  return [
    intake.title.trim(),
    intake.originalExpectation.trim(),
    intake.purposeChoice ?? '',
    intake.durationChoice ?? '',
    intake.confirmedEditorKind ?? '',
  ].join('');
}

// ---------------------------------------------------------------------------
// 換入口
// ---------------------------------------------------------------------------

/**
 * 換建立方式時，哪些東西留著、哪些要丟。
 *
 * **同一時間只能有一份 active 草稿。** 兩份草稿共用一個 clientRequestId
 * 是最糟的組合：家長先建 preset 失敗、切去自訂、再送出，RPC 會認為那是
 * 重送並回放**第一份**任務 —— 家長拿到一個他已經放棄的東西。
 *
 * 選擇則相反，兩邊都留著：家長切去 preset 看一輪之後回來，
 * 剛剛打的字還在。那是他自己輸入的內容，沒有理由因為看了別的畫面而消失。
 */
export type PathSwitchEffect = {
  keepCustomIntake: boolean;
  keepPresetSelection: boolean;
  /** true = 丟掉目前草稿；下一次進 editor 會產生新的 clientRequestId。 */
  resetDraft: boolean;
};

export function pathSwitchEffect(
  from: TaskCreationPath | null,
  to: TaskCreationPath,
): PathSwitchEffect {
  const changed = from !== null && from !== to;
  return {
    keepCustomIntake: true,
    keepPresetSelection: true,
    resetDraft: changed,
  };
}
