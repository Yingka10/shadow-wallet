# HomeScreen Design System Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 HomeScreen 及其任務卡元件從深藍配色翻譯成設計稿的奶油色 Picture-Book 風格，保留所有現有業務邏輯不動。

**Architecture:** 新增五個專責元件（TaskIcons、DutyTaskCard、ContributionTaskCard、GoalHeroCard、BottomNav）各負責一種視覺類型；更新 `colors.ts` 為設計系統 token；HomeScreen 重組佈局但保持所有 hook / callback 不變。未實作的功能（錢包餘額、底部導航其他分頁）使用 Mock Data 與 `Alert.alert` 佔位。

**Tech Stack:** React Native + Expo ~54, react-native-svg (新增), TypeScript strict, @testing-library/react-native (bundled with jest-expo)

---

## File Map

| 動作 | 檔案 | 說明 |
|------|------|------|
| MODIFY | `src/constants/colors.ts` | 換成設計系統 token |
| CREATE | `src/components/icons/TaskIcons.tsx` | SVG icon 元件（Hourglass、Coin、Check、Target、Wave、Home、Wallet、Star、Sparkle） |
| CREATE | `src/components/DutyTaskCard.tsx` | Task-A/B 本分任務卡（sky/sage 背景、hourglass icon） |
| CREATE | `src/components/ContributionTaskCard.tsx` | Task-C 貢獻任務卡（gold 背景、discount nudge） |
| CREATE | `src/components/GoalHeroCard.tsx` | Task-D 長期目標 Hero 卡（streak / level 兩種型態） |
| CREATE | `src/components/BottomNav.tsx` | 底部導覽列 4 分頁（非首頁 → Alert 佔位） |
| MODIFY | `src/screens/child/HomeScreen.tsx` | 套用新設計、組合上述元件 |
| **UNTOUCHED** | `src/hooks/useTodayTasks.ts` | 業務邏輯完全保留 |
| **UNTOUCHED** | `src/lib/taskActions.ts` | 業務邏輯完全保留 |
| **UNTOUCHED** | `src/components/TaskItem.tsx` | 保留但 HomeScreen 不再引用 |
| **UNTOUCHED** | `src/components/TaskCompleteModal.tsx` | 保留不動 |
| **UNTOUCHED** | `src/components/FeedbackAnimation.tsx` | 保留不動 |

---

## Task 0: Install react-native-svg

**Files:**
- Modify: `package.json` (via expo install)

- [ ] **Step 1: Install the package**

```bash
npx expo install react-native-svg
```

Expected: package installs successfully, `package.json` dependencies 出現 `"react-native-svg": "..."`.

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-native-svg for custom icon components"
```

---

## Task 1: Design System Tokens

**Files:**
- Modify: `src/constants/colors.ts`

- [ ] **Step 1: Replace colors.ts with design system tokens**

```typescript
// src/constants/colors.ts
export const Colors = {
  // Cream (canvas + surfaces)
  cream50:  '#FFF8EE',
  cream100: '#FFF2DF',
  cream200: '#F8E8CE',
  cream300: '#EDD7B4',

  // Ink (text — warm dark brown, never pure black)
  ink900: '#3B2A1E',
  ink700: '#5A4232',
  ink500: '#876A53',
  ink300: '#B89C82',
  ink100: '#E5D6C3',

  // Coral (primary brand, CTAs)
  coral100: '#FFE3D6',
  coral300: '#F8B49B',
  coral500: '#F08C6A',
  coral600: '#DB6E48',
  coral700: '#B5552F',

  // Gold (coins, contribution cards, earned)
  gold100: '#FFF0BF',
  gold300: '#FFD86B',
  gold500: '#F5B800',
  gold600: '#D69A00',
  gold700: '#A87800',

  // Sky (Task-A duty soft tint)
  sky100: '#E5F2F8',
  sky200: '#C8E4F0',
  sky400: '#95C5DD',
  sky600: '#5994B3',

  // Sage (Task-B duty alt tint, success)
  sage100: '#ECF4E2',
  sage200: '#D4E8C8',
  sage400: '#A8C98D',
  sage600: '#6E9A55',

  // Lilac (parent/settings, sparingly)
  lilac200: '#E6DEF1',
  lilac500: '#9B82C7',

  // Semantic aliases
  bgCanvas:             '#FFF8EE',
  bgSurface:            '#FFFFFF',
  bgSurfaceWarm:        '#FFF2DF',
  bgDuty:               '#C8E4F0',   // Task-A card
  bgDutyAlt:            '#D4E8C8',   // Task-B card
  bgContribution:       '#FFF0BF',   // Task-C card

  fgPrimary:   '#3B2A1E',
  fgSecondary: '#5A4232',
  fgMuted:     '#876A53',

  accent:      '#F08C6A',
  accentPress: '#DB6E48',
  success:     '#6E9A55',
  warning:     '#F08C6A',
  info:        '#5994B3',

  borderSoft:   'rgba(95, 60, 30, 0.10)',
  borderMedium: 'rgba(95, 60, 30, 0.18)',

  // Use as shadowColor in RN shadow props
  shadowWarm: 'rgba(95, 60, 30, 1)',
  shadowGold: 'rgba(245, 184, 0, 1)',
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/constants/colors.ts
git commit -m "chore: replace colors.ts with Shadow Wallet design system tokens"
```

---

## Task 2: SVG Icon Components

**Files:**
- Create: `src/components/icons/TaskIcons.tsx`
- Test: `src/components/icons/__tests__/TaskIcons.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/icons/__tests__/TaskIcons.test.tsx`:

```typescript
import React from 'react';
import { render } from '@testing-library/react-native';
import {
  HourglassIcon,
  CoinIcon,
  CheckIcon,
  TargetIcon,
  WaveIcon,
  HomeIcon,
  WalletIcon,
  StarIcon,
  SparkleIcon,
} from '../TaskIcons';

describe('TaskIcons', () => {
  it('renders HourglassIcon', () => {
    expect(render(<HourglassIcon size={28} />).toJSON()).not.toBeNull();
  });
  it('renders CoinIcon', () => {
    expect(render(<CoinIcon size={28} />).toJSON()).not.toBeNull();
  });
  it('renders CheckIcon', () => {
    expect(render(<CheckIcon size={24} color="#3B2A1E" />).toJSON()).not.toBeNull();
  });
  it('renders TargetIcon', () => {
    expect(render(<TargetIcon size={44} />).toJSON()).not.toBeNull();
  });
  it('renders WaveIcon', () => {
    expect(render(<WaveIcon />).toJSON()).not.toBeNull();
  });
  it('renders HomeIcon', () => {
    expect(render(<HomeIcon size={24} color="#3B2A1E" />).toJSON()).not.toBeNull();
  });
  it('renders WalletIcon', () => {
    expect(render(<WalletIcon size={24} color="#3B2A1E" />).toJSON()).not.toBeNull();
  });
  it('renders StarIcon', () => {
    expect(render(<StarIcon size={24} />).toJSON()).not.toBeNull();
  });
  it('renders SparkleIcon', () => {
    expect(render(<SparkleIcon size={24} />).toJSON()).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npx jest TaskIcons.test --no-coverage
```

Expected: FAIL — "Cannot find module '../TaskIcons'"

- [ ] **Step 3: Create icon components**

Create `src/components/icons/TaskIcons.tsx`:

```typescript
import React from 'react';
import Svg, { Path, Circle, Ellipse, Rect } from 'react-native-svg';
import { Colors } from '../../constants/colors';

interface IconProps {
  size?: number;
  color?: string;
}

// Hourglass — duty task marker (assets/icons/hourglass.svg, 64×64)
export function HourglassIcon({ size = 28 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Path d="M18 8h28M18 56h28" stroke={Colors.ink900} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M20 8c0 10 12 14 12 24S20 46 20 56" stroke={Colors.ink900} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M44 8c0 10-12 14-12 24s12 14 12 24" stroke={Colors.ink900} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M23 12c0 5 3 8 9 13M41 12c0 5-3 8-9 13" fill={Colors.sky200} />
      <Path d="M23 52c0-6 3-9 9-12 6 3 9 6 9 12z" fill={Colors.sky400} />
      <Path d="M23 52c0-6 3-9 9-12 6 3 9 6 9 12" stroke={Colors.ink900} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={32} cy={34} r={1.2} fill={Colors.ink900} />
      <Circle cx={32} cy={38} r={0.8} fill={Colors.ink900} />
    </Svg>
  );
}

// Coin — gold coin for contribution tasks (assets/icons/coin.svg, 64×64)
export function CoinIcon({ size = 28 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Ellipse cx={32} cy={34} rx={22} ry={22} fill={Colors.gold600} />
      <Circle cx={32} cy={32} r={22} fill={Colors.gold500} />
      <Circle cx={32} cy={32} r={18} fill={Colors.gold300} />
      <Path d="M22 22c2-3 6-5 10-5" stroke={Colors.gold100} strokeWidth={2.5} strokeLinecap="round" />
      <Path
        d="M32 22v20M26 27c0-2 2-3 6-3s6 1 6 3-2 3-6 3-6 1-6 3 2 3 6 3 6-1 6-3"
        stroke={Colors.gold700}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// Check — check-in button (assets/icons/check.svg, 24×24)
export function CheckIcon({ size = 24, color = Colors.ink900 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4.5 4.5L19 7" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Target — long-term goal indicator (assets/icons/target.svg, 64×64)
export function TargetIcon({ size = 44 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Circle cx={32} cy={32} r={22} stroke={Colors.ink900} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={32} cy={32} r={14} stroke={Colors.ink900} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={32} cy={32} r={6} fill={Colors.coral500} />
      <Circle cx={32} cy={32} r={2} fill={Colors.ink900} />
    </Svg>
  );
}

// Wave — section divider (from Components.jsx SWSection, 40×10)
export function WaveIcon() {
  return (
    <Svg width={40} height={10} viewBox="0 0 40 10" fill="none">
      <Path d="M2 5c4-4 8 4 12 0s8-4 12 0 8 4 12 0" stroke={Colors.ink300} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// Home — bottom nav (assets/icons/home.svg, 24×24)
export function HomeIcon({ size = 24, color = Colors.ink500 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 11.5L12 4l9 7.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 10v9h14v-9" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10 19v-5h4v5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Wallet — bottom nav (assets/icons/wallet.svg, 24×24)
export function WalletIcon({ size = 24, color = Colors.ink500 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={6} width={18} height={13} rx={3} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 10h13a3 3 0 013 3v0a3 3 0 01-3 3H3" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={14.5} cy={13} r={1.2} fill={color} />
    </Svg>
  );
}

// Star — bottom nav 願望 tab (assets/icons/star.svg, 24×24)
export function StarIcon({ size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l2.4 6 6.6.6-5 4.4 1.6 6.5L12 17.3 6.4 20.5 8 14l-5-4.4 6.6-.6z"
        fill={Colors.gold300}
        stroke={Colors.gold600}
        strokeWidth={0}
      />
    </Svg>
  );
}

// Sparkle — bottom nav 回顧 tab (assets/icons/sparkle.svg, 24×24)
export function SparkleIcon({ size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={Colors.gold500} stroke={Colors.gold600} strokeWidth={1} strokeLinejoin="round">
      <Path d="M12 2l1.6 5.5L19 9l-4 3.8 1 5.5L12 15.6 8 18.3l1-5.5L5 9l5.4-1.5z" />
    </Svg>
  );
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx jest TaskIcons.test --no-coverage
```

Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/icons/
git commit -m "feat: add SVG icon components from design system assets"
```

---

## Task 3: DutyTaskCard

**Files:**
- Create: `src/components/DutyTaskCard.tsx`
- Test: `src/components/__tests__/DutyTaskCard.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/__tests__/DutyTaskCard.test.tsx`:

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import DutyTaskCard from '../DutyTaskCard';
import type { TodayTask } from '../../hooks/useTodayTasks';

const makeTask = (overrides: Partial<TodayTask> = {}): TodayTask => ({
  id: 'task-1',
  name: '刷牙',
  category: 'A',
  base_time_min: 5,
  difficulty: 1,
  coin_override: null,
  day_type: 'weekday',
  is_active: true,
  is_long_term: false,
  allow_repeat: false,
  time_saving_min: 0,
  isCompleted: false,
  ...overrides,
} as TodayTask);

describe('DutyTaskCard', () => {
  it('renders task name', () => {
    render(<DutyTaskCard task={makeTask()} isCompleted={false} onPress={() => {}} />);
    expect(screen.getByText('刷牙')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<DutyTaskCard task={makeTask()} isCompleted={false} onPress={onPress} />);
    fireEvent.press(screen.getByAccessibilityHint('刷牙，未完成'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows 省 X 分 pill for Task-B with time_saving_min', () => {
    render(<DutyTaskCard task={makeTask({ category: 'B', time_saving_min: 10 })} isCompleted={false} onPress={() => {}} />);
    expect(screen.getByText('省 10 分')).toBeTruthy();
  });

  it('does NOT show time-saving pill for Task-A', () => {
    render(<DutyTaskCard task={makeTask({ category: 'A' })} isCompleted={false} onPress={() => {}} />);
    expect(screen.queryByText(/省/)).toBeNull();
  });

  it('is disabled when completed and allow_repeat is false', () => {
    const onPress = jest.fn();
    const { getByAccessibilityHint } = render(
      <DutyTaskCard task={makeTask()} isCompleted={true} onPress={onPress} />
    );
    fireEvent.press(getByAccessibilityHint('刷牙，已完成'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npx jest DutyTaskCard.test --no-coverage
```

Expected: FAIL — "Cannot find module '../DutyTaskCard'"

- [ ] **Step 3: Create DutyTaskCard**

Create `src/components/DutyTaskCard.tsx`:

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';
import { HourglassIcon, CheckIcon } from './icons/TaskIcons';
import type { TodayTask } from '../hooks/useTodayTasks';

interface DutyTaskCardProps {
  task: TodayTask;
  isCompleted: boolean;
  onPress: () => void;
}

const CAT_LABEL: Record<string, string> = { A: '自理', B: '本分' };

export default function DutyTaskCard({ task, isCompleted, onPress }: DutyTaskCardProps) {
  const bg = task.category === 'B' ? Colors.bgDutyAlt : Colors.bgDuty;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: bg }, isCompleted && styles.cardDone]}
      onPress={onPress}
      disabled={isCompleted && !task.allow_repeat}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityHint={`${task.name}，${isCompleted ? '已完成' : '未完成'}`}
    >
      <View style={styles.iconWrap}>
        <HourglassIcon size={28} />
      </View>

      <View style={styles.mid}>
        <Text style={[styles.taskName, isCompleted && styles.taskNameDone]} numberOfLines={2}>
          {task.name}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.catLabel}>{CAT_LABEL[task.category] ?? task.category}</Text>
          {task.category === 'B' && task.time_saving_min > 0 && (
            <View style={styles.timePill}>
              <Text style={styles.timePillText}>省 {task.time_saving_min} 分</Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.checkBtn, isCompleted && styles.checkBtnDone]}>
        {isCompleted && <CheckIcon size={16} color="#FFFFFF" />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
    marginBottom: 10,
  },
  cardDone: {
    opacity: 0.55,
  },
  iconWrap: {
    width: 44,
    height: 44,
    backgroundColor: Colors.bgSurface,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  mid: {
    flex: 1,
    gap: 4,
  },
  taskName: {
    fontWeight: '700',
    fontSize: 17,
    color: Colors.ink900,
    lineHeight: 22,
  },
  taskNameDone: {
    textDecorationLine: 'line-through',
    color: Colors.ink500,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink700,
  },
  timePill: {
    backgroundColor: Colors.sage600,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  timePillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  checkBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: Colors.ink300,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkBtnDone: {
    backgroundColor: Colors.sage600,
    borderColor: 'transparent',
  },
});
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx jest DutyTaskCard.test --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/DutyTaskCard.tsx src/components/__tests__/DutyTaskCard.test.tsx
git commit -m "feat: add DutyTaskCard with sky/sage picture-book design"
```

---

## Task 4: ContributionTaskCard

**Files:**
- Create: `src/components/ContributionTaskCard.tsx`
- Test: `src/components/__tests__/ContributionTaskCard.test.tsx`

Business logic preserved from `TaskItem.tsx`: `calcDisplayCoin` (coin_override ?? round(base_time_min × difficulty), then × 0.7 if prerequisite not met).

- [ ] **Step 1: Write failing tests**

Create `src/components/__tests__/ContributionTaskCard.test.tsx`:

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ContributionTaskCard from '../ContributionTaskCard';
import type { TodayTask } from '../../hooks/useTodayTasks';

const makeTask = (overrides: Partial<TodayTask> = {}): TodayTask => ({
  id: 'task-c1',
  name: '幫忙洗碗',
  category: 'C',
  base_time_min: 10,
  difficulty: 1.5,
  coin_override: null,
  day_type: 'weekday',
  is_active: true,
  is_long_term: false,
  allow_repeat: false,
  time_saving_min: 0,
  isCompleted: false,
  ...overrides,
} as TodayTask);

// base = round(10 * 1.5) = 15
describe('ContributionTaskCard', () => {
  it('renders task name', () => {
    render(<ContributionTaskCard task={makeTask()} isCompleted={false} isPrerequisiteMet={true} onPress={() => {}} />);
    expect(screen.getByText('幫忙洗碗')).toBeTruthy();
  });

  it('shows full coin when prerequisite met (15 幣)', () => {
    render(<ContributionTaskCard task={makeTask()} isCompleted={false} isPrerequisiteMet={true} onPress={() => {}} />);
    expect(screen.getByText('+15 幣')).toBeTruthy();
  });

  it('shows discounted coin when prerequisite not met (round(15 * 0.7) = 11 幣)', () => {
    render(<ContributionTaskCard task={makeTask()} isCompleted={false} isPrerequisiteMet={false} onPress={() => {}} />);
    expect(screen.getByText('+11 幣')).toBeTruthy();
  });

  it('shows discount nudge when prerequisite not met and not completed', () => {
    render(<ContributionTaskCard task={makeTask()} isCompleted={false} isPrerequisiteMet={false} onPress={() => {}} />);
    expect(screen.getByText('先完成本分，解鎖完整金幣！')).toBeTruthy();
  });

  it('hides discount nudge when task is completed', () => {
    render(<ContributionTaskCard task={makeTask()} isCompleted={true} isPrerequisiteMet={false} onPress={() => {}} />);
    expect(screen.queryByText('先完成本分，解鎖完整金幣！')).toBeNull();
  });

  it('uses coin_override when set', () => {
    render(
      <ContributionTaskCard task={makeTask({ coin_override: 20 })} isCompleted={false} isPrerequisiteMet={true} onPress={() => {}} />
    );
    expect(screen.getByText('+20 幣')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<ContributionTaskCard task={makeTask()} isCompleted={false} isPrerequisiteMet={true} onPress={onPress} />);
    fireEvent.press(screen.getByText('幫忙洗碗'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npx jest ContributionTaskCard.test --no-coverage
```

Expected: FAIL — "Cannot find module '../ContributionTaskCard'"

- [ ] **Step 3: Create ContributionTaskCard**

Create `src/components/ContributionTaskCard.tsx`:

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';
import { CoinIcon, CheckIcon } from './icons/TaskIcons';
import type { TodayTask } from '../hooks/useTodayTasks';
import type { Task } from '../types/database';

interface ContributionTaskCardProps {
  task: TodayTask;
  isCompleted: boolean;
  isPrerequisiteMet: boolean;
  onPress: () => void;
}

function calcDisplayCoin(task: Task, isPrerequisiteMet: boolean): number {
  const base = task.coin_override ?? Math.round(task.base_time_min * task.difficulty);
  return Math.round(base * (isPrerequisiteMet ? 1.0 : 0.7));
}

export default function ContributionTaskCard({
  task,
  isCompleted,
  isPrerequisiteMet,
  onPress,
}: ContributionTaskCardProps) {
  const showDiscount = !isPrerequisiteMet && !isCompleted;
  const displayCoin = calcDisplayCoin(task, isPrerequisiteMet);
  const fullCoin = calcDisplayCoin(task, true);

  return (
    <TouchableOpacity
      style={[styles.card, isCompleted && styles.cardDone]}
      onPress={onPress}
      disabled={isCompleted && !task.allow_repeat}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${task.name}，貢獻任務，${displayCoin} 金幣`}
    >
      <View style={styles.topRow}>
        <View style={isCompleted ? styles.coinOpaque : undefined}>
          <CoinIcon size={48} />
        </View>

        <View style={styles.mid}>
          <Text style={[styles.taskName, isCompleted && styles.taskNameDone]} numberOfLines={2}>
            {task.name}
          </Text>
          <Text style={styles.catLabel}>貢獻任務</Text>
        </View>

        <View style={styles.rewardPill}>
          <CoinIcon size={18} />
          {showDiscount ? (
            <Text style={styles.rewardText}>
              <Text style={styles.strikeText}>+{fullCoin} </Text>
              +{displayCoin} 幣
            </Text>
          ) : (
            <Text style={styles.rewardText}>+{displayCoin} 幣</Text>
          )}
        </View>

        <View style={[styles.checkBtn, isCompleted && styles.checkBtnDone]}>
          {isCompleted && <CheckIcon size={16} color="#FFFFFF" />}
        </View>
      </View>

      {showDiscount && (
        <View style={styles.nudge}>
          <View style={styles.nudgeDot} />
          <Text style={styles.nudgeText}>先完成本分，解鎖完整金幣！</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgContribution,
    borderRadius: 20,
    padding: 16,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
    marginBottom: 10,
  },
  cardDone: {
    opacity: 0.55,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  coinOpaque: {
    opacity: 0.55,
  },
  mid: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  taskName: {
    fontWeight: '800',
    fontSize: 18,
    color: Colors.ink900,
    lineHeight: 23,
  },
  taskNameDone: {
    textDecorationLine: 'line-through',
    color: Colors.ink500,
  },
  catLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink700,
  },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.bgSurface,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 10,
    borderRadius: 999,
    flexShrink: 0,
  },
  rewardText: {
    fontWeight: '800',
    fontSize: 14,
    color: Colors.gold700,
  },
  strikeText: {
    textDecorationLine: 'line-through',
    opacity: 0.55,
  },
  checkBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: Colors.ink300,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkBtnDone: {
    backgroundColor: Colors.gold600,
    borderColor: 'transparent',
  },
  nudge: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  nudgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.coral500,
  },
  nudgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.coral700,
  },
});
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx jest ContributionTaskCard.test --no-coverage
```

Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ContributionTaskCard.tsx src/components/__tests__/ContributionTaskCard.test.tsx
git commit -m "feat: add ContributionTaskCard with gold design and prerequisite nudge"
```

---

## Task 5: GoalHeroCard

**Files:**
- Create: `src/components/GoalHeroCard.tsx`
- Test: `src/components/__tests__/GoalHeroCard.test.tsx`

Two variants: `goal.goal_type === 'habit'` → streak card (gold tint, progress bar, 打卡 button); else → level card (sage tint, pip indicators, level badge on icon).

**Mock note:** `LongTermGoal` has no `currentSubtask` field — level variant shows "Level X / Y" only. Flag for product team.

- [ ] **Step 1: Write failing tests**

Create `src/components/__tests__/GoalHeroCard.test.tsx`:

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import GoalHeroCard from '../GoalHeroCard';
import type { TodayTask } from '../../hooks/useTodayTasks';
import type { LongTermGoal } from '../../types/database';

const makeTask = (): TodayTask => ({
  id: 'task-d1',
  name: '每天練習鋼琴',
  category: 'D',
  base_time_min: 30,
  difficulty: 1,
  coin_override: null,
  day_type: 'both',
  is_active: true,
  is_long_term: true,
  allow_repeat: true,
  time_saving_min: 0,
  isCompleted: false,
} as TodayTask);

const makeGoal = (overrides: Partial<LongTermGoal> = {}): LongTermGoal => ({
  id: 'goal-1',
  child_id: 'child-1',
  task_id: 'task-d1',
  goal_type: 'habit',
  current_day: 7,
  total_days: 30,
  status: 'active',
  checkpoint_rewards: {},
  created_at: '2024-01-01',
  ...overrides,
} as LongTermGoal);

describe('GoalHeroCard — streak variant', () => {
  it('renders goal title', () => {
    render(<GoalHeroCard task={makeTask()} goal={makeGoal()} isCompleted={false} onCheckIn={() => {}} onOpen={() => {}} />);
    expect(screen.getByText('每天練習鋼琴')).toBeTruthy();
  });

  it('shows streak progress label', () => {
    render(<GoalHeroCard task={makeTask()} goal={makeGoal()} isCompleted={false} onCheckIn={() => {}} onOpen={() => {}} />);
    expect(screen.getByText('第 7 天')).toBeTruthy();
    expect(screen.getByText('再 23 天就完成這一輪挑戰！')).toBeTruthy();
  });

  it('calls onCheckIn when 打卡 button pressed', () => {
    const onCheckIn = jest.fn();
    render(<GoalHeroCard task={makeTask()} goal={makeGoal()} isCompleted={false} onCheckIn={onCheckIn} onOpen={() => {}} />);
    fireEvent.press(screen.getByAccessibilityLabel('今天打卡'));
    expect(onCheckIn).toHaveBeenCalledTimes(1);
  });

  it('calls onOpen when card body pressed', () => {
    const onOpen = jest.fn();
    render(<GoalHeroCard task={makeTask()} goal={makeGoal()} isCompleted={false} onCheckIn={() => {}} onOpen={onOpen} />);
    fireEvent.press(screen.getByAccessibilityLabel('長期目標：每天練習鋼琴'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('GoalHeroCard — level variant', () => {
  it('shows level sub-text for non-habit goal', () => {
    const levelGoal = makeGoal({ goal_type: 'skill', current_day: 2, total_days: 5 });
    render(<GoalHeroCard task={makeTask()} goal={levelGoal} isCompleted={false} onCheckIn={() => {}} onOpen={() => {}} />);
    expect(screen.getByText('Level 2 / 5')).toBeTruthy();
  });

  it('does not render 打卡 button for level variant', () => {
    const levelGoal = makeGoal({ goal_type: 'skill' });
    render(<GoalHeroCard task={makeTask()} goal={levelGoal} isCompleted={false} onCheckIn={() => {}} onOpen={() => {}} />);
    expect(screen.queryByAccessibilityLabel('今天打卡')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npx jest GoalHeroCard.test --no-coverage
```

Expected: FAIL — "Cannot find module '../GoalHeroCard'"

- [ ] **Step 3: Create GoalHeroCard**

Create `src/components/GoalHeroCard.tsx`:

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';
import { TargetIcon, CheckIcon } from './icons/TaskIcons';
import type { TodayTask } from '../hooks/useTodayTasks';
import type { LongTermGoal } from '../types/database';

interface GoalHeroCardProps {
  task: TodayTask;
  goal: LongTermGoal;
  isCompleted: boolean;
  onCheckIn: () => void;
  onOpen: () => void;
}

function ProgressPips({ current, total }: { current: number; total: number }) {
  const visible = Math.min(total, 8);
  return (
    <View style={styles.pips}>
      {Array.from({ length: visible }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.pip,
            {
              backgroundColor:
                i < current - 1
                  ? Colors.sage400
                  : i === current - 1
                  ? Colors.sage600
                  : Colors.cream200,
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function GoalHeroCard({
  task,
  goal,
  isCompleted,
  onCheckIn,
  onOpen,
}: GoalHeroCardProps) {
  const isStreak = goal.goal_type === 'habit';
  const total = goal.total_days ?? 30;
  const progressPct = Math.min(Math.round((goal.current_day / total) * 100), 100);
  const remaining = total - goal.current_day;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: isStreak ? Colors.gold100 : Colors.sage100 }]}
      onPress={onOpen}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`長期目標：${task.name}`}
    >
      {/* Radial spotlight tint (approximated as top-fade overlay) */}
      <View
        pointerEvents="none"
        style={[
          styles.tintOverlay,
          {
            backgroundColor: isStreak
              ? 'rgba(255,216,107,0.35)'
              : 'rgba(168,213,186,0.35)',
          },
        ]}
      />

      {/* Icon square */}
      <View style={styles.iconWrap}>
        <TargetIcon size={44} />
        {!isStreak && (
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>{goal.current_day}</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.labelRow}>
          <Text
            style={[
              styles.typeLabel,
              { color: isStreak ? Colors.coral600 : Colors.sage600 },
            ]}
          >
            長期目標 · {isStreak ? '連續打卡' : '等級解鎖'}
          </Text>
          {isStreak && (
            <View style={styles.streakRibbon}>
              <Text style={styles.streakRibbonText}>🔥 第 {goal.current_day} 天</Text>
            </View>
          )}
        </View>

        <Text style={styles.goalTitle} numberOfLines={2}>
          {task.name}
        </Text>

        {isStreak ? (
          <>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
              <Text style={styles.progressLabel}>
                {goal.current_day} / {total}
              </Text>
            </View>
            <Text style={styles.goalSub}>
              {remaining > 0
                ? `再 ${remaining} 天就完成這一輪挑戰！`
                : '這一輪完成了，繼續保持！'}
            </Text>
          </>
        ) : (
          <>
            <ProgressPips current={goal.current_day} total={total} />
            <Text style={styles.goalSub}>Level {goal.current_day} / {total}</Text>
          </>
        )}
      </View>

      {/* 打卡 button (streak only) */}
      {isStreak && (
        <TouchableOpacity
          style={[styles.stampBtn, isCompleted && styles.stampBtnDone]}
          onPress={onCheckIn}
          accessibilityLabel="今天打卡"
          accessibilityRole="button"
        >
          <CheckIcon size={24} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    marginBottom: 18,
    overflow: 'hidden',
    shadowColor: Colors.shadowGold,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 32,
    elevation: 6,
  },
  tintOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  iconWrap: {
    width: 68,
    height: 68,
    backgroundColor: Colors.bgSurface,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 3,
  },
  levelBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    backgroundColor: Colors.sage600,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  streakRibbon: {
    backgroundColor: Colors.bgSurface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  streakRibbonText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.ink700,
  },
  goalTitle: {
    fontWeight: '800',
    fontSize: 20,
    color: Colors.ink900,
    lineHeight: 24,
    marginBottom: 10,
  },
  progressTrack: {
    height: 12,
    backgroundColor: Colors.bgSurface,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 8,
    justifyContent: 'center',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.gold500,
    borderRadius: 999,
  },
  progressLabel: {
    position: 'absolute',
    right: 8,
    fontSize: 10,
    fontWeight: '800',
    color: Colors.gold700,
    lineHeight: 12,
    top: 0,
    bottom: 0,
    textAlignVertical: 'center',
  },
  goalSub: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink700,
  },
  pips: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  pip: {
    flex: 1,
    height: 8,
    borderRadius: 999,
  },
  stampBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.coral500,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: Colors.coral700,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  stampBtnDone: {
    backgroundColor: Colors.sage600,
  },
});
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx jest GoalHeroCard.test --no-coverage
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/GoalHeroCard.tsx src/components/__tests__/GoalHeroCard.test.tsx
git commit -m "feat: add GoalHeroCard with streak and level variants"
```

---

## Task 6: BottomNav

**Files:**
- Create: `src/components/BottomNav.tsx`
- Test: `src/components/__tests__/BottomNav.test.tsx`

4 tabs: 首頁 (home, active by default), 回顧 (sparkle), 撲滿 (wallet), 願望 (star). Non-home tabs call `onTabPress(tabId)` — caller is responsible for showing Alert.

- [ ] **Step 1: Write failing tests**

Create `src/components/__tests__/BottomNav.test.tsx`:

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import BottomNav from '../BottomNav';

describe('BottomNav', () => {
  it('renders all 4 tab labels', () => {
    render(<BottomNav />);
    expect(screen.getByText('首頁')).toBeTruthy();
    expect(screen.getByText('回顧')).toBeTruthy();
    expect(screen.getByText('撲滿')).toBeTruthy();
    expect(screen.getByText('願望')).toBeTruthy();
  });

  it('calls onTabPress with correct tab id', () => {
    const onTabPress = jest.fn();
    render(<BottomNav onTabPress={onTabPress} />);
    fireEvent.press(screen.getByText('回顧'));
    expect(onTabPress).toHaveBeenCalledWith('reports');
  });

  it('defaults active tab to home', () => {
    render(<BottomNav />);
    // home tab should have coral background (tested via accessible state)
    expect(screen.getByAccessibilityState({ selected: true })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npx jest BottomNav.test --no-coverage
```

Expected: FAIL — "Cannot find module '../BottomNav'"

- [ ] **Step 3: Create BottomNav**

Create `src/components/BottomNav.tsx`:

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { HomeIcon, SparkleIcon, WalletIcon, StarIcon } from './icons/TaskIcons';

type TabId = 'home' | 'reports' | 'wallet' | 'wish';

interface BottomNavProps {
  activeTab?: TabId;
  onTabPress?: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string; Icon: React.ComponentType<{ size?: number; color?: string }> }[] = [
  { id: 'home',    label: '首頁', Icon: HomeIcon },
  { id: 'reports', label: '回顧', Icon: SparkleIcon },
  { id: 'wallet',  label: '撲滿', Icon: WalletIcon },
  { id: 'wish',    label: '願望', Icon: StarIcon },
];

export default function BottomNav({ activeTab = 'home', onTabPress }: BottomNavProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.nav}>
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <TouchableOpacity
              key={id}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onTabPress?.(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={label}
            >
              <Icon
                size={24}
                color={isActive ? '#FFFFFF' : Colors.ink500}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.bgCanvas,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  nav: {
    backgroundColor: 'rgba(255, 248, 238, 0.92)',
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    gap: 6,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 18,
  },
  tabActive: {
    backgroundColor: Colors.coral500,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.ink500,
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
});
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx jest BottomNav.test --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/BottomNav.tsx src/components/__tests__/BottomNav.test.tsx
git commit -m "feat: add BottomNav with 4 tabs and coral active state"
```

---

## Task 7: HomeScreen Redesign

**Files:**
- Modify: `src/screens/child/HomeScreen.tsx`
- Test: `src/screens/child/__tests__/HomeScreen.test.tsx`

**Layout changes:**
- Remove dark navy hero section → cream canvas top to bottom
- Header: frosted cream card (greeting + "今天有 X 件事等你開動" + coin pill, mocked 128)
- Scroll area: GoalHeroCard(s) → PrereqBanner → "本分任務" section → "貢獻任務" section → empty state
- BottomNav fixed at bottom (sibling to ScrollView, inside SafeAreaView)

**Task grouping change:** `weekdayTasks` / `weekendTasks` → merged by today's day type, then split A+B vs C. Existing `completeTask`, `openModal`, `handleConfirm`, `handleFeedbackComplete` callbacks untouched.

**Mock data:** coin balance hardcoded to `128` (TODO: replace with `useWallet` hook once implemented).

- [ ] **Step 1: Write failing test**

Create `src/screens/child/__tests__/HomeScreen.test.tsx`:

```typescript
import React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('../../../hooks/useTodayTasks', () => ({
  useTodayTasks: () => ({
    weekdayTasks: [],
    weekendTasks: [],
    longTermTasks: [],
    isPrerequisiteMet: true,
    completedTodayIds: new Set(),
    loading: false,
    refresh: jest.fn(),
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: { childId: 'child-1' } }),
  useNavigation: () => ({ replace: jest.fn(), navigate: jest.fn() }),
}));

jest.mock('../../../lib/taskActions', () => ({
  completeTask: jest.fn().mockResolvedValue({ coinEarned: 0, timeSavedMin: 0, milestone: null }),
}));

import HomeScreen from '../HomeScreen';

describe('HomeScreen', () => {
  it('renders greeting', () => {
    render(<HomeScreen />);
    // greeting text contains 早安 / 午安 / 晚安
    expect(
      screen.getByText(/早安|午安|晚安/)
    ).toBeTruthy();
  });

  it('renders coin pill with mock balance', () => {
    render(<HomeScreen />);
    expect(screen.getByText('128')).toBeTruthy();
  });

  it('renders bottom nav tabs', () => {
    render(<HomeScreen />);
    expect(screen.getByText('首頁')).toBeTruthy();
    expect(screen.getByText('撲滿')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npx jest HomeScreen.test --no-coverage
```

Expected: FAIL — test passes some checks but fails on missing elements from the new layout.

- [ ] **Step 3: Rewrite HomeScreen**

Replace `src/screens/child/HomeScreen.tsx` with:

```typescript
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../App';
import { useTodayTasks, type TodayTask } from '../../hooks/useTodayTasks';
import DutyTaskCard from '../../components/DutyTaskCard';
import ContributionTaskCard from '../../components/ContributionTaskCard';
import GoalHeroCard from '../../components/GoalHeroCard';
import BottomNav from '../../components/BottomNav';
import TaskCompleteModal from '../../components/TaskCompleteModal';
import FeedbackAnimation, { type FeedbackType } from '../../components/FeedbackAnimation';
import { CoinIcon, WaveIcon } from '../../components/icons/TaskIcons';
import { completeTask } from '../../lib/taskActions';
import { Colors } from '../../constants/colors';
import type { Task } from '../../types/database';

type HomeRoute = RouteProp<RootStackParamList, 'Home'>;
type Nav = StackNavigationProp<RootStackParamList, 'Home'>;

type ModalState = { task: TodayTask | null; visible: boolean };
type FeedbackState = { visible: boolean; type: FeedbackType; value: number };

// TODO: replace with useWallet(childId) once wallet hook is implemented
const MOCK_COIN_BALANCE = 128;

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return '早安';
  if (h < 18) return '午安';
  return '晚安';
}

function getSubGreeting(remaining: number, total: number): string {
  if (total === 0 || remaining === 0) return '今天全部完成了！太厲害！';
  return `今天有 ${remaining} 件事等你開動`;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <WaveIcon />
    </View>
  );
}

export default function HomeScreen() {
  const route = useRoute<HomeRoute>();
  const navigation = useNavigation<Nav>();
  const { childId } = route.params;

  const { weekdayTasks, weekendTasks, longTermTasks, isPrerequisiteMet, loading, refresh } =
    useTodayTasks(childId);

  const [modal, setModal] = useState<ModalState>({ task: null, visible: false });
  const [feedback, setFeedback] = useState<FeedbackState>({ visible: false, type: 'task-a', value: 0 });

  // Derive today's active short-term task list without duplicates
  const isWeekend = [0, 6].includes(new Date().getDay());
  const shortTermTasks = isWeekend ? weekendTasks : weekdayTasks;
  const dutyTasks = shortTermTasks.filter(t => t.category === 'A' || t.category === 'B');
  const contributionTasks = shortTermTasks.filter(t => t.category === 'C');

  const allCount = dutyTasks.length + contributionTasks.length + longTermTasks.length;
  const doneCount = [...dutyTasks, ...contributionTasks, ...longTermTasks].filter(t => t.isCompleted).length;
  const remaining = allCount - doneCount;

  const hasDiscountableTasks =
    !isPrerequisiteMet && contributionTasks.some(t => !t.isCompleted);

  const isEmpty = allCount === 0 && !loading;

  const openModal = useCallback((task: TodayTask) => {
    setModal({ task, visible: true });
  }, []);

  const closeModal = useCallback(() => {
    setModal(prev => ({ ...prev, visible: false }));
  }, []);

  const handleConfirm = useCallback(
    async (completedDate: string) => {
      if (!modal.task) return;
      const task: Task = modal.task;
      const result = await completeTask(
        task.id,
        childId,
        completedDate,
        isPrerequisiteMet,
        task,
        modal.task.goal?.id,
      );
      closeModal();
      if (result.milestone) {
        setFeedback({ visible: true, type: 'milestone', value: result.milestone.coinReward });
      } else if (task.category === 'A') {
        setFeedback({ visible: true, type: 'task-a', value: 0 });
      } else if (task.category === 'B') {
        setFeedback({ visible: true, type: 'task-b', value: result.timeSavedMin });
      } else {
        setFeedback({ visible: true, type: 'task-c', value: result.coinEarned });
      }
    },
    [modal.task, childId, isPrerequisiteMet, closeModal],
  );

  const handleFeedbackComplete = useCallback(() => {
    setFeedback(prev => ({ ...prev, visible: false }));
    refresh();
  }, [refresh]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>{getGreeting()}，小探險家！</Text>
          <Text style={styles.greetSub}>{getSubGreeting(remaining, allCount)}</Text>
        </View>
        <TouchableOpacity
          style={styles.coinPill}
          onPress={() => Alert.alert('撲滿', '即將推出！')}
          accessibilityLabel={`金幣餘額 ${MOCK_COIN_BALANCE}`}
        >
          <CoinIcon size={28} />
          <Text style={styles.coinCount}>{MOCK_COIN_BALANCE}</Text>
        </TouchableOpacity>
      </View>

      {/* Scroll content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={Colors.coral500} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Long-term goal hero card(s) */}
        {longTermTasks.map(task =>
          task.goal ? (
            <GoalHeroCard
              key={task.id}
              task={task}
              goal={task.goal}
              isCompleted={task.isCompleted}
              onCheckIn={() => openModal(task)}
              onOpen={() =>
                navigation.navigate('LongTermDetail', {
                  goalId: task.goal!.id,
                  taskId: task.id,
                  taskName: task.name,
                })
              }
            />
          ) : null,
        )}

        {/* Prerequisite nudge banner */}
        {hasDiscountableTasks && (
          <View style={styles.prereqBanner}>
            <View style={styles.nudgeDot} />
            <Text style={styles.prereqText}>先完成本分任務，解鎖完整金幣！</Text>
          </View>
        )}

        {/* Duty tasks (Task-A + Task-B) */}
        {dutyTasks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="本分任務" />
            {dutyTasks.map(task => (
              <DutyTaskCard
                key={task.id}
                task={task}
                isCompleted={task.isCompleted}
                onPress={() => openModal(task)}
              />
            ))}
          </View>
        )}

        {/* Contribution tasks (Task-C) */}
        {contributionTasks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="貢獻任務" />
            {contributionTasks.map(task => (
              <ContributionTaskCard
                key={task.id}
                task={task}
                isCompleted={task.isCompleted}
                isPrerequisiteMet={isPrerequisiteMet}
                onPress={() => openModal(task)}
              />
            ))}
          </View>
        )}

        {/* Empty state */}
        {isEmpty && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>今天全部完成了！</Text>
            <Text style={styles.emptySub}>你今天超棒的！</Text>
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Bottom nav */}
      <BottomNav
        activeTab="home"
        onTabPress={tab => {
          if (tab !== 'home') Alert.alert('功能開發中', '即將推出！');
        }}
      />

      {/* Modals — untouched logic */}
      <TaskCompleteModal
        visible={modal.visible}
        task={modal.task}
        isPrerequisiteMet={isPrerequisiteMet}
        goal={modal.task?.goal}
        onConfirm={handleConfirm}
        onClose={closeModal}
      />

      <FeedbackAnimation
        visible={feedback.visible}
        type={feedback.type}
        value={feedback.value}
        onComplete={handleFeedbackComplete}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgCanvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'rgba(255, 248, 238, 0.85)',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 14,
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 18,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontWeight: '800',
    fontSize: 22,
    color: Colors.ink900,
    lineHeight: 26,
  },
  greetSub: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink500,
    marginTop: 2,
  },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.bgSurface,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: 999,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 3,
  },
  coinCount: {
    fontWeight: '800',
    fontSize: 17,
    color: Colors.gold700,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  prereqBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.coral100,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  nudgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.coral500,
  },
  prereqText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.coral700,
  },
  section: {
    marginBottom: 24,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    marginTop: 6,
    marginLeft: 4,
  },
  sectionTitle: {
    fontWeight: '800',
    fontSize: 13,
    color: Colors.ink700,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 72,
  },
  emptyTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.ink900,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 16,
    color: Colors.ink500,
    fontWeight: '500',
  },
  bottomPad: {
    height: 32,
  },
});
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx jest HomeScreen.test --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Run all tests to confirm no regressions**

```bash
npx jest --no-coverage
```

Expected: all previously passing tests still pass (taskActions.test, taskRecommend.test, DutyTaskCard.test, ContributionTaskCard.test, GoalHeroCard.test, BottomNav.test, TaskIcons.test, HomeScreen.test).

- [ ] **Step 6: Verify visually in Expo Go**

```bash
npx expo start
```

掃 QR code，登入後進入 HomeScreen。確認：
- 背景是奶油色（#FFF8EE），不是深藍
- Header 顯示問候語 + 金幣 pill（128）
- 有長期目標時，GoalHeroCard 出現在頂部
- 本分任務卡是 sky/sage 藍綠色背景
- 貢獻任務卡是金黃色背景，前置條件未滿足時顯示 nudge
- 底部 nav 有 4 個分頁，點非首頁分頁顯示「功能開發中」Alert

- [ ] **Step 7: Commit**

```bash
git add src/screens/child/HomeScreen.tsx src/screens/child/__tests__/HomeScreen.test.tsx
git commit -m "feat: redesign HomeScreen with picture-book design system (cream, duty/contribution cards, goal hero)"
```

---

## Self-Review

### Spec Coverage

| 設計需求 | 對應 Task |
|----------|-----------|
| 奶油色背景取代深藍 | Task 7 (safe/scroll background) |
| Frosted 奶油 header | Task 7 (header styles) |
| 金幣 pill（mock 128） | Task 7 (MOCK_COIN_BALANCE) |
| GoalHeroCard 長期目標 | Task 5 + Task 7 |
| Streak 進度條 + 打卡按鈕 | Task 5 (streak variant) |
| Level pip 指示器 | Task 5 (level variant) |
| 本分任務卡 sky/sage | Task 3 |
| 貢獻任務卡 gold + nudge | Task 4 |
| Prerequisite banner | Task 7 (prereqBanner) |
| BottomNav 4 分頁 | Task 6 |
| 非首頁分頁 → Alert | Task 7 (onTabPress) |
| 保留 completeTask 邏輯 | Task 7 (unchanged callbacks) |
| 保留 useTodayTasks | Task 7 (same hook call) |
| 保留 TaskCompleteModal | Task 7 (unchanged) |
| 保留 FeedbackAnimation | Task 7 (unchanged) |
| 設計 token colors | Task 1 |
| SVG icon 元件 | Task 2 |

### Placeholder Scan

- `MOCK_COIN_BALANCE = 128` — intentional per user's Mock Data rule; has TODO comment ✓
- `Alert.alert('功能開發中', '即將推出！')` — intentional per user's stub rule ✓
- GoalHeroCard level variant 無 currentSubtask 欄位 — noted in Task 5 mock note ✓
- `// TODO: replace with useWallet` — known limitation documented ✓

### Type Consistency

- `TodayTask` 型別在 Task 3/4/5/7 均從 `../../hooks/useTodayTasks` 匯入 ✓
- `LongTermGoal` 在 Task 5/7 均從 `../../types/database` 匯入 ✓
- `calcDisplayCoin` 簽名在 Task 4 (ContributionTaskCard) 與原 TaskItem.tsx 相同 ✓
- `Colors` 在所有新元件均從 `../constants/colors` 或 `../../constants/colors` 匯入 ✓
- BottomNav `TabId` 型別定義在 BottomNav.tsx 內部，Task 7 傳入 `tab !== 'home'` 而非比對 TabId — 正確 ✓
