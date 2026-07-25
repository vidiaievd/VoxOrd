import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import type { LessonReaderContent } from '../../api/lessons';
import { useMarkLessonRead } from '../../hooks/useMarkLessonRead';
import { groupListeningStages, nextAudioLessonStage, type AudioLessonStage } from './listening/listeningStages';
import { StageTracker } from './listening/StageTracker';
import { ListenStage } from './listening/ListenStage';
import { ExerciseStage } from './listening/ExerciseStage';
import { DoneStage } from './listening/DoneStage';

interface AudioLessonViewProps {
  lessonId: string;
  data: LessonReaderContent;
  onFinished: () => void;
}

/**
 * AUDIO-kind lesson flow (Phase 7): listen -> gapfill -> comprehension -> done,
 * skipping any stage with zero exercises. Narration audio comes from
 * `data.mediaIds` (resolved via `AudioPlayer`/`useAudioPlayer`), not from a
 * markdown token — see the note on `LessonReaderContent.mediaIds`.
 */
export function AudioLessonView({ lessonId, data, onFinished }: AudioLessonViewProps) {
  const [stage, setStage] = useState<AudioLessonStage>('listen');
  const { status: markStatus, error: markError, markAsRead } = useMarkLessonRead(lessonId);

  const { gapFillExerciseIds, comprehensionExerciseIds } = useMemo(
    () => groupListeningStages(data.listeningStages ?? []),
    [data.listeningStages],
  );
  const hasGapFill = gapFillExerciseIds.length > 0;
  const hasComprehension = comprehensionExerciseIds.length > 0;

  const mediaId = data.mediaIds[0] ?? null;
  const audioLabel = data.displayTitle ?? data.title;

  const advanceFrom = useCallback(
    (current: AudioLessonStage) => setStage(nextAudioLessonStage(current, hasGapFill, hasComprehension)),
    [hasGapFill, hasComprehension],
  );

  const handleFinish = useCallback(async () => {
    const ok = await markAsRead();
    if (ok) onFinished();
  }, [markAsRead, onFinished]);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <StageTracker stage={stage} hasGapFill={hasGapFill} hasComprehension={hasComprehension} />

      {stage === 'listen' && (
        <ListenStage mediaId={mediaId} audioLabel={audioLabel} onNext={() => advanceFrom('listen')} />
      )}

      {stage === 'gapfill' && (
        <ExerciseStage
          exerciseIds={gapFillExerciseIds}
          headingKey="audioLesson.gapFillHeading"
          bodyKey="audioLesson.gapFillBody"
          mediaId={mediaId}
          audioLabel={audioLabel}
          onComplete={() => advanceFrom('gapfill')}
        />
      )}

      {stage === 'comprehension' && (
        <ExerciseStage
          exerciseIds={comprehensionExerciseIds}
          headingKey="audioLesson.comprehensionHeading"
          bodyKey="audioLesson.comprehensionBody"
          mediaId={mediaId}
          audioLabel={audioLabel}
          onComplete={() => advanceFrom('comprehension')}
        />
      )}

      {stage === 'done' && (
        <DoneStage
          submitting={markStatus === 'submitting'}
          error={markError?.message ?? null}
          onContinue={handleFinish}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
  },
});
