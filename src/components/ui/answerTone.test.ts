import { darkColors, lightColors } from '../../theme/colors';
import { AnswerState, answerTone, verdictColor } from './answerTone';

const STATES: AnswerState[] = [
  'idle',
  'selected',
  'right',
  'missed',
  'near',
  'wrong',
  'rest',
];

describe('answerTone', () => {
  it.each([darkColors, lightColors])(
    'never uses the success/error colours',
    colors => {
      const banned = [
        colors.success,
        colors.danger,
        colors.warning,
        colors.error,
      ];
      for (const s of STATES) {
        const tone = answerTone(colors, s);
        for (const c of [tone.border, tone.bg, tone.fg, tone.iconColor]) {
          expect(banned).not.toContain(c);
        }
      }
    },
  );

  it('lights the right answer and dims the wrong one (§8.5 table)', () => {
    const c = darkColors;
    expect(answerTone(c, 'idle')).toMatchObject({
      border: c.neutral700,
      icon: null,
    });
    expect(answerTone(c, 'selected')).toMatchObject({
      border: c.accentBase,
      bg: c.accent900,
      icon: null,
    });
    expect(answerTone(c, 'right')).toMatchObject({
      border: c.accentBase,
      bg: c.accent900,
      fg: c.text,
      icon: 'Check',
    });
    expect(answerTone(c, 'wrong')).toMatchObject({
      border: c.neutral600,
      bg: 'transparent',
      fg: c.neutral400,
      icon: 'X',
    });
    expect(answerTone(c, 'rest')).toMatchObject({
      border: c.neutral800,
      fg: c.neutral500,
      icon: null,
    });
  });

  it('marks the key the learner missed without filling it', () => {
    expect(answerTone(darkColors, 'missed')).toMatchObject({
      bg: 'transparent',
      icon: 'Check',
    });
  });

  it('verdictColor lights a pass and dims the rest', () => {
    expect(verdictColor(darkColors, true)).toBe(darkColors.accent300);
    expect(verdictColor(darkColors, false)).toBe(darkColors.neutral400);
  });
});
