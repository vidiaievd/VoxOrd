import { Platform, TextStyle } from 'react-native';

// Inter 400/500 only (redesign plan 01). The font file names are resolved here
// and nowhere else. Android picks a file by family name, iOS by family + weight.
const FAMILY_REGULAR = 'Inter-Regular';
const FAMILY_MEDIUM = 'Inter-Medium';

type Weight = 'regular' | 'medium';

function face(weight: Weight): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
  if (Platform.OS === 'android') {
    return { fontFamily: weight === 'medium' ? FAMILY_MEDIUM : FAMILY_REGULAR };
  }
  return {
    fontFamily: weight === 'medium' ? FAMILY_MEDIUM : FAMILY_REGULAR,
    fontWeight: weight === 'medium' ? '500' : '400',
  };
}

function style(
  size: number,
  lineHeight: number,
  weight: Weight,
  letterSpacing = 0,
): TextStyle {
  return { ...face(weight), fontSize: size, lineHeight, letterSpacing };
}

export interface Typography {
  h1: TextStyle;
  resumeTitle: TextStyle;
  bigNumber: TextStyle;
  cardTitle: TextStyle;
  cardTitleMedium: TextStyle;
  body: TextStyle;
  secondary: TextStyle;
  meta: TextStyle;
  overline: TextStyle;
  tabLabel: TextStyle;
}

export const typography: Typography = {
  h1: style(26, 30, 'medium', -0.4),
  resumeTitle: style(22, 26, 'medium', -0.33),
  bigNumber: style(40, 40, 'medium', -0.8),
  cardTitle: style(15, 20, 'regular'),
  cardTitleMedium: style(16, 20, 'medium'),
  body: style(14, 20, 'regular'),
  secondary: style(13, 19, 'regular'),
  meta: style(12, 16, 'regular'),
  overline: { ...style(11, 14, 'regular', 0.88), textTransform: 'uppercase' },
  tabLabel: style(
    Platform.OS === 'ios' ? 10 : 11,
    Platform.OS === 'ios' ? 11 : 11,
    'regular',
  ),
};
