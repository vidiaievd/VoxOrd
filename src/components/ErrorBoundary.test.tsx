import React from 'react';
import { Share, Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ErrorBoundary } from './ErrorBoundary';
import { Button } from './ui';
import { setCurrentScreen } from '../lib/crashReport';

jest.mock('../i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, language: 'en' }),
}));

jest.mock('../providers/ThemeProvider', () => ({
  useTheme: () => ({
    colors: jest.requireActual('../theme/colors').lightColors,
    typography: jest.requireActual('../theme/typography').typography,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

let mockThrow = true;
function Flaky() {
  if (mockThrow) throw new Error('render blew up');
  return <Text>fine</Text>;
}

function texts(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(Text).map(n => String(n.props.children));
}

describe('ErrorBoundary', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    mockThrow = true;
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('shows the crash screen with a report naming the error and the screen', () => {
    setCurrentScreen('ExerciseRunner');
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ErrorBoundary>
          <Flaky />
        </ErrorBoundary>,
      );
    });
    const all = texts(renderer).join('\n');
    expect(all).toContain('crash.title');
    expect(all).toContain('Error: render blew up');
    expect(all).toContain('Screen: ExerciseRunner');
  });

  it('hands the report to the share sheet', () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ErrorBoundary>
          <Flaky />
        </ErrorBoundary>,
      );
    });
    const sendButton = renderer.root
      .findAllByType(Button)
      .find(b => b.props.label === 'crash.share')!;
    act(() => sendButton.props.onPress());
    expect(share).toHaveBeenCalledWith({
      message: expect.stringContaining('render blew up'),
    });
    share.mockRestore();
  });

  it('mounts the children afresh on «Back to the app»', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ErrorBoundary>
          <Flaky />
        </ErrorBoundary>,
      );
    });
    mockThrow = false;
    const retry = renderer.root.findAllByType(Button).find(b => b.props.label === 'crash.retry')!;
    act(() => retry.props.onPress());
    expect(texts(renderer)).toEqual(['fine']);
  });
});
