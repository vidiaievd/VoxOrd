import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Icon } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { ApiError } from '../../api/client';
import {
  getAttempt,
  recentAttempts,
  saveDraft,
  type SubmitAttemptResponse,
} from '../../api/exercises';
import {
  deleteMediaAsset,
  getMediaAsset,
  uploadRecording,
  type MediaAsset,
} from '../../api/media';
import {
  useExerciseAudio,
  type ExerciseAudioEngine,
} from '../../hooks/useExerciseAudio';
import { useAiVerdictWait } from '../../hooks/useAiVerdictWait';
import {
  chosenIndex,
  clockSeconds,
  clockWarns,
  COUNTDOWN_SECONDS,
  formatSeconds,
  isShort,
  left,
  micOk,
  micSilent,
  recordedCount,
  recordedShare,
  shortOnes,
  submitBlock,
  takesOf,
  toDraft,
  toSubmission,
  unsentAssets,
  type Draft,
  type RecorderConfig,
  type SubmittedRecording,
  type Take,
} from '../../lib/readAloud';
import {
  createNativeRecorder,
  useRecorder,
  type CapturedTake,
  type RecorderHandle,
  type RecorderPort,
} from '../../services/recorder';
import { ExerciseAudioPlayer } from './audio';
import { AiReviewPanel } from './AiReviewPanel';
import { ReadAloudGraded } from './ReadAloudGraded';
import type { ExerciseBodyProps } from './ExerciseBody';
import {
  Clock,
  LiveDot,
  Material,
  Meter,
  TakeRow,
  useTakePlayback,
  type TakePlayback,
  type TakeSource,
} from './ReadAloudParts';
import {
  gradedOf,
  handedInVerdict,
  openingOf,
  readReadAloudContent,
  recordingFilename,
  recordingRefusal,
  RETAKE_CODES,
  TEMPLATE_CODE,
  verifiedDraft,
  type GradedVerdict,
  type Opening,
  type ReadAloudContent,
  type RecordingRefusal,
} from './templates/readAloud';

type T = ReturnType<typeof useTranslation>['t'];
type Styles = ReturnType<typeof makeStyles>;

export interface ReadAloudBodyProps extends ExerciseBodyProps {
  /** The microphone. Tests pass a mock; the app uses the native recorder. */
  createPort?: () => RecorderPort;
}

/**
 * `read_aloud` on the phone — plan 70, phase 10 (RA-V1…V6).
 *
 * The web solver's flow, in the runner's frame: a card first, then the recorder against the
 * server — each take uploaded the moment it is made, the uploaded takes kept on the attempt's
 * draft, the hand-in to a teacher through `checkTable`. The recorder's rules are the kernel's
 * machine (`lib/readAloud`), the microphone is the Android module (Q3-A).
 *
 * After a verdict the screen is the web's: the handed-in takes and the graded card
 * (`ReadAloudGraded`) — decided 07.10, deviation 20 does not hold for this type. One thing
 * differs from the web, deliberately: **work with the teacher, or graded with no redo, closes
 * the item at once** — the runner's Continue is the way on, so the body hands the runner the
 * verdict the engine gave at hand-in. A returned task that may be recorded again stays open,
 * with «Continue» under the card.
 *
 * Two more stay open (plan 82): a reading a machine checks by itself — the screen waits for
 * its verdict, as the web does — and work nobody will listen to, which may be recorded again
 * (Q6) instead of closing for good.
 */
export function ReadAloudBody({
  display,
  disabled,
  onAnswerChange,
  checkTable,
  finishTable,
  openAttempt,
  openedContent,
  createPort = createNativeRecorder,
}: ReadAloudBodyProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const content = useMemo(
    () => readReadAloudContent(display.content),
    [display.content],
  );
  const audio = useExerciseAudio(display.content);
  const instruction =
    display.instructions?.[0]?.instructionText || content?.instruction || '';

  // The body owns the hand-in; the footer's Check never shows for it.
  useEffect(() => {
    onAnswerChange(null, false);
  }, [onAnswerChange]);

  type Stage =
    | { kind: 'loading' }
    | { kind: 'card'; opening: Opening }
    | { kind: 'opening'; opening: Opening }
    | { kind: 'error'; opening: Opening }
    | {
        kind: 'run';
        attemptId: string;
        draft: Draft | null;
        /** The projection the attempt's start answered — it knows the carried prompts. */
        content: ReadAloudContent;
      }
    | {
        kind: 'after';
        attemptId: string;
        recordings: SubmittedRecording[];
        /** How each take plays: the session's own files, or the server's asset. */
        sources: Record<string, TakeSource>;
        from: AfterStart;
      };
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });

  /** The runner hears about the item's close once. */
  const finished = useRef(false);
  const finish = (verdict: SubmitAttemptResponse) => {
    if (finished.current) return;
    finished.current = true;
    finishTable(verdict);
  };

  const exerciseId = display.id;
  const revision = content?.settings.revision ?? 'return';
  useEffect(() => {
    if (content === null) return;
    let live = true;
    void recentAttempts(exerciseId).then(rows => {
      if (!live) return;
      const opening = openingOf(rows, revision);
      const after = (from: AfterStart) =>
        opening.stage === 'sent' ||
        opening.stage === 'unread' ||
        opening.stage === 'graded'
          ? setStage({
              kind: 'after',
              attemptId: opening.attemptId,
              recordings: opening.recordings,
              sources: {},
              from,
            })
          : undefined;
      if (opening.stage === 'sent') {
        // With a teacher the item closes; the machine's verdict is worth waiting for.
        after({ kind: opening.byAi ? 'ai' : 'teacher' });
        if (!opening.byAi) finish(handedInVerdict(opening.attemptId));
      } else if (opening.stage === 'unread') {
        // Below a draft like a verdict, and open: it may be recorded again (Q6).
        after({ kind: 'unread' });
      } else if (opening.stage === 'graded') {
        after({ kind: 'graded', verdict: opening.verdict, redo: opening.redo });
        if (!opening.redo) finish(handedInVerdict(opening.attemptId));
      } else {
        setStage({ kind: 'card', opening });
      }
    });
    return () => {
      live = false;
    };
    // Looked at once per mount: a redo opens a clean attempt, not the past again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId, content === null]);

  /**
   * «Start»: the attempt is opened — or the one in progress joined — before the microphone is,
   * because every take is uploaded as an asset of it. A draft is offered back only if it is
   * this attempt's, and only the takes still in storage.
   */
  const start = (opening: Opening) => {
    setStage({ kind: 'opening', opening });
    void (async () => {
      try {
        const attemptId = await openAttempt();
        let draft: Draft | null = null;
        if (opening.stage === 'draft' && opening.attemptId === attemptId) {
          const ids = Object.values(opening.draft.takes)
            .flat()
            .map(take => take.assetId);
          const assets = new Map<string, MediaAsset | null>();
          await Promise.all(
            ids.map(id =>
              getMediaAsset(id).then(
                a => assets.set(id, a),
                () => assets.set(id, null),
              ),
            ),
          );
          draft = verifiedDraft(opening.draft, attemptId, assets);
        }
        // The start knows what the display does not: the prompts carried from the try before.
        const used = readReadAloudContent(openedContent?.()) ?? content;
        if (used === null) throw new Error('No content');
        setStage({ kind: 'run', attemptId, draft, content: used });
      } catch {
        setStage({ kind: 'error', opening });
      }
    })();
  };

  if (content === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>
          {t('exerciseRunner.readAloud.unavailable')}
        </Text>
        <Text style={styles.centerDesc}>
          {t('exerciseRunner.readAloud.unavailableDesc')}
        </Text>
      </View>
    );
  }

  const title =
    content.title.trim() || t('exerciseRunner.readAloud.defaultTitle');

  switch (stage.kind) {
    case 'loading':
    case 'opening':
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accentBase} />
        </View>
      );

    case 'error':
      return (
        <View style={styles.center}>
          <Text style={styles.centerDesc}>
            {t('exerciseRunner.readAloud.loadFailed')}
          </Text>
          <TouchableOpacity
            style={styles.primary}
            onPress={() => start(stage.opening)}
          >
            <Text style={styles.primaryText}>
              {t('exerciseRunner.readAloud.retry')}
            </Text>
          </TouchableOpacity>
        </View>
      );

    case 'card':
      return (
        <ReaderCard
          content={content}
          title={title}
          instruction={instruction}
          onStart={() => start(stage.opening)}
          t={t}
          styles={styles}
        />
      );

    case 'after':
      return (
        <AfterHandIn
          key={stage.attemptId}
          exerciseId={exerciseId}
          attemptId={stage.attemptId}
          title={title}
          content={content}
          recordings={stage.recordings}
          sourceOf={assetId =>
            stage.sources[assetId] ?? { path: null, assetId, peaks: null }
          }
          from={stage.from}
          audio={audio}
          disabled={disabled}
          onRedo={() => start({ stage: 'fresh' })}
          onFinish={finish}
          t={t}
          styles={styles}
        />
      );

    case 'run':
      return (
        <ReadAloudSession
          key={stage.attemptId}
          exerciseId={exerciseId}
          attemptId={stage.attemptId}
          content={stage.content}
          title={title}
          instruction={instruction}
          initialDraft={stage.draft}
          audio={audio}
          checkTable={checkTable}
          onDelivered={(verdict, recordings, sources) => {
            // A teacher's work closes the item at once; the machine's and nobody's stay open
            // (the wait, and «record again»).
            const from: AfterStart =
              verdict.reviewer === 'ai'
                ? { kind: 'ai' }
                : verdict.reviewer === 'none'
                ? { kind: 'unread' }
                : { kind: 'teacher' };
            setStage({
              kind: 'after',
              attemptId: verdict.attemptId,
              recordings,
              sources,
              from,
            });
            if (from.kind === 'teacher') finish(verdict);
          }}
          createPort={createPort}
          t={t}
          styles={styles}
          colors={colors}
        />
      );
  }
}

/* ── The card ───────────────────────────────────────────────────────────── */

/** §7.10 — before any attempt and before any microphone. */
function ReaderCard({
  content,
  title,
  instruction,
  onStart,
  t,
  styles,
}: {
  content: ReadAloudContent;
  title: string;
  instruction: string;
  onStart: () => void;
  t: T;
  styles: Styles;
}) {
  const { colors } = useTheme();
  const mode =
    content.mode === 'read'
      ? t('exerciseRunner.readAloud.card.modeRead')
      : content.mode === 'monologue'
      ? t('exerciseRunner.readAloud.card.modeMonologue')
      : t('exerciseRunner.readAloud.card.modeDialogue');
  const takes = content.recording.takes;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <Icon name="Microphone" size={18} color={colors.accent300} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>
            {t('exerciseRunner.readAloud.card.facts', {
              mode,
              count: content.prompts.length,
            })}
          </Text>
        </View>
      </View>
      {instruction ? (
        <Text style={styles.instruction}>{instruction}</Text>
      ) : null}
      <Text style={styles.sub}>
        {content.recording.listenBack
          ? t('exerciseRunner.readAloud.card.rulesListen', { count: takes })
          : t('exerciseRunner.readAloud.card.rules', { count: takes })}
      </Text>
      {content.prompts.length === 0 ? (
        <Text style={styles.sub}>
          {t('exerciseRunner.readAloud.noPrompts')}
        </Text>
      ) : (
        <TouchableOpacity
          style={styles.primary}
          onPress={onStart}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>
            {t('exerciseRunner.readAloud.card.start')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ── One attempt at the microphone ──────────────────────────────────────── */

interface SessionProps {
  exerciseId: string;
  attemptId: string;
  content: ReadAloudContent;
  title: string;
  instruction: string;
  initialDraft: Draft | null;
  audio: ExerciseAudioEngine;
  checkTable: ExerciseBodyProps['checkTable'];
  /** Handed in: what the engine said, what went, and how each take plays from the phone. */
  onDelivered: (
    verdict: SubmitAttemptResponse,
    recordings: SubmittedRecording[],
    sources: Record<string, TakeSource>,
  ) => void;
  createPort: () => RecorderPort;
  t: T;
  styles: Styles;
  colors: ColorScheme;
}

/**
 * The recorder against the server. A take goes up as soon as it is made, in the background
 * (plan 70 §3.4): the student listens to the file on the phone meanwhile, and the hand-in waits
 * only for the last one. Every uploaded take and the choice between them are saved on the
 * attempt's draft, so a killed app loses nothing that reached the server (RA-R10).
 */
function ReadAloudSession({
  exerciseId,
  attemptId,
  content: whole,
  title,
  instruction,
  initialDraft,
  audio,
  checkTable,
  onDelivered,
  createPort,
  t,
  styles,
  colors,
}: SessionProps) {
  const [port] = useState(createPort);
  /*
   * Prompts passed on an earlier try are not recorded again (phase 11b): the recorder, its
   * counter and the hand-in hold only the prompts still to do, and the passed ones are listed
   * above it. The server glues them back on, so the submission carries the new ones alone.
   */
  const { content, carried } = useMemo(() => {
    const passed = new Map((whole.carried ?? []).map(c => [c.itemId, c.attempt]));
    return {
      content: {
        ...whole,
        prompts: whole.prompts.filter(p => !passed.has(p.id)),
      },
      carried: whole.prompts.flatMap((p, i) => {
        const attempt = passed.get(p.id);
        return attempt === undefined
          ? []
          : [
              {
                itemId: p.id,
                label:
                  p.label.trim() ||
                  t('exerciseRunner.readAloud.promptN', { n: i + 1 }),
                attempt,
              },
            ];
      }),
    };
  }, [whole, t]);
  const config = useMemo<RecorderConfig>(
    () => ({ prompts: content.prompts, recording: content.recording }),
    [content],
  );
  /** `sent` until the body moves on to what follows the hand-in. */
  const [stage, setStage] = useState<'draft' | 'sent'>('draft');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The envelope of each take recorded here, by its file — its waveform until upload. */
  const [envelopes, setEnvelopes] = useState<Record<string, number[]>>({});
  /** Server peaks of the takes read back — restored from the draft. */
  const [peaks, setPeaks] = useState<Record<string, number[] | null>>({});
  /** The takes recorded here, kept for a retried upload. */
  const captures = useRef(new Map<string, CapturedTake>());
  const playback = useTakePlayback();

  const labelOf = (itemId: string) => {
    const i = whole.prompts.findIndex(p => p.id === itemId);
    return (
      whole.prompts[i]?.label.trim() ||
      t('exerciseRunner.readAloud.promptN', { n: i + 1 })
    );
  };

  function upload(take: CapturedTake) {
    uploadRecording({
      path: take.path,
      mimeType: take.mimeType,
      size: take.size,
      attemptId,
      filename: recordingFilename(take.itemId, take.n, take.mimeType),
    }).then(
      ({ assetId }) => recorder.uploaded(take.itemId, take.n, assetId),
      () => recorder.uploadFailed(take.itemId, take.n),
    );
  }

  const recorder = useRecorder({
    config,
    port: stage === 'draft' ? port : null,
    initialDraft,
    onCaptured: take => {
      captures.current.set(`${take.itemId}:${take.n}`, take);
      setEnvelopes(all => ({ ...all, [take.path]: take.envelope }));
      upload(take);
    },
  });
  const { state } = recorder;

  // Every uploaded take and the choice between them, onto the attempt. Keyed by the draft's
  // own content, so a level or a tick does not send it again.
  const draftKey = JSON.stringify(toDraft(state));
  const lastSaved = useRef(
    initialDraft === null ? '' : JSON.stringify(initialDraft),
  );
  useEffect(() => {
    if (stage !== 'draft' || draftKey === lastSaved.current) return;
    const draft = JSON.parse(draftKey) as Draft;
    if (Object.keys(draft.takes).length === 0 && lastSaved.current === '')
      return;
    lastSaved.current = draftKey;
    saveDraft(exerciseId, attemptId, draft).catch(() => {
      // The next change tries again; the takes themselves are already in storage.
      lastSaved.current = '';
    });
  }, [draftKey, stage, exerciseId, attemptId]);

  // The waveform of a take read back from the server — the peaks media-service computed.
  const remoteIds = Object.values(state.takes)
    .flat()
    .flatMap(take =>
      take.ref === null && take.assetId !== null ? [take.assetId] : [],
    );
  const remoteKey = remoteIds.join(',');
  useEffect(() => {
    let live = true;
    for (const id of remoteKey === '' ? [] : remoteKey.split(',')) {
      if (id in peaks) continue;
      getMediaAsset(id).then(
        a => live && setPeaks(all => ({ ...all, [id]: a.peaks ?? null })),
        () => live && setPeaks(all => ({ ...all, [id]: null })),
      );
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteKey]);

  const sourceOf = (take: Take): TakeSource => ({
    path: take.ref,
    assetId: take.assetId,
    peaks:
      take.ref !== null
        ? envelopes[take.ref] ?? null
        : take.assetId
        ? peaks[take.assetId] ?? null
        : null,
  });

  /** A handed-in take plays from the file on the phone while this session holds it. */
  const sourceOfAsset = (assetId: string): TakeSource => {
    const take = Object.values(state.takes)
      .flat()
      .find(x => x.assetId === assetId);
    return take
      ? sourceOf(take)
      : { path: null, assetId, peaks: peaks[assetId] ?? null };
  };

  function retryUpload(itemId: string, n: number) {
    const take = captures.current.get(`${itemId}:${n}`);
    if (take === undefined) return;
    recorder.uploadRetry(itemId, n);
    upload(take);
  }

  /**
   * A take the server cannot use goes, and gives its slot back (decided 06.10): its file is
   * gone or broken, or the server measured it outside the prompt's range. «Still uploading» is
   * not a refusal — the take is fine and only late.
   */
  function takeBack(refusal: RecordingRefusal, sent: SubmittedRecording[]) {
    if (!RETAKE_CODES.has(refusal.code)) return;
    for (const itemId of refusal.itemIds) {
      const assetId = sent.find(r => r.itemId === itemId)?.assetId;
      const take = state.takes[itemId]?.find(x => x.assetId === assetId);
      if (assetId === undefined || take === undefined) continue;
      recorder.refused(itemId, take.n);
      deleteMediaAsset(assetId).catch(() => undefined);
    }
  }

  function refusalText(refusal: RecordingRefusal): string {
    const labels =
      refusal.itemIds.map(labelOf).join(', ') ||
      labelOf(content.prompts[0]?.id ?? '');
    if (refusal.code === 'RA_RECORDING_NOT_READY') {
      return t('exerciseRunner.readAloud.refused.notReady', { labels });
    }
    if (refusal.code === 'RA_RECORDING_LENGTH') {
      return t('exerciseRunner.readAloud.refused.length', { labels });
    }
    return t('exerciseRunner.readAloud.refused.retake', { labels });
  }

  async function send() {
    const submission = toSubmission(state, config);
    if (submission === null || submitting) return;
    setError(null);
    setSubmitting(true);

    const delivered = (verdict: SubmitAttemptResponse) => {
      playback.stop();
      setStage('sent');
      // The takes the teacher will not hear go (DECISIONS §1); a failed delete costs nothing
      // but storage (§8 item 5).
      for (const id of unsentAssets(state, submission)) {
        deleteMediaAsset(id).catch(() => undefined);
      }
      onDelivered(
        verdict,
        submission.recordings,
        Object.fromEntries(
          submission.recordings.map(r => [r.assetId, sourceOfAsset(r.assetId)]),
        ),
      );
    };

    try {
      delivered(await checkTable(submission));
    } catch (e) {
      if (e instanceof ApiError) {
        const refusal = recordingRefusal(e.status, e.body);
        if (refusal !== null) {
          setError(refusalText(refusal));
          takeBack(refusal, submission.recordings);
          return;
        }
        if (e.status === 503) {
          setError(t('exerciseRunner.readAloud.mediaUnavailable'));
          return;
        }
      }
      // A failed request is not a failed hand-in: the engine may have taken it before the
      // answer was lost. The attempt says which.
      try {
        const row = await getAttempt(exerciseId, attemptId);
        if (row.status === 'ROUTED_FOR_REVIEW') {
          delivered(handedInVerdict(attemptId));
          return;
        }
        if (row.status === 'NO_REVIEWER') {
          delivered(handedInVerdict(attemptId, 'none'));
          return;
        }
      } catch {
        // Unknown either way — say it did not go; the draft is intact.
      }
      setError(t('exerciseRunner.readAloud.sendFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  // The body draws what follows; nothing is left to record here.
  if (stage === 'sent') return null;

  const prompt = content.prompts[state.index];
  const total = content.prompts.length;
  const busy = ['prep', 'count', 'rec', 'stopping'].includes(state.phase);

  return (
    <View style={styles.col}>
      {/* wb-run-top */}
      <View style={styles.runTop}>
        <Text style={styles.sub}>{title}</Text>
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${
                    total > 0 ? (recordedCount(state, config) / total) * 100 : 0
                  }%`,
                },
              ]}
            />
          </View>
          <Text style={styles.mono}>
            {t('exerciseRunner.readAloud.progress', {
              n: state.index + 1,
              total,
            })}
          </Text>
        </View>
      </View>

      {instruction ? (
        <Text style={styles.instruction}>{instruction}</Text>
      ) : null}

      {audio.audio.enabled ? (
        <ExerciseAudioPlayer eng={audio} interactive={!busy} />
      ) : null}

      {content.rubric && content.rubric.length > 0 ? (
        <View style={styles.guide}>
          <Text style={styles.recHead}>
            {t('exerciseRunner.readAloud.rubricGuide')}
          </Text>
          {content.rubric.map(c => (
            <Text key={c.id} style={styles.sub}>
              <Text style={styles.bold}>{c.name}</Text>
              {c.levels[3] || c.desc ? ` — ${c.levels[3] || c.desc}` : ''}
            </Text>
          ))}
        </View>
      ) : null}

      {carried.length > 0 ? (
        <View style={styles.carried}>
          <Text style={styles.carriedTitle}>
            {t('exerciseRunner.readAloud.carried.title', {
              count: carried.length,
            })}
          </Text>
          {carried.map(c => (
            <Text key={c.itemId} style={styles.carriedRow}>
              ✓ {c.label} —{' '}
              {t('exerciseRunner.readAloud.carried.inAttempt', {
                attempt: c.attempt,
              })}
            </Text>
          ))}
        </View>
      ) : null}

      {prompt ? (
        <>
          {total > 1 ? (
            <Text style={styles.promptLabel}>{labelOf(prompt.id)}</Text>
          ) : null}
          <Material mode={content.mode} prompt={prompt} />
          <RecorderCard
            recorder={recorder}
            config={config}
            content={content}
            playback={playback}
            sourceOf={sourceOf}
            onRetryUpload={retryUpload}
            t={t}
            styles={styles}
            colors={colors}
          />
        </>
      ) : null}

      {total > 1 ? (
        <View style={styles.nav}>
          <TouchableOpacity
            style={[
              styles.ghost,
              styles.flex,
              (busy || state.index === 0) && styles.dim,
            ]}
            disabled={busy || state.index === 0}
            onPress={() => recorder.goto(state.index - 1)}
          >
            <Text style={styles.ghostText}>
              ← {t('exerciseRunner.readAloud.prev')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.ghost,
              styles.flex,
              (busy || state.index >= total - 1) && styles.dim,
            ]}
            disabled={busy || state.index >= total - 1}
            onPress={() => recorder.goto(state.index + 1)}
          >
            <Text style={styles.ghostText}>
              {t('exerciseRunner.readAloud.next')} →
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <SubmitActions
        recorder={recorder}
        config={config}
        labelOf={labelOf}
        busy={busy}
        submitting={submitting}
        error={error}
        onSubmit={() => void send()}
        t={t}
        styles={styles}
      />
    </View>
  );
}

/* ── The recorder card (`ra-rec`) ───────────────────────────────────────── */

function RecorderCard({
  recorder,
  config,
  content,
  playback,
  sourceOf,
  onRetryUpload,
  t,
  styles,
  colors,
}: {
  recorder: RecorderHandle;
  config: RecorderConfig;
  content: ReadAloudContent;
  playback: TakePlayback;
  sourceOf: (take: Take) => TakeSource;
  onRetryUpload: (itemId: string, n: number) => void;
  t: T;
  styles: Styles;
  colors: ColorScheme;
}) {
  const { state, levels } = recorder;
  const { phase } = state;
  const prompt = config.prompts[state.index];
  const rec = content.recording;
  if (!prompt) return null;

  const frame =
    phase === 'rec' || phase === 'stopping'
      ? styles.recLive
      : phase === 'prep' || phase === 'count'
      ? styles.recPrep
      : null;

  let body: React.ReactNode;
  if (phase === 'mic') {
    const ok = micOk(state);
    body = (
      <>
        <Text style={styles.recHead}>
          {t('exerciseRunner.readAloud.mic.head')}
        </Text>
        <Text style={styles.sub}>{t('exerciseRunner.readAloud.mic.hint')}</Text>
        <Meter levels={levels} live={false} />
        {ok ? (
          <View style={[styles.msg, styles.msgOk]}>
            <Text style={styles.msgOkText}>
              ✓ {t('exerciseRunner.readAloud.mic.ok')}
            </Text>
          </View>
        ) : micSilent(state) ? (
          <View style={styles.msg}>
            <Text style={styles.msgText}>
              {t('exerciseRunner.readAloud.mic.silent')}
            </Text>
          </View>
        ) : null}
        <TouchableOpacity style={styles.recGhost} onPress={recorder.ready}>
          <Text style={styles.recGhostText}>
            {t('exerciseRunner.readAloud.mic.ready')}
          </Text>
        </TouchableOpacity>
      </>
    );
  } else if (phase === 'denied' || phase === 'noDevice') {
    body = (
      <>
        <Text style={styles.recHead}>
          {t('exerciseRunner.readAloud.mic.head')}
        </Text>
        <View style={[styles.msg, styles.msgError]}>
          <Text style={styles.msgErrorText}>
            {phase === 'denied'
              ? t('exerciseRunner.readAloud.mic.denied')
              : t('exerciseRunner.readAloud.mic.noDevice')}
          </Text>
        </View>
        <TouchableOpacity style={styles.recGhost} onPress={recorder.retryMic}>
          <Text style={styles.recGhostText}>
            {t('exerciseRunner.readAloud.retry')}
          </Text>
        </TouchableOpacity>
      </>
    );
  } else if (phase === 'prep' || phase === 'count') {
    body = (
      <>
        <Text style={styles.recHead}>
          {t('exerciseRunner.readAloud.prep.head')}
        </Text>
        {phase === 'prep' ? (
          <Clock seconds={clockSeconds(state, prompt)} warn />
        ) : (
          <Text
            style={[styles.countdown, { color: colors.neutral300 }]}
            accessibilityLiveRegion="assertive"
          >
            {Math.max(1, COUNTDOWN_SECONDS - state.t)}
          </Text>
        )}
        <Text style={styles.clockSub}>
          {phase !== 'prep'
            ? t('exerciseRunner.readAloud.countSub')
            : content.mode === 'read'
            ? t('exerciseRunner.readAloud.prep.subRead')
            : content.mode === 'monologue'
            ? t('exerciseRunner.readAloud.prep.subMonologue')
            : t('exerciseRunner.readAloud.prep.subDialogue')}
        </Text>
        {phase === 'prep' ? (
          <TouchableOpacity style={styles.recBtn} onPress={recorder.startNow}>
            <View style={styles.recDot} />
            <Text style={styles.recBtnText}>
              {t('exerciseRunner.readAloud.prep.startNow')}
            </Text>
          </TouchableOpacity>
        ) : null}
      </>
    );
  } else if (phase === 'rec' || phase === 'stopping') {
    body = (
      <>
        <View style={styles.recHeadRow}>
          <View style={styles.liveHead}>
            <LiveDot />
            <Text style={[styles.recHead, { color: colors.neutral400 }]}>
              {t('exerciseRunner.readAloud.rec.head')}
            </Text>
          </View>
          <Text style={styles.mono}>
            {t('exerciseRunner.readAloud.rec.max', {
              time: formatSeconds(prompt.maxSeconds),
            })}
          </Text>
        </View>
        <Clock
          seconds={clockSeconds(state, prompt)}
          warn={clockWarns(state, prompt)}
        />
        <Meter levels={levels} live />
        <View style={styles.limitTrack}>
          <View
            style={[
              styles.limitFill,
              { width: `${recordedShare(state, prompt) * 100}%` },
            ]}
          />
        </View>
        <TouchableOpacity
          style={[
            styles.recBtn,
            styles.stopBtn,
            phase === 'stopping' && styles.dim,
          ]}
          onPress={recorder.stop}
          disabled={phase === 'stopping'}
        >
          <View style={styles.stopSquare} />
          <Text style={styles.recBtnText}>
            {t('exerciseRunner.readAloud.rec.stop')}
          </Text>
        </TouchableOpacity>
      </>
    );
  } else {
    // idle / review
    const own = takesOf(state, prompt.id);
    const pick = chosenIndex(state, config, prompt.id);
    const remaining = left(state, config, prompt.id);
    const chosen = own[pick];
    const short = chosen !== undefined && isShort(chosen, prompt);
    body = (
      <>
        <View style={styles.recHeadRow}>
          <Text style={styles.recHead}>
            {t('exerciseRunner.readAloud.idle.head', {
              n: own.length,
              total: rec.takes,
            })}
          </Text>
          <Text style={styles.mono}>
            {t('exerciseRunner.readAloud.idle.range', {
              min: formatSeconds(prompt.minSeconds),
              max: formatSeconds(prompt.maxSeconds),
            })}
          </Text>
        </View>

        {state.notice === 'interrupted' ? (
          <View style={[styles.msg, styles.msgError]}>
            <Text style={styles.msgErrorText}>
              {t('exerciseRunner.readAloud.interrupted')}
            </Text>
          </View>
        ) : null}

        {own.length > 0 && rec.listenBack ? (
          <View
            style={styles.takes}
            accessibilityRole={rec.chooseBest ? 'radiogroup' : undefined}
          >
            {own.map((take, i) => {
              // By place, not by `n`: a refused take leaves a gap in the numbers.
              const label = t('exerciseRunner.readAloud.takeLabel', {
                n: i + 1,
              });
              return (
                <View key={take.n} style={styles.takeWrap}>
                  <TakeRow
                    n={i + 1}
                    label={label}
                    seconds={take.seconds}
                    source={sourceOf(take)}
                    playKey={`${prompt.id}:${take.n}`}
                    playback={playback}
                    selected={rec.chooseBest && pick === i}
                    {...(rec.chooseBest
                      ? { onChoose: () => recorder.choose(i) }
                      : {})}
                    uploading={take.upload === 'pending'}
                    interactive
                  />
                  {take.upload === 'failed' ? (
                    <UploadFailed
                      canRetry={take.ref !== null}
                      onRetry={() => onRetryUpload(prompt.id, take.n)}
                      t={t}
                      styles={styles}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : own.length > 0 ? (
          <>
            <Text style={styles.clockSub}>
              {t('exerciseRunner.readAloud.noListenBack')}
            </Text>
            {own
              .filter(take => take.upload === 'failed')
              .map(take => (
                <UploadFailed
                  key={take.n}
                  canRetry={take.ref !== null}
                  onRetry={() => onRetryUpload(prompt.id, take.n)}
                  t={t}
                  styles={styles}
                />
              ))}
          </>
        ) : null}

        {short ? (
          <View style={[styles.msg, styles.msgError]}>
            <Text style={styles.msgErrorText}>
              {t('exerciseRunner.readAloud.short', {
                min: formatSeconds(prompt.minSeconds),
              })}
            </Text>
          </View>
        ) : null}

        {remaining > 0 ? (
          <TouchableOpacity
            style={styles.recBtn}
            onPress={recorder.begin}
            accessibilityRole="button"
          >
            <View style={styles.recDot} />
            <Text style={styles.recBtnText}>
              {own.length > 0
                ? t('exerciseRunner.readAloud.again', { left: remaining })
                : t('exerciseRunner.readAloud.start')}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.msg}>
            <Text style={styles.msgText}>
              {t('exerciseRunner.readAloud.spent', { count: rec.takes })}
            </Text>
          </View>
        )}
        {rec.chooseBest && own.length > 1 ? (
          <Text style={styles.clockSub}>
            {t('exerciseRunner.readAloud.chosenNote')}
          </Text>
        ) : null}
      </>
    );
  }

  return <View style={[styles.rec, frame]}>{body}</View>;
}

function UploadFailed({
  canRetry,
  onRetry,
  t,
  styles,
}: {
  canRetry: boolean;
  onRetry: () => void;
  t: T;
  styles: Styles;
}) {
  return (
    <View style={styles.failedRow}>
      <Text style={styles.msgErrorText}>
        {t('exerciseRunner.readAloud.uploadFailed')}
      </Text>
      {canRetry ? (
        <TouchableOpacity onPress={onRetry} accessibilityRole="button">
          <Text style={styles.link}>{t('exerciseRunner.readAloud.retry')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** `wb-run-actions`: the hand-in, and the line that says why it is off (DECISIONS §7, RA-R7). */
function SubmitActions({
  recorder,
  config,
  labelOf,
  busy,
  submitting,
  error,
  onSubmit,
  t,
  styles,
}: {
  recorder: RecorderHandle;
  config: RecorderConfig;
  labelOf: (id: string) => string;
  busy: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
  t: T;
  styles: Styles;
}) {
  const { state } = recorder;
  const block = submitBlock(state, config);
  const note =
    block === 'unrecorded'
      ? t('exerciseRunner.readAloud.left', {
          count: config.prompts.length - recordedCount(state, config),
        })
      : block === 'short'
      ? t('exerciseRunner.readAloud.tooShort', {
          labels: shortOnes(state, config).map(labelOf).join(', '),
        })
      : block === 'uploading'
      ? t('exerciseRunner.readAloud.uploading')
      : t('exerciseRunner.readAloud.readByTeacher');
  const off = block !== null || busy || submitting;

  return (
    <View style={styles.actions}>
      <TouchableOpacity
        style={[styles.primary, off && styles.dim]}
        disabled={off}
        onPress={onSubmit}
        accessibilityRole="button"
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.primaryText}>
            {t('exerciseRunner.readAloud.submit')}
          </Text>
        )}
      </TouchableOpacity>
      <Text style={styles.note}>{note}</Text>
      {error !== null ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/* ── After the hand-in ──────────────────────────────────────────────────── */

/**
 * Where the work stands once handed in: with a teacher; with the machine, whose verdict is
 * awaited (plan 82); with nobody (`NO_REVIEWER`); or graded.
 */
type AfterStart =
  | { kind: 'teacher' }
  | { kind: 'ai' }
  | { kind: 'unread' }
  | { kind: 'graded'; verdict: GradedVerdict; redo: boolean };

type After =
  | Exclude<AfterStart, { kind: 'unread' }>
  /** `dropped` — the machine was asked and could not check it, not «nobody to ask». */
  | { kind: 'unread'; dropped: boolean };

/**
 * The handed-in takes and what follows them.
 *
 * The machine's verdict is waited for on the attempt handed in (`useAiVerdictWait`, as the
 * runner does for text): it arrives as a verdict — the graded card with the machine's check in
 * place of the rubric — or as `NO_REVIEWER`. Whatever leaves the item open offers «Continue»,
 * the runner's footer being the body's own: during the wait (the verdict still lands here),
 * under a return that may be recorded again, and under work nobody listened to, which may be
 * recorded again (Q6 — on the web since plan 79, 2.1d).
 */
function AfterHandIn({
  exerciseId,
  attemptId,
  title,
  content,
  recordings,
  sourceOf,
  from,
  audio,
  disabled,
  onRedo,
  onFinish,
  t,
  styles,
}: {
  exerciseId: string;
  attemptId: string;
  title: string;
  content: ReadAloudContent;
  recordings: SubmittedRecording[];
  sourceOf: (assetId: string) => TakeSource;
  from: AfterStart;
  audio: ExerciseAudioEngine;
  disabled: boolean;
  onRedo: () => void;
  onFinish: (verdict: SubmitAttemptResponse) => void;
  t: T;
  styles: Styles;
}) {
  const { colors } = useTheme();
  const [after, setAfter] = useState<After>(
    from.kind === 'unread' ? { kind: 'unread', dropped: false } : from,
  );
  const revision = content.settings.revision;
  const { wait, again } = useAiVerdictWait(
    exerciseId,
    after.kind === 'ai' ? attemptId : null,
  );

  useEffect(() => {
    if (wait?.state !== 'settled') return;
    const { attempt } = wait;
    if (attempt.status === 'NO_REVIEWER') {
      setAfter({ kind: 'unread', dropped: true });
      return;
    }
    const graded = gradedOf(attempt, revision);
    setAfter({ kind: 'graded', ...graded });
    if (!graded.redo) onFinish(handedInVerdict(attemptId));
    // Settles once per attempt; the callback is the body's and stable in effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wait]);

  const skip = (reviewer?: 'none') =>
    disabled ? null : (
      <TouchableOpacity
        style={styles.ghost}
        onPress={() => onFinish(handedInVerdict(attemptId, reviewer))}
      >
        <Text style={styles.ghostText}>
          {t('exerciseRunner.readAloud.graded.skip')}
        </Text>
      </TouchableOpacity>
    );

  if (after.kind === 'graded') {
    const { verdict, redo } = after;
    return (
      <SentView
        title={title}
        recordings={recordings}
        content={content}
        sourceOf={sourceOf}
        byAi={verdict.byAi}
        graded={(playback, labelOf, sourceOfTake) => (
          <>
            <ReadAloudGraded
              verdict={verdict}
              revision={revision}
              showRubric={content.settings.showRubric}
              showModel={content.settings.showModel}
              recordings={recordings}
              labelOf={labelOf}
              sourceOf={sourceOfTake}
              playback={playback}
              {...(audio.audio.enabled ? { onPlayModel: audio.toggle } : {})}
              {...(redo && !disabled ? { onRedo } : {})}
              {...(verdict.byAi
                ? {
                    aiReview: (
                      <AiReviewPanel
                        exerciseId={exerciseId}
                        attemptId={attemptId}
                        templateCode={TEMPLATE_CODE}
                        criteria={new Map()}
                        promptLabel={labelOf}
                        passageOf={itemId =>
                          content.prompts.find(p => p.id === itemId)?.text ??
                          null
                        }
                      />
                    ),
                  }
                : {})}
            />
            {/* The redo keeps the item open; «Continue» is the way past it without one. */}
            {redo ? skip() : null}
          </>
        )}
        t={t}
        styles={styles}
      />
    );
  }

  if (after.kind === 'unread') {
    return (
      <SentView
        title={title}
        recordings={recordings}
        content={content}
        sourceOf={sourceOf}
        unread
        notice={
          <>
            <Text style={styles.sentText}>
              <Text style={styles.bold}>
                {t('exerciseRunner.readAloud.unreadTitle')}
              </Text>{' '}
              {after.dropped
                ? t('exerciseRunner.readAloud.droppedBody')
                : t('exerciseRunner.readAloud.unreadBody')}
            </Text>
            {disabled ? null : (
              <TouchableOpacity
                style={styles.primary}
                onPress={onRedo}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>
                  ↻ {t('exerciseRunner.readAloud.graded.redo')}
                </Text>
              </TouchableOpacity>
            )}
            {skip('none')}
          </>
        }
        t={t}
        styles={styles}
      />
    );
  }

  if (after.kind === 'ai') {
    const slow = wait?.state === 'slow';
    return (
      <SentView
        title={title}
        recordings={recordings}
        content={content}
        sourceOf={sourceOf}
        byAi
        notice={
          <>
            <View style={styles.waitRow}>
              {slow ? null : (
                <ActivityIndicator size="small" color={colors.accentBase} />
              )}
              <Text style={[styles.sentText, styles.flex]}>
                <Text style={styles.bold}>
                  {t('exerciseRunner.readAloud.aiTitle')}
                </Text>{' '}
                {slow
                  ? t('exerciseRunner.readAloud.aiSlow')
                  : t('exerciseRunner.readAloud.aiBody')}
              </Text>
            </View>
            {slow ? (
              <TouchableOpacity style={styles.ghost} onPress={again}>
                <Text style={styles.ghostText}>
                  {t('exerciseRunner.aiReview.askAgain')}
                </Text>
              </TouchableOpacity>
            ) : null}
            {skip()}
          </>
        }
        t={t}
        styles={styles}
      />
    );
  }

  return (
    <SentView
      title={title}
      recordings={recordings}
      content={content}
      sourceOf={sourceOf}
      t={t}
      styles={styles}
    />
  );
}

/**
 * `ra-steps`: recorded · with the teacher · graded. With `byAi` the machine checks the reading
 * by itself (plan 82): the same bars, its own words.
 */
function ReviewSteps({
  graded = false,
  byAi = false,
  t,
  styles,
}: {
  graded?: boolean;
  byAi?: boolean;
  t: T;
  styles: Styles;
}) {
  return (
    <View style={styles.steps}>
      <View style={[styles.stepBar, styles.stepDone]} />
      <View
        style={[styles.stepBar, graded ? styles.stepDone : styles.stepNow]}
      />
      <View style={[styles.stepBar, graded ? styles.stepNow : null]} />
      <Text style={styles.mono}>
        {graded
          ? t('exerciseRunner.readAloud.steps.graded')
          : byAi
          ? t('exerciseRunner.readAloud.steps.atAi')
          : t('exerciseRunner.readAloud.steps.atTeacher')}
      </Text>
    </View>
  );
}

/** «hos læreren»: the takes handed in, and «Levert.» (RA-R11). */
function SentView({
  title,
  recordings,
  content,
  sourceOf: given,
  playback: givenPlayback,
  graded,
  unread = false,
  byAi = false,
  notice,
  t,
  styles,
}: {
  title: string;
  recordings: SubmittedRecording[];
  content: ReadAloudContent;
  sourceOf: (assetId: string) => TakeSource;
  playback?: TakePlayback;
  /** The teacher's verdict, drawn under the handed-in takes in place of «Levert.». */
  graded?: (
    playback: TakePlayback,
    labelOf: (itemId: string) => string,
    sourceOf: (assetId: string) => TakeSource,
  ) => React.ReactNode;
  /** Handed in with nobody to listen (plan 79, step 2.1c): no «with the teacher» step. */
  unread?: boolean;
  /** The machine checks it, not a teacher (plan 82). */
  byAi?: boolean;
  /** In place of «Levert.»: the machine's wait, or why nobody listens. */
  notice?: React.ReactNode;
  t: T;
  styles: Styles;
}) {
  const own = useTakePlayback();
  const playback = givenPlayback ?? own;
  // The waveform of a handed-in take: the peaks media-service computed on ingest.
  const [peaks, setPeaks] = useState<Record<string, number[] | null>>({});
  const idsKey = recordings.map(r => r.assetId).join(',');
  useEffect(() => {
    let live = true;
    for (const id of idsKey === '' ? [] : idsKey.split(',')) {
      getMediaAsset(id).then(
        a => live && setPeaks(all => ({ ...all, [id]: a.peaks ?? null })),
        () => undefined,
      );
    }
    return () => {
      live = false;
    };
  }, [idsKey]);
  const sourceOf = (assetId: string): TakeSource => {
    const source = given(assetId);
    return source.peaks !== null
      ? source
      : { ...source, peaks: peaks[assetId] ?? null };
  };
  const labelOf = (itemId: string) => {
    const i = content.prompts.findIndex(p => p.id === itemId);
    return (
      content.prompts[i]?.label.trim() ||
      t('exerciseRunner.readAloud.promptN', { n: i + 1 })
    );
  };
  return (
    <View style={styles.col}>
      <Text style={styles.title}>{title}</Text>
      {unread ? null : (
        <ReviewSteps
          graded={graded !== undefined}
          byAi={byAi}
          t={t}
          styles={styles}
        />
      )}
      <View style={styles.takes}>
        {recordings.map((r, i) => {
          const label = labelOf(r.itemId);
          return (
            <TakeRow
              key={r.assetId}
              n={i + 1}
              label={t('exerciseRunner.readAloud.submittedTake', { label })}
              seconds={r.seconds}
              source={sourceOf(r.assetId)}
              playKey={r.assetId}
              playback={playback}
              interactive
            />
          );
        })}
      </View>
      {graded !== undefined ? (
        graded(playback, labelOf, sourceOf)
      ) : notice !== undefined ? (
        <View style={styles.sent}>{notice}</View>
      ) : (
        <View style={styles.sent}>
          <Text style={styles.sentText}>
            <Text style={styles.bold}>
              {t('exerciseRunner.readAloud.sentTitle')}
            </Text>{' '}
            {t('exerciseRunner.readAloud.sentBody')}
          </Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    col: { gap: 12 },
    flex: { flex: 1 },
    dim: { opacity: 0.45 },
    bold: { fontWeight: '500' },
    center: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
      gap: 10,
    },
    centerTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      textAlign: 'center',
    },
    centerDesc: {
      fontSize: 13,
      color: colors.neutral500,
      textAlign: 'center',
      lineHeight: 19,
    },
    title: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
    },
    sub: {
      fontSize: 13,
      color: colors.neutral400,
      lineHeight: 18,
    },
    instruction: {
      fontSize: 15,
      color: colors.text,
      lineHeight: 21,
    },
    mono: {
      fontFamily: 'monospace',
      fontSize: 11,
      color: colors.neutral500,
    },
    card: {
      gap: 12,
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.neutral800,
      backgroundColor: colors.surface,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    cardIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.accent900,
      alignItems: 'center',
      justifyContent: 'center',
    },
    runTop: { gap: 6 },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    progressTrack: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.neutral800,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.accentBase,
    },
    guide: {
      gap: 4,
      padding: 12,
      borderRadius: 10,
      backgroundColor: colors.surface,
    },
    carried: {
      gap: 4,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.accentBase,
      backgroundColor: colors.surface,
    },
    carriedTitle: { fontWeight: '500', color: colors.accent300 },
    carriedRow: { fontSize: 13, color: colors.accent300 },
    promptLabel: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.neutral400,
    },
    rec: {
      gap: 12,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.neutral800,
      backgroundColor: colors.surface,
    },
    recLive: {
      borderColor: colors.neutral600,
      borderWidth: 2,
    },
    recPrep: {
      borderColor: colors.accent700,
      borderWidth: 2,
    },
    recHeadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    liveHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    recHead: {
      fontSize: 11,
      fontWeight: '500',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.neutral500,
    },
    countdown: {
      fontFamily: 'monospace',
      fontSize: 28,
      fontWeight: '500',
      textAlign: 'center',
    },
    clockSub: {
      fontSize: 12,
      color: colors.neutral500,
      textAlign: 'center',
    },
    limitTrack: {
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.neutral800,
      overflow: 'hidden',
    },
    limitFill: {
      height: '100%',
      backgroundColor: colors.neutral600,
    },
    recBtn: {
      minHeight: 52,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.accentBase,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 16,
    },
    stopBtn: {
      borderColor: colors.neutral600,
    },
    recDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.accentBase,
    },
    stopSquare: {
      width: 12,
      height: 12,
      borderRadius: 2,
      backgroundColor: colors.text,
    },
    recBtnText: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.accent300,
    },
    recGhost: {
      minHeight: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.neutral800,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recGhostText: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.text,
    },
    msg: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: colors.surface,
    },
    msgText: {
      fontSize: 13,
      color: colors.neutral400,
    },
    msgOk: {
      backgroundColor: colors.accent900,
    },
    msgOkText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.accent300,
    },
    msgError: {
      backgroundColor: 'transparent',
    },
    msgErrorText: {
      fontSize: 13,
      color: colors.neutral400,
    },
    takes: { gap: 7 },
    takeWrap: { gap: 4 },
    failedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
    },
    link: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.neutral400,
      textDecorationLine: 'underline',
    },
    nav: {
      flexDirection: 'row',
      gap: 10,
    },
    ghost: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.neutral800,
      paddingVertical: 12,
      alignItems: 'center',
    },
    ghostText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
    },
    actions: { gap: 8 },
    primary: {
      borderWidth: 1,
      borderColor: colors.accentBase,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 20,
      alignItems: 'center',
      alignSelf: 'stretch',
    },
    primaryText: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.accent300,
    },
    note: {
      fontSize: 12,
      color: colors.neutral500,
      textAlign: 'center',
    },
    error: {
      fontSize: 13,
      color: colors.neutral400,
      textAlign: 'center',
    },
    waitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    steps: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    stepBar: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.neutral800,
    },
    stepDone: { backgroundColor: colors.accentBase },
    stepNow: { backgroundColor: colors.accentBase },
    sent: {
      gap: 10,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.accentBase,
      backgroundColor: colors.accent900,
    },
    sentText: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
    },
  });
