import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../../../providers/ThemeProvider';
import { ColorScheme } from '../../../../../theme/colors';

interface TranscriptBoxProps {
  transcript: string;
}

export function TranscriptBox({ transcript }: TranscriptBoxProps) {
  const { colors } = useTheme();
  const styles     = makeStyles(colors);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>You said:</Text>
      <Text style={styles.text}>{transcript || '...'}</Text>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      marginHorizontal: 20,
      marginBottom:     12,
      padding:          12,
      backgroundColor:  colors.backgroundInput,
      borderRadius:     12,
    },
    label: {
      fontSize:      11,
      fontWeight:    '600',
      color:         colors.textMuted,
      marginBottom:   4,
      textTransform: 'uppercase',
      letterSpacing:  1,
    },
    text: {
      fontSize:   16,
      fontWeight: '600',
      color:      colors.textPrimary,
    },
  });