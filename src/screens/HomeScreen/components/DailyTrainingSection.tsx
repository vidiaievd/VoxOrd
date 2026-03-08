import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ColorScheme } from '../../../theme/colors';
import { TrainingMode } from '../types';
import { useTheme } from '../../../providers/ThemeProvider';

interface DailyTrainingSectionProps {
  modes:   TrainingMode[];
  title:   string;
  onPress: (mode: TrainingMode) => void;
}

export function DailyTrainingSection({
  modes, title, onPress,
}: DailyTrainingSectionProps) {
  const { colors } = useTheme();
  const styles     = makeStyles(colors);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.grid}>
        {modes.map((mode) => (
          <TouchableOpacity
            key={mode.id}
            style={styles.card}
            onPress={() => onPress(mode)}
            activeOpacity={0.75}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${mode.color}18` }]}>
              <Text style={styles.icon}>{mode.icon}</Text>
            </View>
            <Text style={styles.label}>{mode.labelKey}</Text>
          </TouchableOpacity>
        ))}
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
  grid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width:           '23%',
    backgroundColor: colors.backgroundCard,
    borderRadius:    16,
    padding:         12,
    alignItems:      'center',
    shadowColor:     colors.cardShadow,
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   1,
    shadowRadius:    6,
    elevation:       2,
  },
  iconWrap: {
    width:          44,
    height:         44,
    borderRadius:   14,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   8,
  },
  icon: {
    fontSize: 22,
  },
  label: {
    fontSize:   10,
    fontWeight: '600',
    color:      colors.textSecondary,
    textAlign:  'center',
  },
});