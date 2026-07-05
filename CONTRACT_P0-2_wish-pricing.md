# 合約：許願定價（P0-2） — A → B

> 型態：**Update 規格**（團隊 2026-07-04 決策；非 RPC）。
> 對應 AUDIT：P0-2 / 2-6。B 的定價框 UI 照此接。A 側無 schema/RPC 變更。

## 意義

孩子許願時 `reward_items.coin_cost = 0`、`parent_approved = false`。家長現行的
[`approveChildWish`](src/hooks/useParentRedemption.ts#L265) 只設 `parent_approved: true`，
**全 codebase 沒有任何地方替願望定幣值** → 孩子端兌換鈕條件 `coin_cost > 0`
（[WishScreen.tsx:345](src/screens/child/WishScreen.tsx)）永遠不成立，鏈斷在兌換那步，
且家長端顯示「0 幣」矛盾文案。本合約補上「家長核可時同時定價」這一步，讓
許願→核可→兌換 走得通（redeem_wish RPC 已就緒，會讀 `coin_cost` 扣款）。

## 合約（B 實作）

家長核可願望時，對 `reward_items` 做**單列 update**，同一次寫入 `parent_approved` 與 `coin_cost`：

```ts
// src/hooks/useParentRedemption.ts —— 由 (id) 改為 (id, coinCost)
const approveChildWish = useCallback(async (id: string, coinCost: number) => {
  const { error: err } = await supabase
    .from('reward_items')
    .update({ parent_approved: true, coin_cost: coinCost })
    .eq('id', id);
  if (err) throw err;
}, []);
```

- 型別已支援：`reward_items.Update = Partial<RewardItem>`，`coin_cost` 本來就可更新，**A 側零型別/migration 變更**。
- 呼叫點：平板 `WishApprovalCard onApprove`（ParentHomeTablet）、手機 `handleConfirmWish`（ParentRedemptionScreen）都改傳 `coinCost`。
- AI 建議幣值：可掛 `suggestRewardCoin`（`aiAgent.ts`）預填定價框，非必要。

## 完成的定義（含邊界）

1. **`coin_cost > 0`**：由定價框 UI 驗證（不可送 0 或負值核可）；`coin_cost = 0` 不算「已定價」，等同沒核可。
2. 核可後家長端文案顯示實際幣值（非「0 幣」）。
3. 孩子端 `WishScreen` 兌換鈕在 `parent_approved && coin_cost > 0 && balance >= coin_cost` 時出現，點擊走既有 `redeem_wish` RPC，扣款金額 = 此 `coin_cost`。
4. 走一遍黃金路徑第 6–7 步（許願→定價核可→兌換）全通，無矛盾數字。

## 邊界與不做

- **無原子性顧慮**：單列 update，不需 RPC。
- **授權**：沿用現行 pattern（client update；migrations 目前無 RLS）。RLS/授權硬化屬另一軌（P1-6 = A backlog #3，針對 complete_task/redeem_wish）。
- **這是 P0 止血**：完整審核環（`redemption_requests` 管線 + AI 篩選 + `adjusted_coins`）是 P1-1 / A backlog #5、B backlog #3，會重建整條兌換路。**別在此路上加新功能**，只讓現有鏈走通。
