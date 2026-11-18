import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { MaintenanceNote, SchoolStatusBanner } from './SchoolStatusBanner';

jest.mock('../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars === undefined ? key : `${key} ${JSON.stringify(vars)}`,
    language: 'en',
  }),
}));

jest.mock('../providers/ThemeProvider', () => {
  const actual = jest.requireActual('../theme/colors');
  return { useTheme: () => ({ colors: actual.lightColors, typography: {} }) };
});

function render(node: React.ReactElement) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(node);
  });
  return renderer;
}
const texts = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(Text).map(n => String(n.props.children));

describe('SchoolStatusBanner', () => {
  it('draws nothing for an active school or an unknown status', () => {
    expect(render(<SchoolStatusBanner status="active" />).toJSON()).toBeNull();
    expect(render(<SchoolStatusBanner status={undefined} />).toJSON()).toBeNull();
  });

  it('says a suspended school is paused, with the days left when it has a date', () => {
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();
    expect(texts(render(<SchoolStatusBanner status="suspended" />))).toEqual([
      'schoolLifecycle.suspendedTitle',
      'schoolLifecycle.suspended',
    ]);
    const withDate = texts(render(<SchoolStatusBanner status="suspended" closesAt={soon} />));
    expect(withDate[1]).toContain('schoolLifecycle.suspendedDays');
    expect(withDate[1]).toContain('"days":5');
  });

  it('says a closed school has gone', () => {
    expect(texts(render(<SchoolStatusBanner status="closed" />))).toEqual([
      'schoolLifecycle.closedTitle',
      'schoolLifecycle.closed',
    ]);
  });
});

describe('MaintenanceNote', () => {
  it('stays quiet for a maintained course and speaks for the other two', () => {
    expect(render(<MaintenanceNote status="maintained" />).toJSON()).toBeNull();
    expect(render(<MaintenanceNote status={undefined} />).toJSON()).toBeNull();
    expect(texts(render(<MaintenanceNote status="unmaintained" />))[0]).toBe('schoolLifecycle.unmaintained');
    expect(texts(render(<MaintenanceNote status="obsolete" />))[0]).toBe('schoolLifecycle.obsolete');
  });
});
