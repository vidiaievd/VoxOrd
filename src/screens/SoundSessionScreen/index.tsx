import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';
import type { SessionResult, SoundSession, TakeResult } from '../../api/soundSession';
import { Button, Overline, SubScreen } from '../../components/ui';
import { useSoundSession, type TakeNotice } from '../../hooks/useSoundSession';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';
import { ClipButtons } from './ClipButtons';
import {
  eventLine,
  familyOf,
  isFramed,
  lowBudget,
  pairNow,
  promptOf,
  toneKeyOf,
} from './soundSessionLogic';
import { TakeButton } from './TakeButton';

/** Only Norwegian is taught so far (plan 86 §0). */
const LANGUAGE = 'nb';

export interface SoundSessionScreenProps {
  /** The learner chose this sound on its card; the session practises that one. */
  atomId?: string;
  onBack: () => void;
}

/**
 * The pronunciation session on the phone (platform plan 86, VoxOrd step 15.3): start → a step
 * (say a word, a pair or a line against the model clip) → the verdict → … → hand in → the ratings.
 * The engine decides everything; this draws its answers (`useSoundSession`).
 */
export function SoundSessionScreen({ atomId, onBack }: SoundSessionScreenProps) {
  const { t, language } = useTranslation();
  const { colors, typography } = useTheme();
  const s = useSoundSession({ language: LANGUAGE, locale: language });
  const { session } = s;

  const card = {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 16,
    gap: 12,
  } as const;
  const secondary = [typography.secondary, { color: colors.neutral400 }];
  const strong = [typography.body, { color: colors.text }];

  const frame = (children: React.ReactNode) => (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <SubScreen
        backLabel={t('soundSession.back')}
        onBack={onBack}
        title={t('soundSession.title')}
      >
        {children}
      </SubScreen>
    </SafeAreaView>
  );

  if (s.phase === 'idle' || s.phase === 'starting' || s.phase === 'refused') {
    const code = s.refusal?.code;
    const refused =
      code === 'SESSION_LIMIT'
        ? t('soundSession.refused.SESSION_LIMIT')
        : code === 'POOL_EMPTY'
        ? t('soundSession.refused.POOL_EMPTY')
        : code === 'NOT_AVAILABLE'
        ? t('soundSession.refused.NOT_AVAILABLE')
        : t('soundSession.refused.generic');
    const family = atomId === undefined ? '' : familyOf(atomId);
    return frame(
      <View style={card}>
        <Text style={secondary}>{t('soundSession.start.hint')}</Text>
        {atomId !== undefined ? (
          <Text style={strong}>{t('soundSession.start.chosen', { family })}</Text>
        ) : null}
        {s.phase === 'refused' ? (
          <Text accessibilityRole="alert" style={strong}>
            {refused}
          </Text>
        ) : null}
        <Button
          block
          size={48}
          busy={s.phase === 'starting'}
          label={
            s.phase === 'refused'
              ? t('soundSession.refused.retry')
              : atomId !== undefined
              ? t('soundSession.start.trainSound', { family })
              : t('soundSession.start.begin')
          }
          onPress={() => {
            void s.start(atomId);
          }}
        />
      </View>,
    );
  }

  if (s.phase === 'broken') {
    return frame(
      <View style={card} accessibilityRole="alert">
        <Text style={strong}>{t('soundSession.broken.title')}</Text>
        <Text style={secondary}>{t('soundSession.broken.body')}</Text>
        <Button
          block
          size={48}
          label={t('soundSession.broken.reload')}
          onPress={() => {
            void s.reload();
          }}
        />
        <Button
          block
          size={48}
          variant="secondary"
          label={t('soundSession.broken.restart')}
          onPress={s.reset}
        />
      </View>,
    );
  }

  if (s.phase === 'result' && s.result !== null) {
    return frame(<ResultCard result={s.result} onAgain={s.reset} />);
  }

  if (session === null) return null;

  const noticeText = (n: TakeNotice | null): string | null =>
    n === 'uploadFailed'
      ? t('soundSession.notice.uploadFailed')
      : n === 'notReady'
      ? t('soundSession.notice.notReady')
      : n === 'inaudible'
      ? t('soundSession.notice.inaudible')
      : n === 'tryAgain'
      ? t('soundSession.notice.tryAgain')
      : n === 'stale'
      ? t('soundSession.notice.stale')
      : null;

  return frame(
    <>
      {lowBudget(s.budget) ? (
        <Text accessibilityRole="summary" style={secondary}>
          {t('soundSession.start.lowBudget', {
            remaining: Math.floor(s.budget.remainingCredits ?? 0),
            estimated: Math.round(s.budget.estimatedCredits ?? 0),
          })}
        </Text>
      ) : null}
      {s.budget?.payer === 'school' && session.takes === 0 && s.phase === 'step' ? (
        <Text style={[typography.meta, { color: colors.neutral500 }]}>
          {t('soundSession.start.schoolPays')}
        </Text>
      ) : null}
      <Progress session={session} />

      {(s.phase === 'step' || s.phase === 'sending') && session.step !== null ? (
        <View style={card}>
          <StepPrompt session={session} />
          <ClipButtons clips={s.clips} />
          {s.instruction !== null ? (
            <View style={{ gap: 6 }}>
              <Overline>{t('soundSession.step.howTo')}</Overline>
              <Text style={secondary}>{s.instruction.howTo}</Text>
              {s.instruction.drill !== null ? (
                <Text style={secondary}>
                  {t('soundSession.step.drill')}: {s.instruction.drill}
                </Text>
              ) : null}
              {s.instruction.commonError !== null ? (
                <Text style={secondary}>
                  {t('soundSession.step.commonError')}: {s.instruction.commonError}
                </Text>
              ) : null}
              {s.instruction.ukNote !== null ? (
                <Text style={secondary}>{s.instruction.ukNote}</Text>
              ) : null}
            </View>
          ) : null}
          {noticeText(s.notice) !== null ? (
            <Text accessibilityRole="alert" style={strong}>
              {noticeText(s.notice)}
            </Text>
          ) : null}
          <TakeButton
            sending={s.phase === 'sending'}
            onCapture={c => {
              void s.sendTake(c);
            }}
          />
        </View>
      ) : null}

      {s.phase === 'verdict' && s.take !== null ? (
        <VerdictCard
          take={s.take}
          last={session.phase === 'done' || s.take.outcome === 'stopped'}
          onNext={() => {
            void s.next();
          }}
        />
      ) : null}

      {s.phase === 'ending' || s.phase === 'submitting' ? (
        <View style={card}>
          <Text style={strong}>{t('soundSession.ending.title')}</Text>
          <Text style={secondary}>
            {session.doneReason === 'pool_empty' || session.doneReason === 'not_available'
              ? t('soundSession.ending.stopped')
              : session.doneReason === 'take_limit'
              ? t('soundSession.ending.take_limit')
              : t('soundSession.ending.body')}
          </Text>
          {s.refusal !== null ? (
            <Text accessibilityRole="alert" style={secondary}>
              {t('soundSession.ending.retry')}
            </Text>
          ) : null}
          <Button
            block
            size={48}
            busy={s.phase === 'submitting'}
            label={t('soundSession.ending.finish')}
            onPress={() => {
              void s.finish();
            }}
          />
        </View>
      ) : null}
    </>,
  );
}

function Progress({ session }: { session: SoundSession }) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const step = session.step;
  const statusText = (st: SoundSession['sounds'][number]['status']) =>
    st === 'pending'
      ? t('soundSession.status.pending')
      : st === 'open'
      ? t('soundSession.status.open')
      : st === 'passed'
      ? t('soundSession.status.passed')
      : t('soundSession.status.failed');
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="text" style={[typography.meta, { color: colors.neutral500 }]}>
        {step?.phase === 'diagnostic'
          ? t('soundSession.progress.diagnostic', { n: step.index + 1, total: step.total })
          : t('soundSession.progress.takes', {
              n: Math.min(session.takes + 1, session.maxTakes),
              max: session.maxTakes,
            })}
      </Text>
      {session.sounds.length > 0 ? (
        <View
          accessibilityLabel={t('soundSession.progress.sounds')}
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
        >
          {session.sounds.map(sound => (
            <View
              key={sound.atomId}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: sound.status === 'open' ? colors.accentBase : colors.neutral800,
                paddingHorizontal: 10,
                paddingVertical: 3,
              }}
            >
              <Text
                style={[
                  typography.meta,
                  { color: sound.status === 'pending' ? colors.neutral500 : colors.text },
                ]}
              >
                [{sound.family}] · {statusText(sound.status)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function StepPrompt({ session }: { session: SoundSession }) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const step = session.step;
  if (step === null) return null;
  const { key, target } = promptOf(step);
  const half = pairNow(step);
  return (
    <View style={{ gap: 8 }}>
      <Overline>
        {key === 'sayWord'
          ? t('soundSession.step.sayWord')
          : key === 'sayPair'
          ? t('soundSession.step.sayPair')
          : t('soundSession.step.sayPhrase')}
      </Overline>
      <Text style={[typography.h1, { color: colors.text }]}>{target}</Text>
      {half !== null ? (
        <Text style={[typography.body, { color: colors.text }]}>
          {t('soundSession.step.sayPairNow', { word: half })}
        </Text>
      ) : null}
      {isFramed(step) ? (
        <Text style={[typography.secondary, { color: colors.neutral400 }]}>
          {t('soundSession.step.frame')}: {step.sentence}
        </Text>
      ) : null}
    </View>
  );
}

function VerdictCard({
  take,
  last,
  onNext,
}: {
  take: TakeResult;
  last: boolean;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const v = take.verdict;
  const headline =
    v === null || !v.measured || v.passed === null
      ? t('soundSession.verdict.unmeasured')
      : v.passed
      ? t('soundSession.verdict.passed')
      : t('soundSession.verdict.missed');
  const tone = toneKeyOf(take.toneme?.verdict);
  const toneText =
    tone === 'like_reference'
      ? t('soundSession.verdict.tone.like_reference')
      : tone === 'other_tone'
      ? t('soundSession.verdict.tone.other_tone')
      : tone === 'unsure'
      ? t('soundSession.verdict.tone.unsure')
      : null;
  const line = eventLine(take.events);
  const lineText =
    line === 'sound_failed'
      ? t('soundSession.events.sound_failed')
      : line === 'sound_passed'
      ? t('soundSession.events.sound_passed')
      : line === 'diagnostic_done'
      ? t('soundSession.events.diagnostic_done')
      : line === 'element_passed'
      ? t('soundSession.events.element_passed')
      : line === 'side_passed'
      ? t('soundSession.events.side_passed')
      : null;
  const fb = take.feedback;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 12 }}
    >
      <Text style={[typography.cardTitle, { color: colors.text }]}>{headline}</Text>
      {toneText !== null ? (
        <Text style={[typography.secondary, { color: colors.neutral400 }]}>{toneText}</Text>
      ) : null}
      {fb !== null && (fb.summary !== '' || fb.items.length > 0) ? (
        <View style={{ gap: 6 }}>
          {fb.summary !== '' ? (
            <Text style={[typography.secondary, { color: colors.neutral400 }]}>{fb.summary}</Text>
          ) : null}
          {fb.items.map((item, i) => (
            <Text key={i} style={[typography.secondary, { color: colors.neutral400 }]}>
              • {item.explanation}
            </Text>
          ))}
        </View>
      ) : null}
      {lineText !== null ? (
        <Text style={[typography.body, { color: colors.text }]}>{lineText}</Text>
      ) : null}
      <Button
        block
        size={48}
        label={last ? t('soundSession.verdict.toEnd') : t('soundSession.verdict.next')}
        onPress={onNext}
      />
    </View>
  );
}

function ResultCard({ result, onAgain }: { result: SessionResult; onAgain: () => void }) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const rating = (r: SessionResult['sounds'][number]['rating']) =>
    r === 'GOOD'
      ? t('soundSession.result.GOOD')
      : r === 'HARD'
      ? t('soundSession.result.HARD')
      : r === 'AGAIN'
      ? t('soundSession.result.AGAIN')
      : t('soundSession.result.none');
  return (
    <View
      style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 12 }}
    >
      <Text style={[typography.cardTitle, { color: colors.text }]}>{t('soundSession.result.title')}</Text>
      {result.sounds.length === 0 ? (
        <Text style={[typography.secondary, { color: colors.neutral400 }]}>
          {t('soundSession.result.empty')}
        </Text>
      ) : (
        <>
          {result.score !== null ? (
            <Text style={[typography.secondary, { color: colors.neutral400 }]}>
              {t('soundSession.result.score', { score: Math.round(result.score) })}
            </Text>
          ) : null}
          {result.sounds.map(sound => (
            <View
              key={sound.atomId}
              style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}
            >
              <Text style={[typography.body, { color: colors.text }]}>
                [{familyOf(sound.atomId)}]
              </Text>
              <Text style={[typography.meta, { color: colors.neutral500 }]}>
                {t('soundSession.result.passes', { n: sound.passes })} ·{' '}
                {t('soundSession.result.fails', { n: sound.fails })}
              </Text>
              <Text style={[typography.body, { color: colors.text }]}>{rating(sound.rating)}</Text>
            </View>
          ))}
          <Text style={[typography.meta, { color: colors.neutral500 }]}>
            {t('soundSession.result.cardsNote')}
          </Text>
        </>
      )}
      {result.diagnosticWeak.length > 0 ? (
        <Text style={[typography.secondary, { color: colors.neutral400 }]}>
          {t('soundSession.result.weak')}: {result.diagnosticWeak.map(f => `[${familyOf(f)}]`).join(' ')}
        </Text>
      ) : null}
      <Button
        block
        size={48}
        variant="secondary"
        label={t('soundSession.result.again')}
        onPress={onAgain}
      />
    </View>
  );
}
