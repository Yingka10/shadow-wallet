// 第七階段 C — 建立請求識別碼
//
// 這個字串是「網路重送不會建出第二筆任務」的全部依據。
// 它只要有一次撞號或格式不合法，idempotency 就整套失效 ——
// 前者會讓兩個家庭的任務互相取代，後者會讓每一次建立都被 RPC 擋成格式錯誤。

import { isClientRequestId, newClientRequestId } from '../clientRequestId';

/** 把全域的 crypto 換掉，測三條產生路徑。結束後一定要還原。 */
function withCrypto<T>(replacement: unknown, run: () => T): T {
  const globals = globalThis as { crypto?: unknown };
  const original = globals.crypto;
  const had = 'crypto' in globals;
  try {
    if (replacement === undefined) delete globals.crypto;
    else globals.crypto = replacement;
    return run();
  } finally {
    if (had) globals.crypto = original;
    else delete globals.crypto;
  }
}

describe('格式', () => {
  it('產出的是合法的 UUID v4', () => {
    for (let i = 0; i < 50; i += 1) {
      const id = newClientRequestId();
      expect({ id, valid: isClientRequestId(id) }).toEqual({ id, valid: true });
    }
  });

  it('DB 的 uuid 欄位吃得下：小寫十六進位、四個連字號、版本與 variant 位元正確', () => {
    const id = newClientRequestId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('不是合法 uuid 的東西一律回 false', () => {
    for (const bad of ['', 'not-a-uuid', '123', null, undefined, 42,
      // 版本位元是 0 —— 長度對但不是 v1-v5。
      '6f1c0f7e-2a4b-0c9d-8e12-3b5a7c9d0e11']) {
      expect({ bad, ok: isClientRequestId(bad) }).toEqual({ bad, ok: false });
    }
  });
});

describe('三條產生路徑', () => {
  it('有 randomUUID 就用它', () => {
    const stub = '6f1c0f7e-2a4b-4c9d-8e12-3b5a7c9d0e11';
    const id = withCrypto({ randomUUID: () => stub }, () => newClientRequestId());
    expect(id).toBe(stub);
  });

  it('randomUUID 回傳格式不對時不採用，改走下一條路', () => {
    // 有些 polyfill 會回非標準字串。原樣送出去只會在 RPC 被擋成格式錯誤。
    const id = withCrypto(
      {
        randomUUID: () => 'definitely-not-a-uuid',
        getRandomValues: (array: Uint8Array) => {
          array.fill(0xab);
          return array;
        },
      },
      () => newClientRequestId(),
    );
    expect(id).not.toBe('definitely-not-a-uuid');
    expect(isClientRequestId(id)).toBe(true);
  });

  it('只有 getRandomValues 時自己組 v4', () => {
    const id = withCrypto(
      {
        getRandomValues: (array: Uint8Array) => {
          for (let i = 0; i < array.length; i += 1) array[i] = i * 7 + 3;
          return array;
        },
      },
      () => newClientRequestId(),
    );
    expect(isClientRequestId(id)).toBe(true);
    // 版本與 variant 位元有被覆寫，不是原樣輸出 byte。
    expect(id[14]).toBe('4');
    expect('89ab').toContain(id[19]);
  });

  it('完全沒有 crypto 時仍然產得出合法且互不相同的 id', () => {
    const ids = withCrypto(undefined, () =>
      Array.from({ length: 500 }, () => newClientRequestId()));
    expect(ids.every(isClientRequestId)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fallback 不是只靠時間戳 —— 同一毫秒內連續產生也不同', () => {
    const now = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const ids = withCrypto(undefined, () =>
        Array.from({ length: 200 }, () => newClientRequestId()));
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('每次呼叫都是新的', () => {
  it('連續呼叫不會回同一個值', () => {
    const ids = Array.from({ length: 200 }, () => newClientRequestId());
    expect(new Set(ids).size).toBe(ids.length);
  });
});
