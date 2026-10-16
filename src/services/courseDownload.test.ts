// The default instance wires native storage, the network and the importer; the tests build their own.
jest.mock('@react-native-async-storage/async-storage', () => ({
  createAsyncStorage: () => ({ getItem: async () => null, setItem: async () => undefined }),
}));
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn() }));
jest.mock('../repositories/VocabularyImportRepository', () => ({ vocabularyImportRepository: {} }));
jest.mock('./mediaCache', () => ({ mediaCache: {} }));

const mockApi = {
  courseHome: jest.fn(),
  unitContents: jest.fn(),
  lesson: jest.fn(),
  grammar: jest.fn(),
  vocab: jest.fn(),
  exercise: jest.fn(),
};
jest.mock('../api/courseHome', () => ({ getCourseHome: (id: string) => mockApi.courseHome(id) }));
jest.mock('../api/unitContents', () => ({ getUnitContents: (id: string) => mockApi.unitContents(id) }));
jest.mock('../api/lessons', () => ({ getLessonReaderContent: (id: string) => mockApi.lesson(id) }));
jest.mock('../api/grammarRules', () => ({
  getGrammarRuleExplanation: (id: string) => mockApi.grammar(id),
}));
jest.mock('../api/vocabulary', () => ({
  getVocabularyListReader: (id: string) => mockApi.vocab(id),
  getVocabularyList: jest.fn(),
}));
jest.mock('../api/exercises', () => ({
  getExerciseDisplay: (id: string) => mockApi.exercise(id),
  getExerciseAnswers: jest.fn(),
}));

import { ApiError } from '../api/client';
import type { UnitSummary } from '../api/types';
import { ALL_UNITS } from '../store/settingsStore';
import {
  CourseDownloader,
  DOWNLOAD_INTERVAL_MS,
  unitWindow,
  type CourseDownloadDeps,
  type CourseRun,
  MIN_FREE_BYTES,
} from './courseDownload';

const offline = () => new ApiError({ message: 'offline', status: null, code: 'NETWORK_ERROR' });
const item = (contentType: string, contentId: string) => ({ id: `i-${contentId}`, contentType, contentId });
const unit = (id: string, status: UnitSummary['status']): UnitSummary => ({
  id,
  position: 0,
  title: id,
  status,
  completedLessons: 0,
  totalLessons: 1,
});

const NARRATION = '11111111-1111-4111-8111-111111111111';
const CLIP = '22222222-2222-4222-8222-222222222222';
const LATER = '33333333-3333-4333-8333-333333333333';

function makeDeps(overrides: Partial<CourseDownloadDeps> = {}) {
  const stored = new Map<string, unknown>();
  const runs = new Map<string, CourseRun>();
  const imported: string[] = [];
  const downloaded: string[] = [];
  const retained: Set<string>[] = [];
  let now = 1_000_000;
  const deps: CourseDownloadDeps = {
    getUserId: () => 'user-1',
    getUiLanguage: () => 'ru',
    getUnitsAhead: () => 1,
    mediaAllowed: async () => true,
    freeBytes: async () => 10 * 1024 * 1024 * 1024,
    getMyCourses: async () => [{ container: { id: 'course-1' } } as never],
    getContainer: jest.fn(async () => ({ difficultyLevel: 'A2', targetLanguage: 'nb' }) as never),
    store: async (key, value) => {
      stored.set(key, value);
    },
    importList: async listId => {
      imported.push(listId);
    },
    media: {
      download: async id => {
        downloaded.push(id);
        return true;
      },
      retainOnly: async ids => {
        retained.push(ids);
      },
    },
    getRun: async key => runs.get(key) ?? null,
    setRun: async (key, run) => {
      runs.set(key, run);
    },
    now: () => now,
    ...overrides,
  };
  return { deps, stored, runs, imported, downloaded, retained, advance: (ms: number) => (now += ms) };
}

beforeEach(() => {
  Object.values(mockApi).forEach(fn => fn.mockReset());
  // unit-0 is done; the learner is on unit-1; unit-2 is next; unit-3 is beyond one ahead.
  mockApi.courseHome.mockResolvedValue({
    units: [unit('unit-0', 'done'), unit('unit-1', 'active'), unit('unit-2', 'locked'), unit('unit-3', 'locked')],
  });
  mockApi.unitContents.mockImplementation(async (unitId: string) => {
    if (unitId === 'unit-1') {
      return {
        sections: [{ id: 's', title: 'T', items: [item('lesson', 'les-1'), item('exercise', 'ex-1')] }],
        ungroupedItems: [item('grammar_rule', 'gr-1'), item('vocabulary_list', 'vl-1')],
      };
    }
    if (unitId === 'unit-3') return { sections: [], ungroupedItems: [item('lesson', 'les-3')] };
    return { sections: [], ungroupedItems: [item('exercise', 'ex-2')] };
  });
  mockApi.lesson.mockImplementation(async (id: string) => ({
    blocks: [],
    mediaIds: id === 'les-3' ? [LATER] : [NARRATION],
  }));
  mockApi.grammar.mockResolvedValue({ rule: 'gr' });
  mockApi.vocab.mockResolvedValue({ items: [] });
  mockApi.exercise.mockResolvedValue({ id: 'ex', content: { audio: { assetId: CLIP } } });
});

describe('unitWindow', () => {
  const units = [unit('a', 'done'), unit('b', 'active'), unit('c', 'locked'), unit('d', 'locked')];

  it('keeps the unit the learner is on and the number ahead', () => {
    expect(unitWindow(units, 0).map(u => u.id)).toEqual(['b']);
    expect(unitWindow(units, 2).map(u => u.id)).toEqual(['b', 'c', 'd']);
    expect(unitWindow(units, ALL_UNITS).map(u => u.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('starts at the first unit not done, whatever open gating marks active', () => {
    const open = [unit('a', 'done'), unit('b', 'active'), unit('c', 'active')];
    expect(unitWindow(open, 0).map(u => u.id)).toEqual(['b']);
  });

  it('keeps the last unit of a finished course', () => {
    expect(unitWindow([unit('a', 'done'), unit('b', 'done')], 1).map(u => u.id)).toEqual(['b']);
  });
});

describe('CourseDownloader', () => {
  it('stores the screens of the current unit and the next, not of the units around them', async () => {
    const { deps, stored } = makeDeps();

    await new CourseDownloader(deps).run();

    expect([...stored.keys()].sort()).toEqual(
      [
        'courses:user-1',
        'course-home:course-1',
        'unit-contents:unit-1',
        'unit-contents:unit-2',
        'lesson-reader:les-1:course-1:ru',
        'grammar-rule-reader:gr-1:course-1:ru',
        'vocab-reader:vl-1:ru',
        'exercise-display:ex-1:ru',
        'exercise-display:ex-2:ru',
      ].sort(),
    );
    expect(stored.get('lesson-reader:les-1:course-1:ru')).toEqual({
      blocks: [],
      mediaIds: [NARRATION],
      targetLanguage: 'nb',
    });
  });

  it('downloads the media of the window and lets go of everything else', async () => {
    const { deps, downloaded, retained } = makeDeps();

    await new CourseDownloader(deps).run();

    expect(downloaded.sort()).toEqual([NARRATION, CLIP].sort());
    expect([...retained[0]].sort()).toEqual([NARRATION, CLIP].sort());
  });

  it('leaves media for Wi-Fi, and walks again once they may be fetched', async () => {
    let wifi = false;
    const { deps, downloaded } = makeDeps({ mediaAllowed: async () => wifi });
    const downloader = new CourseDownloader(deps);

    await downloader.run();
    expect(downloaded).toEqual([]);

    wifi = true;
    await downloader.run();
    expect(downloaded.sort()).toEqual([NARRATION, CLIP].sort());
  });

  it('leaves media when the phone is nearly full, says so, and fetches them once there is room (offline plan, B7.2)', async () => {
    let free = MIN_FREE_BYTES - 1;
    const { deps, downloaded, stored } = makeDeps({ freeBytes: async () => free });
    const downloader = new CourseDownloader(deps);

    await downloader.run();
    expect(downloaded).toEqual([]);
    expect(downloader.getStatus().lowStorage).toBe(true);
    // The text of the units is downloaded all the same: it is small, and it is the course.
    expect(stored.has('lesson-reader:les-1:course-1:ru')).toBe(true);

    free = MIN_FREE_BYTES;
    await downloader.run();
    expect(downloaded.sort()).toEqual([NARRATION, CLIP].sort());
    expect(downloader.getStatus().lowStorage).toBe(false);
  });

  it('fetches media when the free space cannot be read', async () => {
    const { deps, downloaded } = makeDeps({ freeBytes: async () => null });

    await new CourseDownloader(deps).run();

    expect(downloaded.sort()).toEqual([NARRATION, CLIP].sort());
  });

  it('walks a course again when the learner moved on, without waiting out the interval', async () => {
    const { deps, stored } = makeDeps();
    const downloader = new CourseDownloader(deps);
    await downloader.run();

    mockApi.courseHome.mockResolvedValue({
      units: [unit('unit-0', 'done'), unit('unit-1', 'done'), unit('unit-2', 'active'), unit('unit-3', 'locked')],
    });
    await downloader.run();

    expect(stored.has('lesson-reader:les-3:course-1:ru')).toBe(true);
  });

  it('skips a course walked recently with the same window, unless forced, and keeps its media', async () => {
    const { deps, advance, retained } = makeDeps();
    const downloader = new CourseDownloader(deps);
    await downloader.run();
    mockApi.unitContents.mockClear();

    advance(DOWNLOAD_INTERVAL_MS - 1);
    await downloader.run();
    expect(mockApi.unitContents).not.toHaveBeenCalled();
    // A skipped course still names its media, or the cache would drop them.
    expect([...retained[1]].sort()).toEqual([NARRATION, CLIP].sort());

    await downloader.run(true);
    expect(mockApi.unitContents).toHaveBeenCalled();
  });

  it('puts the course vocabulary lists into the decks', async () => {
    const { deps, imported } = makeDeps();
    await new CourseDownloader(deps).run();
    expect(imported).toEqual(['vl-1']);
  });

  it('asks for the course container once, not once per lesson', async () => {
    const { deps } = makeDeps();
    await new CourseDownloader(deps).run();
    expect(deps.getContainer).toHaveBeenCalledTimes(1);
  });

  it('goes on past an item the server refuses and counts it', async () => {
    mockApi.lesson.mockRejectedValue(new ApiError({ message: 'locked', status: 403 }));
    const { deps, stored } = makeDeps();
    const downloader = new CourseDownloader(deps);

    await downloader.run();

    expect(stored.has('exercise-display:ex-2:ru')).toBe(true);
    expect(downloader.getStatus()).toMatchObject({ running: false, lastFailed: 1 });
  });

  it('stops when the connection drops, keeps what it fetched, and prunes nothing', async () => {
    mockApi.unitContents.mockImplementation(async (unitId: string) => {
      if (unitId === 'unit-2') throw offline();
      return { sections: [], ungroupedItems: [item('exercise', 'ex-1')] };
    });
    const { deps, stored, runs, retained } = makeDeps();
    const downloader = new CourseDownloader(deps);

    await downloader.run();

    expect(stored.has('exercise-display:ex-1:ru')).toBe(true);
    expect(runs.size).toBe(0);
    expect(retained).toEqual([]);
    expect(downloader.getStatus()).toMatchObject({ running: false, lastFinishedAt: null });
  });

  it('remembers when it last finished, for the next start of the app', async () => {
    const { deps, runs } = makeDeps();
    await new CourseDownloader(deps).run();

    const later = new CourseDownloader(deps);
    await later.loadStatus();

    expect(later.getStatus().lastFinishedAt).toBe(runs.get('user-1:finished')?.at);
  });

  it('does nothing without a session', async () => {
    const { deps, stored } = makeDeps({ getUserId: () => null });
    await new CourseDownloader(deps).run();
    expect(stored.size).toBe(0);
  });
});
