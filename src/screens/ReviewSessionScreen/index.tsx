import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useSrsReview } from '../../hooks/useSrsReview';
import { predictedByRating } from '../../api/srs';
import { OfflineBanner } from '../../components/OfflineBanner';
import { RatingButtons } from './RatingButtons';

interface ReviewSessionScreenProps {
  onBack: () => void;
}

/**
 * Course-word review session (Phase 8.1). A thin client over the server's FSRS:
 * it renders the due queue, shows the server's predicted intervals on the
 * rating buttons, and submits answers — no scheduling happens here. Personal
 * VoxOrd words are untouched by this screen; they keep their own local engine.
 */
export function ReviewSessionScreen({ onBack }: ReviewSessionScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const session = useSrsReview();

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
        <Text style={styles.backText}>‹ {t('common.back')}</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{t('review.title')}</Text>
      <Text style={styles.counter}>
        {session.card ? `${session.reviewedCount + 1}/${session.reviewedCount + session.remainingCount}` : ''}
      </Text>
    </View>
  );

  const renderBody = () => {
    if (session.loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      );
    }

    if (session.loadError) {
      return (
        <View style={styles.centered}>
          <Text style={styles.message}>
            {session.offline ? t('review.offlineLoad') : t('review.loadError')}
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={session.reload} activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>{t('courses.retry')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!session.card) {
      // Both "nothing was due" and "the session is finished" land here; the
      // count tells them apart.
      return (
        <View style={styles.centered}>
          <Text style={styles.doneTitle}>
            {session.finished ? t('review.sessionDone') : t('review.nothingDue')}
          </Text>
          {session.finished && (
            <Text style={styles.message}>
              {t('review.reviewedCount', { count: session.reviewedCount })}
            </Text>
          )}
          {session.pendingCount > 0 && (
            <Text style={styles.pending}>
              {t('review.pendingSync', { count: session.pendingCount })}
            </Text>
          )}
          <TouchableOpacity style={styles.primaryButton} onPress={onBack} activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const { card } = session;
    const front = card.front!;
    const back = card.back ?? null;

    return (
      <>
        <ScrollView contentContainerStyle={styles.cardBody}>
          <Text style={styles.word}>{front.word}</Text>
          {!!front.partOfSpeech && <Text style={styles.pos}>{front.partOfSpeech}</Text>}
          {!!front.ipaTranscription && <Text style={styles.ipa}>{front.ipaTranscription}</Text>}

          {session.revealed && (
            <View style={styles.answer}>
              {back?.translation ? (
                <Text style={styles.translation}>{back.translation}</Text>
              ) : (
                <Text style={styles.noTranslation}>{t('review.noTranslation')}</Text>
              )}
              {!!back?.alternativeTranslations.length && (
                <Text style={styles.alternatives}>{back.alternativeTranslations.join(', ')}</Text>
              )}
              {!!back?.definition && <Text style={styles.definition}>{back.definition}</Text>}
              {back?.examples.map((example, i) => (
                <View key={i} style={styles.example}>
                  <Text style={styles.exampleText}>{example.text}</Text>
                  {!!example.translation && (
                    <Text style={styles.exampleTranslation}>{example.translation}</Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {session.revealed ? (
          <RatingButtons predicted={predictedByRating(card)} onRate={session.rate} />
        ) : (
          <TouchableOpacity style={styles.revealButton} onPress={session.reveal} activeOpacity={0.8}>
            <Text style={styles.revealText}>{t('review.showAnswer')}</Text>
          </TouchableOpacity>
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header}
      {/* Answers are queued while offline, so the session keeps running. */}
      {session.offline && <OfflineBanner />}
      {renderBody()}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      minWidth: 70,
    },
    backText: {
      fontSize: 16,
      color: colors.accent,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    counter: {
      minWidth: 70,
      textAlign: 'right',
      fontSize: 14,
      color: colors.textSecondary,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      gap: 12,
    },
    message: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    pending: {
      fontSize: 13,
      color: colors.warning,
      textAlign: 'center',
    },
    doneTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    primaryButton: {
      marginTop: 8,
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 28,
    },
    primaryButtonText: {
      color: colors.textInverted,
      fontSize: 16,
      fontWeight: '600',
    },
    cardBody: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 32,
    },
    word: {
      fontSize: 34,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    pos: {
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 6,
    },
    ipa: {
      fontSize: 15,
      color: colors.textSecondary,
      marginTop: 4,
    },
    answer: {
      marginTop: 28,
      alignItems: 'center',
      alignSelf: 'stretch',
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 24,
      gap: 8,
    },
    translation: {
      fontSize: 24,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    noTranslation: {
      fontSize: 15,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
    alternatives: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    definition: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    example: {
      alignSelf: 'stretch',
      backgroundColor: colors.backgroundCard,
      borderRadius: 10,
      padding: 12,
      marginTop: 4,
    },
    exampleText: {
      fontSize: 15,
      color: colors.textPrimary,
    },
    exampleTranslation: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },
    revealButton: {
      margin: 16,
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    revealText: {
      color: colors.textInverted,
      fontSize: 16,
      fontWeight: '600',
    },
  });
