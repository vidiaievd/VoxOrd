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
import {
  DISPUTE_REASON_MAX,
  disputeAiReview,
  getAiReview,
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
 */
export function AiReviewPanel({ exerciseId, attemptId, templateCode, criteria }: AiReviewPanelProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [seq, setSeq] = useState(0);

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
      <Text style={styles.caveat}>{t('exerciseRunner.aiReview.caveat')}</Text>

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
          {load.review.summary !== null && load.review.summary.trim() !== '' ? (
            <Text style={styles.summary}>{load.review.summary}</Text>
          ) : null}
          <Remarks t={t} styles={styles} items={load.review.items} templateCode={templateCode} />
          {load.review.marks !== null && load.review.marks.length > 0 ? (
            <Marks t={t} styles={styles} marks={load.review.marks} criteria={criteria} />
          ) : null}
          <Dispute
            exerciseId={exerciseId}
            attemptId={attemptId}
            disputedAt={load.review.disputedAt}
            onDisputed={onDisputed}
          />
        </>
      )}
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

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
}: {
  exerciseId: string;
  attemptId: string;
  disputedAt: string | null;
  onDisputed: (disputedAt: string) => void;
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
        placeholder={t('exerciseRunner.aiReview.reasonPlaceholder')}
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
