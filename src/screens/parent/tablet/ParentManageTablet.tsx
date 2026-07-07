// Shadow Wallet · Parent Tablet — 管理路由
// 「管理」是一組平板子頁：任務管理 / 獎勵管理 / 帳本紀錄。
// 這支只依 route 的 initialSection 分流到對應整頁；設定走獨立的 ParentSettings route。
// Only renders when width >= 768（家長端平板為唯一開發目標）。

import React from 'react';
import { useWindowDimensions } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { ManageSection } from './ParentSidebar';
import ParentTaskManagementTablet from './ParentTaskManagementTablet';
import ParentRewardManagementTablet from './ParentRewardManagementTablet';
import ParentLedgerTablet from './ParentLedgerTablet';

export default function ParentManageTablet() {
  const { width } = useWindowDimensions();
  const route = useRoute();
  const initialSection = (route.params as { initialSection?: ManageSection } | undefined)?.initialSection;

  if (width < 768) return null;

  if (initialSection === 'rewards') return <ParentRewardManagementTablet />;
  if (initialSection === 'history') return <ParentLedgerTablet />;
  return <ParentTaskManagementTablet />;
}
