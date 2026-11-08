import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '../../api/client';
import { getSoundCard, type SoundCard } from '../../api/soundSession';
import { Button, Overline, SubScreen } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';

type Load =
  | { name: 'loading' }
  | { name: 'ready'; card: SoundCard }
  | { name: 'missing' }
  | { name: 'failed' };

export interface SoundCardScreenProps {
  atomId: string;
  onBack: () => void;
  /** «Train this sound»: a session on this one. */
  onTrain: (atomId: string) => void;
}

/**
 * The learner's card of a sound (platform plan 86, VoxOrd step 15.4): the base's words in the
 * interface language, and a way into a session on it.
 */
export function SoundCardScreen({ atomId, onBack, onTrain }: SoundCardScreenProps) {
  const { t, language } = useTranslation();
  const { colors, typography } = useTheme();
  const [load, setLoad] = useState<Load>({ name: 'loading' });

  useEffect(() => {
    let live = true;
    setLoad({ name: 'loading' });
    getSoundCard(atomId, language)
      .then(card => live && setLoad({ name: 'ready', card }))
      .catch(e => {
        if (!live) return;
        setLoad(e instanceof ApiError && e.status === 404 ? { name: 'missing' } : { name: 'failed' });
      });
    return () => {
      live = false;
    };
  }, [atomId, language]);

  const secondary = [typography.secondary, { color: colors.neutral400 }];
  let body: React.ReactNode;
  if (load.name === 'loading') {
    body = <Text style={secondary}>{t('soundSession.card.loading')}</Text>;
  } else if (load.name === 'missing') {
    body = (
      <Text accessibilityRole="alert" style={secondary}>
        {t('soundSession.card.notFound')}
      </Text>
    );
  } else if (load.name === 'failed') {
    body = (
      <Text accessibilityRole="alert" style={secondary}>
        {t('soundSession.card.failed')}
      </Text>
    );
  } else {
    const { card } = load;
    const parts: Array<[string, string | null]> = [
      [t('soundSession.card.description'), card.description],
      [t('soundSession.card.howTo'), card.howTo],
      [t('soundSession.card.drill'), card.drill],
      [t('soundSession.card.commonError'), card.commonError],
    ];
    body = (
      <View
        style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 12 }}
      >
        <View style={{ gap: 2 }}>
          <Text style={[typography.cardTitle, { color: colors.text }]}>{card.title}</Text>
          {card.ipa !== '' ? (
            <Text style={[typography.meta, { color: colors.neutral500 }]}>
              {t('soundSession.card.ipa')}: {card.ipa}
            </Text>
          ) : null}
        </View>
        {parts.map(([label, text]) =>
          text === null ? null : (
            <View key={label} style={{ gap: 4 }}>
              <Overline>{label}</Overline>
              <Text style={secondary}>{text}</Text>
            </View>
          ),
        )}
        {card.ukNote !== null ? <Text style={secondary}>{card.ukNote}</Text> : null}
        {card.carrierWords.length > 0 ? (
          <View style={{ gap: 4 }}>
            <Overline>{t('soundSession.card.carriers')}</Overline>
            <Text style={[typography.body, { color: colors.text }]}>
              {card.carrierWords.join(' · ')}
            </Text>
          </View>
        ) : null}
        <Button
          block
          size={48}
          label={t('soundSession.card.train')}
          onPress={() => onTrain(card.atomId)}
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <SubScreen
        backLabel={t('soundSession.title')}
        onBack={onBack}
        title={load.name === 'ready' ? load.card.title : t('soundSession.card.open')}
      >
        {body}
      </SubScreen>
    </SafeAreaView>
  );
}
