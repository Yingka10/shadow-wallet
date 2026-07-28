import { StyleSheet } from 'react-native';
import fs from 'fs';
import path from 'path';

jest.mock('../../../../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

jest.mock('@react-navigation/native', () => ({
  CommonActions: { navigate: jest.fn((name: string) => ({ type: 'NAVIGATE', payload: { name } })) },
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => {
    const React = require('react');
    return {
      Navigator: ({ children }: { children: React.ReactNode }) => children,
      Screen: () => null,
    };
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../ParentDashboardScreen', () => () => null);
jest.mock('../../ParentTaskListScreen', () => () => null);
jest.mock('../../ParentRedemptionScreen', () => () => null);
jest.mock('../../ParentWeeklyReportScreen', () => () => null);
jest.mock('../ParentWeeklyTablet', () => () => null);
jest.mock('../ParentManageTablet', () => () => null);

import { webMouseDraggableScroll, webTabletScreen } from '../../../../constants/webStyles';
import { ParentColors, ParentFontSizes, ParentFontWeights } from '../../../../constants/parentTheme';
import { buildParentGreeting, parentHomeTabletStyles } from '../ParentHomeTablet';
import { parentTabletTabStyles } from '../../ParentTabNavigator';
import { taskIconBubbleStyles } from '../home/homeIcons';
import { weekSummaryStyles } from '../home/WeekSummary';
import { parentSidebarStyles } from '../ParentSidebar';
import { parentTaskManagementTabletStyles } from '../ParentTaskManagementTablet';

const homeSource = fs.readFileSync(path.join(__dirname, '..', 'ParentHomeTablet.tsx'), 'utf8');
const summarySource = fs.readFileSync(path.join(__dirname, '..', 'home', 'WeekSummary.tsx'), 'utf8');
const weeklySource = fs.readFileSync(path.join(__dirname, '..', 'ParentWeeklyTablet.tsx'), 'utf8');
const manageSource = fs.readFileSync(path.join(__dirname, '..', 'ParentManageTablet.tsx'), 'utf8');
const taskManagementPath = path.join(__dirname, '..', 'ParentTaskManagementTablet.tsx');
const taskManagementSource = fs.existsSync(taskManagementPath)
  ? fs.readFileSync(taskManagementPath, 'utf8')
  : '';
const rewardManagementPath = path.join(__dirname, '..', 'ParentRewardManagementTablet.tsx');
const rewardManagementSource = fs.existsSync(rewardManagementPath)
  ? fs.readFileSync(rewardManagementPath, 'utf8')
  : '';
const ledgerPath = path.join(__dirname, '..', 'ParentLedgerTablet.tsx');
const ledgerSource = fs.existsSync(ledgerPath)
  ? fs.readFileSync(ledgerPath, 'utf8')
  : '';

describe('ParentHomeTablet layout tokens', () => {
  it('uses the full tablet viewport instead of a fixed preview width', () => {
    if (webTabletScreen.width != null) {
      expect(webTabletScreen.width).toBe('100%');
    }
    expect(webTabletScreen.maxWidth).toBeUndefined();
    expect(webTabletScreen.alignSelf).toBeUndefined();
  });

  it('keeps the AI rail wide enough for prompts without explicit context chips', () => {
    const rightColWrap = StyleSheet.flatten(parentHomeTabletStyles.rightColWrap) as Record<string, unknown>;

    expect(rightColWrap.width).toBeUndefined();
    expect(rightColWrap.minWidth).toBeGreaterThanOrEqual(260);
    expect(rightColWrap.maxWidth).toBeLessThanOrEqual(340);
    expect(parentHomeTabletStyles).not.toHaveProperty('advisorContextRow');
    expect(parentHomeTabletStyles).not.toHaveProperty('advisorContextChip');
  });

  it('caps the main column width instead of stretching unbounded on wide screens', () => {
    const mainAreaWrap = StyleSheet.flatten(parentHomeTabletStyles.mainAreaWrap) as Record<string, unknown>;
    const contentCluster = StyleSheet.flatten(parentHomeTabletStyles.contentCluster) as Record<string, unknown>;

    // 沒有 maxWidth 的話，在很寬的螢幕上 mainAreaWrap 會無限吃掉剩餘空間，
    // 讓字級/留白看起來越來越稀疏（使用者回報：平板越大字越像變小）。
    expect(typeof mainAreaWrap.maxWidth).toBe('number');
    expect(mainAreaWrap.maxWidth as number).toBeGreaterThan(0);
    // 中欄跟右欄要在同一個容器裡置中，超寬螢幕才不會變成中欄單獨拉爆。
    expect(contentCluster.justifyContent).toBe('center');
  });

  it('improves reading hierarchy for support text and task rows', () => {
    const reqAiUrgent = StyleSheet.flatten(parentHomeTabletStyles.reqAiUrgent);
    const advisorSub = StyleSheet.flatten(parentHomeTabletStyles.advisorSub);
    const taskName = StyleSheet.flatten(parentHomeTabletStyles.tRowTask);
    const longTermName = StyleSheet.flatten(parentHomeTabletStyles.pLtName);
    const longTermMeta = StyleSheet.flatten(parentHomeTabletStyles.pLtMeta);

    expect(reqAiUrgent.fontSize).toBeGreaterThanOrEqual(ParentFontSizes.xs);
    expect(reqAiUrgent.lineHeight).toBeGreaterThanOrEqual(18);
    expect(advisorSub.fontSize).toBeGreaterThanOrEqual(ParentFontSizes.pMeta);
    expect(advisorSub.lineHeight).toBeGreaterThanOrEqual(20);
    expect(taskName.fontWeight).toBe(ParentFontWeights.bold);
    expect(taskName.fontSize).toBeGreaterThan(longTermMeta.fontSize);
    expect(longTermName.fontWeight).toBe(ParentFontWeights.bold);
  });

  it('balances proposal action buttons by proportion instead of height', () => {
    const approve = StyleSheet.flatten(parentHomeTabletStyles.proposalApproveBtn);
    const reject = StyleSheet.flatten(parentHomeTabletStyles.proposalRejectBtn);

    expect(approve.minHeight).toBe(reject.minHeight);
    expect(approve.flex).toBe(7);
    expect(reject.flex).toBe(3);
  });

  it('makes footer quick actions look tappable', () => {
    const quickLink = StyleSheet.flatten(parentHomeTabletStyles.quietLink);

    expect(quickLink.borderWidth).toBe(1);
    expect(quickLink.paddingHorizontal).toBeGreaterThanOrEqual(12);
    expect(quickLink.borderRadius).toBeGreaterThanOrEqual(8);
  });

  it('uses web styles that communicate mouse-driven scrolling', () => {
    const webScroll = webMouseDraggableScroll as Record<string, unknown>;

    if (webScroll.cursor != null) {
      expect(webScroll.cursor).toBe('grab');
      expect(webScroll.userSelect).toBe('none');
      expect(webScroll.touchAction).toBe('pan-y');
    }
  });

  it('hides the home tablet bottom tab so the left rail owns navigation', () => {
    const tabletHidden = StyleSheet.flatten(parentTabletTabStyles.tabletHidden);
    const mainContent = StyleSheet.flatten(parentHomeTabletStyles.mainContent);

    expect(tabletHidden.display).toBe('none');
    expect(mainContent.paddingBottom).toBeLessThanOrEqual(ParentFontSizes.h1);
    expect(parentSidebarStyles).toHaveProperty('sidebarNav');
    expect(parentSidebarStyles).toHaveProperty('sidebarNavActive');
  });

  it('gives the advisor card a robot avatar head row instead of a standalone open button', () => {
    const advisorCard = StyleSheet.flatten(parentHomeTabletStyles.advisorCard);
    const advisorSideSheet = StyleSheet.flatten(parentHomeTabletStyles.advisorSideSheet);
    const advisorAvatar = StyleSheet.flatten(parentHomeTabletStyles.advisorAvatar);

    expect(advisorCard.borderWidth).toBe(1);
    expect(advisorSideSheet.position).toBe('absolute');
    expect(advisorSideSheet.right).toBe(0);
    expect(advisorSideSheet.width).toBeGreaterThanOrEqual(360);
    expect(advisorAvatar.borderRadius).toBeGreaterThan(0);
    expect(parentHomeTabletStyles).not.toHaveProperty('advisorOpenButton');
  });

  it('uses a cool-white canvas and white card surfaces', () => {
    expect(ParentColors.bgCanvas).toBe('#FBFCFC');
    expect(ParentColors.bgMain).toBe('#FBFCFC');
    expect(ParentColors.bgRail).toBe('#FBFCFC');
    expect(ParentColors.bgSurface).toBe('#FFFFFF');
    expect(ParentColors.bgHero).toBe('#FFF7E8');
  });

  it('labels the week summary section card as a bordered white surface', () => {
    const sectionCard = StyleSheet.flatten(parentHomeTabletStyles.sectionCard);
    const sectionTitle = StyleSheet.flatten(parentHomeTabletStyles.sectionTitle);
    const heroCard = StyleSheet.flatten(parentHomeTabletStyles.heroCard);

    expect(sectionCard.borderWidth).toBe(1);
    expect(sectionCard.backgroundColor).toBe(ParentColors.bgSurface);
    expect(heroCard.backgroundColor).toBe(ParentColors.bgHero);
    expect(sectionTitle.fontWeight).toBe(ParentFontWeights.bold);
  });

  it('keeps the pending approval content as a single-layer hero card', () => {
    const reqCard = StyleSheet.flatten(parentHomeTabletStyles.reqCard);
    const heroCard = StyleSheet.flatten(parentHomeTabletStyles.heroCard);

    expect(heroCard.borderWidth).toBe(1);
    expect(reqCard.backgroundColor).toBe('transparent');
    expect(reqCard.borderWidth).toBe(0);
    expect(reqCard.padding).toBe(0);
    expect(reqCard.shadowOpacity).toBe(0);
    expect(reqCard.elevation).toBe(0);
  });

  it('shows only coin/task/time stats in the shared week summary card', () => {
    const cellNum = StyleSheet.flatten(weekSummaryStyles.cellNum);
    const cellLabel = StyleSheet.flatten(weekSummaryStyles.cellLabel);

    expect(cellNum.fontWeight).toBe(ParentFontWeights.bold);
    expect(cellLabel.color).toBeTruthy();
    expect(summarySource).not.toContain('attentionCount');
    expect(summarySource).not.toContain('任務回顧');
    expect(summarySource).not.toContain('需要關注');
    expect(summarySource).not.toContain('需要幫助');
    expect(homeSource).not.toContain('attentionCount={attentionCount}');
  });

  it('uses parent-facing, non-pressuring copy on the home screen', () => {
    expect(homeSource).not.toContain('今天又是成長的一天');
    expect(homeSource).not.toContain('需要注意');
    expect(homeSource).not.toContain('需要調整');
    expect(homeSource).not.toContain('需要幫助');
    expect(homeSource).toContain('buildParentGreeting');
  });

  it('builds the parent greeting from current dashboard state', () => {
    expect(buildParentGreeting({ parentName: '媽媽', pendingCount: 2, doneToday: 0, totalToday: 4, missedToday: 0, longTermActive: 3 }))
      .toBe('媽媽，今天先看 2 件需要決定的事。');
    expect(buildParentGreeting({ parentName: '媽媽', pendingCount: 0, doneToday: 4, totalToday: 4, missedToday: 0, longTermActive: 1 }))
      .toBe('媽媽，今天的紀錄很完整，可以晚點一起回顧。');
    expect(buildParentGreeting({ parentName: null, pendingCount: 0, doneToday: 0, totalToday: 0, missedToday: 0, longTermActive: 0 }))
      .toBe('家長，今天先整理一下家裡的成長節奏。');
  });

  it('makes task icon bubbles read as richer illustrated tokens', () => {
    const bubble = StyleSheet.flatten(taskIconBubbleStyles.bubble);

    expect(bubble.borderWidth).toBe(1);
    expect(bubble.borderColor).toBe(ParentColors.borderSoft);
  });

  it('shares one sidebar component across all three tablet tab surfaces', () => {
    const sidebarSource = fs.readFileSync(path.join(__dirname, '..', 'ParentSidebar.tsx'), 'utf8');

    // activeTab 決定「主要功能」哪一項顯示選中，讓三個 tab 都能共用同一份側欄。
    expect(sidebarSource).toContain("activeTab === 'home'");
    expect(sidebarSource).toContain("activeTab === 'weekly'");
    expect(sidebarSource).toContain("activeTab === 'manage'");

    expect(homeSource).toContain('<ParentSidebar');
    expect(weeklySource).toContain('<ParentSidebar');
    expect(manageSource).toContain('ParentTaskManagementTablet');
    expect(manageSource).toContain('ParentRewardManagementTablet');
    expect(manageSource).toContain('ParentLedgerTablet');
    expect(taskManagementSource).toContain('<ParentSidebar');
    expect(taskManagementSource).toContain('activeTab="manage"');
    expect(rewardManagementSource).toContain('<ParentSidebar');
    expect(rewardManagementSource).toContain('activeTab="manage"');
    expect(ledgerSource).toContain('<ParentSidebar');
    expect(ledgerSource).toContain('activeTab="manage"');
  });

  it('frames weekly reports as parent conversation support instead of a scorecard', () => {
    expect(weeklySource).toContain('本週整理');
    expect(weeklySource).toContain('本週紀錄概覽');
    expect(weeklySource).toContain('本週投入分布');
    expect(weeklySource).toContain('長期任務進展');
    expect(weeklySource).toContain('這週值得一起回顧');
    expect(weeklySource).toContain('和孩子聊聊');
    expect(weeklySource).toContain('查看完整紀錄');
    expect(weeklySource).toContain('任務紀錄');
    expect(weeklySource).toContain('成長幣');
    expect(weeklySource).toContain('時間儲蓄');
    expect(weeklySource).toContain('獎勵兌換');

    expect(weeklySource).not.toContain('CompletionRing');
    expect(weeklySource).not.toContain('完成率');
    expect(weeklySource).not.toContain('落後');
    expect(weeklySource).not.toContain('需改善');
    expect(weeklySource).not.toContain('表現不佳');
  });

  it('adds a standalone tablet task management page backed by real parent data', () => {
    expect(fs.existsSync(taskManagementPath)).toBe(true);
    expect(manageSource).toContain('ParentTaskManagementTablet');

    expect(taskManagementSource).toContain('useParentTaskList');
    expect(taskManagementSource).toContain('useParentLongTermGoals');
    expect(taskManagementSource).toContain('日常任務');
    expect(taskManagementSource).toContain('長期挑戰');
    expect(taskManagementSource).toContain('暫停中');
    expect(taskManagementSource).toContain('封存紀錄');
    expect(taskManagementSource).toContain('幣值參考');
    expect(taskManagementSource).toContain('管理提醒');
    expect(taskManagementSource).toContain('最近調整');
    expect(taskManagementSource).toContain('長期挑戰提醒');
    expect(taskManagementSource).toContain('本週變化');
    expect(taskManagementSource).toContain('里程碑設定');
    expect(taskManagementSource).toContain('暫停提醒');
    expect(taskManagementSource).toContain('管理建議');

    expect(taskManagementSource).not.toContain('mockTasks');
    expect(taskManagementSource).not.toContain('假資料');
    expect(taskManagementSource).not.toContain('落後');
    expect(taskManagementSource).not.toContain('失敗');
    expect(taskManagementSource).not.toContain('表現不佳');
  });

  it('balances task management typography with the shared sidebar', () => {
    const taskTitle = StyleSheet.flatten(parentTaskManagementTabletStyles.title);
    const taskSubtitle = StyleSheet.flatten(parentTaskManagementTabletStyles.subtitle);
    const brand = StyleSheet.flatten(parentSidebarStyles.sidebarBrandText);
    const sidebarTitle = StyleSheet.flatten(parentSidebarStyles.sidebarBrandSub);
    const childName = StyleSheet.flatten(parentSidebarStyles.pickName);
    const navText = StyleSheet.flatten(parentSidebarStyles.sidebarNavText);
    const subText = StyleSheet.flatten(parentSidebarStyles.sidebarSubText);

    expect(taskTitle.fontSize).toBeLessThanOrEqual(28);
    expect(taskTitle.fontSize).toBeGreaterThanOrEqual(26);
    expect(taskSubtitle.fontSize).toBeGreaterThanOrEqual(15);
    expect(brand.fontSize).toBeGreaterThanOrEqual(14);
    expect(sidebarTitle.fontSize).toBeGreaterThanOrEqual(19);
    expect(childName.fontSize).toBeGreaterThanOrEqual(15);
    expect(navText.fontSize).toBeGreaterThanOrEqual(15);
    expect(subText.fontSize).toBeGreaterThanOrEqual(14);
  });

  it('adds a standalone tablet reward management page with the approved four-state structure', () => {
    expect(fs.existsSync(rewardManagementPath)).toBe(true);
    expect(manageSource).toContain('ParentRewardManagementTablet');

    expect(rewardManagementSource).toContain('RewardManageTab');
    expect(rewardManagementSource).toContain('待處理');
    expect(rewardManagementSource).toContain('進行中');
    expect(rewardManagementSource).toContain('已完成');
    expect(rewardManagementSource).toContain('已結束');
    expect(rewardManagementSource).toContain('最近 6 個月');
    expect(rewardManagementSource).toContain('最近 90 天');
    expect(rewardManagementSource).toContain('查看較早紀錄');
    expect(rewardManagementSource).toContain('類型圖示');
    expect(rewardManagementSource).toContain('parent_approved');
    expect(rewardManagementSource).not.toContain('設計提醒');
    expect(rewardManagementSource).not.toContain('商品圖');
  });
});
