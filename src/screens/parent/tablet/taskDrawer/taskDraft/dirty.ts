// Shadow Wallet · Parent Tablet — 草稿 dirty 比對
//
// 刻意用「initial snapshot vs current 深度比較」而不是手動 setDirty(true)：
// 手動旗標一旦設起來就不會因為家長改回原值而歸零，會誤觸放棄確認。

import type { TaskDraft } from './types';

/** 純結構深度比較（草稿只含字串／數字／布林／陣列／純物件）。 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  // 只比對「有定義」的鍵，避免 { x: undefined } 與 {} 被判為不同。
  const aKeys = Object.keys(aObj).filter(k => aObj[k] !== undefined);
  const bKeys = Object.keys(bObj).filter(k => bObj[k] !== undefined);
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every(key => deepEqual(aObj[key], bObj[key]));
}

/** 草稿是否被改動過。任一方為 null 時視為未改動。 */
export function isDraftDirty(initial: TaskDraft | null, current: TaskDraft | null): boolean {
  if (!initial || !current) return false;
  return !deepEqual(initial, current);
}
