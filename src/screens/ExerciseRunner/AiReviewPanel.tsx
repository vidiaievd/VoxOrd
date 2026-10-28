import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { ReadingCheck } from './ReadingCheck';
import {
  DISPUTE_REASON_MAX,
  disputeAiReview,
  getAiReview,
  type AiReading,
  type AiReview,
  type AiReviewMark,
  type AiReviewRemark,
} from '../../api/aiReview';

type T = ReturnType<typeof useTranslation>['t'];

/** The aspects the copy names; anything newer reads under its own code. */
const KNOWN_ASPECTS: ReadonlySet<string> = new Set([
  'grammar',
  'order',
  'lexis',
  'register',
  'meaning',
  'alternative',
  'task',
  'structure',
  'content',
]);

interface AiReviewPanelProps {
  exerciseId: string;
  attemptId: string;
  /** What the items are called: sentences, questions, or one essay text. */
  templateCode: string;
  /** Rubric criterion id → name, from the attempt's `rubricSnapshot`, in rubric order. */
  criteria: Map<string, string>;
  /** A `read_aloud` prompt's name; «Prompt N» without it. */
  promptLabel?: (itemId: string) => string;
  /** A `read_aloud` prompt's passage as the screen has it, to draw the check over. */
  passageOf?: (itemId: string) => string | null;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'loaded'; review: AiReview | null };

/**
 * A model's review of the learner's work, and their one way to say it is wrong (plan 79,
 * step 2.3d — the web's `AiReviewPanel`).
 *
 * The label comes first and comes always — before the review loads, if it fails to load, and
 * with no way to close it: a learner must never read a model's words as a teacher's. The
 * remarks follow the order of the work, item by item, then an essay's marks with the reason
 * for each. «This review is wrong» is offered once; the verdict does not change, and the
 * panel says so rather than letting the button look like an appeal.
 *
 * At a school with a model-first policy (plan 80) the review is the school's stand-in: it
 * says whether it waits for the teacher — and when it counts by itself — or counted at the
 * term. A review that does not count yet takes no dispute (the engine refuses one): the
 * teacher's verdict is still to come.
 *
 * A reading aloud checked by the machine (plan 82) is drawn as the check of each prompt
 * instead of remarks; its summary is the counts in figures, which the check already shows.
 */
export function AiReviewPanel({
  exerciseId,
  attemptId,
  templateCode,
  criteria,
  promptLabel,
  passageOf,
}: AiReviewPanelProps) {
  const { t, language } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [seq, setSeq] = useState(0);
  const reading = templateCode === 'read_aloud';

  useEffect(() => {
    let cancelled = false;
    setLoad({ kind: 'loading' });
    getAiReview(exerciseId, attemptId).then(
      review => {
        if (!cancelled) setLoad({ kind: 'loaded', review });
      },
      () => {
        if (!cancelled) setLoad({ kind: 'failed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [exerciseId, attemptId, seq]);

  const onDisputed = useCallback((disputedAt: string) => {
    setLoad(prev =>
      prev.kind === 'loaded' && prev.review !== null
        ? { kind: 'loaded', review: { ...prev.review, disputedAt } }
        : prev,
    );
  }, []);

  return (
    <View style={styles.panel} accessibilityLabel={t('exerciseRunner.aiReview.label')}>
      <Text style={styles.label}>✦ {t('exerciseRunner.aiReview.label')}</Text>
      <Text style={styles.caveat}>
        {reading ? t('exerciseRunner.aiReview.caveatReading') : t('exerciseRunner.aiReview.caveat')}
      </Text>

      {load.kind === 'loading' ? (
        <ActivityIndicator style={styles.spinner} color={colors.accent} />
      ) : load.kind === 'failed' ? (
        <Text style={styles.failed}>
          {t('exerciseRunner.aiReview.failed')}{' '}
          <Text style={styles.link} onPress={() => setSeq(s => s + 1)}>
            {t('exerciseRunner.aiReview.retry')}
          </Text>
        </Text>
      ) : load.review === null ? null : (
        <>
          <Standing styles={styles} t={t} language={language} review={load.review} />
          {load.review.reading != null ? (
            <Readings
              t={t}
              styles={styles}
              reading={load.review.reading}
              promptLabel={promptLabel}
              passageOf={passageOf}
            />
          ) : (
            <>
              {load.review.summary !== null && load.review.summary.trim() !== '' ? (
                <Text style={styles.summary}>{load.review.summary}</Text>
              ) : null}
              <Remarks t={t} styles={styles} items={load.review.items} templateCode={templateCode} />
            </>
          )}
          {load.review.marks !== null && load.review.marks.length > 0 ? (
            <Marks t={t} styles={styles} marks={load.review.marks} criteria={criteria} />
          ) : null}
          {load.review.provisional ? null : (
            <Dispute
              exerciseId={exerciseId}
              attemptId={attemptId}
              disputedAt={load.review.disputedAt}
              onDisputed={onDisputed}
              reading={reading}
            />
          )}
        </>
      )}
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

/** «Tue 1 Nov» in the app's language; the ISO day if the device cannot say it. */
function shortDate(iso: string, language: string): string {
  try {
    return new Date(iso).toLocaleDateString(language, { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Where a school's review stands (plan 80); nothing for a review that simply counts. */
function Standing({
  styles,
  t,
  language,
  review,
}: {
  styles: Styles;
  t: T;
  language: string;
  review: AiReview;
}) {
  if (!review.provisional && !review.acceptedAtTerm) return null;
  const title = review.provisional
    ? t('exerciseRunner.aiReview.provisionalTitle')
    : t('exerciseRunner.aiReview.acceptedAtTermTitle');
  const note = !review.provisional
    ? t('exerciseRunner.aiReview.acceptedAtTermNote')
    : review.countsAt !== null
      ? t('exerciseRunner.aiReview.provisionalNote', { date: shortDate(review.countsAt, language) })
      : t('exerciseRunner.aiReview.provisionalNoteNoTerm');
  return (
    <View style={styles.standing}>
      <Text style={styles.standingTitle}>{title}</Text>
      <Text style={styles.muted}>{note}</Text>
    </View>
  );
}

/**
 * A reading checked by the machine (plan 82): each prompt under its name, with the passage
 * marked where it was missed or read as other words, then the prompts passed in an earlier
 * try, which were not listened to again.
 */
function Readings({
  t,
  styles,
  reading,
  promptLabel,
  passageOf,
}: {
  t: T;
  styles: Styles;
  reading: AiReading;
  promptLabel: ((itemId: string) => string) | undefined;
  passageOf: ((itemId: string) => string | null) | undefined;
}) {
  const labelOf = (itemId: string, index: number) =>
    promptLabel?.(itemId).trim() || t('exerciseRunner.aiReview.readingCheck.prompt', { n: index + 1 });
  const single = reading.prompts.length === 1 && reading.carriedItemIds.length === 0;

  return (
    <View style={styles.groups}>
      {reading.prompts.map((prompt, index) => (
        <View key={prompt.itemId} style={styles.group} accessibilityLabel={labelOf(prompt.itemId, index)}>
          {single ? null : <Text style={styles.groupTitle}>{labelOf(prompt.itemId, index)}</Text>}
          <ReadingCheck
            prompt={prompt}
            passPercent={reading.passPercent}
            passage={passageOf?.(prompt.itemId) ?? null}
          />
        </View>
      ))}
      {/* Where the screen cannot name them, they are counted: a number made up from their
          place here would point at the wrong prompt. */}
      {reading.carriedItemIds.length === 0 ? null : promptLabel === undefined ? (
        <Text style={styles.muted}>
          {t('exerciseRunner.aiReview.readingCheck.carriedCount', {
            count: reading.carriedItemIds.length,
          })}
        </Text>
      ) : (
        reading.carriedItemIds.map(itemId => (
          <Text key={itemId} style={styles.muted}>
            {t('exerciseRunner.aiReview.readingCheck.carried', { label: promptLabel(itemId) })}
          </Text>
        ))
      )}
    </View>
  );
}

/** The remarks, grouped under the item they are about, in the order of the work. */
function Remarks({
  t,
  styles,
  items,
  templateCode,
}: {
  t: T;
  styles: Styles;
  items: AiReviewRemark[];
  templateCode: string;
}) {
  if (items.length === 0) {
    return <Text style={styles.muted}>{t('exerciseRunner.aiReview.noRemarks')}</Text>;
  }

  const groups = new Map<number, AiReviewRemark[]>();
  for (const item of [...items].sort((a, b) => a.sentenceIndex - b.sentenceIndex)) {
    const group = groups.get(item.sentenceIndex) ?? [];
    group.push(item);
    groups.set(item.sentenceIndex, group);
  }
  const essay = templateCode === 'writing_task';

  return (
    <View style={styles.groups}>
      {[...groups].map(([index, remarks]) => (
        <View key={index} style={styles.group}>
          {essay ? null : (
            <Text style={styles.groupTitle}>
              {templateCode === 'short_answer'
                ? t('exerciseRunner.aiReview.question', { n: index + 1 })
                : t('exerciseRunner.aiReview.sentence', { n: index + 1 })}
            </Text>
          )}
          {remarks.map((remark, i) => (
            <View key={`${remark.itemId}-${i}`} style={styles.remark}>
              <Text style={styles.aspect}>
                {aspectLabel(t, remark.aspect)}
                {remark.fragment === null
                  ? ` · ${essay ? t('exerciseRunner.aiReview.wholeText') : t('exerciseRunner.aiReview.wholeAnswer')}`
                  : ''}
              </Text>
              {remark.fragment !== null ? (
                <Text style={styles.fragmentLine}>
                  <Text style={styles.fragment}>{remark.fragment}</Text>
                  {remark.suggestion !== null && remark.suggestion.trim() !== '' ? (
                    <>
                      {' → '}
                      <Text style={styles.suggestion}>{remark.suggestion}</Text>
                    </>
                  ) : null}
                </Text>
              ) : null}
              <Text style={styles.comment}>{remark.comment}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** An essay's marks, in rubric order, each with its reason. */
function Marks({
  t,
  styles,
  marks,
  criteria,
}: {
  t: T;
  styles: Styles;
  marks: AiReviewMark[];
  criteria: Map<string, string>;
}) {
  const order = [...criteria.keys()];
  const position = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? Infinity : i;
  };
  const sorted = [...marks].sort((a, b) => position(a.criterionId) - position(b.criterionId));

  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{t('exerciseRunner.aiReview.marksTitle')}</Text>
      {sorted.map(mark => {
        const name = criteria.get(mark.criterionId)?.trim();
        return (
          <View key={mark.criterionId} style={styles.markRow}>
            <Text style={styles.markName}>
              {name ? name : t('exerciseRunner.aiReview.unnamed')}
              {' · '}
              <Text style={styles.markValue}>
                {t('exerciseRunner.aiReview.mark', { mark: mark.mark })}
              </Text>
            </Text>
            <Text style={styles.muted}>{mark.reason}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * «This review is wrong». A button, then an optional reason, then a thank-you that stays: the
 * engine counts one dispute per review, and the panel remembers it the same way.
 */
function Dispute({
  exerciseId,
  attemptId,
  disputedAt,
  onDisputed,
  reading,
}: {
  exerciseId: string;
  attemptId: string;
  disputedAt: string | null;
  onDisputed: (disputedAt: string) => void;
  /** A reading aloud: the example says what a wrong hearing looks like. */
  reading: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  if (disputedAt !== null) {
    return <Text style={styles.muted}>{t('exerciseRunner.aiReview.disputed')}</Text>;
  }

  if (!open) {
    return (
      <TouchableOpacity style={styles.ghostBtn} onPress={() => setOpen(true)}>
        <Text style={styles.ghostBtnText}>{t('exerciseRunner.aiReview.dispute')}</Text>
      </TouchableOpacity>
    );
  }

  const send = async () => {
    setSending(true);
    setFailed(false);
    try {
      const answer = await disputeAiReview(exerciseId, attemptId, reason);
      onDisputed(answer.disputedAt);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.group}>
      <Text style={styles.reasonLabel}>{t('exerciseRunner.aiReview.reasonLabel')}</Text>
      <TextInput
        value={reason}
        onChangeText={setReason}
        maxLength={DISPUTE_REASON_MAX}
        multiline
        placeholder={
          reading
            ? t('exerciseRunner.aiReview.reasonPlaceholderReading')
            : t('exerciseRunner.aiReview.reasonPlaceholder')
        }
        placeholderTextColor={colors.textMuted}
        style={styles.reasonInput}
        accessibilityLabel={t('exerciseRunner.aiReview.reasonLabel')}
      />
      <Text style={styles.muted}>{t('exerciseRunner.aiReview.disputeNote')}</Text>
      <View style={styles.disputeActions}>
        <TouchableOpacity
          style={[styles.sendBtn, sending && styles.disabled]}
          disabled={sending}
          onPress={() => {
            send();
          }}
        >
          <Text style={styles.sendBtnText}>
            {sending ? t('exerciseRunner.aiReview.sending') : t('exerciseRunner.aiReview.send')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ghostBtn}
          disabled={sending}
          onPress={() => setOpen(false)}
        >
          <Text style={styles.ghostBtnText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
      {failed ? <Text style={styles.failed}>{t('exerciseRunner.aiReview.sendFailed')}</Text> : null}
    </View>
  );
}

/** Explicit branches, as the web does, so a new aspect never reads as a missing key. */
function aspectLabel(t: T, aspect: string): string {
  if (!KNOWN_ASPECTS.has(aspect)) return aspect;
  switch (aspect) {
    case 'grammar':
      return t('exerciseRunner.aiReview.aspect.grammar');
    case 'order':
      return t('exerciseRunner.aiReview.aspect.order');
    case 'lexis':
      return t('exerciseRunner.aiReview.aspect.lexis');
    case 'meaning':
      return t('exerciseRunner.aiReview.aspect.meaning');
    case 'alternative':
      return t('exerciseRunner.aiReview.aspect.alternative');
    case 'task':
      return t('exerciseRunner.aiReview.aspect.task');
    case 'structure':
      return t('exerciseRunner.aiReview.aspect.structure');
    case 'content':
      return t('exerciseRunner.aiReview.aspect.content');
    default:
      return t('exerciseRunner.aiReview.aspect.register');
  }
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    panel: {
      marginTop: 16,
      borderRadius: 14,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.accent,
      backgroundColor: colors.backgroundCard,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    label: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: colors.accent,
    },
    caveat: {
      fontSize: 12.5,
      lineHeight: 17,
      color: colors.textSecondary,
      marginTop: -6,
    },
    spinner: {
      marginVertical: 8,
    },
    standing: {
      borderRadius: 10,
      backgroundColor: colors.backgroundInput,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 2,
    },
    standingTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    failed: {
      fontSize: 13,
      color: colors.danger,
    },
    link: {
      fontWeight: '700',
      textDecorationLine: 'underline',
    },
    summary: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textPrimary,
    },
    muted: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    groups: {
      gap: 10,
    },
    group: {
      gap: 6,
    },
    groupTitle: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    remark: {
      borderRadius: 10,
      backgroundColor: colors.backgroundInput,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 4,
    },
    aspect: {
      fontSize: 11,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    fragmentLine: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textPrimary,
    },
    fragment: {
      backgroundColor: `${colors.warning}33`,
    },
    suggestion: {
      fontWeight: '700',
    },
    comment: {
      fontSize: 13.5,
      lineHeight: 19,
      color: colors.textPrimary,
    },
    markRow: {
      gap: 2,
    },
    markName: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    markValue: {
      fontWeight: '400',
    },
    ghostBtn: {
      alignSelf: 'flex-start',
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    ghostBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.accent,
    },
    reasonLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    reasonInput: {
      minHeight: 72,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.textMuted,
      backgroundColor: colors.backgroundInput,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      color: colors.textPrimary,
      textAlignVertical: 'top',
    },
    disputeActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    sendBtn: {
      borderRadius: 12,
      backgroundColor: colors.accent,
      paddingHorizontal: 18,
      paddingVertical: 9,
    },
    sendBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textInverted,
    },
    disabled: {
      opacity: 0.5,
    },
  });
