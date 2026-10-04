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
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  PanResponder,
  type LayoutChangeEvent,
  type PanResponderInstance,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { ApiError } from '../../api/client';
import {
  findOpenAttempt,
  type AudioTranscript as AudioTranscriptWords,
} from '../../api/exercises';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useExerciseAudio } from '../../hooks/useExerciseAudio';
import { AudioLockNote, AudioTranscript, ExerciseAudioPlayer } from './audio';
import type { ExerciseBodyProps } from './ExerciseBody';
import {
  buildHighlightInTextSubmission,
  completedOf,
  gapInsideRun,
  keepExact,
  nextOpen,
  paragraphOfTokens,
  passageCells,
  readHighlightInTextPassage,
  readHighlightInTextVerdict,
  readQuestionStates,
  resumeAt,
  toggleMark,
  tokenAtPoint,
  tokenize,
  type HighlightInTextPassage,
  type HighlightInTextVerdict,
  type MarkCell,
  type QuestionState,
  type Token,
  type TokenRect,
  type TokenRun,
  type Unit,
} from './templates/highlightInText';

/** BEHAVIOR §8: every word is comfortably tappable — the row plus its slop clears 44. */
const TAP_MIN = 44;
/** How far a finger travels sideways before a press on a phrase question becomes a drag. */
const DRAG_START = 10;

/**
 * `highlight_in_text` — a passage, and up to four questions answered one at a time by
 * marking the words that answer them (plan 67).
 *
 * A passage that arrives carrying any part of its key is refused rather than played — see
 * `readHighlightInTextPassage`.
 */
export function HighlightInTextBody(props: ExerciseBodyProps) {
  const { display, onAnswerChange } = props;
  const passage = useMemo(
    () => readHighlightInTextPassage(display.content),
    [display.content],
  );

  if (passage === null)
    return <UnreadablePassage onAnswerChange={onAnswerChange} />;
  return <HighlightInTextRunner {...props} passage={passage} />;
}

/** Nothing playable: the passage arrived with its key on it, or in a shape this app cannot read. */
function UnreadablePassage({
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
        {t('exerciseRunner.highlightInText.unavailable')}
      </Text>
      <Text style={styles.noticeDesc}>
        {t('exerciseRunner.highlightInText.unavailableDesc')}
      </Text>
    </View>
  );
}

/**
 * The student's side: mark the words, hand the question in, read what comes back, try again
 * or move to the next question — every submit onto the one attempt.
 *
 * It owns nothing about the outcome. Whether a mark is right, whether a question passed and
 * whether it is closed are the server's; nothing here knows the key, so there is no branch
 * that could colour a mark before a check.
 *
 * How it meets the shell is `sort_into_buckets`'s (plan 66 §3.1), a question at a time:
 * every check, retry and reveal is `checkTable` onto the same attempt — the engine keeps it
 * open until the last question closes and carries every question's state itself (Q1-A). The
 * submit that closes the last one is reported through `finishTable`, and the footer's
 * Continue takes it from there.
 *
 * Kept as the web solver decided it (plan 67 phase 5, confirmed by the owner): «Next
 * question» also after the budget runs out; the passage frozen after a check until «Try
 * again»; the rail's «done» is a closed question; a `near` mark draws the key's boundary.
 *
 * **Not sticky** (plan 67 §5, deviation 17): the counter and the buttons sit under the
 * passage. The runner's `ScrollView` is the shell's, and a sticky bottom would need the body
 * to own its scroll — the same reason `sort_into_buckets` puts its pool under its zones.
 */
function HighlightInTextRunner({
  display,
  disabled,
  onAnswerChange,
  checkTable,
  finishTable,
  passage,
}: ExerciseBodyProps & { passage: HighlightInTextPassage }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const { text, questions, settings } = passage;
  const tokens = useMemo(() => tokenize(text), [text]);
  const paragraphOf = useMemo(
    () => paragraphOfTokens(tokens, passage.paragraphs),
    [tokens, passage.paragraphs],
  );

  /** The server's word on every question — from the last verdict or the resumed attempt. */
  const [states, setStates] = useState<QuestionState[]>([]);
  const [index, setIndex] = useState(0);
  const [marks, setMarks] = useState<TokenRun[]>([]);
  /** The last check or reveal of the question on screen; `null` while marking. */
  const [verdict, setVerdict] = useState<HighlightInTextVerdict | null>(null);
  /** The check the question is on — one past the last once a retry has been made. */
  const [attempt, setAttempt] = useState(1);
  /** A drag in progress, drawn as marks before it is let go. */
  const [drag, setDrag] = useState<{ origin: number; end: number } | null>(
    null,
  );
  const [resuming, setResuming] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audio = useExerciseAudio(display.content);
  const audioOn = audio.audio.enabled;
  const audioLocked = audioOn && audio.gated;
  /** The clip's words, once the submit that closed the attempt earned them (plan 56 §3.3). */
  const [transcript, setTranscript] = useState<AudioTranscriptWords | null>(
    null,
  );

  // The footer's Check is not drawn for this template (`bodyOwnsCheck`).
  useEffect(() => {
    onAnswerChange(null, false);
  }, [onAnswerChange]);

  /**
   * Pick up an attempt this learner left open (plan 67, §8 caveat 7): the first question
   * still open, on the check after the last one spent. The checks are the record — the first
   * of each question is the evidence — so replaying from the top would hand out fresh first
   * tries. Read rather than started: opening an exercise and leaving must create nothing.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const open = await findOpenAttempt(display.id);
      if (cancelled) return;
      const resumed = readQuestionStates(open?.questionStates);
      if (resumed.length > 0) {
        const from = resumeAt(questions, resumed);
        setStates(resumed);
        setIndex(from.index);
        setAttempt(from.attempt);
      }
      setResuming(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [display.id, questions]);

  const shownMarks = useMemo(() => {
    const question = questions[index];
    if (drag === null || question === undefined) return marks;
    return toggleMark(marks, drag.origin, drag.end, question.unit, paragraphOf);
  }, [drag, marks, questions, index, paragraphOf]);

  const { cells, numbers } = useMemo(
    () => passageCells(shownMarks, verdict, tokens),
    [shownMarks, verdict, tokens],
  );

  const question =
    questions[Math.min(index, Math.max(questions.length - 1, 0))];
  const completed = completedOf(questions, states);

  /**
   * Hand the question's marks in, or ask to be shown its key.
   *
   * The verdict decides what follows, including whether the question — and with the last
   * one the attempt — is over: `closed` and `complete` are the server's word.
   */
  const send = useCallback(
    async (reveal: boolean) => {
      if (sending || question === undefined) return;
      setSending(true);
      setError(null);
      try {
        const response = await checkTable(
          buildHighlightInTextSubmission(question.id, marks, tokens, reveal),
        );
        const details = readHighlightInTextVerdict(response.details);
        if (details === null) {
          setError(t('exerciseRunner.highlightInText.sendFailed'));
          return;
        }

        setVerdict(details);
        setStates(details.questions);
        setAttempt(details.attempt);
        if (response.audioTranscript) setTranscript(response.audioTranscript);
        // The attempt closes with the last question, and that submit is the one the engine
        // scored. `correct` on it is about *this question's* check, so the outcome the
        // shell records — the set's results, its Try again — is the attempt's own pass
        // (plan 67 phase 5, decision 5).
        if (details.complete)
          finishTable({ ...response, correct: details.attemptPassed });
      } catch (e) {
        // A refusal the engine keeps making — the question is closed — reads the same as a
        // lost request, but only one of them is worth pressing again for.
        setError(
          e instanceof ApiError && e.status === 422
            ? t('exerciseRunner.highlightInText.closedAlready')
            : t('exerciseRunner.highlightInText.sendFailed'),
        );
      } finally {
        setSending(false);
      }
    },
    [checkTable, finishTable, marks, question, sending, t, tokens],
  );

  const revealed =
    verdict !== null && verdict.revealed && verdict.key !== undefined;
  const checked = verdict !== null && !revealed;
  const closed = verdict?.closed === true;
  const passed = checked && verdict.passed;
  const marking = verdict === null;
  const live =
    !disabled &&
    !resuming &&
    marking &&
    !sending &&
    !audioLocked &&
    question !== undefined &&
    !completed[index];

  const mark = useCallback(
    (origin: number, end: number) => {
      if (question === undefined) return;
      setMarks(current =>
        toggleMark(current, origin, end, question.unit, paragraphOf),
      );
    },
    [question, paragraphOf],
  );

  /** «Try again» — exactly the right marks stay (AC-S6), and the check moves on. */
  const retry = useCallback(() => {
    if (verdict === null) return;
    setMarks(current => keepExact(current, verdict.cells, tokens));
    setAttempt(verdict.attempt + 1);
    setVerdict(null);
    setError(null);
  }, [verdict, tokens]);

  const ahead = nextOpen(questions, states, index);

  /** «Next question» — the next one still open, at the check after its last. */
  const next = useCallback(() => {
    if (ahead === null) return;
    setIndex(ahead.index);
    setMarks([]);
    setVerdict(null);
    setAttempt(ahead.attempt);
    setError(null);
  }, [ahead]);

  if (question === undefined) {
    return (
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>
          {t('exerciseRunner.highlightInText.empty')}
        </Text>
        <Text style={styles.noticeDesc}>
          {t('exerciseRunner.highlightInText.emptyDesc')}
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

  const attemptLine =
    settings.attempts === 0
      ? t('exerciseRunner.highlightInText.attempt', { n: attempt })
      : t('exerciseRunner.highlightInText.attemptOf', {
          n: attempt,
          max: settings.attempts,
        });

  // The percentage after the deduction differs from right / total exactly when extra marks
  // cost something — the projection carries no penalty, so it is read off the numbers.
  const deducted =
    checked &&
    verdict.fp > 0 &&
    verdict.total > 0 &&
    verdict.pct !== Math.round((verdict.exact * 100) / verdict.total);

  // Counts first, and alone: hints are ordinary text below (AC-X8).
  const announce = checked
    ? verdict.fp > 0
      ? t('exerciseRunner.highlightInText.announceExtra', {
          correct: verdict.exact,
          total: verdict.total,
          fp: verdict.fp,
        })
      : t('exerciseRunner.highlightInText.announce', {
          correct: verdict.exact,
          total: verdict.total,
        })
    : '';

  return (
    <View>
      {questions.length > 1 && (
        <View
          style={styles.rail}
          accessible
          accessibilityLabel={t('exerciseRunner.highlightInText.rail', {
            n: index + 1,
            total: questions.length,
            done: completed.filter(Boolean).length,
          })}
        >
          {questions.map((q, i) => (
            <View
              key={q.id}
              style={[
                styles.railStep,
                {
                  backgroundColor: completed[i]
                    ? colors.success
                    : i === index
                    ? colors.accent
                    : colors.backgroundPressed,
                },
              ]}
            />
          ))}
          <Text style={styles.railCount}>
            {index + 1}/{questions.length}
          </Text>
        </View>
      )}

      <View style={styles.prompt}>
        <Text style={styles.promptText}>{question.prompt}</Text>
        <Text style={styles.promptHow}>
          {question.unit === 'word'
            ? t('exerciseRunner.highlightInText.tapWords')
            : t('exerciseRunner.highlightInText.tapOrDrag')}
          {question.count !== null &&
            ` ${t('exerciseRunner.highlightInText.count', {
              n: question.count,
            })}`}
        </Text>
      </View>

      {passage.instruction.trim() !== '' && (
        <Text style={styles.instruction}>{passage.instruction}</Text>
      )}

      {audioOn && (
        <View style={styles.audio}>
          <ExerciseAudioPlayer eng={audio} interactive={!disabled} />
          {audioLocked && (
            <AudioLockNote
              itemNoun={t('exerciseRunner.audio.itemNoun.items')}
            />
          )}
        </View>
      )}

      <MarkablePassage
        text={text}
        tokens={tokens}
        paragraphOf={paragraphOf}
        cellOf={i => cells.get(i) ?? null}
        numberOf={i => numbers.get(i) ?? null}
        unit={question.unit}
        live={live}
        onRange={mark}
        onDrag={setDrag}
        colors={colors}
      />

      {(checked || revealed) && (
        <View style={styles.legend}>
          {revealed ? (
            <Swatch
              style={{ backgroundColor: colors.accentLight }}
              styles={styles}
            >
              {t('exerciseRunner.highlightInText.legendKey')}
            </Swatch>
          ) : (
            <>
              <Swatch
                style={{ backgroundColor: tint(colors.success, 0.18) }}
                styles={styles}
              >
                {t('exerciseRunner.highlightInText.legendRight')}
              </Swatch>
              <Swatch
                style={{ backgroundColor: tint(colors.danger, 0.12) }}
                styles={styles}
              >
                {t('exerciseRunner.highlightInText.legendExtra')}
              </Swatch>
              <Swatch
                style={styles.missSwatch}
                styles={styles}
              >
                {t('exerciseRunner.highlightInText.legendMissed')}
              </Swatch>
            </>
          )}
        </View>
      )}

      {checked && (
        <View style={styles.verdict}>
          <Text style={styles.srOnly} accessibilityLiveRegion="polite">
            {announce}
          </Text>
          <Note tone={passed ? 'ok' : 'bad'} colors={colors} styles={styles}>
            <Text style={styles.bold}>
              {verdict.fp > 0
                ? t('exerciseRunner.highlightInText.verdictExtra', {
                    correct: verdict.exact,
                    total: verdict.total,
                    fp: verdict.fp,
                  })
                : t('exerciseRunner.highlightInText.verdict', {
                    correct: verdict.exact,
                    total: verdict.total,
                  })}
            </Text>{' '}
            {deducted
              ? t('exerciseRunner.highlightInText.scoreAfter', {
                  pct: verdict.pct,
                })
              : t('exerciseRunner.highlightInText.score', { pct: verdict.pct })}
          </Note>
          {verdict.near > 0 && (
            <Note tone="reveal" colors={colors} styles={styles}>
              {t('exerciseRunner.highlightInText.near', {
                count: verdict.near,
              })}
            </Note>
          )}
          {verdict.missHint !== undefined && (
            <Note tone="reveal" colors={colors} styles={styles}>
              {verdict.missHint}
            </Note>
          )}
          {verdict.fpHint !== undefined && (
            <Note tone="bad" colors={colors} styles={styles}>
              {verdict.fpHint}
            </Note>
          )}
        </View>
      )}

      {audioOn && (
        <AudioTranscript
          audio={audio.audio}
          revealed={transcript !== null}
          delivered={transcript}
        />
      )}

      <View style={styles.bottom}>
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {question.count !== null
              ? t('exerciseRunner.highlightInText.markedOf', {
                  n: marks.length,
                  total: question.count,
                })
              : t('exerciseRunner.highlightInText.marked', { n: marks.length })}
          </Text>
          {marks.length > 0 && marking && !disabled && (
            <TouchableOpacity
              onPress={() => setMarks([])}
              disabled={sending}
              style={styles.clearBtn}
              accessibilityRole="button"
            >
              <Text style={styles.clearText}>
                {t('exerciseRunner.highlightInText.clear')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Drawn from the last verdict's `closed`, never from a count kept here. */}
        {!disabled && (
          <View style={styles.actions}>
            {marking && (
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  (!live || marks.length === 0) && styles.btnDim,
                ]}
                onPress={() => void send(false)}
                disabled={!live || marks.length === 0}
                accessibilityRole="button"
              >
                {sending ? (
                  <ActivityIndicator size="small" color={colors.textInverted} />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {marks.length > 0
                      ? t('exerciseRunner.highlightInText.checkCount', {
                          n: marks.length,
                        })
                      : t('exerciseRunner.highlightInText.check')}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            {checked && !passed && !closed && (
              <TouchableOpacity
                style={[styles.primaryBtn, sending && styles.btnDim]}
                onPress={retry}
                disabled={sending}
                accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>
                  ↺ {t('exerciseRunner.highlightInText.retry')}
                </Text>
              </TouchableOpacity>
            )}
            {checked && !passed && settings.revealKey && (
              <TouchableOpacity
                style={[styles.ghostBtn, sending && styles.btnDim]}
                onPress={() => void send(true)}
                disabled={sending}
                accessibilityRole="button"
              >
                {sending ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.textSecondary}
                  />
                ) : (
                  <Text style={styles.ghostBtnText}>
                    {t('exerciseRunner.highlightInText.showKey')}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            {/* Closed with another question open: on to it. The last one ends here — the
                shell owns what comes after the exercise (plan 67 §5, deviation 12). */}
            {closed && ahead !== null && (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={next}
                accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>
                  {t('exerciseRunner.highlightInText.next')} →
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {(verdict !== null || attempt > 1) && (
          <Text style={styles.attempt}>{attemptLine}</Text>
        )}

        {revealed && (
          <View style={styles.reasons}>
            {verdict
              .key!.filter(span => span.why !== undefined)
              .map(span => (
                <Text key={span.n} style={styles.reason}>
                  <Text style={styles.bold}>
                    {span.n}. {text.slice(span.start, span.end)}
                  </Text>{' '}
                  — {span.why}
                </Text>
              ))}
          </View>
        )}

        {error !== null && <Text style={styles.error}>{error}</Text>}
      </View>
    </View>
  );
}

/* ── The passage ───────────────────────────────────────────────────────────── */

interface MarkablePassageProps {
  text: string;
  tokens: readonly Token[];
  paragraphOf: readonly number[];
  cellOf: (i: number) => MarkCell | null;
  numberOf: (i: number) => number | null;
  unit: Unit;
  /** False before a check is answered, after it, and while sending: nothing takes input. */
  live: boolean;
  onRange: (origin: number, end: number) => void;
  /** A drag in progress, or `null` once it is let go or cancelled. */
  onDrag: (drag: { origin: number; end: number } | null) => void;
  colors: ColorScheme;
}

/**
 * The passage, a word at a time — the phone's `MarkableText` (plan 67 §7.1).
 *
 * Every word is its own box, so that a tap and a finger can be found on it: nested `Text`
 * would wrap more naturally but measures nothing. A word carries the punctuation and space
 * after it (and the opening punctuation of its paragraph before it), so a line never starts
 * with a comma; that gap is painted only inside a mark (AC-M2).
 *
 * **Tap** marks a word, on either unit. **Drag** (Q5-A), on a phrase question only: a finger
 * moving sideways further than `DRAG_START` takes the gesture from the word and from the
 * screen's scroll, and the run follows it — to the nearest word, never past the paragraph
 * it started in. A vertical move is left to the scroll, as on the web (`touch-action: pan-y`).
 */
function MarkablePassage({
  text,
  tokens,
  paragraphOf,
  cellOf,
  numberOf,
  unit,
  live,
  onRange,
  onDrag,
  colors,
}: MarkablePassageProps) {
  const { t } = useTranslation();
  const styles = makeStyles(colors);

  const container = useRef<View>(null);
  /** Each word's box in its paragraph, and each paragraph's place in the passage. */
  const wordBoxes = useRef(new Map<number, TokenRect>());
  const paragraphBoxes = useRef(new Map<number, { x: number; y: number }>());
  /** The passage's place on screen, taken when a drag starts — the page may have scrolled. */
  const origin = useRef<{ pageX: number; pageY: number } | null>(null);
  const dragging = useRef<{ origin: number; end: number } | null>(null);
  /**
   * Where the finger first touched. `gestureState.x0` is the point at the moment the drag is
   * granted — after the finger has already crossed the start threshold — so on a short word
   * ("I") the anchor would land on the neighbour.
   */
  const touchDown = useRef<{ x: number; y: number } | null>(null);

  // The responder is made once; what it reads changes, so it reads it through a ref.
  const latest = useRef({ live, unit, onRange, onDrag, paragraphOf });
  latest.current = { live, unit, onRange, onDrag, paragraphOf };

  const hit = (pageX: number, pageY: number): number | null => {
    const at = origin.current;
    if (at === null) return null;
    const rects = new Map<number, TokenRect>();
    for (const [i, box] of wordBoxes.current) {
      const p = paragraphBoxes.current.get(latest.current.paragraphOf[i] ?? 0);
      if (p === undefined) continue;
      rects.set(i, { ...box, x: box.x + p.x, y: box.y + p.y });
    }
    return tokenAtPoint(rects, pageX - at.pageX, pageY - at.pageY);
  };

  const responder = useRef<PanResponderInstance | null>(null);
  responder.current ??= PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: (e) => {
      touchDown.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      return false;
    },
    onMoveShouldSetPanResponder: (_e, g) =>
      latest.current.live &&
      latest.current.unit === 'phrase' &&
      Math.abs(g.dx) > DRAG_START &&
      Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: (_e, g) => {
      origin.current = null;
      dragging.current = null;
      const x0 = touchDown.current?.x ?? g.x0;
      const y0 = touchDown.current?.y ?? g.y0;
      container.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
        origin.current = { pageX, pageY };
        const from = hit(x0, y0);
        if (from === null) return;
        dragging.current = { origin: from, end: hit(g.moveX, g.moveY) ?? from };
        latest.current.onDrag(dragging.current);
      });
    },
    onPanResponderMove: (_e, g) => {
      const current = dragging.current;
      if (current === null) return;
      const end = hit(g.moveX, g.moveY);
      if (end === null || end === current.end) return;
      dragging.current = { origin: current.origin, end };
      latest.current.onDrag(dragging.current);
    },
    onPanResponderRelease: () => {
      const done = dragging.current;
      dragging.current = null;
      latest.current.onDrag(null);
      if (done !== null) latest.current.onRange(done.origin, done.end);
    },
    onPanResponderTerminate: () => {
      dragging.current = null;
      latest.current.onDrag(null);
    },
    // Once a drag has the gesture, neither the word nor the scroll may take it back.
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  });

  const stateWord = (cell: MarkCell | null): string | null => {
    if (cell === null) return null;
    switch (cell.m) {
      case 'sel':
        return t('exerciseRunner.highlightInText.stateMarked');
      case 'ok':
        return t('exerciseRunner.highlightInText.legendRight');
      case 'fp':
        return t('exerciseRunner.highlightInText.legendExtra');
      case 'near':
        return t('exerciseRunner.highlightInText.stateNear');
      case 'miss':
        return t('exerciseRunner.highlightInText.legendMissed');
      case 'key':
        return t('exerciseRunner.highlightInText.legendKey');
    }
  };

  // Group the words by paragraph; a paragraph without words still keeps its place.
  const groups = new Map<number, Token[]>();
  for (const token of tokens) {
    const p = paragraphOf[token.i] ?? 0;
    const list = groups.get(p);
    if (list) list.push(token);
    else groups.set(p, [token]);
  }

  const cellsByToken = tokens.map(tk => cellOf(tk.i));
  const cellMap = new Map<number, MarkCell>();
  cellsByToken.forEach((c, i) => {
    if (c !== null) cellMap.set(i, c);
  });

  return (
    <View
      ref={container}
      style={styles.passage}
      {...responder.current.panHandlers}
      accessibilityRole="none"
    >
      {[...groups.entries()].map(([p, words]) => (
        <View
          key={p}
          style={styles.paragraph}
          onLayout={(e: LayoutChangeEvent) => {
            const { x, y } = e.nativeEvent.layout;
            paragraphBoxes.current.set(p, { x, y });
          }}
        >
          {words.map((token, n) => {
            const { lead, gap, breaks } = surroundings(
              text,
              token,
              n === 0 ? undefined : words[n - 1],
              words[n + 1],
              tokens,
            );
            const cell = cellsByToken[token.i] ?? null;
            const prev = token.i > 0 ? cellsByToken[token.i - 1] ?? null : null;
            const nextCell = cellsByToken[token.i + 1] ?? null;
            const startsRun =
              cell !== null && (prev === null || prev.k !== cell.k);
            const endsRun =
              cell !== null && (nextCell === null || nextCell.k !== cell.k);
            const gapPainted = gapInsideRun(cellMap, token.i) && !breaks;
            const ordinal = numberOf(token.i);
            const tone = cellTone(cell, colors);
            const said = stateWord(cell);

            return (
              <React.Fragment key={token.i}>
                <View
                  style={styles.unit}
                  onLayout={(e: LayoutChangeEvent) => {
                    const { x, y, width, height } = e.nativeEvent.layout;
                    wordBoxes.current.set(token.i, { x, y, width, height });
                  }}
                >
                  {lead !== '' && <Text style={styles.word}>{lead}</Text>}
                  <Pressable
                    onPress={() => onRange(token.i, token.i)}
                    disabled={!live}
                    hitSlop={{ top: 6, bottom: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      said === null ? token.w : `${token.w}, ${said}`
                    }
                    accessibilityState={{
                      selected: cell?.m === 'sel',
                      disabled: !live,
                    }}
                    style={[
                      styles.token,
                      tone.box,
                      cell?.keyLine === true && {
                        borderBottomColor: colors.accent,
                      },
                      startsRun && styles.runStart,
                      endsRun && styles.runEnd,
                    ]}
                  >
                    {ordinal !== null && (
                      <Text style={[styles.ordinal, { color: colors.accent }]}>
                        {ordinal}
                      </Text>
                    )}
                    <Text style={[styles.word, tone.text]}>{token.w}</Text>
                  </Pressable>
                  {gap !== '' && (
                    <Text
                      style={[
                        styles.word,
                        styles.gap,
                        gapPainted && tone.box,
                        gapPainted && styles.gapPainted,
                      ]}
                    >
                      {gap}
                    </Text>
                  )}
                </View>
                {breaks && <View style={styles.lineBreak} />}
              </React.Fragment>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * The text a word carries round it: what stands before it on its line (`lead`), the
 * punctuation and space after it (`gap`), and whether a line break follows. A line break
 * inside a paragraph splits the stretch between two words: what is before it stays with
 * this word, what is after it opens the next.
 */
function surroundings(
  text: string,
  token: Token,
  previousInParagraph: Token | undefined,
  nextInParagraph: Token | undefined,
  tokens: readonly Token[],
): { lead: string; gap: string; breaks: boolean } {
  let lead: string;
  if (previousInParagraph === undefined) {
    lead = leadingOf(text, token, tokens[token.i - 1]);
  } else {
    const before = text.slice(previousInParagraph.e, token.s);
    const cut = before.lastIndexOf('\n');
    lead = cut === -1 ? '' : before.slice(cut + 1).replace(/^\s+/, '');
  }

  const after = text.slice(
    token.e,
    nextInParagraph !== undefined
      ? nextInParagraph.s
      : trailingEnd(text, token, tokens[token.i + 1]),
  );
  const cut = nextInParagraph === undefined ? -1 : after.indexOf('\n');
  return cut === -1
    ? { lead, gap: after, breaks: false }
    : { lead, gap: after.slice(0, cut).replace(/\s+$/, ''), breaks: true };
}

/**
 * What stands before the first word of a paragraph — an opening quote, a dash — from the
 * paragraph's own start, which is where the previous word's trailing gap stopped.
 */
function leadingOf(
  text: string,
  token: Token,
  previous: Token | undefined,
): string {
  const from = previous === undefined ? 0 : trailingEnd(text, previous, token);
  return text.slice(from, token.s).replace(/^\s+/, '');
}

/**
 * Where the gap after the last word of a paragraph ends: at the blank line that ends the
 * paragraph, so the closing punctuation stays with the word and the blank line does not.
 */
function trailingEnd(
  text: string,
  token: Token,
  next: Token | undefined,
): number {
  const limit = next === undefined ? text.length : next.s;
  const tail = text.slice(token.e, limit);
  const blank = tail.search(/\n\s*\n/);
  const end = blank === -1 ? tail.replace(/\s+$/, '').length : blank;
  return token.e + end;
}

/** The look of one word in each state (plan 67 §7.1, in this app's palette). */
function cellTone(
  cell: MarkCell | null,
  colors: ColorScheme,
): { box: ViewStyle; text: StyleProp<TextStyle> } {
  switch (cell?.m) {
    case 'sel':
      return {
        box: { backgroundColor: tint(colors.warning, 0.26) },
        text: { fontWeight: '600' },
      };
    case 'ok':
      return {
        box: { backgroundColor: tint(colors.success, 0.18) },
        text: { fontWeight: '600' },
      };
    case 'fp':
      return {
        box: { backgroundColor: tint(colors.danger, 0.12) },
        text: { color: colors.danger, textDecorationLine: 'line-through' },
      };
    case 'near':
      return {
        box: { backgroundColor: tint(colors.warning, 0.14) },
        text: null,
      };
    case 'miss':
      return {
        box: { borderBottomColor: colors.accent },
        text: { color: colors.accent },
      };
    case 'key':
      return {
        box: { backgroundColor: colors.accentLight },
        text: { color: colors.accent, fontWeight: '600' },
      };
    default:
      return { box: {}, text: null };
  }
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

function Note({
  tone,
  colors,
  styles,
  children,
}: {
  tone: 'ok' | 'bad' | 'reveal';
  colors: ColorScheme;
  styles: ReturnType<typeof makeStyles>;
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
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

function Swatch({
  style,
  styles,
  children,
}: {
  style: ViewStyle;
  styles: ReturnType<typeof makeStyles>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.swatchRow}>
      <View style={[styles.swatch, style]} />
      <Text style={styles.swatchText}>{children}</Text>
    </View>
  );
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
    prompt: {
      backgroundColor: colors.accentLight,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 11,
      marginBottom: 12,
    },
    promptText: {
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 21,
      color: colors.textPrimary,
    },
    promptHow: {
      fontSize: 12.5,
      lineHeight: 17,
      color: colors.accent,
      marginTop: 3,
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
    passage: {
      paddingVertical: 4,
    },
    paragraph: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      marginBottom: 16,
    },
    unit: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginVertical: 5,
    },
    token: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 2,
      paddingTop: 3,
      paddingBottom: 1,
      // Always there, coloured only for `miss` and the key's boundary, so nothing moves.
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    runStart: {
      borderTopLeftRadius: 7,
      borderBottomLeftRadius: 7,
    },
    runEnd: {
      borderTopRightRadius: 7,
      borderBottomRightRadius: 7,
    },
    word: {
      fontSize: 17,
      lineHeight: 24,
      color: colors.textPrimary,
    },
    gap: {
      paddingTop: 3,
      paddingBottom: 3,
    },
    gapPainted: {
      borderRadius: 0,
    },
    ordinal: {
      fontSize: 9,
      lineHeight: 11,
      fontWeight: '700',
      opacity: 0.75,
      marginRight: 1,
    },
    lineBreak: {
      width: '100%',
      height: 0,
    },
    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 12,
    },
    swatchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    swatch: {
      width: 12,
      height: 12,
      borderRadius: 4,
    },
    // `miss` is the one state drawn without a fill: an underline (plan 67 §7.1).
    missSwatch: {
      borderRadius: 0,
      borderBottomWidth: 2,
      borderBottomColor: colors.accent,
    },
    swatchText: {
      fontSize: 11.5,
      color: colors.textMuted,
    },
    verdict: {
      gap: 7,
      marginBottom: 12,
    },
    srOnly: {
      height: 0,
      width: 0,
      opacity: 0,
    },
    note: {
      borderLeftWidth: 3,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    noteText: {
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
      gap: 10,
    },
    counter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 28,
    },
    counterText: {
      fontSize: 12.5,
      fontVariant: ['tabular-nums'],
      color: colors.textMuted,
    },
    clearBtn: {
      minHeight: TAP_MIN,
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    clearText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    actions: {
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
    reasons: {
      gap: 6,
    },
    reason: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
    },
    error: {
      fontSize: 13,
      color: colors.danger,
    },
  });
