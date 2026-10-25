import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { ThemeProvider } from '../../../providers/ThemeProvider';
import { recordedSubmissions } from '../../../api/__fixtures__/submissionsRecorded';
import { parseMasteryProfile } from '../../../api/masteryProfile';
import { parseSubmissionsPage, type MySubmissions } from '../../../api/submissions';
import { TeacherFeedback } from './TeacherFeedback';
import { WorkOnThis } from './WorkOnThis';
import { NextClass } from './NextClass';

/*
 * A block whose source failed with nothing cached gets `null` from its hook (the ports throw
 * on 5xx, the SWR hook keeps no data) — and must then draw nothing, leaving the rest of Today.
 */

jest.mock('../../../hooks/useSettings', () => ({ useSettings: () => ({ theme: 'dark', uiLanguage: 'ru' }) }));

let mockSubmissions: MySubmissions | null = null;
jest.mock('../../../hooks/useMySubmissions', () => ({
  useMySubmissions: () => ({ status: 'loaded', submissions: mockSubmissions, stale: false, refresh: async () => {} }),
}));
let mockProfile: unknown = null;
jest.mock('../../../hooks/useMasteryProfile', () => ({
  useMasteryProfile: () => ({ profile: mockProfile, refresh: async () => {} }),
}));

function render(el: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<ThemeProvider>{el}</ThemeProvider>);
  });
  return tree;
}

const texts = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children as string);

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-24T12:00:00.000Z'));
});
afterAll(() => jest.useRealTimers());

describe('TeacherFeedback', () => {
  it('draws nothing when the list could not be read', () => {
    mockSubmissions = null;
    expect(render(<TeacherFeedback offline={false} onNavigate={jest.fn()} />).toJSON()).toBeNull();
  });

  it('opens the latest review, and Back returns to Today', () => {
    const items = parseSubmissionsPage(recordedSubmissions.mine)!;
    mockSubmissions = { items, pendingCount: 5, pendingCapped: false };
    const onNavigate = jest.fn();

    const tree = render(<TeacherFeedback offline={false} onNavigate={onNavigate} />);

    expect(texts(tree)).toEqual(expect.arrayContaining(['От преподавателя', 'Зачтено', 'У преподавателя: 5']));
    act(() => tree.root.findByProps({ accessibilityRole: 'button' }).props.onPress());
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Submission', returnTo: { name: 'Today' } }),
    );
  });

  it('offline, says new reviews come later instead of a count', () => {
    mockSubmissions = { items: parseSubmissionsPage(recordedSubmissions.mine)!, pendingCount: 5, pendingCapped: false };
    const all = texts(render(<TeacherFeedback offline onNavigate={jest.fn()} />));
    expect(all).toContain('Новые отзывы появятся при подключении');
    expect(all).not.toContain('У преподавателя: 5');
  });
});

describe('WorkOnThis', () => {
  it('draws nothing without a profile', () => {
    mockProfile = null;
    expect(render(<WorkOnThis onOpenPractice={jest.fn()} />).toJSON()).toBeNull();
  });

  it('names topics and no numbers', () => {
    mockProfile = parseMasteryProfile(recordedSubmissions.mastery);
    const all = texts(render(<WorkOnThis onOpenPractice={jest.fn()} />));
    expect(all).toContain('Стоит поработать');
    expect(all).toContain('Чтение');
    expect(all.some((s) => /\d/.test(s))).toBe(false);
  });
});

describe('NextClass', () => {
  it('has no empty card', () => {
    expect(render(<NextClass nextClass={null} />).toJSON()).toBeNull();
  });
});
