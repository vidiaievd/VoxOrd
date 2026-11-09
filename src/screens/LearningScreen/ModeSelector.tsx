import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Card,
  Icon,
  IconName,
  NavHeader,
  Overline,
  PressableScale,
  Tag,
  useToast,
} from '../../components/ui';
import { StatStrip } from '../../components/practice';
import { useDeepSessionCooldown } from '../../hooks/useDeepSessionCooldown';
import { useTranslation } from '../../i18n';
import { estimateMinutes } from '../../lib/practice';
import { useTheme } from '../../providers/ThemeProvider';
import { Deck } from '../../repositories/DeckRepository';

export interface LearningMode {
  id: string;
  icon: IconName;
  /** i18n key stem: `modes.<key>` is the name, `modes.<key>Desc` the line under it. */
  key:
    | 'flashcard'
    | 'matching'
    | 'quiz'
    | 'spelling'
    | 'listening'
    | 'pronunciation'
    | 'context';
  available: boolean;
}

/** Practice §8.1: one Phosphor icon per mode; the coloured plates and emoji are gone. */
export const LEARNING_MODES: LearningMode[] = [
  { id: 'flashcard', icon: 'Cards', key: 'flashcard', available: true },
  { id: 'matching', icon: 'LinkSimple', key: 'matching', available: true },
  { id: 'quiz', icon: 'Lightning', key: 'quiz', available: true },
  { id: 'spelling', icon: 'PencilSimple', key: 'spelling', available: true },
  { id: 'listening', icon: 'Headphones', key: 'listening', available: true },
  { id: 'pronunciation', icon: 'Microphone', key: 'pronunciation', available: true },
  { id: 'context', icon: 'TextAlignLeft', key: 'context', available: true },
];

interface ModeSelectorProps {
  deck: Deck;
  onSelectMode: (modeId: string, deck: Deck) => void;
  onBack: () => void;
}

/**
 * A word set's page (Practice 6g): its name and size, the three figures, the deep session,
 * self-assessment and the single modes. The set's word list is not offered — a set on the
 * phone does not remember which course unit it came from, so there is no list to open.
 */
export function ModeSelector({ deck, onSelectMode, onBack }: ModeSelectorProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const toast = useToast();
  const cooldown = useDeepSessionCooldown(deck.id);

  const cooldownText = t('modes.deepCooldown', { time: cooldown.remainingLabel });
  const deepMinutes = estimateMinutes(deck.totalWords * 4);

  const onDeep = () => {
    if (cooldown.isOnCooldown) {
      toast.show(cooldownText);
      return;
    }
    onSelectMode('deep', deck);
  };

  const deepRow = (
    <>
      <Icon
        name="Brain"
        size={26}
        color={cooldown.isOnCooldown ? colors.neutral500 : colors.accent300}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={[
            typography.cardTitleMedium,
            { color: cooldown.isOnCooldown ? colors.neutral400 : colors.text },
          ]}
        >
          {t('modes.deep')}
        </Text>
        <Text
          style={[
            typography.meta,
            {
              lineHeight: 17,
              color: cooldown.isOnCooldown ? colors.neutral500 : colors.neutral400,
            },
          ]}
        >
          {cooldown.isOnCooldown
            ? cooldownText
            : t('modes.deepSub', { min: deepMinutes })}
        </Text>
      </View>
      {cooldown.isOnCooldown ? (
        <Icon name="HourglassMedium" size={18} color={colors.neutral500} />
      ) : (
        <Icon name="CaretRight" size={16} color={colors.accent300} />
      )}
    </>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <NavHeader parentLabel="" onBack={onBack} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: 4,
          paddingHorizontal: 18,
          paddingBottom: 24,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 4 }}>
          <Text
            accessibilityRole="header"
            style={{ fontSize: 22, fontWeight: '500', color: colors.text }}
          >
            {deck.title}
          </Text>
          <Text style={[typography.secondary, { color: colors.neutral400 }]}>
            {t('practice.deckMetaPersonal', { count: deck.totalWords })}
          </Text>
        </View>

        <StatStrip
          items={[
            { value: String(deck.learnedWords), label: t('modes.learned') },
            { value: String(deck.newWords), label: t('modes.new') },
            { value: String(deck.repeatWords), label: t('modes.repeat'), accent: true },
          ]}
        />

        {cooldown.isOnCooldown ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`${t('modes.deep')}. ${cooldownText}`}
            onPress={onDeep}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              padding: 16,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.neutral800,
              backgroundColor: colors.surface,
            }}
          >
            {deepRow}
          </PressableScale>
        ) : (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`${t('modes.deep')}. ${t('modes.deepSub', {
              min: deepMinutes,
            })}`}
            onPress={onDeep}
          >
            <Card
              variant="lit"
              padding={16}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                borderColor: colors.accent700,
              }}
            >
              {deepRow}
            </Card>
          </PressableScale>
        )}

        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${t('modes.assessment')}. ${t('modes.assessmentSub')}`}
          onPress={() => onSelectMode('assessment', deck)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            padding: 16,
            borderRadius: 14,
            backgroundColor: colors.surface,
          }}
        >
          <Icon name="HandSwipeRight" size={24} color={colors.neutral300} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.cardTitleMedium, { color: colors.text }]}>
              {t('modes.assessment')}
            </Text>
            <Text style={[typography.meta, { color: colors.neutral500 }]}>
              {t('modes.assessmentSub')}
            </Text>
          </View>
          <Icon name="CaretRight" size={16} color={colors.neutral600} />
        </PressableScale>

        <View style={{ marginTop: 4 }}>
          <Overline style={{ marginBottom: 6 }}>{t('modes.section')}</Overline>
          {LEARNING_MODES.map(mode => {
            const title = t(`modes.${mode.key}`);
            const description = t(`modes.${mode.key}Desc`);
            return (
              <PressableScale
                key={mode.id}
                accessibilityRole="button"
                accessibilityLabel={`${title}. ${description}`}
                accessibilityState={{ disabled: !mode.available }}
                disabled={!mode.available}
                onPress={() => onSelectMode(mode.id, deck)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 11,
                  borderTopWidth: 1,
                  borderTopColor: colors.neutral800,
                  opacity: mode.available ? 1 : 0.45,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    backgroundColor: colors.neutral900,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={mode.icon} size={20} color={colors.neutral300} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[typography.cardTitle, { color: colors.text }]}>
                    {title}
                  </Text>
                  <Text style={[typography.meta, { color: colors.neutral500 }]}>
                    {description}
                  </Text>
                </View>
                {mode.available ? (
                  <Icon name="CaretRight" size={16} color={colors.neutral600} />
                ) : (
                  <Tag variant="neutral" label={t('modes.soon')} />
                )}
              </PressableScale>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
