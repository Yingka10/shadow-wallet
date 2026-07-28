// Shadow Wallet · Parent Tablet — 建立請求的識別碼
//
// 為什麼按鈕 loading 不夠：
//
//   1. 家長按下確認建立
//   2. RPC 實際成功、資料已經寫進去
//   3. 網路在 response 回來之前斷了 → client 只看得到「失敗」
//   4. 家長再按一次
//   5. 兩筆一模一樣的任務
//
// 前端沒有任何辦法分辨「沒送到」與「送到了但回不來」，所以這件事只能在
// 資料庫解決：同一個 requestId 進來第二次時，RPC 回傳原本那一筆，不再新增。
// 這支檔案負責產生那個 id，並保證同一份草稿的每次重試都用同一個。
//
// 產生順序刻意分三層，因為執行環境差很多：
//   crypto.randomUUID     Node 19+、現代瀏覽器、有 polyfill 的 RN
//   crypto.getRandomValues 舊一點的環境，自己組 v4
//   Math.random 混合      Hermes 沒有 crypto 全域時的最後手段
//
// 不用 Date.now()。時間戳在「兩台裝置同一毫秒送出」時會直接撞號，而且它
// 可預測 —— 別人猜得到 requestId 就能拿它去試探別人家的任務（RPC 那邊還有
// 一層 family/child 比對擋著，但識別碼本身不該是可枚舉的）。

/** 有些環境只有其中一半，所以兩個能力分開描述。 */
type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: <T extends Uint8Array>(array: T) => T;
};

function cryptoLike(): CryptoLike | null {
  const candidate = (globalThis as { crypto?: CryptoLike }).crypto;
  return candidate && typeof candidate === 'object' ? candidate : null;
}

/** RFC 4122 v4：第 7 個 byte 高 4 bits = 0100，第 9 個 byte 高 2 bits = 10。 */
function formatUuidV4(bytes: Uint8Array): string {
  const withVersion = Uint8Array.from(bytes);
  withVersion[6] = (withVersion[6]! & 0x0f) | 0x40;
  withVersion[8] = (withVersion[8]! & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 16; i += 1) {
    hex.push(withVersion[i]!.toString(16).padStart(2, '0'));
  }
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

/**
 * 這個 JS context 專屬的隨機前綴，只算一次。
 *
 * 它存在的理由是最後一層 fallback：Math.random 在某些 runtime 上是可被相同
 * 種子重現的。同一版 App 在兩台裝置上如果從相同狀態開始跑，序列會一樣。
 * 把「這次啟動」的一次性亂數混進去之後，就算 PRNG 序列相同，兩台裝置產生的
 * 位元組也不同。
 */
const SESSION_SALT = Math.floor(Math.random() * 0x100000000);
let sequence = 0;

/**
 * 沒有 crypto 時的 16 bytes。
 *
 * 每個 byte 取自獨立的 Math.random（不是把一個 double 切成 8 份），再和
 * session salt 與遞增序號做 XOR。實際亂度取決於 runtime 的 PRNG，這一點
 * 沒辦法假裝 —— 所以 salt 與序號的作用是保證**同一台裝置連續產生的 id 一定不同**，
 * 而不是宣稱它有密碼學強度。
 */
function pseudoRandomBytes(): Uint8Array {
  sequence += 1;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    const salted = (SESSION_SALT >>> (i % 4 * 8)) & 0xff;
    const counted = (sequence >>> (i % 4 * 8)) & 0xff;
    bytes[i] = (Math.floor(Math.random() * 256) ^ salted ^ counted) & 0xff;
  }
  return bytes;
}

/**
 * 產生一個新的建立請求識別碼（UUID v4 字串）。
 *
 * 同一份草稿只呼叫一次 —— 重試要沿用，不是重新產生。呼叫端見
 * PresetTaskDrawer 的 buildDraft。
 */
export function newClientRequestId(): string {
  const source = cryptoLike();

  if (source && typeof source.randomUUID === 'function') {
    const generated = source.randomUUID();
    // 有些 polyfill 會回傳非標準格式；驗過再用，不要把壞值傳到 uuid 欄位。
    if (isClientRequestId(generated)) return generated;
  }

  if (source && typeof source.getRandomValues === 'function') {
    return formatUuidV4(source.getRandomValues(new Uint8Array(16)));
  }

  return formatUuidV4(pseudoRandomBytes());
}

/** DB 的欄位是 uuid，格式不對會在 RPC 裡被擋成 VALIDATION_FAILED。 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isClientRequestId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
