import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { ExerciseDisplay } from '../../api/types';
import { createMockRecorder, type MockRecorder } from '../../services/recorder';
import type { ExerciseBodyProps } from './ExerciseBody';
import { ReadAloudBody } from './ReadAloudBody';

/**
 * (Drill file.) The body is the whole solver on the phone — the card, the recorder, the uploads, the draft,
 * the hand-in and what follows it — so its rules are tested here against a mock microphone and
 * mocked services, the way the web tests `read-aloud-solver.tsx`.
 */

const mockRecentAttempts = jest.fn();
const mockSaveDraft = jest.fn();
const mockGetAttempt = jest.fn();
const mockGetMediaAsset = jest.fn();
const mockUploadRecording = jest.fn();
const mockDeleteMediaAsset = jest.fn();

jest.mock('../../api/exercises', () => ({
  recentAttempts: (...a: unknown[]) => mockRecentAttempts(...a),
  saveDraft: (...a: unknown[]) => mockSaveDraft(...a),
  getAttempt: (...a: unknown[]) => mockGetAttempt(...a),
}));

const mockGetAiReview = jest.fn();
jest.mock('../../api/aiReview', () => ({
  ...jest.requireActual('../../api/aiReview'),
  getAiReview: (...a: unknown[]) => mockGetAiReview(...a),
}));

jest.mock('../../api/media', () => ({
  getMediaAsset: (...a: unknown[]) => mockGetMediaAsset(...a),
  uploadRecording: (...a: unknown[]) => mockUploadRecording(...a),
  deleteMediaAsset: (...a: unknown[]) => mockDeleteMediaAsset(...a),
}));

jest.mock('react-native-sound', () => {
  function Sound() {}
  Sound.setCategory = () => undefined;
  return Sound;
});

jest.mock('../../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars === undefined ? key : `${key} ${JSON.stringify(vars)}`,
    language: 'en',
  }),
}));

jest.mock('../../providers/ThemeProvider', () => ({
  useTheme: () => ({
    colors: jest.requireActual('../../theme/colors').lightColors,
  }),
}));

jest.mock('../../hooks/useExerciseAudio', () => ({
  useExerciseAudio: () => ({
    audio: {
      enabled: false,
      settings: { layout: 'top', transcriptWhen: 'never' },
    },
    segments: {},
    gated: false,
  }),
}));

jest.mock('./audio', () => ({
  ExerciseAudioPlayer: () => null,
}));


/* The sentence card stands in for itself: what matters here is which passage it is of. */
const mockDrillMounts: string[] = [];
const mockDrillUnmounts: string[] = [];
jest.mock('./ReadAloudSentenceDrill', () => {
  const ReactActual = jest.requireActual('react');
  return {
    ReadAloudSentenceDrill: ({ prompt }: { prompt: { id: string } }) => {
      ReactActual.useEffect(() => {
        mockDrillMounts.push(prompt.id);
        return () => {
          mockDrillUnmounts.push(prompt.id);
        };
      }, []);
      return null;
    },
  };
});
jest.mock('../../hooks/useProsody', () => ({
  wantsProsody: () => true,
  useExerciseProsody: () => null,
  useProsodySettings: () => ({
    mode: 'sentences',
    lens: null,
    legend: false,
    setMode: () => Promise.resolve(),
    setLens: () => Promise.resolve(),
    setLegend: () => Promise.resolve(),
  }),
}));
jest.mock('../../components/prosody/ProsodyControls', () => ({ ProsodyControls: () => null }));
jest.mock('../../components/prosody/ProsodyLegend', () => ({ ProsodyLegend: () => null }));

const content = (recording: Record<string, unknown> = {}) => ({
  title: 'Les høyt',
  instruction: 'Les teksten høyt.',
  language: 'nb',
  mode: 'read',
  prompts: [
    {
      id: 'p1',
      label: 'Avsnitt 1',
      minSeconds: 5,
      maxSeconds: 30,
      prepSeconds: 0,
      text: 'Jeg heter Kari.',
    },
  ],
  recording: {
    takes: 2,
    chooseBest: true,
    listenBack: true,
    countdown: false,
    micCheck: false,
    keepAllTakes: false,
    ...recording,
  },
  settings: {
    showRubric: 'afterGraded',
    showModel: 'afterGraded',
    revision: 'return',
  },
});

const display = (recording?: Record<string, unknown>): ExerciseDisplay =>
  ({
    id: 'ex-1',
    templateCode: 'read_aloud',
    targetLanguage: 'nb',
    content: content(recording),
    instructions: [],
  } as unknown as ExerciseDisplay);


const twoPassages = (): ExerciseDisplay => {
  const d = display();
  const c = d.content as unknown as { prompts: Record<string, unknown>[] };
  c.prompts = [
    { ...c.prompts[0] },
    { ...c.prompts[0], id: 'p2', label: 'Avsnitt 2', text: 'Hun bor i Oslo.' },
  ];
  return d;
};

describe('ReadAloudBody — the sentence card', () => {
  beforeEach(() => {
    mockDrillMounts.length = 0;
    mockDrillUnmounts.length = 0;
    mockRecentAttempts.mockResolvedValue([]);
    mockSaveDraft.mockResolvedValue(undefined);
  });

  // Moving to the next passage left the last passage's sentence and the model's word on it
  // under the new one (OQ-S3 s19): the card is the passage's own and goes with it.
  it('starts afresh on every passage', async () => {
    const mic: MockRecorder = createMockRecorder();
    const props: ExerciseBodyProps = {
      display: twoPassages(),
      phase: 'answering',
      disabled: false,
      verdict: null,
      onAnswerChange: jest.fn(),
      answerQuestion: jest.fn(),
      checkRow: jest.fn(),
      checkTable: jest.fn(),
      finishTable: jest.fn(),
      openAttempt: jest.fn().mockResolvedValue('att-1'),
    };
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<ReadAloudBody {...props} createPort={() => mic} />);
    });
    const press = async (key: string) => {
      const b = renderer.root
        .findAllByType(TouchableOpacity)
        .find(x => x.findAllByType(Text).some(t => [t.props.children].flat().join('').includes(key)));
      if (b === undefined) throw new Error(`no button ${key}`);
      await act(async () => {
        b.props.onPress();
      });
    };
    await press('readAloud.card.start');
    expect(mockDrillMounts).toEqual(['p1']);
    // The passage to record is drawn whole beside the drill, not replaced by its first sentence.
    const texts = () =>
      renderer.root
        .findAllByType(Text)
        .map(t => [t.props.children].flat().join(''))
        .join('\n');
    expect(texts()).toContain('Jeg heter Kari.');

    await press('readAloud.next');
    expect(mockDrillUnmounts).toEqual(['p1']);
    expect(mockDrillMounts).toEqual(['p1', 'p2']);
    expect(texts()).toContain('Hun bor i Oslo.');
  });
});
