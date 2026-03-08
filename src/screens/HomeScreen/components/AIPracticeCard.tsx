import React from 'react';
import {
  View, Text, StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { ColorScheme } from '../../../theme/colors';
import { useTheme } from '../../../providers/ThemeProvider';

interface AIPracticeCardProps {
  onPress:    () => void;
  title:      string;
  subtitle:   string;
  ctaLabel:   string;
}

export function AIPracticeCard({
  onPress, title, subtitle, ctaLabel,
}: AIPracticeCardProps) {
  const { colors } = useTheme();
  const styles     = makeStyles(colors);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={styles.decorCircle} />

      <View style={styles.content}>
        <View style={styles.left}>
          <Text style={styles.robotIcon}>🤖</Text>
          <View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.btn} onPress={onPress}>
          <Text style={styles.btnText}>{ctaLabel}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ColorScheme) => StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop:        24,
    borderRadius:     20,
    backgroundColor:  '#1a1a2e',
    overflow:         'hidden',
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 4 },
    shadowOpacity:    0.2,
    shadowRadius:     12,
    elevation:        4,
  },
  decorCircle: {
    position:        'absolute',
    width:           100,
    height:          100,
    borderRadius:    50,
    backgroundColor: 'rgba(108,99,255,0.2)',
    top:             -20,
    right:           -20,
  },
  content: {
    padding:        20,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  left: {
    flexDirection: 'row',
    alignItems:    'center',
    flex:          1,
  },
  robotIcon: {
    fontSize:    32,
    marginRight: 12,
  },
  title: {
    fontSize:   15,
    fontWeight: '700',
    color:      '#fff',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color:    'rgba(255,255,255,0.6)',
  },
  btn: {
    backgroundColor:   colors.accent,
    borderRadius:      12,
    paddingHorizontal: 14,
    paddingVertical:   10,
    marginLeft:        12,
  },
  btnText: {
    fontSize:   13,
    fontWeight: '700',
    color:      '#fff',
  },
});