import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ApiError } from '../../api/client';
import {
  handOutProbe,
  type SubmitAttemptResponse,
} from '../../api/exercises';
import { useClipPlayer, type ClipPlayer, type Clips } from '../../hooks/useClipPlayer';
import {
  PROBE_CLIP,
  useMinimalPairsSitting,
  type Sitting,
  type SittingDriver,
} from '../../hooks/useMinimalPairsSitting';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import type { ExerciseBodyProps } from './ExerciseBody';
import {
  estimatedMinutes,
  readMinimalPairsProjection,
  readMinimalPairsSummary,
  readProbe,
  readProbeVerdict,
  type MinimalPairsProjection,
  type MinimalPairsSummary,
} from './templates/minimalPairs';

/** BEHAVIOR §8: every control is comfortably tappable. */
const TAP_MIN = 44;

type T = ReturnType<typeof useTranslation>['t'];
type Styles = ReturnType<typeof makeStyles>;

export interface MinimalPairsBodyProps extends ExerciseBodyProps {
  /** The clip player. Tests pass a stand-in; the app uses the native one. */
  player?: ClipPlayer;
}

/** Why a sitting could not be started. */
type Refusal = { kind: 'spent'; allowed: number } | { kind: 'empty' } | { kind: 'failed' };

/** How the start's failure reads — the engine's two refusals by their code (plan 72, Q4-A). */
function refusalOf(e: unknown): Refusal {
  if (e instanceof ApiError && e.status === 422) {
    if (e.code === 'MP_SITTINGS_SPENT') {
      const allowed = (e.body as { allowed?: unknown } | null)?.allowed;
      return { kind: 'spent', allowed: typeof allowed === 'number' ? allowed : 0 };
    }
    if (e.code === 'MP_EMPTY_SET') return { kind: 'empty' };
  }
  return { kind: 'failed' };
}

/**
 * `minimal_pairs` on the phone — plan 72, phase 9 (MP-V1…V5).
 *
 * The web runner's flow in the runner's frame: a card first, then one sitting against the
 * server. The card is drawn from the display projection — no attempt, no draw, no clip until
 * «Start» — and the press that starts it also opens the attempt (or joins the one in progress,
 * which the engine resumes on the probe it was on). One probe at a time: a big button that plays
 * one word, and the two or three it could have been; nothing on the screen knows which.
 *
 * Nothing here grades. A pick goes up through the runner's `answerQuestion`, the verdict names the
 * key only once the probe closes, and the result is the submit's `details`. The body owns the
 * check, so the footer's Check never shows; the closing submit is reported through `finishTable`
 * with the engine's own pass, and the footer's «Try again» is «Ny runde» — a new attempt, a new
 * draw — refused by the engine once the author's sittings are used.
 */
export function MinimalPairsBody({
  display,
  onAnswerChange,
  answerQuestion,
  checkTable,
  finishTable,
  openAttempt,
  openedContent,
  player,
}: MinimalPairsBodyProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const shown = useMemo(() => readMinimalPairsProjection(display.content), [display.content]);
  const instruction = display.instructions?.[0]?.instructionText ?? '';

  // The body owns the hand-in; the footer's Check never shows for it.
  useEffect(() => {
    onAnswerChange(null, false);
  }, [onAnswerChange]);

  const [stage, setStage] = useState<
    | { kind: 'card' }
    | { kind: 'starting' }
    | { kind: 'run'; attemptId: string; projection: MinimalPairsProjection }
  >({ kind: 'card' });
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const begin = useCallback(() => {
    setStage({ kind: 'starting' });
    setRefusal(null);
    openAttempt().then(
      attemptId => {
        // The attempt's own start knows the length of the draw; the display knows the set.
        const opened = readMinimalPairsProjection(openedContent?.() ?? null);
        const projection = opened ?? shown;
        if (projection === null) {
          setRefusal({ kind: 'failed' });
          setStage({ kind: 'card' });
          return;
        }
        setStage({ kind: 'run', attemptId, projection });
      },
      (e: unknown) => {
        setRefusal(refusalOf(e));
        setStage({ kind: 'card' });
      },
    );
  }, [openAttempt, openedContent, shown]);

  if (shown === null) {
    return (
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>{t('exerciseRunner.minimalPairs.unavailable')}</Text>
        <Text style={styles.noticeDesc}>{t('exerciseRunner.minimalPairs.unavailableDesc')}</Text>
      </View>
    );
  }

  if (stage.kind === 'run') {
    return (
      <SittingView
        key={stage.attemptId}
        exerciseId={display.id}
        attemptId={stage.attemptId}
        projection={stage.projection}
        instruction={instruction}
        answerQuestion={answerQuestion}
        checkTable={checkTable}
        finishTable={finishTable}
        {...(player === undefined ? {} : { player })}
      />
    );
  }

  const notice =
    refusal === null
      ? null
      : refusal.kind === 'spent'
        ? t('exerciseRunner.minimalPairs.summary.sittingsSpent', { count: refusal.allowed })
        : refusal.kind === 'empty'
          ? t('exerciseRunner.minimalPairs.failure.emptySet')
          : t('exerciseRunner.minimalPairs.failure.start');

  return (
    <Card
      projection={shown}
      instruction={instruction}
      onStart={begin}
      starting={stage.kind === 'starting'}
      blocked={refusal !== null && refusal.kind !== 'failed'}
      notice={notice}
      styles={styles}
      colors={colors}
      t={t}
    />
  );
}

/* ── The card ──────────────────────────────────────────────────────────────── */

function Card({
  projection,
  instruction,
  onStart,
  starting,
  blocked,
  notice,
  styles,
  colors,
  t,
}: {
  projection: MinimalPairsProjection;
  instruction: string;
  onStart: () => void;
  starting: boolean;
  blocked: boolean;
  notice: string | null;
  styles: Styles;
  colors: ColorScheme;
  t: T;
}) {
  const probes = projection.set.probes;
  const plays = projection.set.playsPerProbe;
  const heading =
    projection.title.trim() !== ''
      ? projection.title
      : t('exerciseRunner.minimalPairs.defaultTitle');
  const lead =
    instruction.trim() !== ''
      ? instruction
      : projection.instruction.trim() !== ''
        ? projection.instruction
        : t('exerciseRunner.minimalPairs.card.defaultInstruction');
  const facts = [
    ...(projection.contrast.label === '' ? [] : [projection.contrast.label]),
    t('exerciseRunner.minimalPairs.card.probes', { count: probes }),
    t('exerciseRunner.minimalPairs.card.minutes', { min: estimatedMinutes(probes) }),
  ].join(' · ');
  const how = [
    plays > 0
      ? t('exerciseRunner.minimalPairs.card.plays', { count: plays })
      : t('exerciseRunner.minimalPairs.card.freePlay'),
    t('exerciseRunner.minimalPairs.card.answerAtOnce'),
    ...(projection.feedback.abCompare
      ? [t('exerciseRunner.minimalPairs.card.hearDifference')]
      : []),
  ].join(' · ');

  return (
    <View style={styles.card} accessibilityLabel={heading}>
      <Text style={styles.cardTitle}>{heading}</Text>
      <Text style={styles.cardFacts}>{facts}</Text>
      <Text style={styles.cardLead}>{lead}</Text>
      <Text style={styles.cardHow}>{how}</Text>
      <TouchableOpacity
        style={[styles.primary, (starting || blocked) && styles.primaryOff]}
        onPress={onStart}
        disabled={starting || blocked}
        accessibilityRole="button"
      >
        {starting ? (
          <ActivityIndicator size="small" color={colors.textInverted} />
        ) : (
          <Text style={styles.primaryText}>{t('exerciseRunner.minimalPairs.card.start')}</Text>
        )}
      </TouchableOpacity>
      {notice !== null ? <Text style={styles.cardNotice}>{notice}</Text> : null}
    </View>
  );
}

/* ── One sitting ───────────────────────────────────────────────────────────── */

function SittingView({
  exerciseId,
  attemptId,
  projection,
  instruction,
  answerQuestion,
  checkTable,
  finishTable,
  player,
}: {
  exerciseId: string;
  attemptId: string;
  projection: MinimalPairsProjection;
  instruction: string;
  answerQuestion: ExerciseBodyProps['answerQuestion'];
  checkTable: ExerciseBodyProps['checkTable'];
  finishTable: ExerciseBodyProps['finishTable'];
  player?: ClipPlayer;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const clips = useClipPlayer(player);

  /** The submit that closed the sitting, kept for the runner once the result is read. */
  const closing = useRef<SubmitAttemptResponse | null>(null);

  const driver = useMemo<SittingDriver>(
    () => ({
      next: () =>
        handOutProbe(exerciseId, attemptId).then(
          raw => {
            const probe = readProbe(raw);
            if (probe === null) throw new Error('Not a probe');
            return probe;
          },
          (e: unknown) => {
            if (e instanceof ApiError && e.code === 'ALL_PROBES_CLOSED') return 'closed' as const;
            throw e;
          },
        ),
      answer: (questionId, optionId) =>
        answerQuestion(questionId, { optionId }).then(data => {
          const verdict = readProbeVerdict(data.result);
          if (verdict === null) throw new Error('Not a verdict');
          return verdict;
        }),
      // The engine ignores the body of this submit: it sums the sitting from what it recorded.
      finish: () =>
        checkTable({}).then(response => {
          const summary = readMinimalPairsSummary(response.details);
          if (summary === null) throw new Error('Not a result');
          closing.current = response;
          return summary;
        }),
    }),
    [exerciseId, attemptId, answerQuestion, checkTable],
  );

  const sitting = useMinimalPairsSitting({
    driver,
    clips,
    playsPerProbe: projection.set.playsPerProbe,
    autoplay: projection.set.autoplay,
    onFinished: (summary: MinimalPairsSummary) => {
      const response = closing.current;
      // `correct` on the submit means every probe right; the runner's «Try again» belongs to a
      // sitting that did not pass, so the engine's own pass is what it is told.
      if (response !== null) finishTable({ ...response, correct: summary.passed });
    },
    isRefusal: e => e instanceof ApiError && e.status === 422,
    isMediaFailure: e => e instanceof ApiError && e.code === 'MEDIA_UNAVAILABLE',
  });

  // The first probe, once per mount: `/items` is idempotent, but the autoplay would be
  // scheduled twice.
  const begun = useRef(false);
  const beginSitting = sitting.begin;
  useEffect(() => {
    if (begun.current) return;
    begun.current = true;
    beginSitting();
  }, [beginSitting]);

  const { state } = sitting;
  if (state.phase === 'done' && state.summary !== null) {
    return (
      <Summary
        summary={state.summary}
        contrastLabel={projection.contrast.label}
        clips={clips}
        styles={styles}
        colors={colors}
        t={t}
      />
    );
  }

  if (projection.set.probes === 0) {
    return (
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>{t('exerciseRunner.minimalPairs.empty.title')}</Text>
        <Text style={styles.noticeDesc}>{t('exerciseRunner.minimalPairs.empty.body')}</Text>
      </View>
    );
  }

  return (
    <Run
      projection={projection}
      sitting={sitting}
      clips={clips}
      instruction={instruction}
      styles={styles}
      colors={colors}
      t={t}
    />
  );
}

/* ── The probe ─────────────────────────────────────────────────────────────── */

function PlayButton({
  size,
  on,
  disabled,
  onPress,
  label,
  styles,
}: {
  size: 'sm' | 'lg';
  on: boolean;
  disabled?: boolean;
  onPress: () => void;
  label: string;
  styles: Styles;
}) {
  const px = size === 'lg' ? 84 : 32;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on, disabled: disabled === true }}
      style={[
        styles.play,
        { width: px, height: px, borderRadius: px / 2 },
        on && styles.playOn,
        disabled === true && styles.playOff,
      ]}
    >
      <Text style={[styles.playIcon, size === 'lg' && styles.playIconLg]}>{on ? '❚❚' : '▶'}</Text>
    </TouchableOpacity>
  );
}

function Run({
  projection,
  sitting,
  clips,
  instruction,
  styles,
  colors,
  t,
}: {
  projection: MinimalPairsProjection;
  sitting: Sitting;
  clips: Clips;
  instruction: string;
  styles: Styles;
  colors: ColorScheme;
  t: T;
}) {
  const { state } = sitting;
  const probe = state.probe;
  const verdict = state.verdict;
  const total = probe?.total ?? projection.set.probes;
  const n = probe?.n ?? Object.keys(state.pips).length + 1;
  const answered = verdict !== null;
  const ok = verdict?.correct === true;
  const f = projection.feedback;
  const budget = projection.set.playsPerProbe;
  const left = sitting.left;
  const probePlaying = clips.playing(PROBE_CLIP);

  const lead =
    instruction.trim() !== ''
      ? instruction
      : projection.instruction.trim() !== ''
        ? projection.instruction
        : t('exerciseRunner.minimalPairs.defaultInstruction');
  const heading =
    projection.title.trim() !== ''
      ? projection.title
      : t('exerciseRunner.minimalPairs.defaultTitle');

  const revealed = (id: string) => verdict?.options?.find(o => o.id === id);
  const options = probe?.options ?? [];
  const keyId = verdict?.keyOptionId;
  const chosen = verdict === null ? undefined : revealed(verdict.optionId);
  const target = keyId === undefined ? undefined : revealed(keyId);

  const progress = Math.min(1, (n - 1 + (answered ? 1 : 0)) / Math.max(1, total));
  const canPlay = probe !== null && (left === null || left > 0 || probePlaying);
  const failure = state.failure;
  const last = probe !== null && probe.n >= probe.total;

  return (
    <View>
      <View style={styles.top}>
        <Text style={styles.topTitle} numberOfLines={1}>
          {heading}
        </Text>
        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityLabel={t('exerciseRunner.minimalPairs.progress')}
          accessibilityValue={{ min: 0, max: total, now: n - 1 + (answered ? 1 : 0) }}
        >
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.topCount}>
          {n}/{total}
        </Text>
      </View>

      {/* By the first answer of each probe (MP-R1). */}
      <View style={styles.pips} accessibilityElementsHidden importantForAccessibility="no">
        {Array.from({ length: total }, (_, k) => {
          const at = k + 1;
          const first = state.pips[at];
          return (
            <View
              key={at}
              style={[
                styles.pip,
                first === true
                  ? { backgroundColor: colors.success }
                  : first === false
                    ? { backgroundColor: colors.danger }
                    : at === n
                      ? { backgroundColor: colors.accent }
                      : null,
              ]}
            />
          );
        })}
      </View>

      <Text style={styles.lead}>{lead}</Text>

      <View style={[styles.stage, clips.anyPlaying && styles.stageOn]}>
        <PlayButton
          size="lg"
          on={probePlaying}
          disabled={!canPlay}
          onPress={sitting.playProbe}
          label={
            probePlaying
              ? t('exerciseRunner.minimalPairs.pause')
              : t('exerciseRunner.minimalPairs.play')
          }
          styles={styles}
        />
        <View style={styles.stageMeta}>
          {budget > 0 ? (
            <View style={styles.leftRow}>
              <View style={styles.leftPips}>
                {Array.from({ length: budget }, (_, k) => (
                  <View
                    key={k}
                    style={[styles.leftPip, k < state.plays && styles.leftPipSpent]}
                  />
                ))}
              </View>
              <Text style={styles.stageText} accessibilityLiveRegion="polite">
                {left !== null && left > 0
                  ? t('exerciseRunner.minimalPairs.playsLeft', { left, total: budget })
                  : t('exerciseRunner.minimalPairs.noPlaysLeft')}
              </Text>
            </View>
          ) : (
            <Text style={styles.stageText}>{t('exerciseRunner.minimalPairs.freePlay')}</Text>
          )}
          {probe?.clip.provenance === 'tts' ? (
            <Text style={styles.stageSub}>{t('exerciseRunner.minimalPairs.synthetic')}</Text>
          ) : null}
        </View>
      </View>

      {state.retried && !answered ? (
        <Text style={styles.retry} accessibilityLiveRegion="polite">
          {t('exerciseRunner.minimalPairs.retry')}
        </Text>
      ) : null}

      <View style={styles.options}>
        {options.map((o, k) => {
          const shownOption = revealed(o.id);
          const st = !answered
            ? undefined
            : o.id === keyId
              ? 'right'
              : o.id === verdict.optionId
                ? 'wrong'
                : 'dim';
          const main = shownOption?.text ?? o.text ?? String.fromCharCode(65 + k);
          const ipa = shownOption?.ipa ?? o.ipa;
          const gloss = shownOption?.gloss ?? o.gloss;
          return (
            <TouchableOpacity
              key={o.id}
              onPress={() => sitting.pick(o.id)}
              disabled={answered || state.sending || probe === null}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={main}
              style={[
                styles.option,
                options.length === 3 && styles.optionThird,
                st === 'right' && styles.optionRight,
                st === 'wrong' && styles.optionWrong,
                st === 'dim' && styles.optionDim,
              ]}
            >
              <Text style={styles.optionMain}>{main}</Text>
              {ipa !== undefined ? <Text style={styles.optionIpa}>{ipa}</Text> : null}
              {gloss !== undefined ? <Text style={styles.optionGloss}>{gloss}</Text> : null}
              {st === 'right' || st === 'wrong' ? (
                <View
                  style={[
                    styles.mark,
                    { backgroundColor: st === 'right' ? colors.success : colors.danger },
                  ]}
                >
                  <Text style={styles.markText}>{st === 'right' ? '✓' : '✕'}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Only when the verdict is shown at once (MP-R11). */}
      {answered && f.immediate ? (
        <View
          style={[styles.fb, ok ? styles.fbOk : styles.fbBad]}
          accessibilityLiveRegion="polite"
        >
          <View style={styles.fbHead}>
            <Text style={styles.fbTitle}>
              {ok
                ? t('exerciseRunner.minimalPairs.right')
                : t('exerciseRunner.minimalPairs.wrong', { word: target?.text ?? '' })}
            </Text>
            {!ok &&
            verdict.compare !== undefined &&
            chosen !== undefined &&
            target !== undefined ? (
              <TouchableOpacity
                style={styles.fbPlay}
                onPress={sitting.replayCompare}
                accessibilityRole="button"
              >
                <Text style={styles.fbPlayText}>
                  {'▶ '}
                  {t('exerciseRunner.minimalPairs.compare', {
                    chosen: chosen.text,
                    target: target.text,
                  })}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {!ok && verdict.compare !== undefined && chosen !== undefined && target !== undefined ? (
            <View style={styles.ab}>
              {[
                { o: chosen, url: verdict.compare.chosen, role: 'chosen' as const },
                { o: target, url: verdict.compare.target, role: 'target' as const },
              ].map(({ o, url, role }) => {
                const on = clips.playing(o.id);
                return (
                  <View key={role} style={[styles.abCell, on && styles.abCellOn]}>
                    <Text style={[styles.abLab, role === 'target' && { color: colors.success }]}>
                      {role === 'target'
                        ? t('exerciseRunner.minimalPairs.heard')
                        : t('exerciseRunner.minimalPairs.chosen')}
                    </Text>
                    <Text style={styles.abWord}>{o.text}</Text>
                    {o.ipa !== undefined ? <Text style={styles.optionIpa}>{o.ipa}</Text> : null}
                    <PlayButton
                      size="sm"
                      on={on}
                      onPress={() => sitting.playWord(o.id, url)}
                      label={
                        on
                          ? t('exerciseRunner.minimalPairs.pause')
                          : t('exerciseRunner.minimalPairs.playWord', { word: o.text })
                      }
                      styles={styles}
                    />
                  </View>
                );
              })}
            </View>
          ) : null}
          {f.showGloss !== 'never' && target?.gloss !== undefined ? (
            <Text style={styles.fbGloss}>
              {target.text} — {target.gloss}
            </Text>
          ) : null}
        </View>
      ) : null}

      {failure !== null ? (
        <View style={styles.failure}>
          <Text style={styles.failureText}>
            {failure === 'media'
              ? t('exerciseRunner.minimalPairs.failure.media')
              : failure === 'probe'
                ? t('exerciseRunner.minimalPairs.failure.probe')
                : failure === 'answer'
                  ? t('exerciseRunner.minimalPairs.failure.answer')
                  : t('exerciseRunner.minimalPairs.failure.finish')}
          </Text>
          {failure !== 'answer' ? (
            <TouchableOpacity
              style={styles.secondary}
              onPress={failure === 'finish' ? sitting.retryFinish : sitting.begin}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>
                {t('exerciseRunner.minimalPairs.failure.tryAgain')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.primary, (!answered || state.phase === 'finishing') && styles.primaryOff]}
        onPress={sitting.next}
        disabled={!answered || state.phase === 'finishing'}
        accessibilityRole="button"
      >
        {state.phase === 'finishing' ? (
          <ActivityIndicator size="small" color={colors.textInverted} />
        ) : (
          <Text style={styles.primaryText}>
            {last
              ? t('exerciseRunner.minimalPairs.seeResult')
              : t('exerciseRunner.minimalPairs.next')}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

/* ── The result ────────────────────────────────────────────────────────────── */

/** `<b>…</b>` in a string is bold — the web's rich text, on a phone. The string brings the tags; the label does not. */
function Rich({ source, style, bold }: { source: string; style: object; bold: object }) {
  const parts = source.split(/(<b>.*?<\/b>)/g).filter(p => p !== '');
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.startsWith('<b>') ? (
          <Text key={i} style={bold}>
            {p.slice(3, -4)}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

function Summary({
  summary,
  contrastLabel,
  clips,
  styles,
  colors,
  t,
}: {
  summary: MinimalPairsSummary;
  contrastLabel: string;
  clips: Clips;
  styles: Styles;
  colors: ColorScheme;
  t: T;
}) {
  const pass = summary.passed;
  const weak = summary.pairs.some(p => p.correct < p.played);
  const memory = summary.memory ?? 'contrast';
  const tip =
    (memory === 'contrast+word' ? `${t('exerciseRunner.minimalPairs.summary.wordsReturn')} ` : '') +
    (memory === 'none'
      ? t('exerciseRunner.minimalPairs.summary.contrastNotHere', { label: contrastLabel })
      : t('exerciseRunner.minimalPairs.summary.contrastScheduled', { label: contrastLabel }));

  return (
    <View>
      <View style={[styles.score, pass ? styles.scorePass : styles.scoreAgain]}>
        <Text style={styles.scoreNum}>
          {summary.right}
          <Text style={styles.scoreOf}>/{summary.total}</Text>
        </Text>
        <View style={[styles.verdict, { backgroundColor: pass ? colors.success : colors.warning }]}>
          <Text style={styles.verdictText}>
            {pass
              ? t('exerciseRunner.minimalPairs.summary.passed')
              : t('exerciseRunner.minimalPairs.summary.again')}
          </Text>
        </View>
        <Text style={styles.scoreSub}>
          {t('exerciseRunner.minimalPairs.summary.score', {
            pct: summary.score,
            pass: summary.passPct,
          })}
        </Text>
      </View>

      <View style={styles.sumList}>
        {summary.pairs.map(p => {
          const ratio = p.played === 0 ? 0 : p.correct / p.played;
          const playable = p.clips.some(url => url !== '');
          const on = clips.now !== null && clips.now.startsWith(`${p.pairId}:`);
          return (
            <View key={p.pairId} style={styles.sumRow}>
              <Text style={styles.sumWords} numberOfLines={1}>
                {p.words.join(' / ')}
              </Text>
              <View style={styles.repTrack}>
                <View
                  style={[
                    styles.repFill,
                    {
                      width: `${ratio * 100}%`,
                      backgroundColor: ratio < 0.6 ? colors.warning : colors.success,
                    },
                  ]}
                />
              </View>
              <Text style={styles.sumCount}>
                {p.correct}/{p.played}
              </Text>
              <PlayButton
                size="sm"
                on={on}
                disabled={!playable}
                onPress={() => {
                  if (on) {
                    clips.stop();
                    return;
                  }
                  // A clip that could not be signed is skipped rather than shifting the others
                  // onto the wrong word: the ids keep each one's place in the pair.
                  void clips.sequence(p.clips.map((url, i) => ({ id: `${p.pairId}:${i}`, url })));
                }}
                label={t('exerciseRunner.minimalPairs.summary.hearPair')}
                styles={styles}
              />
            </View>
          );
        })}
      </View>

      <View style={[styles.callout, weak ? styles.calloutTip : styles.calloutInfo]}>
        {weak ? (
          <Rich source={tip} style={styles.calloutText} bold={styles.calloutBold} />
        ) : (
          <Text style={styles.calloutText}>{t('exerciseRunner.minimalPairs.summary.allRight')}</Text>
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    notice: {
      alignItems: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
    },
    noticeTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 6,
    },
    noticeDesc: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
    },
    card: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      padding: 18,
      gap: 8,
    },
    cardTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    cardFacts: { fontSize: 12, color: colors.textMuted },
    cardLead: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginTop: 4 },
    cardHow: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
    cardNotice: { fontSize: 12, color: colors.textMuted },
    primary: {
      minHeight: TAP_MIN,
      borderRadius: 12,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      marginTop: 10,
    },
    primaryOff: { opacity: 0.45 },
    primaryText: { fontSize: 15, fontWeight: '700', color: colors.textInverted },
    secondary: {
      minHeight: TAP_MIN,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    secondaryText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
    top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    topTitle: { flexShrink: 1, fontSize: 12, color: colors.textMuted },
    topCount: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
    progressTrack: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 2, backgroundColor: colors.accent },
    pips: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginVertical: 12 },
    pip: { width: 16, height: 4, borderRadius: 2, backgroundColor: colors.border },
    lead: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginBottom: 12 },
    stage: {
      alignItems: 'center',
      gap: 12,
      paddingVertical: 26,
      paddingHorizontal: 16,
      borderRadius: 16,
      backgroundColor: colors.backgroundCard,
      borderWidth: 1,
      borderColor: colors.border,
    },
    stageOn: { backgroundColor: colors.accentLight, borderColor: colors.accent },
    stageMeta: { alignItems: 'center', gap: 3 },
    stageText: { fontSize: 12, color: colors.textSecondary },
    stageSub: { fontSize: 12, color: colors.textMuted },
    leftRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    leftPips: { flexDirection: 'row', gap: 3 },
    leftPip: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
    leftPipSpent: { backgroundColor: colors.border },
    play: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
    },
    playOn: { borderWidth: 3, borderColor: colors.accentLight },
    playOff: { backgroundColor: colors.border },
    playIcon: { fontSize: 12, color: colors.textInverted },
    playIconLg: { fontSize: 26 },
    retry: { fontSize: 12, color: colors.danger, marginTop: 10 },
    options: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
    option: {
      flexBasis: '47%',
      flexGrow: 1,
      minHeight: 74,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.textMuted,
      backgroundColor: colors.backgroundCard,
    },
    optionThird: { flexBasis: '30%' },
    optionRight: {
      borderColor: colors.success,
      backgroundColor: `${colors.success}22`,
    },
    optionWrong: {
      borderColor: colors.danger,
      backgroundColor: `${colors.danger}22`,
    },
    optionDim: { opacity: 0.5 },
    optionMain: { fontSize: 20, fontWeight: '500', color: colors.textPrimary },
    optionIpa: { fontSize: 11, fontFamily: 'monospace', color: colors.textMuted },
    optionGloss: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
    mark: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    markText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
    fb: { gap: 10, marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1 },
    fbOk: { borderColor: `${colors.success}80`, backgroundColor: `${colors.success}1a` },
    fbBad: { borderColor: `${colors.warning}80`, backgroundColor: `${colors.warning}1a` },
    fbHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    fbTitle: { flexGrow: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
    fbPlay: {
      minHeight: TAP_MIN,
      justifyContent: 'center',
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgroundCard,
    },
    fbPlayText: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
    fbGloss: { fontSize: 12, color: colors.textMuted },
    ab: { flexDirection: 'row', gap: 8 },
    abCell: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgroundCard,
    },
    abCellOn: { borderColor: colors.accent },
    abLab: {
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    abWord: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    failure: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 },
    failureText: { fontSize: 12, color: colors.danger },
    score: {
      alignItems: 'center',
      gap: 6,
      paddingVertical: 22,
      paddingHorizontal: 16,
      borderRadius: 16,
      borderWidth: 1,
    },
    scorePass: { borderColor: `${colors.success}80`, backgroundColor: `${colors.success}1a` },
    scoreAgain: { borderColor: `${colors.warning}80`, backgroundColor: `${colors.warning}1a` },
    scoreNum: { fontSize: 40, fontWeight: '700', color: colors.textPrimary },
    scoreOf: { fontSize: 20, fontWeight: '400', color: colors.textMuted },
    verdict: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
    verdictText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
    scoreSub: { fontSize: 12, color: colors.textMuted },
    sumList: { gap: 6, marginTop: 14 },
    sumRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    sumWords: { flex: 1, fontSize: 15, color: colors.textPrimary },
    repTrack: {
      width: 70,
      height: 7,
      borderRadius: 4,
      overflow: 'hidden',
      backgroundColor: colors.border,
    },
    repFill: { height: '100%' },
    sumCount: { width: 36, fontSize: 11, fontFamily: 'monospace', color: colors.textMuted },
    callout: { marginTop: 14, padding: 12, borderRadius: 10, borderWidth: 1 },
    calloutTip: { borderColor: colors.accent, backgroundColor: colors.accentLight },
    calloutInfo: { borderColor: colors.border, backgroundColor: colors.backgroundInput },
    calloutText: { fontSize: 13, lineHeight: 19, color: colors.textPrimary },
    calloutBold: { fontWeight: '700' },
  });
