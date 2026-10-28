import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Sound from 'react-native-sound';
import { Icon } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { getMediaAsset, type MediaAsset } from '../../api/media';
import { formatSeconds, type Mode } from '../../lib/readAloud';
import { bucketPeaks } from '../../services/recorder';
import type { ReadAloudPrompt } from './templates/readAloud';

/** Bars in a take's waveform (`ra-wave`). */
const WAVE_BARS = 28;

/* ── Playback ───────────────────────────────────────────────────────────── */

/** Where a take's sound comes from: the file on this phone, or the asset on the server. */
export interface TakeSource {
  /** The file the recorder wrote, while this session holds it. */
  path: string | null;
  /** The uploaded asset — played by a just-in-time signed URL when there is no file. */
  assetId: string | null;
  /** Loudness to draw: the recorder's envelope, or the server's peaks. */
  peaks: number[] | null;
}

export interface TakePlayback {
  /** The take playing or loading, by the key it was started with. */
  key: string | null;
  loading: boolean;
  /** 0..1 through the take playing. */
  progress: number;
  toggle: (key: string, source: TakeSource) => void;
  stop: () => void;
}

/**
 * One take at a time, through `react-native-sound` — the player behind every `ra-take` on the
 * screen. A file recorded here plays from disk; a take restored from the draft or handed in
 * plays from media-service, its URL fetched just before playing because a signed URL lives an
 * hour (`api/media.ts`).
 */
export function useTakePlayback(): TakePlayback {
  const [key, setKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const sound = useRef<Sound | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const seq = useRef(0);

  const stop = useCallback(() => {
    seq.current += 1;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    sound.current?.stop();
    sound.current?.release();
    sound.current = null;
    setKey(null);
    setLoading(false);
    setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  const toggle = useCallback(
    (next: string, source: TakeSource) => {
      if (key === next) {
        stop();
        return;
      }
      stop();
      const mine = seq.current;
      setKey(next);
      setLoading(true);
      void (async () => {
        let src = source.path;
        if (src === null && source.assetId !== null) {
          try {
            src = (await getMediaAsset(source.assetId)).url;
          } catch {
            src = null;
          }
        }
        if (mine !== seq.current) return;
        if (!src) {
          stop();
          return;
        }
        const s = new Sound(src, undefined, error => {
          if (mine !== seq.current) {
            s.release();
            return;
          }
          if (error) {
            s.release();
            stop();
            return;
          }
          sound.current = s;
          setLoading(false);
          const duration = s.getDuration();
          timer.current = setInterval(() => {
            s.getCurrentTime(at => {
              if (mine === seq.current && duration > 0)
                setProgress(Math.min(1, at / duration));
            });
          }, 100);
          s.play(() => {
            if (mine === seq.current) stop();
          });
        });
      })();
    },
    [key, stop],
  );

  return { key, loading, progress, toggle, stop };
}

/* ── The take row ───────────────────────────────────────────────────────── */

interface TakeRowProps {
  /** The number on the circle — the take's place in the list, not its `n`. */
  n: number;
  label: string;
  seconds: number;
  source: TakeSource;
  playKey: string;
  playback: TakePlayback;
  /** Chosen under `chooseBest` — the row is outlined and the circle filled. */
  selected?: boolean;
  /** Tap the row to choose this take. Absent — not choosable. */
  onChoose?: () => void;
  uploading?: boolean;
  interactive: boolean;
}

/** `ra-take`: the take's number, the play button, its waveform and its length. */
export function TakeRow({
  n,
  label,
  seconds,
  source,
  playKey,
  playback,
  selected = false,
  onChoose,
  uploading = false,
  interactive,
}: TakeRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const playing = playback.key === playKey;
  const bars = bucketPeaks(source.peaks ?? [], WAVE_BARS);
  const played = playing ? Math.round(playback.progress * WAVE_BARS) : 0;
  const canPlay =
    interactive && (source.path !== null || source.assetId !== null);

  const row = (
    <View style={[styles.take, selected && styles.takeSelected]}>
      <View
        style={[styles.takeN, selected && styles.takeNSelected]}
        accessibilityRole={onChoose ? 'radio' : undefined}
        accessibilityState={onChoose ? { checked: selected } : undefined}
      >
        <Text style={[styles.takeNText, selected && styles.takeNTextSelected]}>
          {n}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.play, !canPlay && styles.dim]}
        onPress={() => playback.toggle(playKey, source)}
        disabled={!canPlay}
        accessibilityRole="button"
        accessibilityLabel={
          playing
            ? t('exerciseRunner.readAloud.pause')
            : t('exerciseRunner.readAloud.play', { label })
        }
      >
        {playing && playback.loading ? (
          <ActivityIndicator size="small" color={colors.accentBase} />
        ) : (
          <Icon name={playing ? 'Pause' : 'Play'} size={14} color={colors.accent300} />
        )}
      </TouchableOpacity>
      <View style={styles.wave}>
        {bars.map((v, i) => (
          <View
            key={i}
            style={[
              styles.waveBar,
              { height: 4 + v * 20 },
              i < played ? { backgroundColor: colors.accentBase } : null,
            ]}
          />
        ))}
      </View>
      {uploading ? (
        <ActivityIndicator
          size="small"
          color={colors.neutral500}
          accessibilityLabel={t('exerciseRunner.readAloud.uploadingTake')}
        />
      ) : (
        <Text style={styles.dur}>{formatSeconds(seconds)}</Text>
      )}
    </View>
  );

  if (!onChoose) return row;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onChoose}
      disabled={!interactive}
    >
      {row}
    </TouchableOpacity>
  );
}

/* ── The recorder's instruments ─────────────────────────────────────────── */

/** `ra-meter`: 18 bars, `6 + v·38` px. Calm on the check, red while recording. */
export function Meter({ levels, live }: { levels: number[]; live: boolean }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View
      style={styles.meter}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {levels.map((v, i) => (
        <View
          key={i}
          style={[
            styles.meterBar,
            {
              height: 6 + v * 38,
              backgroundColor: live ? colors.neutral400 : colors.accentBase,
            },
          ]}
        />
      ))}
    </View>
  );
}

/** `ra-clock`: the big monospaced clock, amber when it warns. */
export function Clock({ seconds, warn }: { seconds: number; warn: boolean }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <Text
      style={[styles.clock, warn && { color: colors.neutral300 }]}
      accessibilityLiveRegion="polite"
    >
      {formatSeconds(seconds)}
    </Text>
  );
}

/** `ra-live`: the pulsing red dot beside «Tar opp». */
export function LiveDot() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.25,
          duration: 550,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 550,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.liveDot, { opacity }]} />;
}

/* ── Material ───────────────────────────────────────────────────────────── */

/**
 * What the prompt gives the student to speak from — and only the current mode's (RA-V5): the
 * passage (`ra-source`), the picture and the plan (`ra-plan`), or the situation and the
 * partner's line (`ra-turn`). The partner's avatar is an icon, not initials: initials are
 * content (plan 70 §8 item 9).
 */
export function Material({
  mode,
  prompt,
}: {
  mode: Mode;
  prompt: ReadAloudPrompt;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  if (mode === 'read') {
    return (
      <View style={styles.source}>
        <Text style={styles.sourceText}>{prompt.text ?? ''}</Text>
      </View>
    );
  }

  if (mode === 'monologue') {
    return (
      <View style={styles.monologue}>
        {prompt.image ? (
          <PromptImage image={prompt.image} />
        ) : (
          <View style={styles.imgSlot}>
            <Text style={styles.imgSlotText}>
              {t('exerciseRunner.readAloud.imagePlaceholder')}
            </Text>
          </View>
        )}
        {(prompt.plan ?? []).length > 0 ? (
          <View style={styles.plan}>
            {(prompt.plan ?? []).map(point => (
              <View key={point.id} style={styles.planRow}>
                <View style={styles.planDot} />
                <Text style={styles.planText}>{point.text}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.monologue}>
      {prompt.turn?.situation ? (
        <Text style={styles.sub}>{prompt.turn.situation}</Text>
      ) : null}
      <View style={styles.turn}>
        <View style={styles.turnAv}>
          <Icon name="User" size={14} color={colors.neutral400} />
        </View>
        <Text style={styles.turnText}>{prompt.turn?.partner ?? ''}</Text>
      </View>
    </View>
  );
}

function PromptImage({
  image,
}: {
  image: NonNullable<ReadAloudPrompt['image']>;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  useEffect(() => {
    let live = true;
    getMediaAsset(image.assetId)
      .then(a => {
        if (live) setAsset(a);
      })
      .catch(() => {
        // A missing picture leaves the slot; the plan still says what to talk about.
      });
    return () => {
      live = false;
    };
  }, [image.assetId]);

  return (
    <View>
      {asset ? (
        <Image
          source={{ uri: asset.url }}
          style={styles.image}
          resizeMode="contain"
          accessibilityLabel={image.alt}
        />
      ) : (
        <View style={styles.imgSlot} />
      )}
      {image.caption ? (
        <Text style={styles.caption}>{image.caption}</Text>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    take: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 9,
      paddingHorizontal: 11,
      borderWidth: 1,
      borderColor: colors.neutral800,
      borderRadius: 10,
      backgroundColor: colors.surface,
    },
    takeSelected: {
      borderColor: colors.accentBase,
      backgroundColor: colors.accent900,
    },
    takeN: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.accentBase,
      alignItems: 'center',
      justifyContent: 'center',
    },
    takeNSelected: {
      backgroundColor: colors.accentBase,
    },
    takeNText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.accentBase,
    },
    takeNTextSelected: {
      color: colors.accent300,
    },
    play: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.accent900,
      alignItems: 'center',
      justifyContent: 'center',
    },
    playGlyph: {
      fontSize: 13,
      color: colors.accentBase,
    },
    dim: {
      opacity: 0.4,
    },
    wave: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      height: 24,
    },
    waveBar: {
      flex: 1,
      borderRadius: 1,
      backgroundColor: colors.neutral500,
    },
    dur: {
      fontFamily: 'monospace',
      fontSize: 11,
      color: colors.neutral400,
      minWidth: 34,
      textAlign: 'right',
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.neutral600,
    },
    meter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      height: 46,
    },
    meterBar: {
      width: 6,
      borderRadius: 3,
    },
    clock: {
      fontFamily: 'monospace',
      fontSize: 28,
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
      color: colors.text,
      textAlign: 'center',
    },
    source: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.neutral800,
      backgroundColor: colors.surface,
    },
    sourceText: {
      fontSize: 18,
      lineHeight: 28,
      color: colors.text,
    },
    monologue: {
      gap: 10,
    },
    image: {
      width: '100%',
      height: 200,
      borderRadius: 10,
    },
    imgSlot: {
      minHeight: 150,
      borderRadius: 10,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.neutral500,
      alignItems: 'center',
      justifyContent: 'center',
    },
    imgSlotText: {
      fontSize: 13,
      color: colors.neutral500,
    },
    caption: {
      marginTop: 6,
      fontSize: 13,
      color: colors.neutral400,
    },
    plan: {
      gap: 5,
    },
    planRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    planDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accentBase,
    },
    planText: {
      flex: 1,
      fontSize: 14,
      color: colors.neutral400,
    },
    sub: {
      fontSize: 13,
      color: colors.neutral400,
    },
    turn: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.neutral800,
      backgroundColor: colors.neutral800,
    },
    turnAv: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.accent900,
      alignItems: 'center',
      justifyContent: 'center',
    },
    turnAvGlyph: {
      fontSize: 14,
    },
    turnText: {
      flex: 1,
      fontSize: 16,
      lineHeight: 22,
      color: colors.text,
    },
  });
