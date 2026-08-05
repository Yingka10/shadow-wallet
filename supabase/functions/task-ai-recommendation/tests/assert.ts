// 最小斷言工具。
//
// 刻意不 import `jsr:@std/assert`：本輪的規則之一是不新增 dependency，
// 而一個遠端匯入即使不進 package.json 也仍然是一個依賴 ——
// 它會進 lock、會在 CI 上被下載、會有版本。這四個函式加起來三十行，
// 不值得為它多一個外部來源。

export function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`斷言失敗：${msg}`);
}

export function assertEquals<T>(actual: T, expected: T, msg = ''): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`${msg ? msg + '\n' : ''}  實際：${a}\n  預期：${b}`);
  }
}

export function assertStringIncludes(actual: string, needle: string, msg = ''): void {
  if (!actual.includes(needle)) {
    throw new Error(`${msg ? msg + '\n' : ''}  「${actual}」不含「${needle}」`);
  }
}

export function assertNotStringIncludes(actual: string, needle: string, msg = ''): void {
  if (actual.includes(needle)) {
    throw new Error(`${msg ? msg + '\n' : ''}  「${needle}」不該出現，但出現了`);
  }
}
