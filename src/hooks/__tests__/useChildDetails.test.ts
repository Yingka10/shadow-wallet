// 第九階段 B3 — 抽屜要的孩子資料
//
// 這一支只測一件事的三個面向：**抽屜拿到的一定是它要的那個孩子。**
// 拿錯孩子的後果不是畫面錯字，是任務被建立到別人身上，而畫面上看不出來。

// eslint-disable-next-line prefer-const -- let allows reassignment in beforeEach
let mockSingle = jest.fn();
// eslint-disable-next-line prefer-const
let mockFromCalls: string[] = [];
// eslint-disable-next-line prefer-const
let mockEqCalls: [string, unknown][] = [];

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      mockFromCalls.push(table);
      return {
        select: () => ({
          eq: (column: string, value: unknown) => {
            mockEqCalls.push([column, value]);
            return { single: () => mockSingle() };
          },
        }),
      };
    },
  },
}));

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useChildDetails } from '../useChildDetails';
import type { Child } from '../../types/database';

const CHILD_1: Child = {
  id: 'child-1',
  family_id: 'family-1',
  nickname: '承恩',
  birth_date: '2018-03-05',
  age_group: '6-9',
  account_type: 'SINGLE',
  pin_code: null,
  created_at: '2026-01-01T00:00:00Z',
};

const CHILD_2 = { ...CHILD_1, id: 'child-2', nickname: '子晴', birth_date: '2016-09-20' };

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  mockSingle = jest.fn();
  mockFromCalls = [];
  mockEqCalls = [];
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  errorSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// 1-2. 不需要的時候不要查
// ---------------------------------------------------------------------------

describe('1-2. childId 不成立時不查詢', () => {
  it('null（抽屜沒開）—— 不查、不 loading、不報錯', async () => {
    const { result } = renderHook(() => useChildDetails(null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFromCalls).toEqual([]);
    expect(result.current.child).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('空字串（孩子清單還沒載完）—— 同樣不查，否則 Postgres 會以 22P02 回 400', async () => {
    const { result } = renderHook(() => useChildDetails(''));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFromCalls).toEqual([]);
    expect(result.current.child).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. 正常路徑
// ---------------------------------------------------------------------------

describe('3. 取一個孩子', () => {
  it('查 children 的那一列，並把整列交出去（含 birth_date）', async () => {
    mockSingle.mockResolvedValue({ data: CHILD_1, error: null });

    const { result } = renderHook(() => useChildDetails('child-1'));

    await waitFor(() => expect(result.current.child).toEqual(CHILD_1));
    expect(mockFromCalls).toEqual(['children']);
    expect(mockEqCalls).toEqual([['id', 'child-1']]);
    // 抽屜要的四個欄位都在 —— 少 birth_date 就算不出年齡段。
    expect(result.current.child?.birth_date).toBe('2018-03-05');
    expect(result.current.child?.family_id).toBe('family-1');
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. 失敗時不留舊資料
// ---------------------------------------------------------------------------

describe('4. 查詢失敗', () => {
  it('清掉孩子並報錯 —— 不可以留著上一個孩子讓抽屜繼續用', async () => {
    mockSingle.mockResolvedValue({ data: CHILD_1, error: null });
    const { result, rerender } = renderHook(
      (childId: string) => useChildDetails(childId),
      { initialProps: 'child-1' },
    );
    await waitFor(() => expect(result.current.child).toEqual(CHILD_1));

    mockSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    rerender('child-2');

    await waitFor(() => expect(result.current.error).toBe('資料載入失敗，請稍後再試'));
    expect(result.current.child).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. 舊回應不得覆蓋新的
// ---------------------------------------------------------------------------

describe('5. 連續切換目標孩子', () => {
  it('先送出的那一次晚回來也不會蓋掉現在的孩子', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    const first = new Promise(resolve => { resolveFirst = resolve; });
    mockSingle.mockReturnValueOnce(first);

    const { result, rerender } = renderHook(
      (childId: string) => useChildDetails(childId),
      { initialProps: 'child-1' },
    );

    // child-1 還在飛的時候就切到 child-2，而 child-2 先回來。
    mockSingle.mockResolvedValueOnce({ data: CHILD_2, error: null });
    rerender('child-2');
    await waitFor(() => expect(result.current.child).toEqual(CHILD_2));

    // 現在 child-1 才回來 —— 必須被丟掉。
    await act(async () => {
      resolveFirst({ data: CHILD_1, error: null });
      await first;
    });

    expect(result.current.child).toEqual(CHILD_2);
  });

  it('先送出的那一次晚回來報錯，也不會把現在的孩子清掉', async () => {
    let rejectFirst: (reason?: unknown) => void = () => undefined;
    const first = new Promise((_resolve, reject) => { rejectFirst = reject; });
    first.catch(() => undefined); // 避免 unhandled rejection 警告
    mockSingle.mockReturnValueOnce(first);

    const { result, rerender } = renderHook(
      (childId: string) => useChildDetails(childId),
      { initialProps: 'child-1' },
    );

    mockSingle.mockResolvedValueOnce({ data: CHILD_2, error: null });
    rerender('child-2');
    await waitFor(() => expect(result.current.child).toEqual(CHILD_2));

    await act(async () => {
      rejectFirst(new Error('late failure'));
      await first.catch(() => undefined);
    });

    expect(result.current.child).toEqual(CHILD_2);
    expect(result.current.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. refresh
// ---------------------------------------------------------------------------

describe('6. refresh', () => {
  it('重查同一個孩子', async () => {
    mockSingle.mockResolvedValue({ data: CHILD_1, error: null });
    const { result } = renderHook(() => useChildDetails('child-1'));
    await waitFor(() => expect(result.current.child).toEqual(CHILD_1));
    expect(mockFromCalls).toHaveLength(1);

    await act(async () => { await result.current.refresh(); });

    expect(mockFromCalls).toEqual(['children', 'children']);
    expect(mockEqCalls).toEqual([['id', 'child-1'], ['id', 'child-1']]);
  });
});
