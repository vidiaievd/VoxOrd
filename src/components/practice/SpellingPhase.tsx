import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';
import { useSpelling } from '../../hooks/useSpelling';
import { useAutoAdvance } from '../../hooks/useAutoAdvance';
import { useKeyboardShown } from '../../hooks/useKeyboardShown';
import { insertAt, langInKey, specialLetters } from '../../lib/langLetters';
import { Button } from '../ui/Button';
import { Overline } from '../ui/Overline';
import { Skeleton } from '../ui/Skeleton';
import { PhaseFooter } from './PhaseFooter';
import { useReportSession, type ChoicePhaseProps } from './ChoicePhase';

/**
 * «Write it in Norwegian» (Practice §7.4, 6e) over `useSpelling`, whose rules stay as they
 * were: a wrong answer clears the field and the same word stays up, the hint and the full word
 * appear after mistakes, a near miss is accepted as «Almost». «Don't remember» is the hook's
 * `skip` — a give-up, graded as a wrong answer — now offered from the start instead of after
 * three mistakes (§7.4).
 */
export function SpellingPhase({
  deckId,
  languageCode,
  wordIds,
  tracking,
  onDone,
  onProgress,
  onSession,
}: ChoicePhaseProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const keyboardShown = useKeyboardShown();
  const { state, isLoading, sessionId, setInput, submit, skip, next } = useSpelling(
    deckId,
    wordIds,
    onDone,
    tracking,
  );
  useReportSession(sessionId, onSession);
  useAutoAdvance(state.isAnswered, state.isCorrect, next);

  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const selection = useRef({ start: 0, end: 0 });
  const [caret, setCaret] = useState<{ start: number; end: number } | undefined>();
  const total = state.questions.length;
  const letters = specialLetters(languageCode);

  useEffect(() => {
    if (!isLoading && total === 0) onDone(0);
  }, [isLoading, total, onDone]);
  useEffect(() => {
    if (!isLoading && total > 0) onProgress?.(Math.min(state.currentIndex + 1, total), total);
  }, [isLoading, state.currentIndex, total, onProgress]);

  // Focus each new word; a wrong try keeps the keyboard up on its own.
  useEffect(() => {
    if (!isLoading && !state.isAnswered && !state.isSkipped) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, state.currentIndex, state.isAnswered, state.isSkipped]);

  const question = state.questions[state.currentIndex];
  if (isLoading) {
    return (
      <View style={{ paddingTop: 14, paddingHorizontal: 20, gap: 18 }}>
        <Skeleton width={160} height={12} />
        <Skeleton width={200} height={30} />
        <Skeleton height={52} />
      </View>
    );
  }
  if (!question || state.isComplete) return null;

  const done = state.isAnswered || state.isSkipped;
  // A wrong try: the hook cleared the field and keeps the word up.
  const retrying = !done && state.isCorrect === false;

  const insert = (letter: string) => {
    const { text, caret: at } = insertAt(state.input, selection.current, letter);
    setInput(text);
    selection.current = { start: at, end: at };
    setCaret({ start: at, end: at });
    inputRef.current?.focus();
  };

  const feedback = state.isSkipped
    ? { icon: 'Info' as const, title: t('reviewSession.correctIs', { answer: question.word }) }
    : state.isAnswered
      ? state.wasTypo
        ? { icon: 'Info' as const, title: t('reviewSession.almost', { answer: question.word }) }
        : { icon: 'CheckCircle' as const, title: t('reviewSession.correct') }
      : null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      enabled={keyboardShown}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 20, gap: 18 }}
      >
        <View style={{ gap: 8 }}>
          <Overline>
            {t('reviewSession.writeIn', { langIn: t(langInKey(languageCode)) })}
          </Overline>
          <Text style={{ fontSize: 26, lineHeight: 30, fontWeight: '500', color: colors.text }}>
            {question.translation}
          </Text>
          {state.showHint && question.hint ? (
            <Text style={[typography.secondary, { color: colors.neutral500 }]}>
              {question.hint}
            </Text>
          ) : null}
        </View>

        <TextInput
          ref={inputRef}
          value={state.input}
          onChangeText={setInput}
          onSelectionChange={e => {
            selection.current = e.nativeEvent.selection;
            setCaret(undefined);
          }}
          selection={caret}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={submit}
          editable={!done}
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          returnKeyType="done"
          blurOnSubmit={false}
          accessibilityLabel={question.translation}
          style={{
            height: 52,
            borderRadius: radii.plate,
            backgroundColor: colors.neutral900,
            borderWidth: 1,
            borderColor: focused ? colors.accentBase : colors.neutral700,
            paddingHorizontal: 16,
            fontSize: 18,
            color: done ? colors.neutral400 : colors.text,
          }}
        />

        {letters.length > 0 && !done ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {letters.map(letter => (
              <Pressable
                key={letter}
                accessibilityRole="button"
                accessibilityLabel={letter}
                onPress={() => insert(letter)}
                style={({ pressed }) => ({
                  width: 44,
                  height: 36,
                  borderRadius: radii.plate,
                  backgroundColor: pressed ? colors.neutral800 : colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                })}
              >
                <Text style={{ fontSize: 16, color: colors.text }}>{letter}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {retrying ? (
          <View accessibilityLiveRegion="polite" style={{ gap: 4 }}>
            <Text style={[typography.secondary, { color: colors.neutral400 }]}>
              {t('reviewSession.tryAgain')}
            </Text>
            {state.isRevealed ? (
              <Text style={[typography.secondary, { color: colors.neutral400 }]}>
                {t('reviewSession.correctIs', { answer: question.word })}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <PhaseFooter feedback={feedback} keyboardShown={keyboardShown}>
        {done ? (
          <Button block label={t('reviewSession.next')} onPress={next} />
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              variant="ghost"
              label={t('reviewSession.dontKnow')}
              onPress={skip}
              style={{ flex: 1 }}
            />
            <Button
              label={t('reviewSession.check')}
              disabled={state.input.trim() === ''}
              onPress={submit}
              style={{ flex: 1.4 }}
            />
          </View>
        )}
      </PhaseFooter>
    </KeyboardAvoidingView>
  );
}
