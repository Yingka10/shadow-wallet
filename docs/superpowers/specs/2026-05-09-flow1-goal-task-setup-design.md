# 流程一：兌換目標與任務推薦 — Design Spec
Date: 2026-05-09

## Overview

為 6-9 歲孩子建立「第一個兌換目標」與「本週任務包」的三步引導流程。
觸發點：初次 Onboarding 完成後，或從 Parent 控制台進入（每個孩子各自設定）。

---

## 1. Navigation 架構

### 新增 Routes（加入 `App.tsx` 的 `RootStackParamList`）

```typescript
GoalSetup: {
  childId: string;
  childNickname: string;
  familyId: string;
  ageGroup: AgeGroup;
  isOnboarding: boolean;   // 決定離開時用 reset 還是 pop
};
TaskSelection: {
  childId: string;
  childNickname: string;
  familyId: string;
  ageGroup: AgeGroup;
  rewardName: string;
  goalCoinCost: number;
  isOnboarding: boolean;
};
Overview: {
  childId: string;
  childNickname: string;
  familyId: string;
  selectedTemplateIds: string[];
  rewardName: string;
  goalCoinCost: number;
  isOnboarding: boolean;
};
```

### 流程路徑

```
初次：  Onboarding ──replace──> GoalSetup → TaskSelection → Overview ──replace('Parent')──>
重入：  Parent ────navigate───> GoalSetup → TaskSelection → Overview ──pop(3)──────────────>
```

### Overview 離開邏輯

```typescript
if (isOnboarding) {
  // reset 整個 stack，避免使用者從 Parent 按返回回到 setup 流程
  navigation.reset({ index: 0, routes: [{ name: 'Parent' }] });
} else {
  navigation.pop(3);
}
```

### Overview 內部返回

- 「✏️ 修改目標」在目標卡片標題旁 → `navigation.pop(2)` 回 GoalSetup
- 「✏️ 修改任務」在任務包標題旁 → `navigation.pop(1)` 回 TaskSelection

---

## 2. 資料庫 Schema

### 新增 Table 1：`system_task_templates`

```sql
CREATE TABLE system_task_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,           -- 'A' | 'B' | 'C' | 'D'
  age_group       TEXT NOT NULL,           -- '2-4' | '4-6' | '6-9' | '9-12'
  base_time_min   INT  NOT NULL DEFAULT 15,
  difficulty      NUMERIC(3,1) NOT NULL DEFAULT 1,
  time_saving_min INT  NOT NULL DEFAULT 0,
  sort_order      INT  NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE system_task_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read templates"
  ON system_task_templates FOR SELECT TO authenticated USING (true);
GRANT SELECT ON system_task_templates TO authenticated;
```

### 新增 Table 2：`child_tasks`

```sql
CREATE TABLE child_tasks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id   UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  task_id    UUID NOT NULL REFERENCES tasks(id)    ON DELETE CASCADE,
  is_active  BOOL NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(child_id, task_id)
);

ALTER TABLE child_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parents manage own family child_tasks"
  ON child_tasks FOR ALL TO authenticated
  USING (
    child_id IN (
      SELECT c.id FROM children c
      JOIN parents p ON p.family_id = c.family_id
      WHERE p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    child_id IN (
      SELECT c.id FROM children c
      JOIN parents p ON p.family_id = c.family_id
      WHERE p.user_id = auth.uid()
    )
  );
GRANT ALL ON child_tasks TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
```

### Seed：6-9 歲系統任務模板（7 筆）

| name | category | base_time_min | difficulty | time_saving_min |
|---|---|---|---|---|
| 整理書包 | B | 10 | 1.0 | 10 |
| 收好玩具 | B | 15 | 1.0 | 15 |
| 幫忙擺餐具 | B | 10 | 1.0 | 10 |
| 洗自己的碗 | B | 10 | 1.0 | 10 |
| 幫忙擦桌子 | C | 15 | 2.0 | 0 |
| 幫忙洗碗 | C | 20 | 2.0 | 0 |
| 整理客廳 | C | 20 | 2.5 | 0 |

Task-C 全選潛在幣值：30 + 40 + 50 = 120 幣（符合 120-150 週目標）

### 新增 PostgreSQL Function（原子寫入）

```sql
CREATE OR REPLACE FUNCTION setup_child_tasks(
  p_family_id     UUID,
  p_child_id      UUID,
  p_template_ids  UUID[],
  p_reward_name   TEXT,
  p_coin_cost     INT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_task_id UUID;
  v_tmpl    system_task_templates%ROWTYPE;
BEGIN
  FOR v_tmpl IN
    SELECT * FROM system_task_templates WHERE id = ANY(p_template_ids)
  LOOP
    INSERT INTO tasks (family_id, name, category, day_type,
                       base_time_min, difficulty, time_saving_min,
                       is_system_default)
    VALUES (p_family_id, v_tmpl.name, v_tmpl.category, 'both',
            v_tmpl.base_time_min, v_tmpl.difficulty, v_tmpl.time_saving_min,
            false)
    RETURNING id INTO v_task_id;

    INSERT INTO child_tasks (child_id, task_id)
    VALUES (p_child_id, v_task_id);
  END LOOP;

  INSERT INTO reward_items
    (family_id, child_id, name, reward_type, coin_cost, added_by, parent_approved)
  VALUES
    (p_family_id, p_child_id, p_reward_name, 'item', p_coin_cost, 'parent', true);
END;
$$;
```

### `database.ts` 新增型別

```typescript
export type SystemTaskTemplate = {
  id: string;
  name: string;
  category: TaskCategory;
  age_group: AgeGroup;
  base_time_min: number;
  difficulty: number;
  time_saving_min: number;
  sort_order: number;
  created_at: string;
};

export type ChildTask = {
  id: string;
  child_id: string;
  task_id: string;
  is_active: boolean;
  created_at: string;
};
```

並在 `Database` interface 的 `Tables` 中加入 `system_task_templates` 與 `child_tasks`。

---

## 3. `src/lib/taskRecommend.ts` API

```typescript
/** 從 system_task_templates 撈指定年齡段的 Task-B + Task-C（跳過 A/D） */
fetchTemplates(ageGroup: AgeGroup): Promise<SystemTaskTemplate[]>

/** 從模板清單取 3-4 個 Task-B、2-3 個 Task-C */
recommendTasks(templates: SystemTaskTemplate[]): {
  taskB: SystemTaskTemplate[];
  taskC: SystemTaskTemplate[];
}

/** 計算選取的 Task-C 總潛在幣值（Task-B 不計）
 *  coin = Math.round(base_time_min * difficulty)
 */
calcTotalCoin(selectedC: SystemTaskTemplate[]): number

/** 呼叫 RPC 原子寫入：複製任務 + 指派給孩子 + 寫入目標 */
confirmSetup(params: {
  familyId: string;
  childId: string;
  templateIds: string[];
  rewardName: string;
  coinCost: number;
}): Promise<void>
// 內部：await supabase.rpc('setup_child_tasks', { p_family_id, p_child_id, ... })

/** 呼叫 Gemini 1.5 Flash API 取得自訂目標的幣值建議 */
suggestCoinWithAI(rewardName: string): Promise<{
  coins: number;
  weeks: number;
  reason: string;
}>
// API key: process.env.EXPO_PUBLIC_GEMINI_API_KEY
// Model: gemini-1.5-flash
// Response format: JSON { coins, weeks, reason }
// 脈絡 prompt 說明：每週可賺 120-150 幣，建議目標 60-200 幣
```

---

## 4. 畫面設計

### 視覺原則
- 無邊框卡片：`box-shadow: 0 1px 3px rgba(0,0,0,0.06)` 代替 border
- 選取狀態統一：淡藍背景 `#EEF5FF` + 藍色勾（Task-B / C 相同）
- 輔助動作降為 12px 文字連結（不做成卡片大小的按鈕）
- 進度條：3 格橫線，當前段為藍色，完成段為綠色

---

### GoalSetupScreen

**路由**：`GoalSetup`  
**入口**：Onboarding 完成 / ParentScreen 孩子管理
**`familyId` 來源**：
- 初次（Onboarding）：從 `submitOnboarding` 回傳
- 重入（Parent）：GoalSetupScreen 進入時呼叫 `supabase.from('parents').select('family_id').eq('user_id', auth.uid()).single()`

**Layout**：
1. 進度條（1/3）
2. 標題「為 [nickname] 設定目標」
3. 2 欄 Grid，6 張卡片（5 個預設 + 1 個「自訂」）
   - 選取：淡藍背景 + 右上角藍色勾
   - 未選：白底 + 輕微陰影
4. 文字連結「🔄 換一批建議」
5. ⓘ 說明區塊：說明幣值與每週賺幣量
6. 「下一步：選任務 →」主按鈕

**6-9 歲預設目標**：
| emoji | name | coinCost |
|---|---|---|
| 🃏 | 寶可夢卡牌 | 80 |
| 🎮 | 多 30 分鐘 Switch | 80 |
| 🎬 | 選一部電影 | 60 |
| 📚 | 買一本漫畫 | 70 |
| 🎡 | 去遊樂場 | 100 |

**自訂目標 Bottom Sheet（`Modal` component）**：
1. 文字輸入框（獎品名稱）
2. 幣值輸入框（可自填）+ 「✨ AI 建議」按鈕
3. AI 按鈕觸發：顯示骨架屏 → 呼叫 `suggestCoinWithAI()` → 顯示建議幣值卡
4. 建議卡：說明 coins + 預估 weeks + reason
5. − / + 微調 + 「套用此目標」按鈕

---

### TaskSelectionScreen

**路由**：`TaskSelection`  
**params**：`rewardName`, `goalCoinCost` 從上一頁傳入

**Layout**：
1. 進度條（2/3）
2. 標題「幫 [nickname] 選任務」+ 副標顯示目標名稱與幣值
3. **家庭本分** 區塊
   - 標題右側 ⓘ 圖示：Tooltip 說明「幫家裡省了時間，累積後跟爸媽討論兌換成家庭共同時間」
   - Task-B 卡片列表（可勾選，副標題「X 分鐘・幫家裡省 X 分鐘」）
   - 底部文字連結：「＋ 新增自訂任務」/ 「🔄 換一批」
4. **超出本分貢獻** 區塊
   - Task-C 卡片列表（可勾選，右側顯示幣值）
   - 底部文字連結：「＋ 新增自訂任務」/ 「🔄 換一批」
5. 底部合計列「每次全完成可賺 XX 幣」
6. 「下一步：確認總覽 →」主按鈕

**自訂任務 Modal**（Task-B 和 Task-C 各自的）：
- 任務名稱輸入
- 預估時間（分鐘）
- 難度選擇（1 / 1.5 / 2 / 2.5 / 3）
- Task-C 顯示計算出的幣值預覽：`Math.round(time × difficulty)` 幣
- Task-B 顯示時間儲蓄欄位

**「換一批建議」邏輯**：  
從 `fetchTemplates()` 結果中，排除已選取的模板，隨機換一批未選的顯示（若已用完則提示「已顯示全部建議」）

---

### OverviewScreen

**路由**：`Overview`

**Layout**：
1. 進度條（3/3）
2. 標題「確認 [nickname] 的計畫」
3. **目標卡片**：標題旁「✏️ 修改目標」文字連結 → `navigation.pop(2)`
4. **任務包卡片**：標題旁「✏️ 修改任務」文字連結 → `navigation.pop(1)`
   - 家庭本分：任務名稱列表
   - 賺幣任務：任務名稱列表
5. **預估卡**（深色底）：「每次最多可賺 XX 幣」/ 「~X 次就能換到目標」
6. 「✓ 確認並開始！」主按鈕（綠色）

**確認按鈕行為**：
```typescript
// 1. 呼叫 RPC（原子寫入）
await confirmSetup({ familyId, childId, templateIds, rewardName, coinCost });
// 2. 依入口離開
if (isOnboarding) navigation.replace('Parent');
else navigation.pop(3);
```

---

## 5. OnboardingScreen 修改

`submitOnboarding` 回傳值需增加 `ageGroup`：

```typescript
// onboarding.ts
export interface OnboardingResult {
  familyId: string;
  childId: string;
  ageGroup: AgeGroup;   // 新增
}
```

`OnboardingScreen.handleSubmit` 改為：
```typescript
const { familyId, childId, ageGroup } = await submitOnboarding({ ... });
navigation.replace('GoalSetup', {
  childId,
  childNickname,
  familyId,
  ageGroup,
  isOnboarding: true,
});
```

---

## 6. AI 定價（Gemini）

- Model：`gemini-1.5-flash`
- API Key：`EXPO_PUBLIC_GEMINI_API_KEY`（`.env` 中設定，僅用於個人測試）
- Endpoint：`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`
- Response MIME：`application/json`

Prompt 脈絡：
```
你是一個家庭教養 App 的幣值顧問。
這個 App 使用「幣」作為虛擬貨幣。孩子（6-9歲）每週透過完成家務賺取約 120-150 幣。
家長想設定一個兌換目標：「{rewardName}」
請根據這個獎品的相對吸引力，建議一個合適的幣值（60-200 幣之間）。
回應 JSON：{ "coins": number, "weeks": number, "reason": string }
```

---

## 7. 實作檔案清單

| 檔案 | 動作 |
|---|---|
| `src/types/database.ts` | 新增 `SystemTaskTemplate`, `ChildTask` 型別 + Database tables |
| `src/lib/taskRecommend.ts` | 新建（完整推薦邏輯 + AI 定價） |
| `src/screens/onboarding/GoalSetupScreen.tsx` | 新建 |
| `src/screens/onboarding/TaskSelectionScreen.tsx` | 新建 |
| `src/screens/onboarding/OverviewScreen.tsx` | 新建 |
| `src/screens/onboarding/OnboardingScreen.tsx` | 修改 `handleSubmit`，replace → GoalSetup |
| `src/lib/onboarding.ts` | `OnboardingResult` 新增 `ageGroup` |
| `App.tsx` | `RootStackParamList` 新增三個 routes |

### SQL（需在 Supabase SQL Editor 執行）
1. 建立 `system_task_templates` + RLS + GRANT
2. 建立 `child_tasks` + RLS + GRANT
3. Seed 7 筆 6-9 歲模板
4. 建立 `setup_child_tasks` function
