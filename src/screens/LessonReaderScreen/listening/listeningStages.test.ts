import type { ListeningStage } from '../../../api/lessons';
import { groupListeningStages, nextAudioLessonStage } from './listeningStages';

function makeStage(overrides: Partial<ListeningStage> & { position: number }): ListeningStage {
  return {
    stageType: 'gap_fill',
    exercise: {
      id: `ex-${overrides.position}`,
      templateCode: 'fill_in_blank',
      content: {},
      instructions: [],
    },
    ...overrides,
  };
}

describe('groupListeningStages', () => {
  it('splits gap_fill and comprehension stages by type, sorted by position', () => {
    const stages: ListeningStage[] = [
      makeStage({ position: 2, stageType: 'comprehension' }),
      makeStage({ position: 0, stageType: 'gap_fill' }),
      makeStage({ position: 1, stageType: 'gap_fill' }),
      makeStage({ position: 3, stageType: 'comprehension' }),
    ];

    const result = groupListeningStages(stages);

    expect(result.gapFillExerciseIds).toEqual(['ex-0', 'ex-1']);
    expect(result.comprehensionExerciseIds).toEqual(['ex-2', 'ex-3']);
  });

  it('drops stages with no attached exercise', () => {
    const stages: ListeningStage[] = [
      makeStage({ position: 0, stageType: 'gap_fill', exercise: null }),
      makeStage({ position: 1, stageType: 'gap_fill' }),
    ];

    expect(groupListeningStages(stages).gapFillExerciseIds).toEqual(['ex-1']);
  });

  it('ignores unknown stage types', () => {
    const stages: ListeningStage[] = [makeStage({ position: 0, stageType: 'intro' })];

    const result = groupListeningStages(stages);
    expect(result.gapFillExerciseIds).toEqual([]);
    expect(result.comprehensionExerciseIds).toEqual([]);
  });

  it('returns empty arrays for an empty input', () => {
    expect(groupListeningStages([])).toEqual({
      gapFillExerciseIds: [],
      comprehensionExerciseIds: [],
    });
  });
});

describe('nextAudioLessonStage', () => {
  it('goes listen -> gapfill -> comprehension -> done when both exist', () => {
    expect(nextAudioLessonStage('listen', true, true)).toBe('gapfill');
    expect(nextAudioLessonStage('gapfill', true, true)).toBe('comprehension');
    expect(nextAudioLessonStage('comprehension', true, true)).toBe('done');
  });

  it('skips gapfill when there are no gap-fill exercises', () => {
    expect(nextAudioLessonStage('listen', false, true)).toBe('comprehension');
  });

  it('skips comprehension when there are no comprehension exercises', () => {
    expect(nextAudioLessonStage('gapfill', true, false)).toBe('done');
  });

  it('goes straight to done when neither stage has exercises', () => {
    expect(nextAudioLessonStage('listen', false, false)).toBe('done');
  });

  it('stays at done once reached', () => {
    expect(nextAudioLessonStage('done', true, true)).toBe('done');
  });
});
