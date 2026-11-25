import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { ExerciseAudioEngine } from '../../../hooks/useExerciseAudio';
import { INITIAL_STATE } from '../../../lib/audio';
import { ExerciseAudioPlayer } from './ExerciseAudioPlayer';

/**
 * The status line of a clip that cannot play: offline with the clip not on the phone it
 * says the network is needed (OQ-S3 П-2, step 4 live check), anything else keeps the
 * "could not be played" line.
 */

jest.mock('../../../i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    language: 'en',
  }),
}));

jest.mock('../../../providers/ThemeProvider', () => ({
  useTheme: () => ({
    colors: jest.requireActual('../../../theme/colors').lightColors,
  }),
}));

jest.mock('../../../components/ui', () => ({
  Icon: () => null,
}));

function engine(over: Partial<ExerciseAudioEngine>): ExerciseAudioEngine {
  return {
    audio: { enabled: true, title: 'dictation-pilot', settings: { plays: 3 } },
    segments: {},
    src: null,
    state: INITIAL_STATE,
    duration: 14,
    playing: false,
    plays: 0,
    limit: 3,
    exhausted: false,
    heard: false,
    gated: false,
    canPlay: false,
    failed: false,
    offline: false,
    loading: false,
    speed: 1,
    toggle: jest.fn(),
    back: jest.fn(),
    seekTo: jest.fn(),
    playRange: jest.fn(),
    cycleSpeed: jest.fn(),
    reset: jest.fn(),
    ...over,
  } as unknown as ExerciseAudioEngine;
}

function texts(eng: ExerciseAudioEngine): string[] {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(<ExerciseAudioPlayer eng={eng} />);
  });
  return tree.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .filter((c): c is string => typeof c === 'string');
}

describe('ExerciseAudioPlayer status line', () => {
  it('says the network is needed when the clip is not on the phone and the server is out of reach', () => {
    const shown = texts(engine({ failed: true, offline: true }));
    expect(shown).toContain('exerciseRunner.audio.status.offline');
    expect(shown).not.toContain('exerciseRunner.audio.status.failed');
  });

  it('keeps "could not be played" for any other failure', () => {
    const shown = texts(engine({ failed: true, offline: false }));
    expect(shown).toContain('exerciseRunner.audio.status.failed');
    expect(shown).not.toContain('exerciseRunner.audio.status.offline');
  });

  it('a playable clip shows the idle line', () => {
    expect(texts(engine({ canPlay: true }))).toContain('exerciseRunner.audio.status.idle');
  });
});
