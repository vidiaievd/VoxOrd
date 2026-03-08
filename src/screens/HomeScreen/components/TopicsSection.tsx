import React from 'react';
import {
  View, Text, StyleSheet,
  ScrollView, TouchableOpacity,
} from 'react-native';
import { ColorScheme } from '../../../theme/colors';
import { Topic } from '../types';
import { useTheme } from '../../../providers/ThemeProvider';

interface TopicsSectionProps {
  topics:  Topic[];
  title:   string;
  onPress: (topic: Topic) => void;
}

export function TopicsSection({ topics, title, onPress }: TopicsSectionProps) {
  const { colors } = useTheme();
  const styles     = makeStyles(colors);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {topics.map((topic) => {
          const percent = Math.round(topic.progress * 100);
          return (
            <TouchableOpacity
              key={topic.id}
              style={styles.card}
              onPress={() => onPress(topic)}
              activeOpacity={0.8}
            >
              <Text style={styles.icon}>{topic.icon}</Text>
              <Text style={styles.title} numberOfLines={1}>
                {topic.title}
              </Text>
              <Text style={styles.words}>{topic.words} ord</Text>

              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${percent}%` }]} />
              </View>
              <Text style={styles.percent}>{percent}%</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) => StyleSheet.create({
  container: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize:          17,
    fontWeight:        '700',
    color:             colors.textPrimary,
    marginBottom:      12,
    paddingHorizontal: 16,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom:     4,
  },
  card: {
    width:           140,
    backgroundColor: colors.backgroundCard,
    borderRadius:    20,
    padding:         16,
    marginRight:     12,
    shadowColor:     colors.cardShadow,
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   1,
    shadowRadius:    6,
    elevation:       2,
  },
  icon: {
    fontSize:     32,
    marginBottom: 8,
  },
  title: {
    fontSize:     14,
    fontWeight:   '700',
    color:        colors.textPrimary,
    marginBottom:  4,
  },
  words: {
    fontSize:     12,
    color:        colors.textMuted,
    marginBottom: 10,
  },
  progressBg: {
    height:          4,
    backgroundColor: colors.border,
    borderRadius:    2,
    overflow:        'hidden',
    marginBottom:    4,
  },
  progressFill: {
    height:          '100%',
    backgroundColor: colors.accent,
    borderRadius:    2,
  },
  percent: {
    fontSize:   11,
    color:      colors.textMuted,
    fontWeight: '600',
  },
});