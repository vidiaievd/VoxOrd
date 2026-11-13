import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { Button } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { createNativeRecorder, type Capture, type RecorderPort } from '../../services/recorder';

export interface TakeButtonProps {
  /** A take is being heard; the button waits. */
  sending: boolean;
  onCapture: (capture: Capture) => void;
  /** For tests: a microphone that is not the phone's. */
  createPort?: () => RecorderPort;
}

/**
 * One button that records a take and hands it over (platform plan 86, VoxOrd step 15.3). The
 * microphone is the button's for one take: opened on press, released after the take and on
 * leaving the card — the session's own recorder is not shared with anything else.
 */
export function TakeButton({
  sending,
  onCapture,
  createPort = createNativeRecorder,
}: TakeButtonProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const [recording, setRecording] = useState(false);
  const [mic, setMic] = useState<'denied' | 'missing' | null>(null);
  const port = useRef<RecorderPort | null>(null);
  const busy = useRef(false);

  useEffect(
    () => () => {
      port.current?.cancel();
      port.current?.close();
      port.current = null;
    },
    [],
  );

  const begin = async () => {
    if (busy.current) return;
    busy.current = true;
    setMic(null);
    try {
      const next = createPort();
      const opened = await next.open();
      if (opened !== 'ok') {
        next.close();
        setMic(opened === 'denied' ? 'denied' : 'missing');
        return;
      }
      if ((await next.start()) !== 'ok') {
        next.close();
        setMic('missing');
        return;
      }
      port.current = next;
      setRecording(true);
    } finally {
      busy.current = false;
    }
  };

  const end = async () => {
    const active = port.current;
    if (active === null || busy.current) return;
    busy.current = true;
    try {
      const capture = await active.stop();
      setRecording(false);
      if (capture !== null) onCapture(capture);
    } finally {
      active.close();
      port.current = null;
      busy.current = false;
    }
  };

  return (
    <>
      <Button
        block
        size={52}
        variant="primary"
        icon="Microphone"
        label={
          sending
            ? t('soundSession.record.hearing')
            : recording
            ? t('soundSession.record.stop')
            : t('soundSession.record.record')
        }
        busy={sending}
        disabled={sending}
        onPress={recording ? end : begin}
      />
      {recording ? (
        <Text style={[typography.meta, { color: colors.neutral400 }]}>
          {t('soundSession.record.recording')}
        </Text>
      ) : null}
      {mic !== null ? (
        <Text accessibilityRole="alert" style={[typography.meta, { color: colors.neutral400 }]}>
          {t(mic === 'denied' ? 'soundSession.record.micDenied' : 'soundSession.record.micMissing')}
        </Text>
      ) : null}
    </>
  );
}
