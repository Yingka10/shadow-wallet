# 流程一：兌換目標與任務推薦 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作家長為孩子設定兌換目標與任務包的三步引導流程（GoalSetup → TaskSelection → Overview），含 Gemini AI 幣值建議與原子寫入 DB。

**Architecture:** 新增 `taskRecommend.ts` 處理所有推薦邏輯與 DB 寫入；三個新畫面透過 navigation params 傳遞狀態；所有 DB 寫入透過 `setup_child_tasks` PostgreSQL Function 確保原子性。

**Tech Stack:** React Native / Expo、Supabase (supabase-js v2)、Google Gemini 1.5 Flash API、React Navigation Stack

---

## File Map

| 動作 | 路徑 |
|---|---|
| 新建 | `src/lib/taskRecommend.ts` |
| 新建 | `src/lib/__tests__/taskRecommend.test.ts` |
| 新建 | `src/screens/onboarding/GoalSetupScreen.tsx` |
| 新建 | `src/screens/onboarding/TaskSelectionScreen.tsx` |
| 新建 | `src/screens/onboarding/OverviewScreen.tsx` |
| 修改 | `src/types/database.ts` |
| 修改 | `src/lib/onboarding.ts` |
| 修改 | `src/screens/onboarding/OnboardingScreen.tsx` |
| 修改 | `App.tsx` |
| SQL (手動) | Supabase SQL Editor |

---

## Task 1: SQL Migrations

**在 Supabase SQL Editor 執行以下 SQL（順序不可顛倒）**

- [ ] **Step 1: 建立 system_task_templates**

```sql
CREATE TABLE IF NOT EXISTS system_task_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  age_group       TEXT NOT NULL,
  base_time_min   INT  NOT NULL DEFAULT 15,
  difficulty      NUMERIC(3,1) NOT NULL DEFAULT 1,
  time_saving_min INT  NOT NULL DEFAULT 0,
  sort_order      INT  NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE system_task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read templates"
  ON system_task_templates FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON system_task_templates TO authenticated;
```

- [ ] **Step 2: Seed 6-9 歲模板資料**

```sql
INSERT INTO system_task_templates
  (name, category, age_group, base_time_min, difficulty, time_saving_min, sort_order)
VALUES
  ('整理書包',   'B', '6-9', 10, 1.0, 10, 1),
  ('收好玩具',   'B', '6-9', 15, 1.0, 15, 2),
  ('幫忙擺餐具', 'B', '6-9', 10, 1.0, 10, 3),
  ('洗自己的碗', 'B', '6-9', 10, 1.0, 10, 4),
  ('幫忙擦桌子', 'C', '6-9', 15, 2.0,  0, 5),
  ('幫忙洗碗',   'C', '6-9', 20, 2.0,  0, 6),
  ('整理客廳',   'C', '6-9', 20, 2.5,  0, 7);
```

- [ ] **Step 3: 建立 child_tasks**

```sql
CREATE TABLE IF NOT EXISTS child_tasks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id   UUID NOT NULL REFERENCES children(id)  ON DELETE CASCADE,
  task_id    UUID NOT NULL REFERENCES tasks(id)      ON DELETE CASCADE,
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

- [ ] **Step 4: 建立 setup_child_tasks Function（含自訂任務支援）**

```sql
CREATE OR REPLACE FUNCTION setup_child_tasks(
  p_family_id    UUID,
  p_child_id     UUID,
  p_template_ids UUID[],
  p_custom_tasks JSONB DEFAULT '[]',
  p_reward_name  TEXT DEFAULT '',
  p_coin_cost    INT  DEFAULT 0
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_task_id UUID;
  v_tmpl    system_task_templates%ROWTYPE;
  v_custom  JSONB;
BEGIN
  -- 1. 複製模板任務
  FOR v_tmpl IN
    SELECT * FROM system_task_templates WHERE id = ANY(p_template_ids)
  LOOP
    INSERT INTO tasks (family_id, name, category, day_type,
                       base_time_min, difficulty, time_saving_min, is_system_default)
    VALUES (p_family_id, v_tmpl.name, v_tmpl.category, 'both',
            v_tmpl.base_time_min, v_tmpl.difficulty, v_tmpl.time_saving_min, false)
    RETURNING id INTO v_task_id;

    INSERT INTO child_tasks (child_id, task_id)
    VALUES (p_child_id, v_task_id);
  END LOOP;

  -- 2. 插入自訂任務
  FOR v_custom IN SELECT * FROM jsonb_array_elements(p_custom_tasks)
  LOOP
    INSERT INTO tasks (family_id, name, category, day_type,
                       base_time_min, difficulty, time_saving_min, is_system_default)
    VALUES (
      p_family_id,
      v_custom->>'name',
      v_custom->>'category',
      'both',
      (v_custom->>'base_time_min')::INT,
      (v_custom->>'difficulty')::NUMERIC,
      (v_custom->>'time_saving_min')::INT,
      false
    )
    RETURNING id INTO v_task_id;

    INSERT INTO child_tasks (child_id, task_id)
    VALUES (p_child_id, v_task_id);
  END LOOP;

  -- 3. 寫入兌換目標
  INSERT INTO reward_items
    (family_id, child_id, name, reward_type, coin_cost, added_by, parent_approved)
  VALUES
    (p_family_id, p_child_id, p_reward_name, 'item', p_coin_cost, 'parent', true);
END;
$$;
```

- [ ] **Step 5: 確認 SQL 無誤**

在 Supabase → Table Editor 確認：
- `system_task_templates` 有 7 筆資料
- `child_tasks` 表格存在
- Functions → `setup_child_tasks` 存在

---

## Task 2: database.ts — 新增型別與 Database 表格定義

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: 在 database.ts 的型別區塊（第 26 行附近）新增以下型別**

在 `export type SiblingRelation = {...}` 之後，在 `export interface Database` 之前加入：

```typescript
export type CustomTask = {
  name: string;
  category: 'B' | 'C';
  base_time_min: number;
  difficulty: number;
  time_saving_min: number;
};

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

- [ ] **Step 2: 在 Database interface 的 Tables 物件中加入兩個新表格**

在 `sibling_relations: { ... };` 之後，`};` 之前加入：

```typescript
      system_task_templates: {
        Row: SystemTaskTemplate;
        Insert: {
          id?: string;
          name: string;
          category: TaskCategory;
          age_group: AgeGroup;
          base_time_min?: number;
          difficulty?: number;
          time_saving_min?: number;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<SystemTaskTemplate>;
        Relationships: [];
      };
      child_tasks: {
        Row: ChildTask;
        Insert: {
          id?: string;
          child_id: string;
          task_id: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          child_id?: string;
          task_id?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
```

- [ ] **Step 3: 在 Database 的 Functions 物件中加入 setup_child_tasks**

在 `my_parent_id: { ... };` 之後加入：

```typescript
      setup_child_tasks: {
        Args: {
          p_family_id: string;
          p_child_id: string;
          p_template_ids: string[];
          p_custom_tasks?: CustomTask[];
          p_reward_name: string;
          p_coin_cost: number;
        };
        Returns: undefined;
      };
```

- [ ] **Step 4: 驗證 TypeScript 無錯誤**

```powershell
cd C:\Users\jenny\app\shadow-wallet
npx tsc --noEmit
```

Expected: 無輸出（0 errors）

- [ ] **Step 5: Commit**

```powershell
git add src/types/database.ts
git commit -m "feat: add SystemTaskTemplate, ChildTask, CustomTask types to database.ts"
```

---

## Task 3: onboarding.ts + App.tsx — 加入 ageGroup 回傳與三個新路由

**Files:**
- Modify: `src/lib/onboarding.ts`
- Modify: `App.tsx`

- [ ] **Step 1: onboarding.ts — OnboardingResult 加入 ageGroup**

找到 `export interface OnboardingResult` 並修改：

```typescript
export interface OnboardingResult {
  familyId: string;
  childId: string;
  ageGroup: AgeGroup;
}
```

- [ ] **Step 2: onboarding.ts — submitOnboarding 回傳 ageGroup**

找到 `return { familyId, childId };` 並替換為：

```typescript
return { familyId, childId, ageGroup };
```

- [ ] **Step 3: App.tsx — 加入三個新路由的型別與 Screen 匯入**

在 `App.tsx` 頂部的 import 區塊加入：

```typescript
import GoalSetupScreen from './src/screens/onboarding/GoalSetupScreen';
import TaskSelectionScreen from './src/screens/onboarding/TaskSelectionScreen';
import OverviewScreen from './src/screens/onboarding/OverviewScreen';
```

- [ ] **Step 4: App.tsx — RootStackParamList 加入新路由型別**

先在 `App.tsx` 頂部加入 import（和已有的 import 合併）：

```typescript
import type { AgeGroup } from './src/types/database';
import type { CustomTask } from './src/types/database';
```

然後在 `RootStackParamList` 中加入（加在 `Parent: undefined;` 之後）：

```typescript
  GoalSetup: {
    childId: string;
    childNickname: string;
    familyId: string;
    ageGroup: AgeGroup;
    isOnboarding: boolean;
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
    customTasks: CustomTask[];
    rewardName: string;
    goalCoinCost: number;
    isOnboarding: boolean;
  };
```

- [ ] **Step 5: App.tsx — Stack.Navigator 加入三個 Screen**

在 `<Stack.Screen name="Parent" component={ParentScreen} />` 之後加入：

```typescript
          <Stack.Screen name="GoalSetup" component={GoalSetupScreen} />
          <Stack.Screen name="TaskSelection" component={TaskSelectionScreen} />
          <Stack.Screen name="Overview" component={OverviewScreen} />
```

- [ ] **Step 6: 為三個新畫面建立佔位文件（讓 TypeScript 不報錯）**

建立 `src/screens/onboarding/GoalSetupScreen.tsx`：

```typescript
import React from 'react';
import { View, Text } from 'react-native';
export default function GoalSetupScreen() {
  return <View><Text>GoalSetup</Text></View>;
}
```

建立 `src/screens/onboarding/TaskSelectionScreen.tsx`：

```typescript
import React from 'react';
import { View, Text } from 'react-native';
export default function TaskSelectionScreen() {
  return <View><Text>TaskSelection</Text></View>;
}
```

建立 `src/screens/onboarding/OverviewScreen.tsx`：

```typescript
import React from 'react';
import { View, Text } from 'react-native';
export default function OverviewScreen() {
  return <View><Text>Overview</Text></View>;
}
```

- [ ] **Step 7: 驗證 TypeScript 無錯誤**

```powershell
npx tsc --noEmit
```

Expected: 無輸出

- [ ] **Step 8: Commit**

```powershell
git add src/lib/onboarding.ts App.tsx src/screens/onboarding/GoalSetupScreen.tsx src/screens/onboarding/TaskSelectionScreen.tsx src/screens/onboarding/OverviewScreen.tsx
git commit -m "feat: add ageGroup to OnboardingResult, add GoalSetup/TaskSelection/Overview routes"
```

---

## Task 4: taskRecommend.ts — TDD 實作推薦邏輯

**Files:**
- Create: `src/lib/__tests__/taskRecommend.test.ts`
- Create: `src/lib/taskRecommend.ts`

- [ ] **Step 1: 建立測試目錄並寫失敗測試**

建立 `src/lib/__tests__/taskRecommend.test.ts`：

```typescript
import { recommendTasks, calcTotalCoin } from '../taskRecommend';
import type { SystemTaskTemplate } from '../../types/database';

function makeTemplate(overrides: Partial<SystemTaskTemplate>): SystemTaskTemplate {
  return {
    id: 'test-id',
    name: 'Test',
    category: 'B',
    age_group: '6-9',
    base_time_min: 10,
    difficulty: 1,
    time_saving_min: 10,
    sort_order: 0,
    created_at: '2026-01-01',
    ...overrides,
  };
}

const TEMPLATES: SystemTaskTemplate[] = [
  makeTemplate({ id: 'b1', category: 'B', sort_order: 1 }),
  makeTemplate({ id: 'b2', category: 'B', sort_order: 2 }),
  makeTemplate({ id: 'b3', category: 'B', sort_order: 3 }),
  makeTemplate({ id: 'b4', category: 'B', sort_order: 4 }),
  makeTemplate({ id: 'c1', category: 'C', base_time_min: 15, difficulty: 2, sort_order: 5 }),
  makeTemplate({ id: 'c2', category: 'C', base_time_min: 20, difficulty: 2, sort_order: 6 }),
  makeTemplate({ id: 'c3', category: 'C', base_time_min: 20, difficulty: 2.5, sort_order: 7 }),
];

describe('recommendTasks', () => {
  it('returns 3 Task-B and 2 Task-C by default', () => {
    const { taskB, taskC } = recommendTasks(TEMPLATES);
    expect(taskB).toHaveLength(3);
    expect(taskC).toHaveLength(2);
    taskB.forEach(t => expect(t.category).toBe('B'));
    taskC.forEach(t => expect(t.category).toBe('C'));
  });

  it('returns remaining templates when showAlt=true', () => {
    const { taskB, taskC } = recommendTasks(TEMPLATES, true);
    expect(taskB).toHaveLength(1);
    expect(taskC).toHaveLength(1);
  });

  it('alt batch has no overlap with primary batch', () => {
    const primary = recommendTasks(TEMPLATES);
    const alt = recommendTasks(TEMPLATES, true);
    const primaryIds = new Set([...primary.taskB, ...primary.taskC].map(t => t.id));
    [...alt.taskB, ...alt.taskC].forEach(t => {
      expect(primaryIds.has(t.id)).toBe(false);
    });
  });

  it('returns empty arrays when templates is empty', () => {
    const { taskB, taskC } = recommendTasks([]);
    expect(taskB).toHaveLength(0);
    expect(taskC).toHaveLength(0);
  });
});

describe('calcTotalCoin', () => {
  it('sums Math.round(base_time_min * difficulty) for each template', () => {
    const c1 = makeTemplate({ base_time_min: 15, difficulty: 2 });   // 30
    const c2 = makeTemplate({ base_time_min: 20, difficulty: 2 });   // 40
    expect(calcTotalCoin([c1, c2])).toBe(70);
  });

  it('rounds fractional results', () => {
    const c = makeTemplate({ base_time_min: 20, difficulty: 2.5 });  // 50.0
    expect(calcTotalCoin([c])).toBe(50);
  });

  it('returns 0 for empty array', () => {
    expect(calcTotalCoin([])).toBe(0);
  });

  it('uses Math.round (not floor or ceil)', () => {
    // 10 * 1.5 = 15.0 → round → 15
    const c = makeTemplate({ base_time_min: 10, difficulty: 1.5 });
    expect(calcTotalCoin([c])).toBe(15);
  });
});
```

- [ ] **Step 2: 確認測試失敗（模組不存在）**

```powershell
npx jest src/lib/__tests__/taskRecommend.test.ts --no-coverage 2>&1 | Select-Object -Last 5
```

Expected: `Cannot find module '../taskRecommend'`

- [ ] **Step 3: 建立 taskRecommend.ts 並實作所有函數**

建立 `src/lib/taskRecommend.ts`：

```typescript
import { supabase } from './supabase';
import type { AgeGroup, CustomTask, SystemTaskTemplate } from '../types/database';

/**
 * 從 system_task_templates 撈指定年齡段的 Task-B + Task-C（跳過 A/D）
 */
export async function fetchTemplates(ageGroup: AgeGroup): Promise<SystemTaskTemplate[]> {
  const { data, error } = await supabase
    .from('system_task_templates')
    .select('*')
    .eq('age_group', ageGroup)
    .in('category', ['B', 'C'])
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`載入任務模板失敗：${error.message}`);
  return data ?? [];
}

/**
 * 從模板清單取前 3 個 Task-B、前 2 個 Task-C 作為推薦；
 * showAlt=true 時取剩餘的模板作為第二批建議。
 */
export function recommendTasks(
  templates: SystemTaskTemplate[],
  showAlt = false
): { taskB: SystemTaskTemplate[]; taskC: SystemTaskTemplate[] } {
  const allB = templates.filter(t => t.category === 'B');
  const allC = templates.filter(t => t.category === 'C');
  if (showAlt) {
    return { taskB: allB.slice(3), taskC: allC.slice(2) };
  }
  return { taskB: allB.slice(0, 3), taskC: allC.slice(0, 2) };
}

/**
 * 計算選取的 Task-C 模板總潛在幣值（Task-B 不發幣，不計入）
 * coin = Math.round(base_time_min * difficulty)
 */
export function calcTotalCoin(selectedC: SystemTaskTemplate[]): number {
  return selectedC.reduce(
    (sum, t) => sum + Math.round(t.base_time_min * t.difficulty),
    0
  );
}

/**
 * 呼叫 Gemini 1.5 Flash API 取得自訂目標的幣值建議
 */
export async function suggestCoinWithAI(
  rewardName: string
): Promise<{ coins: number; weeks: number; reason: string }> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) throw new Error('未設定 EXPO_PUBLIC_GEMINI_API_KEY');

  const prompt = `你是一個家庭教養 App 的幣值顧問。
這個 App 使用「幣」作為虛擬貨幣。孩子（6-9歲）每週透過完成家務賺取約 120-150 幣。
家長想設定一個兌換目標：「${rewardName}」
請根據這個獎品的相對吸引力，建議一個合適的幣值（60-200 幣之間）。
回應 JSON（不含其他文字）：{ "coins": number, "weeks": number, "reason": string }`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API 錯誤：${res.status}`);
  const json = await res.json() as {
    candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  return JSON.parse(text) as { coins: number; weeks: number; reason: string };
}

/**
 * 原子寫入：複製模板任務 + 自訂任務 + 指派給孩子 + 寫入兌換目標
 * 全部在同一個 PostgreSQL transaction 中執行
 */
export async function confirmSetup(params: {
  familyId: string;
  childId: string;
  templateIds: string[];
  customTasks: CustomTask[];
  rewardName: string;
  coinCost: number;
}): Promise<void> {
  const { error } = await supabase.rpc('setup_child_tasks', {
    p_family_id: params.familyId,
    p_child_id: params.childId,
    p_template_ids: params.templateIds,
    p_custom_tasks: params.customTasks,
    p_reward_name: params.rewardName,
    p_coin_cost: params.coinCost,
  });
  if (error) throw new Error(`設定失敗：${error.message}`);
}
```

- [ ] **Step 4: 執行測試，確認全部通過**

```powershell
npx jest src/lib/__tests__/taskRecommend.test.ts --no-coverage
```

Expected:
```
PASS src/lib/__tests__/taskRecommend.test.ts
  recommendTasks
    ✓ returns 3 Task-B and 2 Task-C by default
    ✓ returns remaining templates when showAlt=true
    ✓ alt batch has no overlap with primary batch
    ✓ returns empty arrays when templates is empty
  calcTotalCoin
    ✓ sums Math.round(base_time_min * difficulty) for each template
    ✓ rounds fractional results
    ✓ returns 0 for empty array
    ✓ uses Math.round (not floor or ceil)

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

- [ ] **Step 5: TypeScript 驗證**

```powershell
npx tsc --noEmit
```

Expected: 無輸出

- [ ] **Step 6: Commit**

```powershell
git add src/lib/taskRecommend.ts src/lib/__tests__/taskRecommend.test.ts
git commit -m "feat: add taskRecommend lib with recommendation logic and Gemini AI pricing"
```

---

## Task 5: GoalSetupScreen.tsx

**Files:**
- Replace: `src/screens/onboarding/GoalSetupScreen.tsx`

- [ ] **Step 1: 完整實作 GoalSetupScreen**

以下內容完整替換 `src/screens/onboarding/GoalSetupScreen.tsx`：

```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import { Colors } from '../../constants/colors';
import { suggestCoinWithAI } from '../../lib/taskRecommend';
import type { RootStackParamList } from '../../../App';

type Nav = StackNavigationProp<RootStackParamList, 'GoalSetup'>;
type Route = RouteProp<RootStackParamList, 'GoalSetup'>;

type PresetGoal = { emoji: string; name: string; coinCost: number };

const PRESET_GOALS_6_9: PresetGoal[] = [
  { emoji: '🃏', name: '寶可夢卡牌', coinCost: 80 },
  { emoji: '🎮', name: '多 30 分鐘 Switch', coinCost: 80 },
  { emoji: '🎬', name: '選一部電影', coinCost: 60 },
  { emoji: '📚', name: '買一本漫畫', coinCost: 70 },
  { emoji: '🎡', name: '去遊樂場', coinCost: 100 },
];

export default function GoalSetupScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { childId, childNickname, familyId, ageGroup, isOnboarding } = route.params;

  const [selectedName, setSelectedName] = useState('');
  const [selectedCoin, setSelectedCoin] = useState(0);

  // Custom goal modal
  const [modalVisible, setModalVisible] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCoin, setCustomCoin] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ coins: number; weeks: number; reason: string } | null>(null);
  const [adjustedCoin, setAdjustedCoin] = useState(0);

  const isCustomSelected =
    selectedName !== '' && !PRESET_GOALS_6_9.some(g => g.name === selectedName);

  function handleSelectPreset(goal: PresetGoal) {
    setSelectedName(goal.name);
    setSelectedCoin(goal.coinCost);
  }

  function openCustomModal() {
    setCustomName('');
    setCustomCoin('');
    setAiResult(null);
    setAdjustedCoin(0);
    setModalVisible(true);
  }

  async function handleAiSuggest() {
    if (!customName.trim()) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const result = await suggestCoinWithAI(customName.trim());
      setAiResult(result);
      setAdjustedCoin(result.coins);
    } catch {
      Alert.alert('AI 建議失敗', '請手動填入幣值');
    } finally {
      setAiLoading(false);
    }
  }

  function handleApplyCustom() {
    const coin = aiResult ? adjustedCoin : parseInt(customCoin, 10);
    if (!customName.trim() || !coin || coin < 1) {
      Alert.alert('請填寫完整', '需要獎品名稱與有效的幣值');
      return;
    }
    setSelectedName(customName.trim());
    setSelectedCoin(coin);
    setModalVisible(false);
  }

  function handleNext() {
    if (!selectedName) {
      Alert.alert('請選擇目標', '請先選一個獎品目標');
      return;
    }
    navigation.navigate('TaskSelection', {
      childId,
      childNickname,
      familyId,
      ageGroup,
      rewardName: selectedName,
      goalCoinCost: selectedCoin,
      isOnboarding,
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Progress */}
        <View style={styles.progressRow}>
          <View style={[styles.progressBar, styles.progressActive]} />
          <View style={[styles.progressBar, styles.progressInactive]} />
          <View style={[styles.progressBar, styles.progressInactive]} />
        </View>

        <Text style={styles.title}>為 {childNickname} 設定目標</Text>
        <Text style={styles.subtitle}>選一個最想換的獎勵 🎯</Text>

        {/* Goal grid */}
        <View style={styles.grid}>
          {PRESET_GOALS_6_9.map(goal => {
            const isSelected = selectedName === goal.name;
            return (
              <TouchableOpacity
                key={goal.name}
                style={[styles.goalCard, isSelected && styles.goalCardSelected]}
                onPress={() => handleSelectPreset(goal)}
                activeOpacity={0.75}
              >
                {isSelected && (
                  <View style={styles.checkBadge}>
                    <Text style={styles.checkMark}>✓</Text>
                  </View>
                )}
                <Text style={styles.goalEmoji}>{goal.emoji}</Text>
                <Text style={styles.goalName}>{goal.name}</Text>
                <Text style={styles.goalCoin}>{goal.coinCost} 幣</Text>
              </TouchableOpacity>
            );
          })}

          {/* Custom card */}
          <TouchableOpacity
            style={[styles.goalCard, isCustomSelected && styles.goalCardSelected]}
            onPress={openCustomModal}
            activeOpacity={0.75}
          >
            {isCustomSelected && (
              <View style={styles.checkBadge}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
            )}
            <Text style={styles.goalEmoji}>✏️</Text>
            <Text style={[styles.goalName, !isCustomSelected && { color: Colors.textSecondary }]}>
              {isCustomSelected ? selectedName : '自己填…'}
            </Text>
            <Text style={[styles.goalCoin, !isCustomSelected && { color: Colors.textSecondary }]}>
              {isCustomSelected ? `${selectedCoin} 幣` : '自訂幣值'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 換一批 text link (static presets — no-op with friendly message) */}
        <TouchableOpacity
          style={styles.refreshLink}
          onPress={() => Alert.alert('', '你已看到全部建議囉！可以自訂目標 ✏️')}
        >
          <Text style={styles.refreshText}>🔄 換一批建議</Text>
        </TouchableOpacity>

        {/* Coin info */}
        <View style={styles.infoBox}>
          <View style={styles.infoIcon}>
            <Text style={styles.infoIconText}>i</Text>
          </View>
          <Text style={styles.infoText}>
            幣是孩子完成任務賺的虛擬貨幣，每週大約可賺{' '}
            <Text style={styles.infoHighlight}>120–150 幣</Text>。
            建議第一個目標設在 60–100 幣，大約 1 週就能達成。
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, !selectedName && styles.primaryBtnDisabled]}
          onPress={handleNext}
          disabled={!selectedName}
        >
          <Text style={styles.primaryBtnText}>下一步：選任務 →</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Custom goal Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>自訂獎品目標</Text>
            <Text style={styles.sheetSubtitle}>輸入想換的獎品，讓 AI 幫你定幣值</Text>

            <Text style={styles.fieldLabel}>獎品名稱</Text>
            <TextInput
              style={styles.input}
              value={customName}
              onChangeText={setCustomName}
              placeholder="例：去吃屋馬燒肉"
              placeholderTextColor={Colors.textSecondary}
            />

            {!aiResult ? (
              <View style={styles.coinRow}>
                <TextInput
                  style={[styles.input, styles.coinInput]}
                  value={customCoin}
                  onChangeText={setCustomCoin}
                  placeholder="幣值（可自填）"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="numeric"
                />
                <TouchableOpacity
                  style={[styles.aiBtn, (!customName.trim() || aiLoading) && styles.aiBtnDisabled]}
                  onPress={handleAiSuggest}
                  disabled={aiLoading || !customName.trim()}
                >
                  {aiLoading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.aiBtnText}>✨ AI 建議</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.aiResultCard}>
                  <View style={styles.aiResultHeader}>
                    <Text style={styles.aiResultIcon}>✨</Text>
                    <View>
                      <Text style={styles.aiResultTitle}>AI 建議幣值</Text>
                      <Text style={styles.aiResultSub}>根據「{customName}」的相對價值</Text>
                    </View>
                  </View>
                  <Text style={styles.aiResultCoin}>{aiResult.coins} 幣</Text>
                  <Text style={styles.aiResultWeeks}>大約需要努力 {aiResult.weeks} 週 💪</Text>
                </View>

                <Text style={styles.fieldLabel}>微調幣值</Text>
                <View style={styles.adjustRow}>
                  <TouchableOpacity
                    style={styles.adjustBtn}
                    onPress={() => setAdjustedCoin(c => Math.max(10, c - 10))}
                  >
                    <Text style={styles.adjustBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.adjustValue}>{adjustedCoin}</Text>
                  <TouchableOpacity
                    style={styles.adjustBtn}
                    onPress={() => setAdjustedCoin(c => c + 10)}
                  >
                    <Text style={styles.adjustBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <TouchableOpacity style={styles.applyBtn} onPress={handleApplyCustom}>
              <Text style={styles.applyBtnText}>套用此目標 ✓</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, paddingBottom: 48 },

  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 28 },
  progressBar: { flex: 1, height: 3, borderRadius: 2 },
  progressActive: { backgroundColor: Colors.primary },
  progressInactive: { backgroundColor: Colors.border },

  title: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 24 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  goalCard: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
    position: 'relative',
  },
  goalCardSelected: { backgroundColor: '#EEF5FF' },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: '#fff', fontSize: 10, fontWeight: '700' },
  goalEmoji: { fontSize: 28, marginBottom: 6 },
  goalName: { fontSize: 12, fontWeight: '600', color: Colors.text, textAlign: 'center', marginBottom: 4 },
  goalCoin: { fontSize: 12, fontWeight: '700', color: Colors.coin },

  refreshLink: { alignItems: 'center', paddingVertical: 10 },
  refreshText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },

  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  infoIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  infoIconText: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary },
  infoText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  infoHighlight: { color: Colors.coin, fontWeight: '600' },

  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  sheetSubtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: Colors.text, marginBottom: 6 },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    marginBottom: 12,
  },
  coinRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  coinInput: { flex: 1, marginBottom: 0 },
  aiBtn: {
    backgroundColor: Colors.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiBtnDisabled: { opacity: 0.4 },
  aiBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  aiResultCard: {
    backgroundColor: '#EEF5FF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  aiResultHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  aiResultIcon: { fontSize: 18 },
  aiResultTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  aiResultSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  aiResultCoin: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.coin,
    textAlign: 'center',
    marginVertical: 6,
  },
  aiResultWeeks: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },

  adjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 18,
    justifyContent: 'center',
  },
  adjustBtn: {
    width: 36,
    height: 36,
    backgroundColor: Colors.background,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustBtnText: { fontSize: 20, fontWeight: '700', color: Colors.textSecondary },
  adjustValue: { fontSize: 22, fontWeight: '700', color: Colors.text, minWidth: 60, textAlign: 'center' },

  applyBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  applyBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
```

- [ ] **Step 2: TypeScript 驗證**

```powershell
npx tsc --noEmit
```

Expected: 無輸出

- [ ] **Step 3: Commit**

```powershell
git add src/screens/onboarding/GoalSetupScreen.tsx
git commit -m "feat: implement GoalSetupScreen with preset goals and AI-assisted custom pricing"
```

---

## Task 6: TaskSelectionScreen.tsx

**Files:**
- Replace: `src/screens/onboarding/TaskSelectionScreen.tsx`

- [ ] **Step 1: 完整實作 TaskSelectionScreen**

以下內容完整替換 `src/screens/onboarding/TaskSelectionScreen.tsx`：

```typescript
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import { Colors } from '../../constants/colors';
import { fetchTemplates, recommendTasks, calcTotalCoin } from '../../lib/taskRecommend';
import type { SystemTaskTemplate, CustomTask } from '../../types/database';
import type { RootStackParamList } from '../../../App';

type Nav = StackNavigationProp<RootStackParamList, 'TaskSelection'>;
type Route = RouteProp<RootStackParamList, 'TaskSelection'>;

const DIFFICULTY_OPTIONS = [1, 1.5, 2, 2.5, 3];

export default function TaskSelectionScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { childId, childNickname, familyId, ageGroup, rewardName, goalCoinCost, isOnboarding } =
    route.params;

  const [allTemplates, setAllTemplates] = useState<SystemTaskTemplate[]>([]);
  const [displayedB, setDisplayedB] = useState<SystemTaskTemplate[]>([]);
  const [displayedC, setDisplayedC] = useState<SystemTaskTemplate[]>([]);
  const [showingAlt, setShowingAlt] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [customTasks, setCustomTasks] = useState<CustomTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltipVisible, setTooltipVisible] = useState(false);

  // Custom task modal
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [customModalCategory, setCustomModalCategory] = useState<'B' | 'C'>('B');
  const [customTaskName, setCustomTaskName] = useState('');
  const [customTaskTime, setCustomTaskTime] = useState('');
  const [customTaskDifficulty, setCustomTaskDifficulty] = useState(1);

  useEffect(() => {
    void loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    try {
      const templates = await fetchTemplates(ageGroup);
      setAllTemplates(templates);
      const { taskB, taskC } = recommendTasks(templates, false);
      setDisplayedB(taskB);
      setDisplayedC(taskC);
      // Pre-select the initial recommendation
      const initialIds = new Set([...taskB, ...taskC].map(t => t.id));
      setSelectedIds(initialIds);
    } catch {
      Alert.alert('載入失敗', '請重試');
    } finally {
      setLoading(false);
    }
  }

  function toggleSelection(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleRefresh() {
    const next = !showingAlt;
    const { taskB, taskC } = recommendTasks(allTemplates, next);
    if (taskB.length === 0 && taskC.length === 0) {
      Alert.alert('', '已顯示全部建議，可新增自訂任務 ✏️');
      return;
    }
    setShowingAlt(next);
    setDisplayedB(taskB);
    setDisplayedC(taskC);
  }

  function openCustomModal(category: 'B' | 'C') {
    setCustomModalCategory(category);
    setCustomTaskName('');
    setCustomTaskTime('');
    setCustomTaskDifficulty(1);
    setCustomModalVisible(true);
  }

  function handleAddCustomTask() {
    const timeMin = parseInt(customTaskTime, 10);
    if (!customTaskName.trim() || !timeMin || timeMin < 1) {
      Alert.alert('請填寫完整', '需要任務名稱與有效的時間');
      return;
    }
    const newTask: CustomTask = {
      name: customTaskName.trim(),
      category: customModalCategory,
      base_time_min: timeMin,
      difficulty: customTaskDifficulty,
      time_saving_min: customModalCategory === 'B' ? timeMin : 0,
    };
    setCustomTasks(prev => [...prev, newTask]);
    setCustomModalVisible(false);
  }

  const selectedTemplates = [...displayedB, ...displayedC].filter(t => selectedIds.has(t.id));
  const selectedC = selectedTemplates.filter(t => t.category === 'C');
  const customC = customTasks.filter(t => t.category === 'C');
  const totalCoin =
    calcTotalCoin(selectedC) +
    customC.reduce((s, t) => s + Math.round(t.base_time_min * t.difficulty), 0);

  function handleNext() {
    const templateIds = [...selectedIds];
    navigation.navigate('Overview', {
      childId,
      childNickname,
      familyId,
      selectedTemplateIds: templateIds,
      customTasks,
      rewardName,
      goalCoinCost,
      isOnboarding,
    });
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Progress */}
        <View style={styles.progressRow}>
          <View style={[styles.progressBar, styles.progressDone]} />
          <View style={[styles.progressBar, styles.progressActive]} />
          <View style={[styles.progressBar, styles.progressInactive]} />
        </View>

        <Text style={styles.title}>幫 {childNickname} 選任務</Text>
        <Text style={styles.subtitle}>
          目標：{rewardName}（{goalCoinCost} 幣）
        </Text>

        {/* Task-B section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>家庭本分</Text>
          <TouchableOpacity onPress={() => setTooltipVisible(v => !v)}>
            <View style={styles.infoIcon}>
              <Text style={styles.infoIconText}>i</Text>
            </View>
          </TouchableOpacity>
        </View>

        {tooltipVisible && (
          <View style={styles.tooltip}>
            <Text style={styles.tooltipText}>
              完成後，幫家裡省下這些分鐘。累積後，可以跟爸媽討論把它兌換成
              <Text style={{ color: Colors.primary, fontWeight: '600' }}> 家庭共同時間</Text>，
              例如週末一起出去玩 🎉
            </Text>
          </View>
        )}

        {displayedB.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.taskCard, selectedIds.has(t.id) && styles.taskCardSelected]}
            onPress={() => toggleSelection(t.id)}
            activeOpacity={0.75}
          >
            <View style={[styles.checkbox, selectedIds.has(t.id) && styles.checkboxSelected]}>
              {selectedIds.has(t.id) && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <View style={styles.taskInfo}>
              <Text style={styles.taskName}>{t.name}</Text>
              <Text style={styles.taskMeta}>
                {t.base_time_min} 分鐘・幫家裡省 {t.time_saving_min} 分鐘
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {customTasks.filter(t => t.category === 'B').map((t, i) => (
          <View key={`cb-${i}`} style={[styles.taskCard, styles.taskCardSelected]}>
            <View style={[styles.checkbox, styles.checkboxSelected]}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
            <View style={styles.taskInfo}>
              <Text style={styles.taskName}>{t.name} <Text style={styles.customBadge}>自訂</Text></Text>
              <Text style={styles.taskMeta}>
                {t.base_time_min} 分鐘・幫家裡省 {t.time_saving_min} 分鐘
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.sectionActions}>
          <TouchableOpacity onPress={() => openCustomModal('B')}>
            <Text style={styles.actionLink}>＋ 新增自訂任務</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleRefresh}>
            <Text style={styles.actionLinkSecondary}>🔄 換一批</Text>
          </TouchableOpacity>
        </View>

        {/* Task-C section */}
        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={styles.sectionTitle}>超出本分貢獻</Text>
        </View>

        {displayedC.map(t => {
          const coin = Math.round(t.base_time_min * t.difficulty);
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.taskCard, selectedIds.has(t.id) && styles.taskCardSelected]}
              onPress={() => toggleSelection(t.id)}
              activeOpacity={0.75}
            >
              <View style={[styles.checkbox, selectedIds.has(t.id) && styles.checkboxSelected]}>
                {selectedIds.has(t.id) && <Text style={styles.checkMark}>✓</Text>}
              </View>
              <View style={styles.taskInfo}>
                <Text style={styles.taskName}>{t.name}</Text>
                <Text style={styles.taskMeta}>
                  {t.base_time_min} 分鐘 × 難度 {t.difficulty}
                </Text>
              </View>
              <Text style={[styles.coinBadge, !selectedIds.has(t.id) && styles.coinBadgeDim]}>
                {coin} 幣
              </Text>
            </TouchableOpacity>
          );
        })}

        {customTasks.filter(t => t.category === 'C').map((t, i) => {
          const coin = Math.round(t.base_time_min * t.difficulty);
          return (
            <View key={`cc-${i}`} style={[styles.taskCard, styles.taskCardSelected]}>
              <View style={[styles.checkbox, styles.checkboxSelected]}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
              <View style={styles.taskInfo}>
                <Text style={styles.taskName}>{t.name} <Text style={styles.customBadge}>自訂</Text></Text>
                <Text style={styles.taskMeta}>
                  {t.base_time_min} 分鐘 × 難度 {t.difficulty}
                </Text>
              </View>
              <Text style={styles.coinBadge}>{coin} 幣</Text>
            </View>
          );
        })}

        <View style={styles.sectionActions}>
          <TouchableOpacity onPress={() => openCustomModal('C')}>
            <Text style={styles.actionLink}>＋ 新增自訂任務</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleRefresh}>
            <Text style={styles.actionLinkSecondary}>🔄 換一批</Text>
          </TouchableOpacity>
        </View>

        {/* Coin summary */}
        <View style={styles.coinSummary}>
          <Text style={styles.coinSummaryLabel}>每次全完成可賺</Text>
          <Text style={styles.coinSummaryValue}>{totalCoin} 幣</Text>
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={handleNext}>
          <Text style={styles.primaryBtnText}>下一步：確認總覽 →</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Custom task Modal */}
      <Modal
        visible={customModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCustomModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCustomModalVisible(false)}
        >
          <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              新增{customModalCategory === 'B' ? '家庭本分' : '賺幣'}任務
            </Text>

            <Text style={styles.fieldLabel}>任務名稱</Text>
            <TextInput
              style={styles.input}
              value={customTaskName}
              onChangeText={setCustomTaskName}
              placeholder="例：整理房間"
              placeholderTextColor={Colors.textSecondary}
            />

            <Text style={styles.fieldLabel}>預估時間（分鐘）</Text>
            <TextInput
              style={styles.input}
              value={customTaskTime}
              onChangeText={setCustomTaskTime}
              placeholder="例：15"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="numeric"
            />

            {customModalCategory === 'C' && (
              <>
                <Text style={styles.fieldLabel}>難度</Text>
                <View style={styles.difficultyRow}>
                  {DIFFICULTY_OPTIONS.map(d => (
                    <TouchableOpacity
                      key={d}
                      style={[
                        styles.difficultyBtn,
                        customTaskDifficulty === d && styles.difficultyBtnSelected,
                      ]}
                      onPress={() => setCustomTaskDifficulty(d)}
                    >
                      <Text
                        style={[
                          styles.difficultyBtnText,
                          customTaskDifficulty === d && styles.difficultyBtnTextSelected,
                        ]}
                      >
                        {d}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {customTaskTime ? (
                  <Text style={styles.coinPreview}>
                    預估幣值：{Math.round(parseInt(customTaskTime, 10) * customTaskDifficulty || 0)} 幣
                  </Text>
                ) : null}
              </>
            )}

            <TouchableOpacity style={styles.applyBtn} onPress={handleAddCustomTask}>
              <Text style={styles.applyBtnText}>加入任務 ✓</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 28 },
  progressBar: { flex: 1, height: 3, borderRadius: 2 },
  progressActive: { backgroundColor: Colors.primary },
  progressDone: { backgroundColor: Colors.success },
  progressInactive: { backgroundColor: Colors.border },

  title: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 28 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  infoIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoIconText: { fontSize: 9, fontWeight: '700', color: Colors.textSecondary },

  tooltip: {
    backgroundColor: Colors.text,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    marginTop: -4,
  },
  tooltipText: { fontSize: 12, color: '#D1D5DB', lineHeight: 18 },

  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 13,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  taskCardSelected: { backgroundColor: '#EEF5FF' },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxSelected: { backgroundColor: Colors.primary },
  checkMark: { color: '#fff', fontSize: 11, fontWeight: '700' },
  taskInfo: { flex: 1 },
  taskName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  taskMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  customBadge: { fontSize: 10, color: Colors.textSecondary, fontStyle: 'italic' },
  coinBadge: { fontSize: 13, fontWeight: '700', color: Colors.coin },
  coinBadgeDim: { color: Colors.textSecondary },

  sectionActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 2,
    marginBottom: 4,
  },
  actionLink: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  actionLinkSecondary: { fontSize: 13, color: Colors.textSecondary },

  coinSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  coinSummaryLabel: { fontSize: 14, color: Colors.textSecondary },
  coinSummaryValue: { fontSize: 20, fontWeight: '800', color: Colors.coin },

  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: Colors.text, marginBottom: 6 },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    marginBottom: 14,
  },
  difficultyRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  difficultyBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  difficultyBtnSelected: { backgroundColor: Colors.primary },
  difficultyBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  difficultyBtnTextSelected: { color: '#fff' },
  coinPreview: { fontSize: 13, color: Colors.coin, fontWeight: '600', marginBottom: 14 },
  applyBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  applyBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
```

- [ ] **Step 2: TypeScript 驗證**

```powershell
npx tsc --noEmit
```

Expected: 無輸出

- [ ] **Step 3: Commit**

```powershell
git add src/screens/onboarding/TaskSelectionScreen.tsx
git commit -m "feat: implement TaskSelectionScreen with template selection, custom tasks, and batch refresh"
```

---

## Task 7: OverviewScreen.tsx

**Files:**
- Replace: `src/screens/onboarding/OverviewScreen.tsx`

- [ ] **Step 1: 完整實作 OverviewScreen**

以下內容完整替換 `src/screens/onboarding/OverviewScreen.tsx`：

```typescript
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import { Colors } from '../../constants/colors';
import { confirmSetup, fetchTemplates } from '../../lib/taskRecommend';
import type { SystemTaskTemplate } from '../../types/database';
import type { RootStackParamList } from '../../../App';

type Nav = StackNavigationProp<RootStackParamList, 'Overview'>;
type Route = RouteProp<RootStackParamList, 'Overview'>;

export default function OverviewScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const {
    childId,
    childNickname,
    familyId,
    selectedTemplateIds,
    customTasks,
    rewardName,
    goalCoinCost,
    isOnboarding,
  } = route.params;

  const [confirming, setConfirming] = useState(false);

  // Derive template names from IDs by fetching — but we already have them in navigation history.
  // For simplicity, fetch templates again on mount to get display names.
  const [templateDetails, setTemplateDetails] = useState<SystemTaskTemplate[]>([]);

  React.useEffect(() => {
    void (async () => {
      try {
        // Re-fetch all templates to resolve IDs to names
        // In a real app this could come from a cache/context; fine for MVP
        const all = await fetchTemplates(route.params.selectedTemplateIds.length > 0 ? '6-9' : '6-9');
        const selected = all.filter(t => selectedTemplateIds.includes(t.id));
        setTemplateDetails(selected);
      } catch {
        // Non-critical — names will just be empty
      }
    })();
  }, []);

  const selectedB = templateDetails.filter(t => t.category === 'B');
  const selectedC = templateDetails.filter(t => t.category === 'C');
  const customB = customTasks.filter(t => t.category === 'B');
  const customC = customTasks.filter(t => t.category === 'C');

  const totalCoin = useMemo(() => {
    const fromTemplates = selectedC.reduce(
      (s, t) => s + Math.round(t.base_time_min * t.difficulty),
      0
    );
    const fromCustom = customC.reduce(
      (s, t) => s + Math.round(t.base_time_min * t.difficulty),
      0
    );
    return fromTemplates + fromCustom;
  }, [selectedC, customC]);

  const estimatedRounds = totalCoin > 0 ? Math.ceil(goalCoinCost / totalCoin) : '?';

  const allTaskBNames = [
    ...selectedB.map(t => t.name),
    ...customB.map(t => t.name),
  ];
  const allTaskCNames = [
    ...selectedC.map(t => t.name),
    ...customC.map(t => t.name),
  ];

  async function handleConfirm() {
    setConfirming(true);
    try {
      await confirmSetup({
        familyId,
        childId,
        templateIds: selectedTemplateIds,
        customTasks,
        rewardName,
        coinCost: goalCoinCost,
      });
      if (isOnboarding) {
        navigation.dispatch(
          CommonActions.reset({ index: 0, routes: [{ name: 'Parent' }] })
        );
      } else {
        navigation.pop(3);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '發生未知錯誤';
      Alert.alert('設定失敗', msg);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Progress */}
        <View style={styles.progressRow}>
          <View style={[styles.progressBar, styles.progressDone]} />
          <View style={[styles.progressBar, styles.progressDone]} />
          <View style={[styles.progressBar, styles.progressActive]} />
        </View>

        {/* Header with title and no top-level edit — edits are inline */}
        <Text style={styles.title}>確認 {childNickname} 的計畫</Text>
        <Text style={styles.subtitle}>看起來 OK 就出發 🚀</Text>

        {/* Goal card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>目標</Text>
            <TouchableOpacity onPress={() => navigation.pop(2)}>
              <Text style={styles.editLink}>✏️ 修改目標</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.goalRow}>
            <Text style={styles.goalName}>{rewardName}</Text>
            <Text style={styles.goalCoin}>{goalCoinCost} 幣</Text>
          </View>
        </View>

        {/* Task package card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>任務包</Text>
            <TouchableOpacity onPress={() => navigation.pop(1)}>
              <Text style={styles.editLink}>✏️ 修改任務</Text>
            </TouchableOpacity>
          </View>

          {allTaskBNames.length > 0 && (
            <>
              <Text style={styles.taskGroupLabel}>家庭本分</Text>
              <Text style={styles.taskList}>{allTaskBNames.join('・')}</Text>
            </>
          )}

          {allTaskBNames.length > 0 && allTaskCNames.length > 0 && (
            <View style={styles.divider} />
          )}

          {allTaskCNames.length > 0 && (
            <>
              <Text style={styles.taskGroupLabel}>賺幣任務</Text>
              <Text style={styles.taskList}>{allTaskCNames.join('・')}</Text>
            </>
          )}

          {allTaskBNames.length === 0 && allTaskCNames.length === 0 && (
            <Text style={styles.emptyNote}>尚未選取任何任務</Text>
          )}
        </View>

        {/* Estimate card */}
        <View style={styles.estimateCard}>
          <Text style={styles.estimateLabel}>全部完成時，大概…</Text>
          <View style={styles.estimateRow}>
            <View style={styles.estimateItem}>
              <Text style={styles.estimateValue}>{totalCoin} 幣</Text>
              <Text style={styles.estimateUnit}>每次最多可賺</Text>
            </View>
            <View style={styles.estimateDivider} />
            <View style={styles.estimateItem}>
              <Text style={styles.estimateValue}>~{estimatedRounds} 次</Text>
              <Text style={styles.estimateUnit}>就能換到目標</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.confirmBtn, confirming && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={confirming}
        >
          {confirming
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.confirmBtnText}>✓ 確認並開始！</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, paddingBottom: 48 },

  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 28 },
  progressBar: { flex: 1, height: 3, borderRadius: 2 },
  progressActive: { backgroundColor: Colors.primary },
  progressDone: { backgroundColor: Colors.success },

  title: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 24 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  editLink: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalName: { fontSize: 17, fontWeight: '700', color: Colors.text },
  goalCoin: { fontSize: 22, fontWeight: '800', color: Colors.coin },

  taskGroupLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  taskList: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 10 },
  emptyNote: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },

  estimateCard: {
    backgroundColor: Colors.text,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  estimateLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 12 },
  estimateRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  estimateItem: { alignItems: 'center' },
  estimateValue: { fontSize: 22, fontWeight: '800', color: Colors.coin },
  estimateUnit: { fontSize: 11, color: '#6B7280', marginTop: 4 },
  estimateDivider: { width: 1, height: 36, backgroundColor: '#374151' },

  confirmBtn: {
    backgroundColor: Colors.success,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
```

- [ ] **Step 2: TypeScript 驗證**

```powershell
npx tsc --noEmit
```

Expected: 無輸出

- [ ] **Step 3: Commit**

```powershell
git add src/screens/onboarding/OverviewScreen.tsx
git commit -m "feat: implement OverviewScreen with goal/task summary and atomic DB confirmation"
```

---

## Task 8: OnboardingScreen.tsx — 完成接線

**Files:**
- Modify: `src/screens/onboarding/OnboardingScreen.tsx`

- [ ] **Step 1: 更新 handleSubmit — 從 Parent 改為跳轉 GoalSetup**

找到 `OnboardingScreen.tsx` 中的 `handleSubmit` 函數內：

**原本（約 169-183 行）：**
```typescript
    try {
      await submitOnboarding({
        parentName,
        familyName,
        answers: Object.values(answers),
        childNickname,
        childBirthDate: birthDate,
        childPin: childPin.length === 4 ? childPin : undefined,
      });
      navigation.replace('Parent');
    } catch (err) {
```

**替換為：**
```typescript
    try {
      const { familyId, childId, ageGroup } = await submitOnboarding({
        parentName,
        familyName,
        answers: Object.values(answers),
        childNickname,
        childBirthDate: birthDate,
        childPin: childPin.length === 4 ? childPin : undefined,
      });
      navigation.replace('GoalSetup', {
        childId,
        childNickname,
        familyId,
        ageGroup,
        isOnboarding: true,
      });
    } catch (err) {
```

- [ ] **Step 2: 確認 QuestionOption import 正確（OnboardingScreen 有使用 QuestionOption）**

在 `OnboardingScreen.tsx` 的 import 區塊確認有：
```typescript
import {
  QUESTIONS,
  SelectedAnswer,
  signUpUser,
  submitOnboarding,
  calcAgeGroup,
} from '../../lib/onboarding';
```

如有 `QuestionOption` 未 import 的錯誤，補上：
```typescript
import type { QuestionOption } from '../../lib/onboarding';
```

- [ ] **Step 3: TypeScript 全專案驗證**

```powershell
npx tsc --noEmit
```

Expected: 無輸出（0 errors）

- [ ] **Step 4: 加入 EXPO_PUBLIC_GEMINI_API_KEY 到 .env**

確認 `shadow-wallet` 根目錄有 `.env` 文件，加入：

```
EXPO_PUBLIC_GEMINI_API_KEY=你的_Gemini_API_Key
```

取得 key：[Google AI Studio](https://aistudio.google.com/app/apikey) → 免費方案

- [ ] **Step 5: 跑完整測試**

```powershell
npx jest --no-coverage
```

Expected: All tests pass（至少 8 tests in taskRecommend.test.ts）

- [ ] **Step 6: Final Commit**

```powershell
git add src/screens/onboarding/OnboardingScreen.tsx .env
git commit -m "feat: wire OnboardingScreen to GoalSetup flow, complete flow-1 implementation"
```

---

## 手動測試流程

完成所有 Task 後，在 Expo Go 驗證：

1. 從 Entry → Onboarding → 填完所有步驟 → 應跳至 GoalSetupScreen（不再是 ParentScreen）
2. GoalSetupScreen：點選預設目標 → 藍色勾出現 → 「下一步」可用
3. GoalSetupScreen：點「自己填…」→ Modal 彈出 → 輸入名稱 → 點「✨ AI 建議」→ loading → 建議結果 → 微調 → 套用
4. TaskSelectionScreen：兩個分區各有任務列表，預設已勾選 → 勾選後藍色背景 → 底部幣值即時更新
5. TaskSelectionScreen：點「ⓘ」→ tooltip 展開
6. TaskSelectionScreen：點「換一批」→ 不同任務出現（或提示已看完）
7. TaskSelectionScreen：點「＋ 新增自訂任務」→ Modal → 填入 → 確認 → 出現在列表中
8. OverviewScreen：「✏️ 修改目標」回到 GoalSetup；「✏️ 修改任務」回到 TaskSelection
9. OverviewScreen：點「確認並開始！」→ loading → 成功後跳至 Parent（初次）
10. Supabase Table Editor：確認 tasks、child_tasks、reward_items 有新資料寫入
11. 從 Parent → GoalSetup（重入）→ 完成後 `pop(3)` 回到原本的 Parent（不是新的 Parent）
