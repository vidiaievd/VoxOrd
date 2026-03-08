import React from 'react';
import {
  View, Text, StyleSheet,
  TouchableOpacity, Dimensions,
} from 'react-native';
import { ColorScheme } from '../../../theme/colors';
import { useTheme } from '../../../providers/ThemeProvider';

const { width } = Dimensions.get('window');

interface ContinueLearningCardProps {
  deckTitle:  string;
  deckIcon:   string;
  progress:   number;
  wordsLeft:  number;
  totalWords: number;
  onPress:    () => void;
  ctaLabel:   string;
}

export function ContinueLearningCard({
  deckTitle, deckIcon, progress,
  wordsLeft, totalWords, onPress, ctaLabel,
}: ContinueLearningCardProps) {
  const { colors } = useTheme();
  const styles     = makeStyles(colors);
  const percent    = Math.round(progress * 100);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.9}
    >
      {/* Фоновый декор */}
      <View style={styles.decorCircle1} />
      <View style={styles.decorCircle2} />

      <View style={styles.content}>
        <View style={styles.top}>
          <View>
            <Text style={styles.sectionLabel}>Fortsett å lære</Text>
            <Text style={styles.deckTitle} numberOfLines={1}>
              {deckIcon}  {deckTitle}
            </Text>
            <Text style={styles.wordsLeft}>
              {wordsLeft} av {totalWords} ord igjen
            </Text>
          </View>
          <View style={styles.percentBadge}>
            <Text style={styles.percentText}>{percent}%</Text>
          </View>
        </View>

        {/* Прогресс бар */}
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${percent}%` }]} />
        </View>

        {/* CTA кнопка */}
        <TouchableOpacity style={styles.ctaBtn} onPress={onPress}>
          <Text style={styles.ctaText}>{ctaLabel} →</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ColorScheme) => StyleSheet.create({
  card: {
    marginHorizontal: 16,
    borderRadius:     24,
    backgroundColor:  colors.accent,
    overflow:         'hidden',
    shadowColor:      colors.accent,
    shadowOffset:     { width: 0, height: 8 },
    shadowOpacity:    0.35,
    shadowRadius:     16,
    elevation:        8,
  },
  decorCircle1: {
    position:        'absolute',
    width:           120,
    height:          120,
    borderRadius:    60,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top:             -30,
    right:           -20,
  },
  decorCircle2: {
    position:        'absolute',
    width:           80,
    height:          80,
    borderRadius:    40,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom:          -20,
    right:           60,
  },
  content: {
    padding: 20,
  },
  top: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   16,
  },
  sectionLabel: {
    fontSize:     11,
    fontWeight:   '600',
    color:        'rgba(255,255,255,0.7)',
    letterSpacing: 1,
    marginBottom:  4,
    textTransform: 'uppercase',
  },
  deckTitle: {
    fontSize:     20,
    fontWeight:   '800',
    color:        '#fff',
    marginBottom:  4,
    maxWidth:     width * 0.55,
  },
  wordsLeft: {
    fontSize: 13,
    color:    'rgba(255,255,255,0.7)',
  },
  percentBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius:    12,
    paddingHorizontal: 10,
    paddingVertical:   6,
  },
  percentText: {
    fontSize:   16,
    fontWeight: '800',
    color:      '#fff',
  },
  progressBg: {
    height:          6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius:    3,
    overflow:        'hidden',
    marginBottom:    16,
  },
  progressFill: {
    height:          '100%',
    backgroundColor: '#fff',
    borderRadius:    3,
  },
  ctaBtn: {
    backgroundColor: '#fff',
    borderRadius:    14,
    paddingVertical:   12,
    alignItems:        'center',
  },
  ctaText: {
    fontSize:   15,
    fontWeight: '800',
    color:      colors.accent,
  },
});