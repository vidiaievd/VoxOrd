import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  type TextStyle,
} from 'react-native';
import { ApiError } from '../../api/client';
import { findOpenAttempt } from '../../api/exercises';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useExerciseAudio } from '../../hooks/useExerciseAudio';
import { wordCount } from '../../lib/text/words';
import {
  AudioGateScreen,
  AudioLockNote,
  AudioSegmentButton,
  AudioTranscript,
  ExerciseAudioPlayer,
} from './audio';
import type { ExerciseBodyProps } from './ExerciseBody';
import {
  buildDictationSubmission,
  nextOpen,
  railStates,
  readDictationProjection,
  readDictationVerdict,
  readSegmentStates,
  resumeAt,
  summaryRows,
  transcriptSlices,
  type DictationProjection,
  type DictationVerdict,
  type SegmentState,
  type VerdictOp,
  type WordCounts,
} from './templates/dictation';

/** BEHAVIOR §8: every control is comfortably tappable. */
const TAP_MIN = 44;
/**
 * The engine refuses a second check of a sentence sooner than this (plan 68 Q4-A, 429) —
 * the kernel's `DC_CHECK_INTERVAL_MS`. «Check» rests for as long, so an ordinary learner
 * never meets the refusal.
 */
const CHECK_INTERVAL_MS = 2000;

type T = ReturnType<typeof useTranslation>['t'];

/**
 * `dictation` — a recording, and the sentences said in it written down one at a time
 * (plan 68).
 *
 * A dictation that arrives carrying any part of its key is refused rather than played — see
 * `readDictationProjection`.
 */
export function DictationBody(props: ExerciseBodyProps) {
  const { display, onAnswerChange } = props;
  const projection = useMemo(
    () => readDictationProjection(display.content),
    [display.content],
  );

  if (projection === null)
    return <UnreadableDictation onAnswerChange={onAnswerChange} />;
  return <DictationRunner {...props} projection={projection} />;
}

/** Nothing playable: the sentences arrived with their key, or in a shape this app cannot read. */
function UnreadableDictation({
  onAnswerChange,
}: Pick<ExerciseBodyProps, 'onAnswerChange'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  useEffect(() => {
    onAnswerChange(null, false);
  }, [onAnswerChange]);

  return (
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>
        {t('exerciseRunner.dictation.unavailable')}
      </Text>
      <Text style={styles.noticeDesc}>
        {t('exerciseRunner.dictation.unavailableDesc')}
      </Text>
    </View>
  );
}

/** What the corrected block shows: a check, as it came. */
interface Corrected {
  ops: readonly VerdictOp[];
  words: WordCounts;
  pct: number;
  passed: boolean;
}

/**
 * The learner's side: listen, write the sentence, hand it in, read the corrected line, try
 * again or move on — every submit onto the one attempt.
 *
 * Nothing on this screen knows the sentences. The corrected line, the counts, the pass, the
 * score and whether a sentence is closed are the server's, and are drawn as they came
 * (plan 68 §3.5, deviation 15).
 *
 * How it meets the shell is `highlight_in_text`'s (plan 67), a sentence at a time: every
 * check, retry and reveal is `checkTable` onto the same attempt — the engine keeps it open
 * until the last sentence closes and carries every sentence's state itself. The submit that
 * closes the last one is reported through `finishTable` at once, with the attempt's own pass,
 * so the evidence is in the set's results even if the learner leaves there. The sentence and
 * its verdict stay on screen; «Done» then opens the summary (AC-R10) — it only changes what is
 * drawn, so it is live even though the shell has locked the body.
 *
 * Kept as the web solver decided it (plan 68 phase 5): a retry keeps the text (AC-R8); after a
 * reveal the last corrected line stays above «Answer»; «Check» rests two seconds after a check;
 * the summary's line is the last check and its number the first.
 *
 * **Not sticky** (plan 67 §5, deviation 17): the buttons sit under the field. The runner's
 * `ScrollView` is the shell's, and a sticky bottom would need the body to own its scroll.
 */
function DictationRunner({
  display,
  disabled,
  onAnswerChange,
  checkTable,
  finishTable,
  projection,
}: ExerciseBodyProps & { projection: DictationProjection }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const { segments, settings, mode } = projection;

  /** The server's word on every sentence — from the last verdict or the resumed attempt. */
  const [states, setStates] = useState<SegmentState[]>([]);
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  /** The last check or reveal of the sentence on screen; `null` while writing. */
  const [verdict, setVerdict] = useState<DictationVerdict | null>(null);
  /** The check the sentence is on — one past the last once a retry has been made. */
  const [attempt, setAttempt] = useState(1);
  /** The attempt's score and pass, from the server — the summary's head. */
  const [result, setResult] = useState<{ pct: number; passed: boolean } | null>(
    null,
  );
  const [done, setDone] = useState(false);
  const [cooling, setCooling] = useState(false);
  const [resuming, setResuming] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Past the listen-first screen of a `gate` layout. */
  const [entered, setEntered] = useState(false);

  const coolTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** So the closing submit is reported once. */
  const reported = useRef(false);

  const audio = useExerciseAudio(display.content);
  const audioOn = audio.audio.enabled;
  const gated = audioOn && audio.gated;

  // The footer's Check is not drawn for this template (`bodyOwnsCheck`).
  useEffect(() => {
    onAnswerChange(null, false);
  }, [onAnswerChange]);

  useEffect(
    () => () => {
      if (coolTimer.current !== null) clearTimeout(coolTimer.current);
    },
    [],
  );

  /**
   * Pick up an attempt this learner left open: the first sentence still open, on the check
   * after the last one spent, with its last checked text back in the field. The checks are
   * the record — the first of each sentence is the evidence — so replaying from the top would
   * hand out fresh first tries. Read rather than started: opening an exercise and leaving must
   * create nothing.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const open = await findOpenAttempt(display.id);
      if (cancelled) return;
      const resumed = readSegmentStates(open?.segmentStates);
      if (resumed.length > 0) {
        const from = resumeAt(segments, resumed);
        setStates(resumed);
        setIndex(from.index);
        setAttempt(from.attempt);
        setText(from.text);
      }
      setResuming(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [display.id, segments]);

  const cool = useCallback(() => {
    if (coolTimer.current !== null) clearTimeout(coolTimer.current);
    setCooling(true);
    coolTimer.current = setTimeout(() => setCooling(false), CHECK_INTERVAL_MS);
  }, []);

  const segment = segments[Math.min(index, Math.max(segments.length - 1, 0))];

  /**
   * Hand the sentence in, or ask to be shown it. The verdict decides what follows,
   * including whether the sentence — and with the last one the attempt — is over.
   */
  const send = useCallback(
    async (reveal: boolean) => {
      if (sending || segment === undefined) return;
      setSending(true);
      setError(null);
      try {
        const response = await checkTable(
          buildDictationSubmission(segment.id, text, reveal),
        );
        const details = readDictationVerdict(response.details);
        if (details === null) {
          setError(t('exerciseRunner.dictation.sendFailed'));
          return;
        }

        setVerdict(details);
        setStates(details.segments);
        setAttempt(details.attempt);
        setResult({ pct: details.attemptPct, passed: details.attemptPassed });
        if (!reveal) cool();
        // The attempt closes with the last sentence, and that submit is the one the engine
        // scored. `correct` on it is about *this sentence's* check, so the outcome the shell
        // records is the attempt's own pass (plan 67 phase 5, decision 5).
        if (details.complete && !reported.current) {
          reported.current = true;
          finishTable({ ...response, correct: details.attemptPassed });
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 429) {
          // Too soon after the last check: the server kept nothing, the text is still here.
          setError(t('exerciseRunner.dictation.tooFast'));
          cool();
        } else if (e instanceof ApiError && e.status === 422) {
          // A refusal the engine will keep making — this sentence is closed.
          setError(t('exerciseRunner.dictation.closedAlready'));
        } else {
          setError(t('exerciseRunner.dictation.sendFailed'));
        }
      } finally {
        setSending(false);
      }
    },
    [checkTable, cool, finishTable, segment, sending, t, text],
  );

  /** «Try again» — the text stays (AC-R8), and the check moves on. */
  const retry = useCallback(() => {
    if (verdict === null) return;
    setAttempt(verdict.attempt + 1);
    setVerdict(null);
    setError(null);
  }, [verdict]);

  const ahead = nextOpen(segments, states, index);

  /** «Next sentence» — the next one still open, at the check after its last. */
  const next = useCallback(() => {
    if (ahead === null) return;
    // The server's rest is per sentence: a new one may be checked at once.
    if (coolTimer.current !== null) clearTimeout(coolTimer.current);
    setCooling(false);
    setIndex(ahead.index);
    setText(ahead.text);
    setVerdict(null);
    setAttempt(ahead.attempt);
    setError(null);
  }, [ahead]);

  if (segment === undefined) {
    return (
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>
          {t('exerciseRunner.dictation.empty')}
        </Text>
        <Text style={styles.noticeDesc}>
          {t('exerciseRunner.dictation.emptyDesc')}
        </Text>
      </View>
    );
  }

  if (resuming) {
    return (
      <View style={styles.notice}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (done) {
    return (
      <Summary
        projection={projection}
        states={states}
        result={result}
        colors={colors}
        styles={styles}
      />
    );
  }

  // `layout: 'gate'` fills the body with the listen-first screen until it is left.
  if (audioOn && audio.audio.settings.layout === 'gate' && !entered) {
    return (
      <AudioGateScreen
        eng={audio}
        interactive={!disabled}
        onStart={() => setEntered(true)}
      />
    );
  }

  const here = states.find(s => s.segmentId === segment.id);
  const whole = mode === 'whole';
  const revealed = verdict?.revealed === true;
  const checked = verdict !== null && !revealed;
  const closed = verdict?.closed === true || here?.closed === true;
  const passed = checked && verdict.passed;
  const writing = verdict === null && !closed;
  const fieldLive = !disabled && writing && !sending && !gated;
  const key = verdict?.key ?? here?.key ?? null;

  // After a reveal the line still shows: it is the last check, kept on the sentence's state.
  const corrected: Corrected | null = checked
    ? verdict
    : revealed && here?.last != null
    ? { ...here.last, passed: false }
    : null;

  const timecode =
    !whole && audioOn ? audio.segments[segment.id] ?? null : null;
  const typed = wordCount(text);
  const rail = railStates(segments, states, index);

  // A typo note only where typos were counted; «half credit» only where the server says this
  // check gave it — the rule itself is never sent ahead of a check (deviation 15).
  const headline = checked
    ? passed
      ? t('exerciseRunner.dictation.passed')
      : verdictLine(verdict, t)
    : null;

  const focusLines = checked
    ? verdict.focus
    : revealed && key !== null
    ? key.focus.filter(f => f.why.trim() !== '')
    : [];
  const reason = checked
    ? verdict.why ?? ''
    : revealed && key !== null
    ? key.why
    : '';

  // Announced once, the count first and then «wrote X, correct Y» per deviation (AC-X11).
  const announcement = checked
    ? [headline, ...verdict.ops.map(op => deviationPhrase(op, t))]
        .filter(Boolean)
        .join(' ')
    : revealed && key !== null
    ? `${t('exerciseRunner.dictation.key')}: ${key.text}`
    : '';

  const attemptLine =
    settings.attempts === 0
      ? t('exerciseRunner.dictation.attempt', { n: attempt })
      : t('exerciseRunner.dictation.attemptOf', {
          n: attempt,
          max: settings.attempts,
        });

  const slices = transcriptSlices(segments, states);
  const canCheck = fieldLive && !cooling && text.trim() !== '';

  return (
    <View>
      {segments.length > 1 && (
        <View
          style={styles.rail}
          accessible
          accessibilityLabel={t('exerciseRunner.dictation.rail', {
            n: index + 1,
            total: segments.length,
          })}
        >
          {segments.map((s, i) => (
            <View
              key={s.id}
              style={[
                styles.railStep,
                {
                  backgroundColor:
                    rail[i] === 'done'
                      ? colors.success
                      : rail[i] === 'part'
                      ? colors.warning
                      : rail[i] === 'now'
                      ? colors.accent
                      : colors.backgroundPressed,
                },
              ]}
            />
          ))}
          <Text style={styles.railCount}>
            {index + 1}/{segments.length}
          </Text>
        </View>
      )}

      {/* The reader's own instruction wins where there is one: it is translated per
          learner, while the projection carries the author's (plan 53 §5). */}
      {instructionOf(display, projection) !== '' && (
        <Text style={styles.instruction}>
          {instructionOf(display, projection)}
        </Text>
      )}

      {audioOn && (
        <View style={styles.audio}>
          <ExerciseAudioPlayer eng={audio} interactive={!disabled} />
        </View>
      )}

      <View
        style={[
          styles.field,
          {
            borderColor:
              corrected === null
                ? colors.border
                : corrected.passed
                ? colors.success
                : tint(colors.danger, 0.55),
          },
        ]}
      >
        <View style={styles.fieldHead}>
          <Text style={styles.caps}>
            {whole
              ? t('exerciseRunner.dictation.fieldWhole')
              : t('exerciseRunner.dictation.fieldSentence', { n: index + 1 })}
          </Text>
          {timecode !== null && (
            // Free, always: a fragment spends no listen (AC-R2). The button carries its own
            // top margin for a place under a prompt; in the head it is pulled back level.
            <View style={styles.fragmentSlot}>
              <AudioSegmentButton
                eng={audio}
                segment={timecode}
                disabled={disabled || gated}
              />
            </View>
          )}
          <View style={styles.spacer} />
          <Text style={styles.wordCount}>
            {settings.showWordCount && segment.wordCount !== undefined
              ? t('exerciseRunner.dictation.wordsOf', {
                  n: typed,
                  count: segment.wordCount,
                })
              : t('exerciseRunner.dictation.words', { count: typed })}
          </Text>
        </View>

        <TextInput
          style={[
            styles.input,
            whole ? styles.inputWhole : styles.inputSentence,
            !fieldLive && styles.inputLocked,
          ]}
          value={text}
          onChangeText={value => {
            setText(value);
            setError(null);
          }}
          // Read-only rather than disabled once checked: the text stays selectable and
          // readable to assistive technology.
          editable={fieldLive}
          multiline
          textAlignVertical="top"
          placeholder={
            gated
              ? t('exerciseRunner.dictation.placeholderGated')
              : t('exerciseRunner.dictation.placeholder')
          }
          placeholderTextColor={colors.textMuted}
          // Load-bearing, not hygiene: a keyboard that fixes `sjøkken` to `kjøkken` destroys
          // the exercise (BEHAVIOR §6, AC-R11). On Android `autoCorrect={false}` sets
          // TYPE_TEXT_FLAG_NO_SUGGESTIONS, which is what Gboard reads.
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          accessibilityLabel={
            whole
              ? t('exerciseRunner.dictation.fieldWhole')
              : t('exerciseRunner.dictation.fieldSentence', { n: index + 1 })
          }
        />

        {corrected !== null && (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>
              {t('exerciseRunner.dictation.corrected')}
            </Text>
            <DiffLine ops={corrected.ops} colors={colors} styles={styles} />
            <View style={styles.tallyRow}>
              <DiffTally
                words={corrected.words}
                colors={colors}
                styles={styles}
              />
              <View style={styles.spacer} />
              <DiffScore
                pct={corrected.pct}
                ok={corrected.passed}
                colors={colors}
                styles={styles}
              />
            </View>
          </View>
        )}

        {key !== null && (
          <View style={[styles.block, { backgroundColor: colors.accentLight }]}>
            <Text style={styles.blockLabel}>
              {t('exerciseRunner.dictation.key')}
            </Text>
            <Text style={styles.keyText}>{key.text}</Text>
          </View>
        )}
      </View>

      <Text style={styles.srOnly} accessibilityLiveRegion="polite">
        {announcement}
      </Text>

      {(checked || revealed) && (
        <View style={styles.verdict}>
          {checked && (
            <Note
              tone={passed ? 'ok' : 'bad'}
              icon={passed ? '✓' : '!'}
              colors={colors}
              styles={styles}
            >
              <Text style={styles.bold}>{headline}</Text>
            </Note>
          )}
          {focusLines.map(f => (
            <Note
              key={f.focusId}
              tone="reveal"
              icon="◎"
              colors={colors}
              styles={styles}
            >
              <Text style={styles.bold}>{f.word}</Text> —{' '}
              {f.why.trim() === ''
                ? t('exerciseRunner.dictation.focusDefault')
                : f.why}
            </Note>
          ))}
          {reason.trim() !== '' && (
            <Note tone="reveal" icon="ⓘ" colors={colors} styles={styles}>
              {reason}
            </Note>
          )}
        </View>
      )}

      {audioOn && (
        // The slices of the sentences already closed, in order (plan 68 §3.6).
        <AudioTranscript
          audio={audio.audio}
          revealed={slices.length > 0}
          delivered={
            slices.length > 0
              ? { transcript: slices.join('\n'), translation: '' }
              : null
          }
        />
      )}

      <View style={styles.bottom}>
        {/* Drawn from the last verdict's `closed`, never from a count kept here. */}
        {writing && !disabled && (
          <Button
            label={t('exerciseRunner.dictation.check')}
            onPress={() => send(false)}
            // Empty (AC-R4), behind the gate (AC-R5), or resting after a check (Q4-A).
            disabled={!canCheck}
            busy={sending}
            colors={colors}
            styles={styles}
          />
        )}
        {checked && !passed && !closed && !disabled && (
          <Button
            label={`↺ ${t('exerciseRunner.dictation.retry')}`}
            onPress={retry}
            disabled={sending}
            colors={colors}
            styles={styles}
          />
        )}
        {checked && !passed && settings.revealKey && !disabled && (
          <TouchableOpacity
            style={[styles.ghostBtn, sending && styles.btnDim]}
            onPress={() => send(true)}
            disabled={sending}
            accessibilityRole="button"
          >
            <Text style={styles.ghostBtnText}>
              {t('exerciseRunner.dictation.showKey')}
            </Text>
          </TouchableOpacity>
        )}
        {closed &&
          (ahead !== null ? (
            !disabled && (
              <Button
                label={`${t('exerciseRunner.dictation.next')} →`}
                onPress={next}
                disabled={sending}
                colors={colors}
                styles={styles}
              />
            )
          ) : (
            // The summary only changes what is drawn — live after the shell has the result.
            <Button
              label={`${t('exerciseRunner.dictation.finish')} →`}
              onPress={() => setDone(true)}
              disabled={sending}
              colors={colors}
              styles={styles}
            />
          ))}

        {(verdict !== null || attempt > 1) && (
          <Text style={styles.attempt}>{attemptLine}</Text>
        )}
        {gated && (
          <AudioLockNote message={t('exerciseRunner.dictation.lockNote')} />
        )}
        {error !== null && <Text style={styles.error}>{error}</Text>}
      </View>
    </View>
  );
}

/** The instruction above the field — the reader's translation, else the author's. */
function instructionOf(
  display: ExerciseBodyProps['display'],
  projection: DictationProjection,
): string {
  return (
    display.instructions?.[0]?.instructionText ?? projection.instruction
  ).trim();
}

/** «4 of 6 words right — 1 typo (half credit).» */
function verdictLine(verdict: DictationVerdict, t: T): string {
  const { exact, total, near } = verdict.words;
  let line = t('exerciseRunner.dictation.verdictHead', {
    correct: exact,
    count: total,
  });
  if (near > 0)
    line += ` — ${t('exerciseRunner.dictation.typos', { count: near })}`;
  if (verdict.nearCredit)
    line += ` ${t('exerciseRunner.dictation.halfCredit')}`;
  return `${line}.`;
}

/** The phrase a screen reader hears for one deviation, or `null` for a word written right. */
function deviationPhrase(op: VerdictOp, t: T): string | null {
  switch (op.k) {
    case 'eq':
      return null;
    case 'ins':
      return t('exerciseRunner.dictation.sr.extra', { wrote: op.wrote });
    case 'del':
      return t('exerciseRunner.dictation.sr.missing', {
        expected: op.expected,
      });
    case 'sub':
      return t('exerciseRunner.dictation.sr.sub', {
        wrote: op.wrote,
        expected: op.expected,
      });
  }
}

/* ── The corrected line ────────────────────────────────────────────────────── */

type Styles = ReturnType<typeof makeStyles>;

/**
 * The corrected line — plan 68 §7.1 on nested `Text`, so it wraps as text does and needs no
 * measuring.
 *
 * Every deviation has a shape as well as a colour (AC-R6): an extra word is struck through, a
 * missing one underlined, a wrong one struck through and followed by the right one in bold.
 * The words keep the primary text colour on a tinted ground, so they read in both themes. A
 * screen reader hears the line as one label — the words as written, and «wrote X, correct Y»
 * for each deviation (AC-X11).
 */
function DiffLine({
  ops,
  size = 'md',
  colors,
  styles,
}: {
  ops: readonly VerdictOp[];
  size?: 'md' | 'sm';
  colors: ColorScheme;
  styles: Styles;
}) {
  const { t } = useTranslation();
  const label = ops
    .map(op => (op.k === 'eq' ? `${op.w}${op.p}` : deviationPhrase(op, t)))
    .join(' ');
  const pad = ' ';

  return (
    <Text
      style={[styles.diffLine, size === 'sm' && styles.diffLineSm]}
      accessibilityLabel={label}
    >
      {ops.map((op, i) => {
        let piece: React.ReactNode;
        switch (op.k) {
          case 'eq':
            piece = (
              <Text>
                {op.w}
                {op.p !== '' && <Text style={styles.punct}>{op.p}</Text>}
              </Text>
            );
            break;
          case 'ins':
            piece = (
              <Text
                style={[
                  { backgroundColor: tint(colors.danger, 0.16) },
                  styles.struck,
                ]}
              >
                {pad}
                {op.wrote}
                {pad}
              </Text>
            );
            break;
          case 'del':
            piece = (
              <Text
                style={[
                  { backgroundColor: colors.accentLight },
                  styles.underlined,
                ]}
              >
                {pad}
                {op.expected}
                {op.p}
                {pad}
              </Text>
            );
            break;
          case 'sub':
            piece = (
              <Text
                style={{
                  backgroundColor: op.near
                    ? tint(colors.warning, 0.24)
                    : tint(colors.danger, 0.16),
                }}
              >
                {pad}
                <Text style={[styles.struck, styles.wrote]}>
                  {op.wrote}
                </Text>{' '}
                <Text style={styles.expected}>
                  {op.expected}
                  {op.p}
                </Text>
                {pad}
              </Text>
            );
            break;
        }
        return (
          <React.Fragment key={i}>
            {piece}
            {i < ops.length - 1 ? ' ' : ''}
          </React.Fragment>
        );
      })}
    </Text>
  );
}

type Swatch = 'eq' | 'near' | 'wrong' | 'missing' | 'extra';
const SWATCHES: readonly Swatch[] = ['eq', 'near', 'wrong', 'missing', 'extra'];

function swatchStyle(s: Swatch, colors: ColorScheme) {
  switch (s) {
    case 'eq':
      return { backgroundColor: colors.success };
    case 'near':
      return { backgroundColor: colors.warning };
    case 'wrong':
      return { backgroundColor: colors.danger };
    case 'missing':
      return {
        backgroundColor: colors.accentLight,
        borderBottomWidth: 3,
        borderBottomColor: colors.accent,
      };
    case 'extra':
      return {
        backgroundColor: tint(colors.danger, 0.16),
        borderWidth: 1.5,
        borderColor: colors.danger,
      };
  }
}

/** How many of each — only the counts that are not zero. */
function DiffTally({
  words,
  colors,
  styles,
}: {
  words: WordCounts;
  colors: ColorScheme;
  styles: Styles;
}) {
  const { t } = useTranslation();
  const counts: Record<Swatch, number> = {
    eq: words.exact,
    near: words.near,
    wrong: words.wrong,
    missing: words.missing,
    extra: words.extra,
  };
  return (
    <View style={styles.tally}>
      {SWATCHES.filter(s => counts[s] > 0).map(s => (
        <View key={s} style={styles.swatchRow}>
          <View style={[styles.swatch, swatchStyle(s, colors)]} />
          <Text style={styles.tallyText}>
            {t(`exerciseRunner.dictation.tally.${s}`, { n: counts[s] })}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** All five — what the colours and shapes mean. */
function DiffLegend({
  colors,
  styles,
}: {
  colors: ColorScheme;
  styles: Styles;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.tally}>
      {SWATCHES.map(s => (
        <View key={s} style={styles.swatchRow}>
          <View style={[styles.swatch, swatchStyle(s, colors)]} />
          <Text style={styles.legendText}>
            {t(`exerciseRunner.dictation.legend.${s}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A percentage as the server gave it, with a mark beside the colour. */
function DiffScore({
  pct,
  ok,
  size = 'md',
  colors,
  styles,
}: {
  pct: number;
  ok: boolean;
  size?: 'md' | 'sm' | 'xl';
  colors: ColorScheme;
  styles: Styles;
}) {
  const font: TextStyle =
    size === 'xl'
      ? styles.scoreXl
      : size === 'sm'
      ? styles.scoreSm
      : styles.score;
  return (
    <Text style={[font, { color: ok ? colors.success : colors.danger }]}>
      {pct}%
    </Text>
  );
}

/* ── The summary ───────────────────────────────────────────────────────────── */

/**
 * After the last sentence (AC-R10): the attempt's score, «N of M sentences right», and per
 * sentence its last corrected line (or its sentence, if it was only revealed), the reason the
 * learner was shown, and the first check's score — the record.
 */
function Summary({
  projection,
  states,
  result,
  colors,
  styles,
}: {
  projection: DictationProjection;
  states: readonly SegmentState[];
  result: { pct: number; passed: boolean } | null;
  colors: ColorScheme;
  styles: Styles;
}) {
  const { t } = useTranslation();
  const { rows, right } = summaryRows(projection.segments, states);

  return (
    <View style={styles.summary}>
      <View style={styles.summaryHead}>
        {result !== null && (
          <DiffScore
            pct={result.pct}
            ok={result.passed}
            size="xl"
            colors={colors}
            styles={styles}
          />
        )}
        <View style={styles.summaryHeadText}>
          <Text style={styles.summaryCount}>
            {t('exerciseRunner.dictation.summaryCount', {
              n: right,
              count: rows.length,
            })}
          </Text>
          <Text style={styles.summarySub}>
            {t('exerciseRunner.dictation.summarySub')}
          </Text>
        </View>
      </View>

      {rows.map(row => (
        <View key={row.id} style={styles.summaryRow}>
          <View style={styles.num}>
            <Text style={styles.numText}>{row.n}</Text>
          </View>
          <View style={styles.summaryBody}>
            {row.ops !== null ? (
              <DiffLine
                ops={row.ops}
                size="sm"
                colors={colors}
                styles={styles}
              />
            ) : row.keyText !== null ? (
              <Text style={[styles.keyText, styles.keyTextSm]}>
                {row.keyText}
              </Text>
            ) : (
              <Text style={styles.muted}>—</Text>
            )}
            {row.reason.trim() !== '' && (
              <Text style={styles.summaryReason}>{row.reason}</Text>
            )}
          </View>
          <DiffScore
            pct={row.pct}
            ok={row.ok}
            size="sm"
            colors={colors}
            styles={styles}
          />
        </View>
      ))}

      <DiffLegend colors={colors} styles={styles} />
    </View>
  );
}

/* ── Small parts ───────────────────────────────────────────────────────────── */

function Button({
  label,
  onPress,
  disabled,
  busy = false,
  colors,
  styles,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  busy?: boolean;
  colors: ColorScheme;
  styles: Styles;
}) {
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, (disabled || busy) && styles.btnDim]}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.textInverted} />
      ) : (
        <Text style={styles.primaryBtnText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

function Note({
  tone,
  icon,
  colors,
  styles,
  children,
}: {
  tone: 'ok' | 'bad' | 'reveal';
  icon: string;
  colors: ColorScheme;
  styles: Styles;
  children: React.ReactNode;
}) {
  const accent =
    tone === 'ok'
      ? colors.success
      : tone === 'bad'
      ? colors.danger
      : colors.accent;
  return (
    <View
      style={[
        styles.note,
        { backgroundColor: tint(accent, 0.1), borderLeftColor: accent },
      ]}
    >
      <Text
        style={[styles.noteIcon, { color: accent }]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {icon}
      </Text>
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

/** A `#rrggbb` colour at the given opacity — the palette has no tint scale. */
function tint(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(
    m[3],
    16,
  )}, ${alpha})`;
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    notice: {
      paddingVertical: 40,
      paddingHorizontal: 16,
      alignItems: 'center',
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
    rail: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 12,
    },
    railStep: {
      flex: 1,
      height: 4,
      borderRadius: 2,
    },
    railCount: {
      fontSize: 11,
      fontVariant: ['tabular-nums'],
      color: colors.textMuted,
      marginLeft: 2,
    },
    instruction: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      marginBottom: 12,
    },
    audio: {
      marginBottom: 12,
    },
    field: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      gap: 9,
      backgroundColor: colors.backgroundCard,
      marginBottom: 12,
    },
    fieldHead: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
    },
    fragmentSlot: {
      marginTop: -8,
    },
    caps: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    spacer: {
      flex: 1,
    },
    wordCount: {
      fontSize: 11,
      fontVariant: ['tabular-nums'],
      color: colors.textMuted,
    },
    input: {
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 18,
      lineHeight: 27,
      color: colors.textPrimary,
      backgroundColor: colors.backgroundInput,
    },
    // Three lines for a sentence, eight for the whole text (§7.8).
    inputSentence: {
      minHeight: 96,
    },
    inputWhole: {
      minHeight: 230,
    },
    inputLocked: {
      color: colors.textSecondary,
      backgroundColor: colors.background,
    },
    block: {
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
      backgroundColor: colors.backgroundInput,
    },
    blockLabel: {
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      fontVariant: ['tabular-nums'],
      color: colors.textMuted,
    },
    diffLine: {
      fontSize: 18,
      lineHeight: 34,
      color: colors.textPrimary,
    },
    diffLineSm: {
      fontSize: 15,
      lineHeight: 26,
    },
    punct: {
      opacity: 0.6,
    },
    struck: {
      textDecorationLine: 'line-through',
    },
    underlined: {
      textDecorationLine: 'underline',
    },
    wrote: {
      color: colors.textSecondary,
    },
    expected: {
      fontWeight: '700',
      color: colors.textPrimary,
    },
    tallyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    tally: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      flexShrink: 1,
    },
    swatchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    swatch: {
      width: 10,
      height: 10,
      borderRadius: 3,
    },
    tallyText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    legendText: {
      fontSize: 11,
      color: colors.textMuted,
    },
    score: {
      fontSize: 18,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    scoreSm: {
      fontSize: 14,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      minWidth: 46,
      textAlign: 'right',
    },
    scoreXl: {
      fontSize: 30,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    keyText: {
      fontSize: 18,
      lineHeight: 27,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    keyTextSm: {
      fontSize: 15,
      lineHeight: 22,
    },
    srOnly: {
      height: 0,
      width: 0,
      opacity: 0,
    },
    verdict: {
      gap: 7,
      marginBottom: 12,
    },
    note: {
      flexDirection: 'row',
      gap: 8,
      borderLeftWidth: 3,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    noteIcon: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
    },
    noteText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textPrimary,
    },
    bold: {
      fontWeight: '700',
      color: colors.textPrimary,
    },
    bottom: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 12,
      marginTop: 4,
      gap: 10,
    },
    primaryBtn: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      minHeight: TAP_MIN,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textInverted,
    },
    ghostBtn: {
      borderRadius: 14,
      minHeight: TAP_MIN,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ghostBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    btnDim: {
      opacity: 0.5,
    },
    attempt: {
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: 'center',
    },
    error: {
      fontSize: 13,
      color: colors.danger,
    },
    summary: {
      gap: 12,
    },
    summaryHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      borderRadius: 12,
      padding: 16,
      backgroundColor: colors.backgroundInput,
    },
    summaryHeadText: {
      flex: 1,
    },
    summaryCount: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    summarySub: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingVertical: 10,
    },
    summaryBody: {
      flex: 1,
      minWidth: 0,
    },
    summaryReason: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.textMuted,
      marginTop: 4,
    },
    num: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.backgroundPressed,
      marginTop: 2,
    },
    numText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    muted: {
      fontSize: 14,
      color: colors.textMuted,
    },
  });
