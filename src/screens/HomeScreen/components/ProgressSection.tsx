import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ColorScheme } from '../../../theme/colors';
import { useTheme } from '../../../providers/ThemeProvider';

interface ProgressSectionProps {
  wordsLearned: number;
  dailyDone:    number;
  dailyGoal:    number;
  weekActivity: number[];
  title:        string;
}

const DAY_LABELS = ['М', 'В', 'С', 'Ч', 'П', 'С', 'В'];

export function ProgressSection({
  wordsLearned, dailyDone, dailyGoal, weekActivity, title,
}: ProgressSectionProps) {
  const { colors } = useTheme();
  const styles     = makeStyles(colors);
  const maxActivity = Math.max(...weekActivity, 1);
  const dailyPercent = Math.min((dailyDone / dailyGoal) * 100, 100);
  const today = new Date().getDay(); // 0=вс, 1=пн...
  const todayIndex = today === 0 ? 6 : today - 1;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{title}</Text>

      <View style={styles.card}>
        {/* Стата */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{wordsLearned}</Text>
            <Text style={styles.statLabel}>слов изучено</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{dailyDone}/{dailyGoal}</Text>
            <Text style={styles.statLabel}>цель сегодня</Text>
          </View>
        </View>

        {/* Дневная цель */}
        <View style={styles.dailyGoalRow}>
          <View style={styles.progressBg}>
            <View style={[
              styles.progressFill,
              { width: `${dailyPercent}%` },
              dailyPercent >= 100 && styles.progressComplete,
            ]} />
          </View>
          {dailyPercent >= 100 && (
            <Text style={styles.goalDone}>✓</Text>
          )}
        </View>

        {/* Недельный график */}
        <View style={styles.chart}>
          {weekActivity.map((val, i) => {
            const heightPercent = (val / maxActivity) * 100;
            const isToday = i === todayIndex;
            return (
              <View key={i} style={styles.chartColumn}>
                <View style={styles.barContainer}>
                  <View style={[
                    styles.bar,
                    {
                      height:          `${Math.max(heightPercent, 8)}%`,
                      backgroundColor: isToday ? colors.accent : colors.accentLight,
                    },
                  ]} />
                </View>
                <Text style={[
                  styles.dayLabel,
                  isToday && { color: colors.accent, fontWeight: '700' },
                ]}>
                  {DAY_LABELS[i]}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) => StyleSheet.create({
  container: {
    marginTop:         24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize:     17,
    fontWeight:   '700',
    color:        colors.textPrimary,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius:    20,
    padding:         16,
    shadowColor:     colors.cardShadow,
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   1,
    shadowRadius:    8,
    elevation:       2,
  },
  statsRow: {
    flexDirection:  'row',
    alignItems:     'center',
    marginBottom:   16,
  },
  stat: {
    flex:       1,
    alignItems: 'center',
  },
  statValue: {
    fontSize:   22,
    fontWeight: '800',
    color:      colors.textPrimary,
  },
  statLabel: {
    fontSize:  12,
    color:     colors.textMuted,
    marginTop:  2,
  },
  divider: {
    width:           1,
    height:          36,
    backgroundColor: colors.border,
  },
  dailyGoalRow: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  20,
  },
  progressBg: {
    flex:            1,
    height:          8,
    backgroundColor: colors.border,
    borderRadius:    4,
    overflow:        'hidden',
  },
  progressFill: {
    height:          '100%',
    backgroundColor: colors.accent,
    borderRadius:    4,
  },
  progressComplete: {
    backgroundColor: colors.success,
  },
  goalDone: {
    fontSize:   16,
    color:      colors.success,
    marginLeft: 8,
    fontWeight: '700',
  },
  chart: {
    flexDirection: 'row',
    height:        64,
    alignItems:    'flex-end',
  },
  chartColumn: {
    flex:       1,
    alignItems: 'center',
    height:     '100%',
  },
  barContainer: {
    flex:           1,
    width:          '60%',
    justifyContent: 'flex-end',
    marginBottom:   4,
  },
  bar: {
    width:        '100%',
    borderRadius: 4,
    minHeight:    4,
  },
  dayLabel: {
    fontSize: 10,
    color:    colors.textMuted,
  },
});