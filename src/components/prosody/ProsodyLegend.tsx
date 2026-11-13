import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { GroupBoundary, SoundSeg, WordStress } from '../../kernel/prosody';
import type { TokenMarks } from '../../lib/prosody/marks';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import type { ProsodyLens } from '../../store/settingsStore';
import { typography } from '../../theme/typography';
import { ProsodyWordView } from './ProsodyText';

// The signs of the lens in use (plan 86, §4i.3). Every sample is drawn by the very component
// that draws it in the text, so the legend cannot drift from what it explains.

const FONT = 17;

const stress = (word: string, s: number, e: number, toneme: 1 | 2 | null, long: boolean): WordStress => ({
  i: 0,
  w: word,
  toneme,
  vowel: { s, e, long },
  source: 'lexicon',
});

const seg = (s: number, e: number, patch: Partial<SoundSeg>): SoundSeg => ({
  s,
  e,
  kind: 'consonant',
  sounds: [],
  stress: null,
  long: null,
  tie: false,
  ...patch,
});

// tunge → T OH2 NG AX0, godt → G OH1 T with a silent d.
const TUNGE: SoundSeg[] = [
  seg(0, 1, { sounds: ['T'] }),
  seg(1, 2, { kind: 'vowel', sounds: ['OH'], stress: 2, long: false }),
  seg(2, 4, { sounds: ['NG'], tie: true }),
  seg(4, 5, { kind: 'vowel', sounds: ['AX'], stress: 0, long: false }),
];
const GODT: SoundSeg[] = [
  seg(0, 1, { sounds: ['G'] }),
  seg(1, 2, { kind: 'vowel', sounds: ['OH'], stress: 1, long: false }),
  seg(2, 3, { kind: 'silent' }),
  seg(3, 4, { sounds: ['T'] }),
];

const boundary = (pitch: GroupBoundary['pitch'], pause: GroupBoundary['pause']): GroupBoundary => ({
  i: 0,
  w: 'ord',
  pitch,
  pause,
  source: 'teacher',
});

function Row({ sample, label }: { sample: ReactNode; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.sample}>{sample}</View>
      <Text style={[typography.meta, styles.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

/** The legend of one lens, in the learner's interface language. */
export function ProsodyLegend({ lens }: { lens: ProsodyLens }) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const sample = (word: string, marks: Omit<TokenMarks, 'word'>) => (
    <ProsodyWordView
      word={word}
      marks={{ word, ...marks }}
      trailing=""
      lens={lens}
      fontSize={FONT}
      color={colors.textPrimary}
    />
  );

  return (
    <View accessibilityLabel={t('prosody.legendTitle')}>
      <Text style={[typography.overline, { color: colors.textMuted, marginBottom: 4 }]}>
        {t('prosody.legendTitle')}
      </Text>
      {lens === 'stress' && (
        <>
          <Row sample={sample('tunge', { stress: stress('tunge', 1, 2, 2, false) })} label={t('prosody.legendStressed')} />
          <Row sample={sample('hus', { stress: stress('hus', 1, 2, null, true) })} label={t('prosody.legendLong')} />
        </>
      )}
      {lens === 'sounds' && (
        <>
          <Row sample={sample('godt', { sounds: GODT })} label={t('prosody.legendSilent')} />
          <Row sample={sample('tunge', { sounds: TUNGE })} label={t('prosody.legendTie')} />
          <Row sample={sample('tunge', { sounds: TUNGE })} label={t('prosody.legendWeak')} />
        </>
      )}
      {lens === 'respell' && (
        <>
          <Row sample={sample('tunge', { sounds: TUNGE })} label={t('prosody.legendRespell')} />
          <Row
            sample={<Text style={{ color: colors.textPrimary, fontSize: FONT }}>ŋ · ː</Text>}
            label={t('prosody.legendRespellSigns')}
          />
        </>
      )}
      {lens === 'melody' && (
        <>
          <Row sample={sample('heter', { stress: stress('heter', 1, 2, 1, true) })} label={t('prosody.legendTone1')} />
          <Row sample={sample('Anna', { stress: stress('Anna', 0, 1, 2, false) })} label={t('prosody.legendTone2')} />
          <Row sample={sample('norsk', { stress: stress('norsk', 1, 2, null, false) })} label={t('prosody.legendDot')} />
          <Row
            sample={sample('Anna', {
              stress: stress('Anna', 0, 1, 2, false),
              accent: { i: 0, w: 'Anna', source: 'teacher' },
            })}
            label={t('prosody.legendAccent')}
          />
          <Row sample={sample('ord', { boundary: boundary('fall', 'long') })} label={t('prosody.legendFall')} />
          <Row sample={sample('ord', { boundary: boundary('rise', 'short') })} label={t('prosody.legendRise')} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sample: { minWidth: 72, alignItems: 'flex-start' },
  label: { flex: 1 },
});
