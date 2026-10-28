import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { AssistAnswer, AssistBlock, AssistCitation, AssistSuggestion } from '../../api/assistant';
import { Icon } from '../../components/ui';
import { useTranslation } from '../../i18n';
import type { Screen } from '../../navigation/screens';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';
import type { ThreadTurn } from '../../store/assistantThreadStore';
import { emphasisSegments } from './assistantLogic';

interface AnswerViewProps {
  turn: ThreadTurn & { answer: AssistAnswer };
  /** Where a citation leads, or null when it has no screen here. */
  targetOf: (citation: AssistCitation) => Screen | null;
  onOpen: (screen: Screen) => void;
  onAsk: (text: string) => void;
  onAddWord: (lemma: string) => void;
  onFeedback: (helpful: boolean) => void;
  /** No new question while one is out; the chips that ask wait too. */
  busy: boolean;
}

/** One answer of the assistant: left, without a bubble (mockup 3f). */
export function AnswerView({ turn, targetOf, onOpen, onAsk, onAddWord, onFeedback, busy }: AnswerViewProps) {
  const { answer } = turn;
  // A suggestion to open what is already cited below adds nothing but a second link.
  const cited = new Set(answer.citations.map((c) => `${c.kind}:${c.id}`));
  const suggestions = answer.suggestions.filter(
    (s) => s.kind !== 'open' || (!cited.has(`${s.target.kind}:${s.target.id}`) && targetOf(s.target) !== null),
  );

  return (
    <View style={{ gap: 10 }}>
      {answer.blocks.map((block, i) => (
        <BlockText key={i} block={block} />
      ))}
      {answer.citations.length > 0 ? (
        <View style={{ gap: 6 }}>
          {answer.citations.map((c) => (
            <CitationRow key={`${c.kind}:${c.id}`} citation={c} target={targetOf(c)} onOpen={onOpen} />
          ))}
        </View>
      ) : null}
      {suggestions.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {suggestions.map((s, i) => (
            <SuggestionChip
              key={i}
              suggestion={s}
              disabled={busy && s.kind === 'ask'}
              onPress={() => {
                if (s.kind === 'ask') onAsk(s.text);
                else if (s.kind === 'add_word') onAddWord(s.lemma);
                else {
                  const target = targetOf(s.target);
                  if (target) onOpen(target);
                }
              }}
            />
          ))}
        </View>
      ) : null}
      <FeedbackRow given={turn.feedback ?? null} onFeedback={onFeedback} />
    </View>
  );
}

function BlockText({ block }: { block: AssistBlock }) {
  const { colors, typography } = useTheme();
  const stressed = { ...typography.cardTitleMedium, fontSize: 15, color: colors.accent300 };
  return (
    <Text style={[typography.cardTitle, { color: colors.text }]}>
      {emphasisSegments(block.text, block.emphasis).map((seg, i) =>
        seg.stressed ? (
          <Text key={i} style={stressed}>
            {seg.text}
          </Text>
        ) : (
          seg.text
        ),
      )}
    </Text>
  );
}

function citationLabel(citation: AssistCitation, t: ReturnType<typeof useTranslation>['t']): string {
  const title = citation.title;
  switch (citation.kind) {
    case 'grammar_rule':
      return t('assistant.citeGrammarRule', { title });
    case 'lesson':
      return t('assistant.citeLesson', { title });
    case 'unit':
      return t('assistant.citeUnit', { title });
    case 'vocabulary_item':
      // The one kind without a course is a learner's own word.
      return citation.courseId === null
        ? t('assistant.citeMyWord', { title })
        : t('assistant.citeWord', { title });
  }
}

function CitationRow({
  citation,
  target,
  onOpen,
}: {
  citation: AssistCitation;
  target: Screen | null;
  onOpen: (screen: Screen) => void;
}) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const label = citationLabel(citation, t);
  if (!target) {
    return <Text style={[typography.secondary, { color: colors.neutral400 }]}>{label}</Text>;
  }
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => onOpen(target)}
      hitSlop={{ top: 8, bottom: 8 }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      <Text style={[typography.secondary, { color: colors.accent300, flexShrink: 1 }]}>{label}</Text>
      <Icon name="CaretRight" size={14} color={colors.accent300} />
    </Pressable>
  );
}

function SuggestionChip({
  suggestion,
  disabled,
  onPress,
}: {
  suggestion: AssistSuggestion;
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const label =
    suggestion.kind === 'ask'
      ? suggestion.text
      : suggestion.kind === 'add_word'
        ? t('assistant.addWord', { lemma: suggestion.lemma })
        : suggestion.target.title;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: radii.tag,
        backgroundColor: pressed ? colors.neutral800 : colors.neutral900,
        opacity: disabled ? 0.5 : 1,
        maxWidth: '100%',
      })}
    >
      <Text style={[typography.secondary, { color: colors.neutral300 }]}>{label}</Text>
    </Pressable>
  );
}

/** Once per answer: after a press the chosen mark stays and the other goes. */
function FeedbackRow({
  given,
  onFeedback,
}: {
  given: ThreadTurn['feedback'] | null;
  onFeedback: (helpful: boolean) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const button = (helpful: boolean) => {
    const mark = helpful ? 'helpful' : 'not_helpful';
    if (given && given !== mark) return null;
    const chosen = given === mark;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(helpful ? 'assistant.helpful' : 'assistant.notHelpful')}
        accessibilityState={{ selected: chosen, disabled: given !== null }}
        disabled={given !== null}
        onPress={() => onFeedback(helpful)}
        style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon
          name={helpful ? 'ThumbsUp' : 'ThumbsDown'}
          size={18}
          color={chosen ? colors.accent300 : colors.neutral500}
          weight={chosen ? 'fill' : 'regular'}
        />
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: 'row', marginLeft: -8 }}>
      {button(true)}
      {button(false)}
    </View>
  );
}
