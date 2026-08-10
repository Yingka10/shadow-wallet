// Shadow Wallet · Parent Tablet — 建立任務抽屜的畫面路由
//
// ─────────────────────────────────────────────────────────────────────────
// 抽屜原本用 `step: 'pick' | 'edit' | 'review' | 'success'`。四個畫面、
// 一條路，那樣夠用。
//
// 加上自訂入口之後就不夠了：`edit` 的「上一步」要回哪裡，取決於家長是從
// preset 還是從自訂進來的。用一個模糊的數字 step 再靠模式去猜，等於把
// 導覽規則拆散在每一顆按鈕的 onPress 裡 —— 而漏掉的那一顆會把家長丟回
// 一個他沒去過的畫面，順便清掉他剛填的東西。
//
// 所以這裡是 discriminated union ＋ 一支純函式回答「上一步是哪裡」。
// 沒有 step 1／2／3／4／5。
// ─────────────────────────────────────────────────────────────────────────

import type { TaskEditorKind } from './taskDraft';

/** 家長這一次是從哪個入口進來的。同一時間只會有一個。 */
export type TaskCreationPath = 'preset' | 'parent_custom';

export type TaskCreationDrawerRoute =
  /** 起點：選擇開始方式。 */
  | { kind: 'entry' }
  /** preset：既有的家族／版本挑選畫面。 */
  | { kind: 'preset_catalog' }
  /** 自訂基本設定 1／3：想做什麼。 */
  | { kind: 'custom_basics_title' }
  /** 自訂基本設定 2／3：這件事主要是為了什麼。 */
  | { kind: 'custom_basics_purpose' }
  /** 自訂基本設定 3／3：預計怎麼進行。 */
  | { kind: 'custom_basics_duration' }
  /** 五種既有 editor 之一。兩種來源共用。 */
  | { kind: 'editor'; editorKind: TaskEditorKind }
  | { kind: 'review' }
  | { kind: 'success' };

export const ENTRY_ROUTE: TaskCreationDrawerRoute = { kind: 'entry' };

/**
 * 上一步是哪個畫面。
 *
 * 回 `null` 代表這一頁沒有上一步（起點頁與成功畫面）。
 * **成功畫面刻意沒有上一步**：任務已經建立了，回到草稿只會讓家長
 * 以為可以再改一次 —— 而那份草稿已經不對應任何東西。
 */
export function backRouteFor(
  route: TaskCreationDrawerRoute,
  path: TaskCreationPath | null,
): TaskCreationDrawerRoute | null {
  switch (route.kind) {
    case 'entry':
    case 'success':
      return null;
    case 'preset_catalog':
    case 'custom_basics_title':
      return { kind: 'entry' };
    case 'custom_basics_purpose':
      return { kind: 'custom_basics_title' };
    case 'custom_basics_duration':
      return { kind: 'custom_basics_purpose' };
    case 'editor':
      // 這一格就是整支 union 存在的理由：同一個畫面，兩個來源，兩個上一步。
      return path === 'parent_custom'
        ? { kind: 'custom_basics_duration' }
        : { kind: 'preset_catalog' };
    case 'review':
      return null;
  }
}

/** review 的上一步是家長剛才那一支 editor，所以要知道 editorKind。 */
export function reviewBackRoute(editorKind: TaskEditorKind): TaskCreationDrawerRoute {
  return { kind: 'editor', editorKind };
}

/** 這個畫面屬於自訂的三個基本設定步驟嗎。 */
export function isCustomBasicsRoute(route: TaskCreationDrawerRoute): boolean {
  return (
    route.kind === 'custom_basics_title'
    || route.kind === 'custom_basics_purpose'
    || route.kind === 'custom_basics_duration'
  );
}

/**
 * 這個畫面是不是在編輯內容（editor 或 review）。
 *
 * 用途是決定要不要把 draft 的 dirty 狀態算進「離開前要不要確認」。
 */
export function isDraftRoute(route: TaskCreationDrawerRoute): boolean {
  return route.kind === 'editor' || route.kind === 'review';
}
