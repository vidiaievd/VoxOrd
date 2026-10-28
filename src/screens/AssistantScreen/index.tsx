import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { MESSAGE_MAX, type AssistContext } from '../../api/assistant';
import type { CourseHomePayload } from '../../api/types';
import { AddWordSheet } from '../../components/modal/sheets/AddWordSheet';
import { Button, Card, Icon, useToast } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { useSettings } from '../../hooks/useSettings';
import { useSwrResource } from '../../hooks/useSwrResource';
import { useTranslation } from '../../i18n';
import { courseHomeResource } from '../../lib/courseResources';
import type { Screen } from '../../navigation/screens';
import { useTheme } from '../../providers/ThemeProvider';
import { createASRService, type ASRService } from '../../services/asr';
import { radii, spacing } from '../../theme/spacing';
import { AnswerView } from './AnswerView';
import { canRetry, citationTarget, contextCourseId, speechLocale } from './assistantLogic';
import { useAssistantThread, type FailedTurn } from './useAssistantThread';

type AssistantRoute = Extract<Screen, { name: 'Assistant' }>;

interface AssistantScreenProps {
  route: AssistantRoute;
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

const FREE: AssistContext = { kind: 'free' };

/**
 * The learner's assistant (mobile redesign 03, step 2; mockup 3f). Over everything, no tab
 * bar; Back returns to the screen that opened it. The thread is the context's own and lives
 * on the phone (plan 83 Q1 = A).
 *
 * The context chip takes the question out of its context — a free question, the learner's
 * own plan paying (83 Q3) — and offers it back without asking first.
 */
export function AssistantScreen({ route, onBack, onNavigate }: AssistantScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const toast = useToast();
  const { uiLanguage, learningLanguage } = useSettings();
  const { offline: sessionOffline } = useAuth();
  const net = useNetInfo();
  const offline = sessionOffline || net.isConnected === false;

  const routeContext = route.context ?? FREE;
  const [context, setContext] = useState<AssistContext>(routeContext);
  const contextRemoved = context.kind === 'free' && routeContext.kind !== 'free';
  const thread = useAssistantThread(context);

  // The course the answers come from — its title for the subtitle, its language for a word
  // added from an answer. Read from the cache the course screens fill.
  const courseId = contextCourseId(context);
  const course = useMemo(() => (courseId ? courseHomeResource(courseId) : null), [courseId]);
  const { data: courseHome } = useSwrResource<CourseHomePayload>(
    course?.key ?? null,
    course?.load ?? noCourse,
  );
  const courseTitle = courseHome?.courseInfo.title ?? null;
  const targetLanguage = courseHome?.courseInfo.targetLanguage ?? learningLanguage;

  /** This thread as a screen to come back to — never sending its prompt a second time. */
  const self: Screen = useMemo(
    () => ({
      name: 'Assistant',
      context,
      ...(contextRemoved || !route.contextLabel ? {} : { contextLabel: route.contextLabel }),
      returnTo: route.returnTo,
    }),
    [context, contextRemoved, route.contextLabel, route.returnTo],
  );
  const targetOf = useCallback(
    (citation: Parameters<typeof citationTarget>[0]) => citationTarget(citation, context, self),
    [context, self],
  );

  const [draft, setDraft] = useState('');
  const [wordToAdd, setWordToAdd] = useState<string | null>(null);
  const busy = thread.pending !== null;

  const send = useCallback(
    (text: string) => {
      if (offline || busy || text.trim() === '') return;
      thread.send(text);
      setDraft('');
    },
    [busy, offline, thread],
  );

  // `prompt` goes out once, as the first question of this opening.
  const prompted = useRef(false);
  useEffect(() => {
    if (prompted.current || !thread.loaded || !route.prompt) return;
    prompted.current = true;
    if (!busy) send(route.prompt);
  }, [busy, route.prompt, send, thread.loaded]);

  const voice = useVoiceInput(speechLocale(uiLanguage), setDraft);
  const listen = useCallback(async () => {
    if (!(await voice.start())) toast.show(t('assistant.micUnavailable'));
  }, [t, toast, voice]);
  const startedVoice = useRef(false);
  useEffect(() => {
    if (startedVoice.current || !route.startVoice || offline) return;
    startedVoice.current = true;
    void listen();
  }, [listen, offline, route.startVoice]);

  const handleFeedback = async (turnId: string, helpful: boolean) => {
    if (!(await thread.giveFeedback(turnId, helpful))) toast.show(t('assistant.feedbackFailed'));
  };

  const scrollRef = useRef<ScrollView>(null);

  // A screen reader hears an answer that arrives while the learner is on the thread. A live
  // region on a freshly mounted view is not announced, so the text is spoken explicitly; the
  // answers already stored when the thread opened stay silent.
  const announcedTurn = useRef<string | null | undefined>(undefined);
  const lastTurn = thread.turns[thread.turns.length - 1];
  useEffect(() => {
    if (!thread.loaded) return;
    const lastId = lastTurn?.id ?? null;
    if (announcedTurn.current === undefined) {
      announcedTurn.current = lastId;
      return;
    }
    if (lastId === announcedTurn.current) return;
    announcedTurn.current = lastId;
    if (lastTurn?.role !== 'user' && lastTurn?.answer) {
      AccessibilityInfo.announceForAccessibility(lastTurn.answer.blocks.map((b) => b.text).join(' '));
    }
  }, [lastTurn, thread.loaded]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Header
          subtitle={
            courseTitle ? t('assistant.subtitleCourse', { course: courseTitle }) : t('assistant.subtitleAll')
          }
          onClose={onBack}
        />
        {routeContext.kind !== 'free' ? (
          <ContextChip
            label={contextChipLabel(routeContext, route.contextLabel, t)}
            removed={contextRemoved}
            onRemove={() => setContext(FREE)}
            onRestore={() => setContext(routeContext)}
          />
        ) : null}

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: spacing.screenGutter, paddingVertical: 12, gap: 18 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="Sparkle" size={14} color={colors.neutral500} />
            <Text style={[typography.meta, { color: colors.neutral500, flex: 1 }]}>{t('assistant.aiLabel')}</Text>
          </View>

          {thread.loaded && thread.turns.length === 0 && !busy && !thread.failed ? (
            <Text style={[typography.body, { color: colors.neutral400 }]}>{t('assistant.empty')}</Text>
          ) : null}

          {thread.turns.map((turn) =>
            turn.role === 'user' ? (
              <UserBubble key={turn.id} text={turn.text} />
            ) : turn.answer ? (
              <AnswerView
                key={turn.id}
                turn={{ ...turn, answer: turn.answer }}
                targetOf={targetOf}
                onOpen={onNavigate}
                onAsk={send}
                onAddWord={setWordToAdd}
                onFeedback={(helpful) => void handleFeedback(turn.id, helpful)}
                busy={busy || offline}
              />
            ) : null,
          )}

          {thread.pending !== null ? (
            <>
              <UserBubble text={thread.pending} />
              <TypingDots />
            </>
          ) : null}

          {thread.failed ? (
            <>
              <UserBubble text={thread.failed.text} />
              <Unanswered
                failed={thread.failed}
                free={context.kind === 'free'}
                onRetry={offline ? undefined : thread.retry}
              />
            </>
          ) : null}
        </ScrollView>

        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => send(draft)}
          offline={offline}
          busy={busy}
          listening={voice.listening}
          onMic={() => (voice.listening ? voice.stop() : void listen())}
        />
      </KeyboardAvoidingView>

      {wordToAdd !== null ? (
        <AddWordSheet
          visible
          surfaceForm={wordToAdd}
          source={{ targetLanguage, sourceVariantId: null, sourceParagraph: null, contextSentence: null }}
          onClose={() => setWordToAdd(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const noCourse = (): Promise<CourseHomePayload> => Promise.reject(new Error('no course'));

function contextChipLabel(
  context: AssistContext,
  label: string | undefined,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (context.kind) {
    case 'unit':
      return label ? t('assistant.contextUnit', { label }) : t('assistant.contextUnitUnnamed');
    case 'submission':
      return label ? t('assistant.contextSubmission', { label }) : t('assistant.contextSubmissionUnnamed');
    case 'class':
      return label ? t('assistant.contextClass', { label }) : t('assistant.contextClassUnnamed');
    case 'word':
      return t('assistant.contextWord', { label: label ?? context.lemma });
    case 'free':
      return '';
  }
}

function Header({ subtitle, onClose }: { subtitle: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  return (
    <View style={{ minHeight: 56, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('assistant.close')}
        onPress={onClose}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="X" size={20} color={colors.text} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={[typography.cardTitleMedium, { color: colors.text }]}>
          {t('assistant.title')}
        </Text>
        <Text style={[typography.meta, { color: colors.neutral500 }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function ContextChip({
  label,
  removed,
  onRemove,
  onRestore,
}: {
  label: string;
  removed: boolean;
  onRemove: () => void;
  onRestore: () => void;
}) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  if (removed) {
    return (
      <View style={{ paddingHorizontal: spacing.screenGutter, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[typography.secondary, { color: colors.neutral400 }]}>{t('assistant.contextRemoved')}</Text>
        <Pressable accessibilityRole="button" onPress={onRestore} hitSlop={8}>
          <Text style={[typography.secondary, { color: colors.accent300 }]}>{t('assistant.contextRestore')}</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={{ paddingHorizontal: spacing.screenGutter }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('assistant.contextRemoveHint')}
        onPress={onRemove}
        style={({ pressed }) => ({
          alignSelf: 'flex-start',
          maxWidth: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: radii.tag,
          backgroundColor: pressed ? colors.neutral800 : colors.neutral900,
        })}
      >
        <Text style={[typography.meta, { color: colors.neutral300, flexShrink: 1 }]} numberOfLines={1}>
          {label}
        </Text>
        <Icon name="X" size={12} color={colors.neutral400} />
      </Pressable>
    </View>
  );
}

function UserBubble({ text }: { text: string }) {
  const { colors, typography } = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-end',
        maxWidth: '85%',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: radii.card,
        backgroundColor: colors.surface,
      }}
    >
      <Text style={[typography.cardTitle, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

/** Three dots pulsing one after another while the answer is awaited (plan 83 Q2 = A). */
function TypingDots() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 3, duration: 1200, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View
      accessible
      accessibilityLabel={t('assistant.typing')}
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', gap: 5, paddingVertical: 6 }}
    >
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.neutral400,
            opacity: pulse.interpolate({
              inputRange: [0, i, i + 0.5, i + 1, 3],
              outputRange: [0.3, 0.3, 1, 0.3, 0.3],
              extrapolate: 'clamp',
            }),
          }}
        />
      ))}
    </View>
  );
}

/** A question that brought no answer: a neutral card, never red, never invented text. */
function Unanswered({ failed, free, onRetry }: { failed: FailedTurn; free: boolean; onRetry?: () => void }) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const message = {
    refused: free ? t('assistant.refusedFree') : t('assistant.refused'),
    rate_limited: t('assistant.rateLimited'),
    silent: t('assistant.silent'),
    unreachable: t('assistant.unreachable'),
  }[failed.kind];
  return (
    <Card variant="outline" style={{ gap: 8 }}>
      <Text accessibilityLiveRegion="polite" style={[typography.body, { color: colors.text }]}>
        {message}
      </Text>
      {failed.kind === 'refused' && failed.reason === 'quota' ? (
        <Text style={[typography.secondary, { color: colors.neutral400 }]}>{t('assistant.refusedQuota')}</Text>
      ) : null}
      {canRetry(failed.kind) && onRetry ? (
        <Button label={t('assistant.retry')} variant="ghost" size={36} onPress={onRetry} style={{ alignSelf: 'flex-start' }} />
      ) : null}
    </Card>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  offline,
  busy,
  listening,
  onMic,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  offline: boolean;
  busy: boolean;
  listening: boolean;
  onMic: () => void;
}) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const canSend = !offline && !busy && value.trim() !== '';
  return (
    <View style={{ paddingHorizontal: spacing.screenGutter, paddingTop: 8, paddingBottom: 10, gap: 6 }}>
      {offline ? (
        <Text style={[typography.meta, { color: colors.neutral400 }]}>{t('assistant.needsNetwork')}</Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 4,
          paddingLeft: 14,
          paddingRight: 4,
          paddingVertical: 4,
          borderRadius: radii.pillLarge,
          backgroundColor: colors.surface,
          opacity: offline ? 0.5 : 1,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          editable={!offline}
          multiline
          maxLength={MESSAGE_MAX}
          accessibilityLabel={t('assistant.placeholder')}
          placeholder={listening ? t('assistant.listening') : t('assistant.placeholder')}
          placeholderTextColor={colors.neutral500}
          style={[
            typography.cardTitle,
            { flex: 1, color: colors.text, maxHeight: 120, paddingVertical: 10, paddingHorizontal: 0 },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={listening ? t('assistant.micStop') : t('assistant.mic')}
          accessibilityState={{ disabled: offline, selected: listening }}
          disabled={offline}
          onPress={onMic}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon
            name="Microphone"
            size={20}
            color={listening ? colors.accent300 : colors.neutral400}
            weight={listening ? 'fill' : 'regular'}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('assistant.send')}
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={onSend}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="PaperPlaneRight" size={20} color={canSend ? colors.accent300 : colors.neutral600} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Speech into the composer through the device's recogniser (`services/asr`). What is heard
 * replaces the draft as it comes; it is sent only when the learner presses send.
 */
function useVoiceInput(lang: string, onText: (text: string) => void) {
  const asr = useRef<ASRService | null>(null);
  const [listening, setListening] = useState(false);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(
    () => () => {
      asr.current?.destroy();
      asr.current = null;
    },
    [],
  );

  /** False when the phone has no recogniser or the microphone was not allowed. */
  const start = useCallback(async (): Promise<boolean> => {
    const service = asr.current ?? createASRService();
    asr.current = service;
    try {
      if (!(await service.isAvailable()) || !(await service.hasPermission())) return false;
    } catch {
      return false;
    }
    service.onStart = () => setListening(true);
    service.onPartial = (text) => onTextRef.current(text);
    service.onResult = (result) => onTextRef.current(result.transcript);
    service.onError = () => setListening(false);
    service.onEnd = () => setListening(false);
    setListening(true);
    service.start({ lang, interimResults: true });
    return true;
  }, [lang]);

  const stop = useCallback(() => {
    asr.current?.stop();
    setListening(false);
  }, []);

  return useMemo(() => ({ listening, start, stop }), [listening, start, stop]);
}
