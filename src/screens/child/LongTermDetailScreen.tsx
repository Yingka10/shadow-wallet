import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from '../../lib/supabase';
import { completeTask } from '../../lib/taskActions';
import { Colors } from '../../constants/colors';
import { webFullHeight } from '../../constants/webStyles';
import { CheckIcon } from '../../components/icons/TaskIcons';
import type { RootStackParamList } from '../../../App';
import { Colors } from '../../constants/colors';

type LongTermDetailRoute = RouteProp<RootStackParamList, 'LongTermDetail'>;

export default function LongTermDetailScreen() {
  const route = useRoute<LongTermDetailRoute>();
  const { taskName } = route.params;

  return (
    <SafeAreaView style={[styles.safe, webFullHeight]} edges={['bottom']}>
      {/* Nav bar */}
      <View style={[styles.navBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevLeftIcon size={22} />
          <Text style={styles.backLabel}>返回</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>
          長期目標
        </Text>
        <View style={styles.navSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.gold500} style={styles.loader} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : !goal ? null : goal.goal_type !== 'habit' ? (
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonTitle}>{taskName}</Text>
          <Text style={styles.comingSoonBody}>此類型長期目標詳情即將推出</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero card */}
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <Text style={styles.heroLabel}>🔥 連續打卡挑戰</Text>
              <View style={styles.streakBadge}>
                <Text style={styles.streakText}>第 {currentDay} 天</Text>
              </View>
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {taskName}
            </Text>
            <Text style={styles.heroSub}>
              共 {total} 天
              {remaining > 0 ? `  ·  還剩 ${remaining} 天` : '  ·  目標完成！'}
            </Text>
          </View>

          {/* Progress section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>進度</Text>
            <View style={styles.card}>
              <View style={styles.progressDayRow}>
                <Text style={styles.progressDayNum}>第 {currentDay} 天</Text>
                <Text style={styles.progressDayOf}>/ 共 {total} 天</Text>
              </View>
              <ProgressBarWithCheckpoints
                current={currentDay}
                total={total}
                checkpointRewards={goal.checkpoint_rewards}
              />
            </View>
          </View>

          {/* Check-in section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>今日打卡</Text>
            {isCheckedIn ? (
              <View style={styles.checkedCard}>
                <CheckIcon size={20} color={Colors.success} />
                <Text style={styles.checkedText}>今天已打卡</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.checkInBtn, checking && styles.checkInBtnBusy]}
                onPress={handleCheckIn}
                activeOpacity={0.8}
                disabled={checking}
              >
                {checking ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.checkInBtnText}>今天打卡</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Milestones section */}
          {sortedCpDays.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>里程碑獎勵</Text>
              <View style={styles.milestonesCard}>
                {sortedCpDays.map((cpDay, idx) => (
                  <React.Fragment key={cpDay}>
                    {idx > 0 && <View style={styles.rowDivider} />}
                    <MilestoneRow
                      day={cpDay}
                      coins={goal.checkpoint_rewards![String(cpDay)]}
                      status={getCpStatus(cpDay, currentDay, sortedCpDays)}
                    />
                  </React.Fragment>
                ))}
              </View>
            </View>
          )}

          {/* Interrupt note */}
          {(goal.interrupt_count ?? 0) > 0 && (
            <View style={styles.interruptNote}>
              <Text style={styles.interruptText}>
                曾中斷 {goal.interrupt_count} 次，繼續加油！
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
});
