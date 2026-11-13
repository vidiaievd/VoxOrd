import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ApiError } from '../../api/client';
import { createMockRecorder, type MockRecorder } from '../../services/recorder';
import { ReadAloudSentenceDrill } from './ReadAloudSentenceDrill';

const mockUploadRecording = jest.fn();
const mockDeleteMediaAsset = jest.fn();
const mockCheckSentence = jest.fn();
const mockFetchMediaAsset = jest.fn();

jest.mock('../../api/media', () => ({
  uploadRecording: (...a: unknown[]) => mockUploadRecording(...a),
  deleteMediaAsset: (...a: unknown[]) => mockDeleteMediaAsset(...a),
  fetchMediaAsset: (...a: unknown[]) => mockFetchMediaAsset(...a),
}));

jest.mock('../../api/sentenceCheck', () => ({
  checkSentence: (...a: unknown[]) => mockCheckSentence(...a),
}));

jest.mock('../../api/srs', () => ({ addReachedAtom: jest.fn() }));

jest.mock('../../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars === undefined ? key : `${key} ${JSON.stringify(vars)}`,
    language: 'ru',
  }),
}));

jest.mock('../../providers/ThemeProvider', () => ({
  useTheme: () => ({ colors: jest.requireActual('../../theme/colors').lightColors }),
}));

const TEXT = 'Jeg heter Anna. Jeg søker jobb.';

const ok = {
  courseId: null,
  selfCheck: null,
  ai: { status: 'ok' },
  feedback: { summary: 'Fint lest', items: [], words: [{ text: 'heter', passageIndex: 0, accuracy: 90 }] },
  reading: null,
  remaining: null,
};

function mount(overrides: { micBusy?: boolean } = {}) {
  const mic: MockRecorder = createMockRecorder();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <ReadAloudSentenceDrill
        exerciseId="ex-1"
        attemptId="att-1"
        prompt={{ id: 'p1', text: TEXT }}
        lens={null}
        createPort={() => mic}
        micBusy={overrides.micBusy ?? false}
      />,
    );
  });
  const root = renderer.root;
  const texts = () =>
    root
      .findAllByType(Text)
      .map(t => [t.props.children].flat().join(''))
      .join('\n');
  const button = (label: string) =>
    root.findAll(
      n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
    )[0];
  const press = async (label: string) => {
    const b = button(label);
    if (b === undefined) throw new Error(`No button ${label}\n${texts()}`);
    await act(async () => {
      await b.props.onPress();
    });
  };
  return { mic, texts, button, press };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUploadRecording.mockResolvedValue({ assetId: 'asset-1' });
  mockDeleteMediaAsset.mockResolvedValue(undefined);
  mockCheckSentence.mockResolvedValue(ok);
  mockFetchMediaAsset.mockResolvedValue({ id: 'asset-1', status: 'READY' });
});

describe('ReadAloudSentenceDrill', () => {
  it('shows one sentence of the passage at a time', async () => {
    const { texts, press } = mount();
    expect(texts()).toContain('Jeg heter Anna.');
    expect(texts()).not.toContain('Jeg søker jobb.');
    expect(texts()).toContain('"n":1,"total":2');

    await press('prosody.drill.next');
    expect(texts()).toContain('Jeg søker jobb.');
    expect(texts()).toContain('"n":2,"total":2');
  });

  it('records the sentence, has it heard, draws the answer and deletes the take', async () => {
    const { mic, texts, press } = mount();
    await press('prosody.drill.say');
    expect(mic.recording).toBe(true);

    await press('prosody.drill.stop');
    expect(mockUploadRecording).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: 'att-1' }),
    );
    expect(mockCheckSentence).toHaveBeenCalledWith('ex-1', 'att-1', {
      itemId: 'p1',
      sentence: 'Jeg heter Anna.',
      recordingAssetId: 'asset-1',
      explanationLanguage: 'ru',
    });
    expect(mockDeleteMediaAsset).toHaveBeenCalledWith('asset-1');
    expect(texts()).toContain('Fint lest');
  });

  it('waits for media-service to finish with the take before asking the model', async () => {
    mockFetchMediaAsset
      .mockResolvedValueOnce({ id: 'asset-1', status: 'PROCESSING' })
      .mockResolvedValue({ id: 'asset-1', status: 'READY' });
    const { press } = mount();
    await press('prosody.drill.say');
    await press('prosody.drill.stop');
    expect(mockFetchMediaAsset).toHaveBeenCalledTimes(2);
    expect(mockCheckSentence).toHaveBeenCalledTimes(1);
  });

  it('says so when the sentence has had its tries for the day', async () => {
    mockCheckSentence.mockResolvedValue({
      ...ok,
      ai: { status: 'refused', reason: 'attempt_limit' },
      feedback: null,
    });
    const { texts, press } = mount();
    await press('prosody.drill.say');
    await press('prosody.drill.stop');
    expect(texts()).toContain('exerciseRunner.precheck.line.sentenceLimit');
  });

  it('takes the button away when the school switched checks off', async () => {
    mockCheckSentence.mockRejectedValue(new ApiError({ message: 'PRECHECK_NOT_AVAILABLE', status: 403, code: 'PRECHECK_NOT_AVAILABLE' }));
    const { texts, button, press } = mount();
    await press('prosody.drill.say');
    await press('prosody.drill.stop');
    expect(button('prosody.drill.say')).toBeUndefined();
    expect(texts()).toContain('prosody.drill.closed');
  });

  it('keeps the button and says to try again on a failed upload', async () => {
    mockUploadRecording.mockRejectedValue(new Error('network'));
    const { texts, button, press } = mount();
    await press('prosody.drill.say');
    await press('prosody.drill.stop');
    expect(button('prosody.drill.say')).toBeDefined();
    expect(texts()).toContain('prosody.drill.failed');
    expect(mockCheckSentence).not.toHaveBeenCalled();
  });

  it('does not open the microphone while the passage itself is being recorded', async () => {
    const { mic, button } = mount({ micBusy: true });
    expect(button('prosody.drill.say')?.props.disabled).toBe(true);
    expect(mic.calls).toEqual([]);
  });

  it('names a blocked microphone', async () => {
    const { mic, texts, press } = mount();
    mic.openResult = 'denied';
    await press('prosody.drill.say');
    expect(texts()).toContain('prosody.drill.micDenied');
  });
});
