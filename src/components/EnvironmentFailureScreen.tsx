// Shadow Wallet — 環境設定失敗時的整頁畫面
//
// 這一頁取代整個 App，而不是一個可以關掉的提示。
//
// 理由：環境設定錯誤的時候，「還能用」才是危險的。讓 App 照常開起來、
// 只在角落放一行小字，使用者會照樣登入、照樣建立任務，然後資料寫進
// 一個沒有人打算寫入的資料庫。
//
// 畫面上不出現 URL、project ref、anon key —— 這一頁最可能被截圖傳出去。
// 那些細節印在 console，開發者看得到，截圖看不到。

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SUPABASE_ENVIRONMENT_FAILURE_MESSAGE } from '../lib/environment';
import {
  ParentColors,
  ParentFontSizes,
  ParentFontWeights,
  ParentSpacing,
} from '../constants/parentTheme';

export function EnvironmentFailureScreen() {
  return (
    <View style={s.root}>
      <View style={s.card}>
        <Text style={s.title}>{SUPABASE_ENVIRONMENT_FAILURE_MESSAGE}</Text>
        <Text style={s.body}>
          請確認本機的環境設定檔已指定 App 環境、Supabase 專案網址與預期的專案代號。
        </Text>
        <Text style={s.hint}>詳細的錯誤類型已輸出到開發主控台。</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ParentColors.bgCanvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: ParentSpacing[6],
  },
  card: {
    maxWidth: 520,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 16,
    padding: ParentSpacing.cardPadLg,
    gap: ParentSpacing[3],
  },
  title: {
    fontSize: ParentFontSizes.h2,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  body: {
    fontSize: ParentFontSizes.pBody,
    color: ParentColors.fgSecondary,
  },
  hint: {
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
  },
});

export default EnvironmentFailureScreen;
