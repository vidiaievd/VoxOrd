import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { getLocales } from 'react-native-localize';
import { settingsStore } from '../store/settingsStore';
import { watchDeviceLocales } from './deviceLocales';
import { useTranslation } from './index';

const phone = (tag: string) =>
  (getLocales as jest.Mock).mockReturnValue([
    { languageCode: tag.slice(0, 2), countryCode: tag.slice(3), languageTag: tag, isRTL: false },
  ]);

describe('useTranslation', () => {
  // A body puts its footer button in the runner through an effect with `t` among its
  // dependencies. A new `t` per render re-ran that effect on every render the runner's own
  // update caused: a loop that never shows on screen and never stops.
  it('hands back the same t across renders for one language', () => {
    const seen: unknown[] = [];
    function Probe({ tick }: { tick: number }) {
      const { t } = useTranslation();
      seen.push(t);
      return <>{tick}</>;
    }

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<Probe tick={1} />);
    });
    act(() => {
      renderer.update(<Probe tick={2} />);
    });

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
  });
});

describe('useTranslation on «as on the phone»', () => {
  let onAppState: ((state: string) => void) | undefined;

  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _: string,
      cb: (s: string) => void,
    ) => {
      onAppState = cb;
      return { remove: jest.fn() };
    }) as never);
  });

  afterEach(() => jest.restoreAllMocks());

  // Plurals are picked by the resolved code: «system» is not a language `pickPlural` knows.
  it('speaks the phone language, plurals included, and follows a change made meanwhile', () => {
    expect(settingsStore.getAll().uiLanguage).toBe('system'); // a fresh install
    phone('en-US');
    const stop = watchDeviceLocales();
    act(() => onAppState?.('active')); // drop whatever an earlier test cached
    function Probe() {
      const { t, language } = useTranslation();
      return <>{`${language}|${t('today.reviewDue', { count: 1 })}`}</>;
    }

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<Probe />);
    });
    expect(renderer.toJSON()).toBe('en|1 card is due for review');

    phone('uk-UA');
    act(() => onAppState?.('active'));
    expect(renderer.toJSON()).toBe('uk|1 картка чекає на повторення');
    stop();
  });
});
