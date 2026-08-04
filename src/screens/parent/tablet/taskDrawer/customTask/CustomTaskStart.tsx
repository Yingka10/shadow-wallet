// Shadow Wallet · Parent Tablet — 新增任務的起點頁
//
// 第一版只有兩個入口。孩子提案、親子共創、願望轉計畫、複製任務與系統建議
// 都已經在 domain 型別裡留了位置（PlannedTaskCreationSource），
// 但**沒做的東西不上畫面** —— 一個灰掉的「孩子提案（即將推出）」
// 只會讓家長每次開抽屜都重新失望一次。
//
// 入口清單由 ENABLED_TASK_CREATION_SOURCES 決定，不是這支硬寫的：
// 之後真的做出第三個入口時，加在 domain 那一份就會出現在這裡。

import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ParentSpacing } from '../../../../../constants/parentTheme';
import type { IconKey } from '../taskCatalog';
import type { TaskCreationPath } from '../taskCreationRoute';
import { CustomChoiceCard } from './CustomChoiceCard';
import { ENTRY_COPY } from './customTaskCopy';
import {
  ENABLED_TASK_CREATION_SOURCES,
  type EnabledTaskCreationSource,
} from './customTaskContract';

type EntryCard = { label: string; description: string; iconKey: IconKey };

const ENTRY_CARDS: Record<EnabledTaskCreationSource, EntryCard> = {
  preset: ENTRY_COPY.preset,
  parent_custom: ENTRY_COPY.parentCustom,
};

export function CustomTaskStart({
  selected,
  onSelect,
}: {
  selected: TaskCreationPath | null;
  onSelect: (path: TaskCreationPath) => void;
}) {
  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.list} accessibilityRole="radiogroup" accessibilityLabel="選擇開始方式">
        {ENABLED_TASK_CREATION_SOURCES.map(source => {
          const card = ENTRY_CARDS[source];
          return (
            <CustomChoiceCard
              key={source}
              label={card.label}
              description={card.description}
              selected={selected === source}
              onPress={() => onSelect(source)}
              iconKey={card.iconKey}
              // 起點頁還不知道任務目的，兩張卡用同一組中性 tint ——
              // 用不同顏色會暗示兩個入口建出來的是不同種類的任務，而那不是真的。
              iconCategory="learning_skill"
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: ParentSpacing[6],
    paddingTop: ParentSpacing[5],
    paddingBottom: ParentSpacing[8],
  },
  list: { gap: ParentSpacing[3] },
});
