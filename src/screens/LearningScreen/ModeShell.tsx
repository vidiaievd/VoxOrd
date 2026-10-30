import React, { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SessionHeader } from '../../components/practice';
import { Button } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { MessageLayout } from '../ReviewSessionScreen/MessageLayout';

/**
 * What a mode played on its own (not inside the deep session) keeps beside the phase it hosts:
 * the «3/18» counter, the learning session to hand to the results screen, and the difference
 * between «finished» and «had nothing to ask». A phase reports both through `onDone`; only a
 * phase that showed a question counts as finished.
 */
export function useStandaloneMode(onSessionDone: (sessionId: number) => void) {
  const [counter, setCounter] = useState<string | undefined>();
  const [empty, setEmpty] = useState(false);
  const started = useRef(false);
  const sessionRef = useRef<number | null>(null);
  const doneRef = useRef(onSessionDone);
  doneRef.current = onSessionDone;

  const onProgress = useCallback((index: number, total: number) => {
    started.current = true;
    setCounter(`${index}/${total}`);
  }, []);
  const onSession = useCallback((sessionId: number | null) => {
    sessionRef.current = sessionId;
  }, []);
  const onDone = useCallback(() => {
    if (started.current) doneRef.current(sessionRef.current ?? 0);
    else setEmpty(true);
  }, []);

  return { counter, empty, onProgress, onSession, onDone };
}

interface ModeShellProps {
  title: string;
  counter?: string;
  empty?: boolean;
  onBack: () => void;
  children: React.ReactNode;
}

/** The frame of a single mode (Practice §8.3): session header on top, the phase below. */
export function ModeShell({ title, counter, empty, onBack, children }: ModeShellProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <SessionHeader
        title={title}
        leading={empty ? 'back' : 'close'}
        leadingLabel={t('common.back')}
        onLeading={onBack}
        counter={counter}
      />
      <View style={{ flex: 1 }}>
        {empty ? (
          <MessageLayout
            icon="Info"
            title={t('modes.notEnoughWords')}
            footer={<Button block variant="ghost" label={t('common.back')} onPress={onBack} />}
          >
            <Text style={[typography.body, { color: colors.neutral400 }]}>{title}</Text>
          </MessageLayout>
        ) : (
          children
        )}
      </View>
    </SafeAreaView>
  );
}
