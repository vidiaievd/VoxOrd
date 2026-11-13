import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { deleteMediaAsset, fetchMediaAsset, uploadRecording } from '../../api/media';
import type { PrecheckResult } from '../../api/precheck';
import type { TextProsody } from '../../api/prosody';
import { checkSentence } from '../../api/sentenceCheck';
import { ProsodyText } from '../../components/prosody/ProsodyText';
import { useTranslation } from '../../i18n';
import { splitSentences } from '../../kernel/text';
import { useTheme } from '../../providers/ThemeProvider';
import type { RecorderPort } from '../../services/recorder';
import type { ProsodyLens } from '../../store/settingsStore';
import type { ColorScheme } from '../../theme/colors';
import { PrecheckPanel } from './PrecheckPanel';
import { recordingFilename } from './templates/readAloud';

type Phase = 'idle' | 'rec' | 'sending' | 'closing';

/** media-service makes the speech variant after finalize; the model hears nothing before it. */
const READY_POLL_MS = 700;
const READY_POLLS = 30;
const SETTLED = new Set(['READY', 'FAILED', 'DELETED']);

/**
 * Wait until media-service has finished with an upload. Resolves in any case — a failed or
 * slow one is for the engine to name, and its answer says «not ready» in the learner's words.
 */
async function untilProcessed(assetId: string): Promise<void> {
  for (let i = 0; i < READY_POLLS; i++) {
    try {
      const asset = await fetchMediaAsset(assetId);
      if (asset.status === undefined || SETTLED.has(asset.status)) return;
    } catch {
      return;
    }
    await new Promise<void>(resolve => setTimeout(resolve, READY_POLL_MS));
  }
}

export interface ReadAloudSentenceDrillProps {
  exerciseId: string;
  attemptId: string;
  /** The prompt the sentences are of. */
  prompt: { id: string; text: string };
  /** The layer made for exactly this passage; without it the sentence is drawn plain. */
  prosody?: TextProsody;
  /** The lens the sentence is drawn in; `null` — plain. */
  lens: ProsodyLens | null;
  /** A fresh microphone for one take: the session's own recorder is not shared. */
  createPort: () => RecorderPort;
  /** The passage itself is being recorded: the microphone is not free. */
  micBusy: boolean;
}

/**
 * One sentence of a reading at a time, said and heard on its own (platform plan 86, step 7e.2).
 *
 * A try, not a take: the recording goes up as a `submission_recording` of this attempt, the
 * engine has a model hear it, the answer is drawn by the rehearsal's panel and the recording is
 * deleted at once — it is never handed in. Nothing about the attempt moves. The microphone is
 * the card's own, opened for one take and released after it. 403 (the school switched checks
 * off) and 409 (the work is handed in) are final and take the button away; anything else leaves
 * it, with a line to try again.
 */
export function ReadAloudSentenceDrill({
  exerciseId,
  attemptId,
  prompt,
  prosody,
  lens,
  createPort,
  micBusy,
}: ReadAloudSentenceDrillProps) {
  const { t, language } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const sentences = useMemo(() => splitSentences(prompt.text), [prompt.text]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<PrecheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const port = useRef<RecorderPort | null>(null);

  useEffect(
    () => () => {
      port.current?.cancel();
      port.current?.close();
      port.current = null;
    },
    [],
  );

  const sentence = sentences[Math.min(index, sentences.length - 1)];
  if (sentence === undefined) return null;
  const text = prompt.text.slice(sentence.s, sentence.e);
  const layered = prosody !== undefined && prosody.text === prompt.text && lens !== null;

  function go(to: number) {
    if (phase !== 'idle') return;
    setIndex(to);
    setResult(null);
    setError(null);
  }

  async function begin() {
    setError(null);
    setResult(null);
    const next = createPort();
    const opened = await next.open();
    if (opened !== 'ok') {
      next.close();
      setError(t(opened === 'denied' ? 'prosody.drill.micDenied' : 'prosody.drill.micMissing'));
      return;
    }
    if ((await next.start()) !== 'ok') {
      next.close();
      setError(t('prosody.drill.micMissing'));
      return;
    }
    port.current = next;
    setPhase('rec');
  }

  async function finish() {
    const active = port.current;
    if (active === null) return;
    setPhase('sending');
    let assetId: string | null = null;
    try {
      const capture = await active.stop();
      if (capture === null) throw new Error('No take');
      ({ assetId } = await uploadRecording({
        path: capture.path,
        mimeType: capture.mimeType,
        size: capture.size,
        attemptId,
        filename: recordingFilename(prompt.id, 0, capture.mimeType),
      }));
      setPhase('closing');
      await untilProcessed(assetId);
      setResult(
        await checkSentence(exerciseId, attemptId, {
          itemId: prompt.id,
          sentence: text,
          recordingAssetId: assetId,
          explanationLanguage: language,
        }),
      );
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 409)) setClosed(true);
      else setError(t('prosody.drill.failed'));
    } finally {
      // A try is not a hand-in: the recording never stays, and a failed delete costs storage only.
      if (assetId !== null) deleteMediaAsset(assetId).catch(() => undefined);
      active.close();
      port.current = null;
      setPhase('idle');
    }
  }

  const recording = phase === 'rec';
  const working = phase === 'sending' || phase === 'closing';
  const off = micBusy && !recording;

  return (
    <View style={styles.card}>
      <Text style={styles.position}>
        {t('prosody.drill.position', { n: index + 1, total: sentences.length })}
      </Text>
      <View accessibilityLabel={text}>
        {layered && prosody !== undefined ? (
          <ProsodyText
            text={text}
            layer={prosody.layer}
            sounds={prosody.sounds}
            lens={lens}
            tokenOffset={sentence.first}
            fontSize={18}
            color={colors.text}
          />
        ) : (
          <Text style={styles.sentence}>{text}</Text>
        )}
      </View>

      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('prosody.drill.previous')}
          disabled={index === 0 || phase !== 'idle'}
          onPress={() => go(index - 1)}
          style={[styles.step, (index === 0 || phase !== 'idle') && styles.off]}
        >
          <Text style={styles.stepText}>‹</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('prosody.drill.next')}
          disabled={index >= sentences.length - 1 || phase !== 'idle'}
          onPress={() => go(index + 1)}
          style={[styles.step, (index >= sentences.length - 1 || phase !== 'idle') && styles.off]}
        >
          <Text style={styles.stepText}>›</Text>
        </Pressable>
      </View>

      {closed ? (
        <Text style={styles.note}>{t('prosody.drill.closed')}</Text>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(recording ? 'prosody.drill.stop' : 'prosody.drill.say')}
            disabled={off || working}
            onPress={() => (recording ? finish() : begin())}
            style={[styles.say, (off || working) && styles.off]}
          >
            {working ? (
              <View style={styles.sayRow}>
                <ActivityIndicator size="small" color={colors.accentBase} />
                <Text style={styles.sayText}>
                  {t(phase === 'sending' ? 'prosody.drill.sending' : 'prosody.drill.checking')}
                </Text>
              </View>
            ) : (
              <Text style={styles.sayText}>
                {t(recording ? 'prosody.drill.stop' : 'prosody.drill.say')}
              </Text>
            )}
          </Pressable>
          {off ? <Text style={styles.note}>{t('prosody.drill.busy')}</Text> : null}
          {error !== null ? <Text style={styles.note}>{error}</Text> : null}
        </>
      )}

      {result !== null ? <PrecheckPanel result={result} /> : null}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    card: {
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.neutral800,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 12,
    },
    position: { fontSize: 12, color: colors.neutral500 },
    sentence: { fontSize: 18, lineHeight: 26, color: colors.text },
    nav: { flexDirection: 'row', gap: 10 },
    step: {
      minWidth: 48,
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.neutral800,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepText: { fontSize: 22, color: colors.text },
    say: {
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.accentBase,
      minHeight: 44,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sayText: { fontSize: 15, fontWeight: '500', color: colors.accentBase },
    off: { opacity: 0.5 },
    note: { fontSize: 13, color: colors.neutral400, lineHeight: 18 },
  });
