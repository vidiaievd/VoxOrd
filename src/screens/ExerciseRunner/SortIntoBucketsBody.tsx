import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { ApiError } from '../../api/client';
import type {
  AudioTranscript as AudioTranscriptWords,
  SubmitAttemptResponse,
} from '../../api/exercises';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useExerciseAudio } from '../../hooks/useExerciseAudio';
import {
  AudioLockNote,
  AudioSegmentButton,
  AudioTranscript,
  ExerciseAudioPlayer,
} from './audio';
import type { ExerciseBodyProps } from './ExerciseBody';
import {
  buildSortIntoBucketsSubmission,
  isMovable,
  keepOnRetry,
  placeTile,
  readSortIntoBucketsBoard,
  readSortIntoBucketsVerdict,
  tileViews,
  uncheckedCount,
  wrongCount,
  zoneNotes,
  type ProjectedBucket,
  type ProjectedTile,
  type SortIntoBucketsBoard,
  type SortIntoBucketsPlacements,
  type SortIntoBucketsVerdict,
  type TileView,
} from './templates/sortIntoBuckets';

/** BEHAVIOR §Accessibility: every tile and zone is comfortably tappable. */
const TAP_MIN = 44;

/**
 * `sort_into_buckets` — tiles to put into zones, the whole board checked as one (plan 66).
 *
 * A board that arrives carrying any part of its key is refused rather than played — see
 * `readSortIntoBucketsBoard`.
 */
export function SortIntoBucketsBody(props: ExerciseBodyProps) {
  const { display, onAnswerChange } = props;
  const board = useMemo(
    () => readSortIntoBucketsBoard(display.content),
    [display.content],
  );

  if (board === null)
    return <UnreadableBoard onAnswerChange={onAnswerChange} />;
  return <SortIntoBucketsBoardBody {...props} board={board} />;
}

/** Nothing playable: the board arrived with its key on it, or in a shape this app cannot read. */
function UnreadableBoard({
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
        {t('exerciseRunner.sortIntoBuckets.unavailable')}
      </Text>
      <Text style={styles.noticeDesc}>
        {t('exerciseRunner.sortIntoBuckets.unavailableDesc')}
      </Text>
    </View>
  );
}

/**
 * The student's side of the board: put every tile in a zone, hand the board in, read what
 * comes back, fix the wrong ones and hand it in again.
 *
 * It owns nothing about the outcome. Which zone is right, which tiles are frozen and
 * whether the board is closed are the server's; there is no branch here that could mark a
 * tile right before a check, because nothing here knows the key (plan 66 §3.4).
 *
 * **Tap, then tap.** Tap a tile in the pool to pick it up, tap a zone to put it down; tap
 * a placed tile to take it back. No drag: none of this app's bodies drags, and tap/tap is
 * the way the handoff requires on every platform (AC-S1).
 *
 * **Zones stacked, the pool beneath them**, as `MatchPairsBody` puts its pool under its
 * slots. The handoff's sticky pool needs the body to own its scroll, and the runner's
 * `ScrollView` is the shell's — so while a tile is in hand, the line naming it is drawn
 * above the zones instead, where the tap that places it happens.
 *
 * How it meets the shell is `multiple_choice_group`'s (plan 66 §3.1): a check is
 * `checkTable`, which opens the attempt on the first one and submits the whole board; a
 * re-check is another submit onto that same attempt, counted by the engine against the
 * author's budget. The check that *closes* the board is reported through `finishTable`,
 * and the footer's Continue and Try again take it from there.
 *
 * **No count of what is left unless the author asked for one** (AC-S9), which rules out a
 * progress bar as well.
 */
function SortIntoBucketsBoardBody({
  display,
  disabled,
  onAnswerChange,
  checkTable,
  finishTable,
  board,
}: ExerciseBodyProps & { board: SortIntoBucketsBoard }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [placements, setPlacements] = useState<SortIntoBucketsPlacements>({});
  /** The last check. `null` before the first and again after a retry. */
  const [verdict, setVerdict] = useState<SortIntoBucketsVerdict | null>(null);
  /**
   * Tiles the server froze, cumulative. Held apart from the verdict because it outlives
   * it: a retry drops the marks and keeps the freeze (plan 54's lesson).
   */
  const [locked, setLocked] = useState<string[]>([]);
  /** The check the board is on — one past the last once a retry has been made. */
  const [attempt, setAttempt] = useState(1);
  /** The tile in hand, if any. */
  const [selected, setSelected] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The listening layer, if this board has one (plan 56). As for the table, a `gate`
   * layout is the same player with the tiles locked until the clip has been heard.
   */
  const audio = useExerciseAudio(display.content);
  const audioOn = audio.audio.enabled;
  const audioLocked = audioOn && audio.gated;
  /** The clip's words, once the check that closed the board earned them (plan 56 §3.3). */
  const [transcript, setTranscript] = useState<AudioTranscriptWords | null>(
    null,
  );

  // The footer's Check is not drawn for this template (`bodyOwnsCheck`): the board is
  // handed in from here, and a second submit on a closed board is a refusal.
  useEffect(() => {
    onAnswerChange(null, false);
  }, [onAnswerChange]);

  const { buckets, tiles, settings } = board;
  const views = useMemo(
    () => tileViews(tiles, placements, verdict, locked),
    [tiles, placements, verdict, locked],
  );
  const closed = verdict?.closed === true;
  const canEdit = !disabled && !closed && !sending && !audioLocked;
  const unchecked = uncheckedCount(views);
  const wrong = wrongCount(views);
  const pool = views.filter(view => view.zone === null);
  const total = tiles.length;
  const bucketLabel = useMemo(
    () => new Map(buckets.map(b => [b.id, b.label])),
    [buckets],
  );
  const inHand: ProjectedTile | undefined = tiles.find(
    tile => tile.id === selected,
  );

  /** The tile's own recording, when the author recorded one (`source: 'items'`). */
  const recording = useAudioPlayer(inHand?.mediaId ?? null);

  /**
   * Hand the board in, or ask to be shown the key.
   *
   * The verdict decides everything that follows, including whether the board is over —
   * `closed` is the server's word, never a count kept here. When it closes, the shell is
   * told, and this screen keeps drawing the closed board above the verdict bar.
   */
  const send = useCallback(
    async (reveal: boolean) => {
      if (sending) return;
      setSending(true);
      setError(null);
      setSelected(null);
      try {
        const response: SubmitAttemptResponse = await checkTable(
          buildSortIntoBucketsSubmission(placements, reveal),
        );
        const details = readSortIntoBucketsVerdict(response.details);
        if (details === null) {
          setError(t('exerciseRunner.sortIntoBuckets.sendFailed'));
          return;
        }

        setVerdict(details);
        setLocked(details.locked);
        setAttempt(details.attempt);
        if (response.audioTranscript) setTranscript(response.audioTranscript);
        if (details.closed) finishTable(response);
      } catch (e) {
        // A refusal the engine will keep making — this board is closed, the budget is
        // spent — reads the same as a lost request, but only one is worth retrying.
        setError(
          e instanceof ApiError && e.status === 422
            ? t('exerciseRunner.sortIntoBuckets.closedAlready')
            : t('exerciseRunner.sortIntoBuckets.sendFailed'),
        );
      } finally {
        setSending(false);
      }
    },
    [checkTable, finishTable, placements, sending, t],
  );

  const put = useCallback(
    (tileId: string, bucketId: string | null) => {
      setPlacements(current => placeTile(current, locked, tileId, bucketId));
      setSelected(null);
    },
    [locked],
  );

  /**
   * A tap on a tile.
   *
   * In the pool: pick it up, or let go of it. Placed, with nothing in hand: take it back
   * to the pool (AC-S2). Placed, with another tile in hand: the tap is on that zone, which
   * is where the tile in hand is going.
   */
  const tapTile = useCallback(
    (view: TileView) => {
      if (!canEdit || !isMovable(view.state)) return;
      if (view.state === 'pool') {
        setSelected(current =>
          current === view.tile.id ? null : view.tile.id,
        );
        return;
      }
      if (
        selected !== null &&
        selected !== view.tile.id &&
        view.zone !== null
      ) {
        put(selected, view.zone);
        return;
      }
      put(view.tile.id, null);
    },
    [canEdit, put, selected],
  );

  const tapZone = useCallback(
    (bucketId: string) => {
      if (!canEdit || selected === null) return;
      put(selected, bucketId);
    },
    [canEdit, put, selected],
  );

  /** «Try the wrong ones again» — exactly the tiles found wrong go back (AC-S5). */
  const retryWrong = useCallback(() => {
    if (verdict === null) return;
    setPlacements(current => keepOnRetry(current, verdict, locked));
    setAttempt(verdict.attempt + 1);
    setVerdict(null);
    setSelected(null);
    setError(null);
  }, [locked, verdict]);

  if (total === 0 || buckets.length < 2) {
    return (
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>
          {t('exerciseRunner.sortIntoBuckets.empty')}
        </Text>
        <Text style={styles.noticeDesc}>
          {t('exerciseRunner.sortIntoBuckets.emptyDesc')}
        </Text>
      </View>
    );
  }

  function renderTile(view: TileView) {
    const { tile, state, zone } = view;
    const isSelected = selected === tile.id;
    const zoneName = zone === null ? '' : bucketLabel.get(zone) ?? '';
    const tone = tileTone(state, isSelected, colors);
    const free = canEdit && isMovable(state);

    const label =
      state === 'ok'
        ? t('exerciseRunner.sortIntoBuckets.tileLocked', {
            text: tile.text,
            bucket: zoneName,
          })
        : state === 'bad'
        ? t('exerciseRunner.sortIntoBuckets.tileWrong', {
            text: tile.text,
            bucket: zoneName,
          })
        : state === 'key'
        ? t('exerciseRunner.sortIntoBuckets.tileKey', {
            text: tile.text,
            bucket: zoneName,
          })
        : state === 'placed'
        ? t('exerciseRunner.sortIntoBuckets.tilePlaced', {
            text: tile.text,
            bucket: zoneName,
          })
        : tile.text;

    return (
      <TouchableOpacity
        key={tile.id}
        style={[
          styles.tile,
          { borderColor: tone.border, backgroundColor: tone.bg },
          isSelected && styles.tileSelected,
          state === 'key' && styles.dashed,
          !free && state !== 'pool' && styles.tileInert,
        ]}
        onPress={() => tapTile(view)}
        disabled={!free}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: isSelected, disabled: !free }}
      >
        {/* Right and wrong ride in a mark as well as a colour (BEHAVIOR §Accessibility). */}
        {(state === 'ok' || state === 'key') && (
          <Text style={[styles.tileMark, { color: colors.success }]}>✓</Text>
        )}
        {state === 'bad' && (
          <Text style={[styles.tileMark, { color: colors.danger }]}>✗</Text>
        )}
        <Text style={styles.tileText}>{tile.text}</Text>
      </TouchableOpacity>
    );
  }

  function renderZone(bucket: ProjectedBucket) {
    const inside = views.filter(view => view.zone === bucket.id);
    const armed = selected !== null && canEdit;
    const rule = verdict?.rules.find(r => r.bucketId === bucket.id)?.rule;
    const hint = rule === undefined ? bucket.hint : undefined;
    const notes = zoneNotes(views, bucket.id, verdict);

    return (
      <TouchableOpacity
        key={bucket.id}
        activeOpacity={armed ? 0.7 : 1}
        onPress={() => tapZone(bucket.id)}
        disabled={!armed}
        accessibilityRole="button"
        accessibilityLabel={t('exerciseRunner.sortIntoBuckets.zoneLabel', {
          label: bucket.label,
          n: inside.length,
        })}
        style={[
          styles.zone,
          { borderColor: armed ? colors.accent : colors.border },
          inside.length === 0 && styles.dashed,
        ]}
      >
        <Text style={styles.zoneLabel}>{bucket.label}</Text>
        {hint !== undefined && <Text style={styles.zoneHint}>{hint}</Text>}
        {rule !== undefined && (
          <Text style={styles.zoneRule}>
            <Text style={styles.bold}>
              {t('exerciseRunner.sortIntoBuckets.rule')}:{' '}
            </Text>
            {rule}
          </Text>
        )}

        {inside.length > 0 ? (
          <View style={styles.tiles}>{inside.map(renderTile)}</View>
        ) : (
          <Text style={styles.zoneEmpty}>
            {armed
              ? t('exerciseRunner.sortIntoBuckets.zoneTap')
              : t('exerciseRunner.sortIntoBuckets.zoneIdle')}
          </Text>
        )}

        {notes.map(note => (
          <Text key={note.id} style={styles.note}>
            <Text style={styles.bold}>{note.text}</Text> — {note.body}
          </Text>
        ))}
      </TouchableOpacity>
    );
  }

  const attemptLine =
    settings.attempts === 0
      ? t('exerciseRunner.sortIntoBuckets.attempt', { n: attempt })
      : t('exerciseRunner.sortIntoBuckets.attemptOf', {
          n: attempt,
          max: settings.attempts,
        });
  const correctNow =
    verdict?.correctNow ?? (attempt > 1 ? locked.length : null);
  const showFooter = verdict !== null || attempt > 1;
  const segment =
    inHand !== undefined && audioOn ? audio.segments[inHand.id] ?? null : null;

  /** What is spoken: the verdict, or what is in hand. The notes under a zone are ordinary text. */
  const live =
    verdict !== null
      ? t('exerciseRunner.sortIntoBuckets.score', {
          correct: verdict.correctNow,
          total: verdict.totalItems,
        })
      : inHand !== undefined
      ? t('exerciseRunner.sortIntoBuckets.selected', { text: inHand.text })
      : '';

  return (
    <View>
      {board.instruction.trim() !== '' && (
        <Text style={styles.instruction}>{board.instruction}</Text>
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

      {closed && verdict !== null && (
        <Summary
          verdict={verdict}
          threshold={settings.threshold}
          colors={colors}
          styles={styles}
        />
      )}

      {inHand !== undefined && (
        <View style={styles.inHand}>
          <Text style={styles.inHandText} accessibilityLiveRegion="polite">
            {live}
          </Text>
          <View style={styles.inHandActions}>
            {inHand.mediaId !== undefined && (
              <TouchableOpacity
                style={styles.listenBtn}
                onPress={recording.toggle}
                accessibilityRole="button"
                accessibilityLabel={t('exerciseRunner.sortIntoBuckets.listen', {
                  text: inHand.text,
                })}
              >
                {recording.status === 'loading' ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.textSecondary}
                  />
                ) : (
                  <Text style={styles.listenText}>
                    {recording.status === 'playing' ? '■' : '▶'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            <AudioSegmentButton
              eng={audio}
              segment={segment}
              disabled={audioLocked}
            />
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => setSelected(null)}
              accessibilityRole="button"
            >
              <Text style={styles.linkBtnText}>
                {t('exerciseRunner.sortIntoBuckets.putBack')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Only one live region on screen at a time: the in-hand line speaks while a tile is held. */}
      {inHand === undefined && live !== '' && (
        <Text style={styles.srOnly} accessibilityLiveRegion="polite">
          {live}
        </Text>
      )}

      <View style={styles.zones}>{buckets.map(renderZone)}</View>

      {pool.length > 0 && (
        <View style={styles.pool}>
          <View style={styles.poolHead}>
            <Text style={styles.poolTitle}>
              {t('exerciseRunner.sortIntoBuckets.poolTitle')}
            </Text>
            {settings.showRemaining && (
              <Text style={styles.poolCount}>
                {t('exerciseRunner.sortIntoBuckets.remaining', {
                  n: pool.length,
                })}
              </Text>
            )}
          </View>
          <View style={styles.tiles}>{pool.map(renderTile)}</View>
        </View>
      )}

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {audioOn && (
        <AudioTranscript
          audio={audio.audio}
          revealed={transcript !== null}
          delivered={transcript}
        />
      )}

      {/* The controls belong to the board, not to the shell's footer: for this template
          they are the check itself (plan 66 §3.1). Drawn from the last verdict's `closed`,
          never from a count kept here. */}
      <View style={styles.actions}>
        {!closed && (
          <>
            {verdict !== null && wrong > 0 && (
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  (disabled || sending) && styles.btnDim,
                ]}
                onPress={retryWrong}
                disabled={disabled || sending}
                accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>
                  ↺{' '}
                  {t('exerciseRunner.sortIntoBuckets.retryWrong', { n: wrong })}
                </Text>
              </TouchableOpacity>
            )}
            {/* Primary until a check has left something to retry; a partial board is
                never a dead end (AC-S3), but the retry then leads. */}
            <TouchableOpacity
              style={[
                verdict !== null && wrong > 0
                  ? styles.ghostBtn
                  : styles.primaryBtn,
                (unchecked === 0 || disabled || sending || audioLocked) &&
                  styles.btnDim,
              ]}
              onPress={() => void send(false)}
              disabled={unchecked === 0 || disabled || sending || audioLocked}
              accessibilityRole="button"
            >
              {sending ? (
                <ActivityIndicator
                  size="small"
                  color={
                    verdict !== null && wrong > 0
                      ? colors.textSecondary
                      : colors.textInverted
                  }
                />
              ) : (
                <Text
                  style={
                    verdict !== null && wrong > 0
                      ? styles.ghostBtnText
                      : styles.primaryBtnText
                  }
                >
                  {unchecked > 0
                    ? t('exerciseRunner.sortIntoBuckets.checkCount', {
                        n: unchecked,
                      })
                    : t('exerciseRunner.sortIntoBuckets.check')}
                </Text>
              )}
            </TouchableOpacity>
            {settings.revealKey && (verdict !== null || attempt > 1) && (
              <TouchableOpacity
                style={[
                  styles.ghostBtn,
                  (disabled || sending) && styles.btnDim,
                ]}
                onPress={() => void send(true)}
                disabled={disabled || sending}
                accessibilityRole="button"
              >
                <Text style={styles.ghostBtnText}>
                  {t('exerciseRunner.sortIntoBuckets.showKey')}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {showFooter && (
          <Text style={styles.attempt}>
            {attemptLine}
            {correctNow !== null &&
              ` · ${t('exerciseRunner.sortIntoBuckets.score', {
                correct: correctNow,
                total,
              })}`}
          </Text>
        )}
        {closed && (
          <Text style={styles.closedHint}>
            {t('exerciseRunner.sortIntoBuckets.doneHint')}
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * The score card of a closed board.
 *
 * The score is the first check's (plan 66 §3.3) — the number the engine recorded and the
 * one the SRS sees — so it is what this card reports, not how the board stands now. The
 * percentage is arithmetic over two numbers the server sent; `>=`, as the kernel compares.
 */
function Summary({
  verdict,
  threshold,
  colors,
  styles,
}: {
  verdict: SortIntoBucketsVerdict;
  threshold: number;
  colors: ColorScheme;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { t } = useTranslation();
  const { passedItems, totalItems } = verdict;
  const pct = totalItems === 0 ? 0 : (passedItems / totalItems) * 100;
  const passed = pct >= threshold;
  const tone = passed ? colors.success : colors.warning;

  return (
    <View style={[styles.summary, { borderLeftColor: tone }]}>
      <Text style={[styles.summaryScore, { color: tone }]}>
        {passedItems}/{totalItems}
      </Text>
      <View style={styles.summaryBody}>
        <Text style={styles.summaryHead}>
          {passed
            ? t('exerciseRunner.sortIntoBuckets.passed')
            : t('exerciseRunner.sortIntoBuckets.notPassed')}
        </Text>
        <Text style={styles.summaryLine}>
          {t('exerciseRunner.sortIntoBuckets.firstScore', {
            score: passedItems,
            total: totalItems,
            threshold,
          })}
        </Text>
      </View>
    </View>
  );
}

/** The colours of one tile. `key` is hollow and dashed — shown, not chosen. */
function tileTone(
  state: TileView['state'],
  isSelected: boolean,
  colors: ColorScheme,
): { border: string; bg: string } {
  if (state === 'ok')
    return { border: colors.success, bg: 'rgba(52, 199, 89, 0.12)' };
  if (state === 'bad')
    return { border: colors.danger, bg: 'rgba(255, 59, 48, 0.10)' };
  if (state === 'key')
    return { border: colors.success, bg: colors.backgroundCard };
  if (isSelected) return { border: colors.accent, bg: colors.accentLight };
  return { border: colors.border, bg: colors.backgroundCard };
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
    instruction: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textSecondary,
      lineHeight: 21,
      marginBottom: 14,
    },
    audio: {
      marginBottom: 12,
    },
    bold: {
      fontWeight: '700',
      color: colors.textPrimary,
    },
    srOnly: {
      height: 0,
      width: 0,
      opacity: 0,
    },
    inHand: {
      borderWidth: 1.5,
      borderColor: colors.accent,
      backgroundColor: colors.accentLight,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },
    inHandText: {
      fontSize: 13.5,
      lineHeight: 19,
      color: colors.textPrimary,
    },
    inHandActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    listenBtn: {
      minWidth: TAP_MIN,
      minHeight: TAP_MIN,
      borderRadius: TAP_MIN / 2,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.backgroundCard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listenText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    linkBtn: {
      minHeight: TAP_MIN,
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    linkBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      textDecorationLine: 'underline',
    },
    zones: {
      gap: 10,
    },
    zone: {
      minHeight: TAP_MIN * 2,
      borderWidth: 1.5,
      borderRadius: 14,
      backgroundColor: colors.backgroundCard,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    zoneLabel: {
      fontSize: 15.5,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    zoneHint: {
      fontSize: 12.5,
      color: colors.textMuted,
      marginTop: 2,
    },
    zoneRule: {
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.textSecondary,
      marginTop: 2,
    },
    zoneEmpty: {
      fontSize: 12.5,
      fontStyle: 'italic',
      color: colors.textMuted,
      marginTop: 8,
    },
    note: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
      marginTop: 8,
    },
    tiles: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    tile: {
      minHeight: TAP_MIN,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1.5,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    tileSelected: {
      borderWidth: 2,
    },
    // The key beside a wrong pick, and a zone with nothing in it yet: hollow, not chosen.
    dashed: {
      borderStyle: 'dashed',
    },
    tileInert: {
      opacity: 0.9,
    },
    tileMark: {
      fontSize: 14,
      fontWeight: '700',
      marginRight: 6,
    },
    tileText: {
      fontSize: 15,
      lineHeight: 20,
      color: colors.textPrimary,
    },
    pool: {
      marginTop: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    poolHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    poolTitle: {
      fontSize: 11.5,
      fontWeight: '700',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    poolCount: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.textMuted,
    },
    summary: {
      flexDirection: 'row',
      alignItems: 'center',
      borderLeftWidth: 3,
      backgroundColor: colors.backgroundInput,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 14,
    },
    summaryScore: {
      fontSize: 20,
      fontWeight: '800',
      marginRight: 12,
    },
    summaryBody: {
      flex: 1,
    },
    summaryHead: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    summaryLine: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    error: {
      fontSize: 13,
      color: colors.danger,
      marginTop: 10,
    },
    actions: {
      marginTop: 16,
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
      borderWidth: 2,
      borderColor: colors.border,
      minHeight: TAP_MIN,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ghostBtnText: {
      fontSize: 15,
      fontWeight: '700',
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
    closedHint: {
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: 'center',
    },
  });
