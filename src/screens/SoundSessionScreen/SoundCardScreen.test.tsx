import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ApiError } from '../../api/client';
import { getSoundCard } from '../../api/soundSession';
import { SoundCardScreen } from './SoundCardScreen';

jest.mock('../../api/soundSession', () => ({ getSoundCard: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, language: 'uk' }),
}));
jest.mock('../../providers/ThemeProvider', () => ({
  useTheme: () => ({
    colors: jest.requireActual('../../theme/colors').lightColors,
    typography: jest.requireActual('../../theme/typography').typography,
  }),
}));

const mockGet = getSoundCard as jest.Mock;

async function draw(onTrain = jest.fn()) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(
      <SoundCardScreen atomId="nb:kj" onBack={() => undefined} onTrain={onTrain} />,
    );
  });
  const text = tree.root
    .findAllByType(Text)
    .map(n => [n.props.children].flat(Infinity).join(''))
    .join('|');
  return { tree, text, onTrain };
}

describe('SoundCardScreen', () => {
  beforeEach(() => mockGet.mockReset());

  it('asks for the card in the interface language and draws what the base says', async () => {
    mockGet.mockResolvedValue({
      atomId: 'nb:kj', family: 'kj', ipa: 'ç', title: 'kj', description: null,
      howTo: 'Tongue up.', drill: null, commonError: 'Hard k.', ukNote: null, carrierWords: ['kyss', 'kino'],
    });
    const { text } = await draw();
    expect(mockGet).toHaveBeenCalledWith('nb:kj', 'uk');
    expect(text).toContain('Tongue up.');
    expect(text).toContain('Hard k.');
    expect(text).toContain('kyss · kino');
    expect(text).not.toContain('soundSession.card.description');
  });

  it('trains the sound on the card', async () => {
    mockGet.mockResolvedValue({
      atomId: 'nb:kj', family: 'kj', ipa: '', title: 'kj', description: null,
      howTo: 'x', drill: null, commonError: null, ukNote: null, carrierWords: [],
    });
    const { tree, onTrain } = await draw();
    act(() => tree.root.find(n => n.props.label === 'soundSession.card.train').props.onPress());
    expect(onTrain).toHaveBeenCalledWith('nb:kj');
  });

  it('tells «no such sound» from a fault', async () => {
    mockGet.mockRejectedValue(new ApiError({ message: 'x', status: 404 }));
    expect((await draw()).text).toContain('soundSession.card.notFound');
    mockGet.mockRejectedValue(new Error('boom'));
    expect((await draw()).text).toContain('soundSession.card.failed');
  });
});
