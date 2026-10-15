// The default instance wires native storage and the importer; the tests build their own.
jest.mock('@react-native-async-storage/async-storage', () => ({
  createAsyncStorage: () => ({ getItem: async () => null, setItem: async () => undefined }),
}));
jest.mock('../repositories/VocabularyImportRepository', () => ({ vocabularyImportRepository: {} }));

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
jest.mock('../api/exercises', () => ({ getExerciseDisplay: (id: string) => mockApi.exercise(id) }));

import { ApiError } from '../api/client';
import { CourseDownloader, DOWNLOAD_INTERVAL_MS, type CourseDownloadDeps } from './courseDownload';

const offline = () => new ApiError({ message: 'offline', status: null, code: 'NETWORK_ERROR' });
const item = (contentType: string, contentId: string) => ({ id: `i-${contentId}`, contentType, contentId });

function makeDeps(overrides: Partial<CourseDownloadDeps> = {}) {
  const stored = new Map<string, unknown>();
  const runs = new Map<string, number>();
  const imported: string[] = [];
  let now = 1_000_000;
  const deps: CourseDownloadDeps = {
    getUserId: () => 'user-1',
    getUiLanguage: () => 'ru',
    getMyCourses: async () => [{ container: { id: 'course-1' } } as never],
    getContainer: jest.fn(async () => ({ difficultyLevel: 'A2', targetLanguage: 'nb' }) as never),
    store: async (key, value) => {
      stored.set(key, value);
    },
    importList: async listId => {
      imported.push(listId);
    },
    getLastRun: async key => runs.get(key) ?? null,
    setLastRun: async (key, at) => {
      runs.set(key, at);
    },
    now: () => now,
    ...overrides,
  };
  return { deps, stored, runs, imported, advance: (ms: number) => (now += ms) };
}

beforeEach(() => {
  Object.values(mockApi).forEach(fn => fn.mockReset());
  mockApi.courseHome.mockResolvedValue({ units: [{ id: 'unit-1' }, { id: 'unit-2' }] });
  mockApi.unitContents.mockImplementation(async (unitId: string) =>
    unitId === 'unit-1'
      ? {
          sections: [{ id: 's', title: 'T', items: [item('lesson', 'les-1'), item('exercise', 'ex-1')] }],
          ungroupedItems: [item('grammar_rule', 'gr-1'), item('vocabulary_list', 'vl-1')],
        }
      : { sections: [], ungroupedItems: [item('exercise', 'ex-2')] },
  );
  mockApi.lesson.mockResolvedValue({ blocks: [] });
  mockApi.grammar.mockResolvedValue({ rule: 'gr' });
  mockApi.vocab.mockResolvedValue({ items: [] });
  mockApi.exercise.mockResolvedValue({ id: 'ex' });
});

describe('CourseDownloader', () => {
  it('stores every screen of the course under the key its screen reads', async () => {
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
    // The lesson keeps the course language the reader response lacks.
    expect(stored.get('lesson-reader:les-1:course-1:ru')).toEqual({ blocks: [], targetLanguage: 'nb' });
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

  it('skips a course walked recently, unless forced', async () => {
    const { deps, advance } = makeDeps();
    const downloader = new CourseDownloader(deps);
    await downloader.run();
    mockApi.courseHome.mockClear();

    advance(DOWNLOAD_INTERVAL_MS - 1);
    await downloader.run();
    expect(mockApi.courseHome).not.toHaveBeenCalled();

    await downloader.run(true);
    expect(mockApi.courseHome).toHaveBeenCalledTimes(1);

    advance(DOWNLOAD_INTERVAL_MS);
    await downloader.run();
    expect(mockApi.courseHome).toHaveBeenCalledTimes(2);
  });

  it('goes on past an item the server refuses and counts it', async () => {
    mockApi.lesson.mockRejectedValue(new ApiError({ message: 'locked', status: 403 }));
    const { deps, stored } = makeDeps();
    const downloader = new CourseDownloader(deps);

    await downloader.run();

    expect(stored.has('exercise-display:ex-2:ru')).toBe(true);
    expect(downloader.getStatus()).toMatchObject({ running: false, lastFailed: 1 });
  });

  it('stops when the connection drops, keeps what it fetched, and tries again next time', async () => {
    mockApi.unitContents.mockImplementation(async (unitId: string) => {
      if (unitId === 'unit-2') throw offline();
      return { sections: [], ungroupedItems: [item('exercise', 'ex-1')] };
    });
    const { deps, stored, runs } = makeDeps();
    const downloader = new CourseDownloader(deps);

    await downloader.run();

    expect(stored.has('exercise-display:ex-1:ru')).toBe(true);
    // Not marked as walked, and no finish time: the next run starts over.
    expect(runs.size).toBe(0);
    expect(downloader.getStatus()).toMatchObject({ running: false, lastFinishedAt: null });
  });

  it('remembers when it last finished, for the next start of the app', async () => {
    const { deps, runs } = makeDeps();
    await new CourseDownloader(deps).run();

    const later = new CourseDownloader(deps);
    await later.loadStatus();

    expect(later.getStatus().lastFinishedAt).toBe(runs.get('user-1:finished'));
  });

  it('does nothing without a session', async () => {
    const { deps, stored } = makeDeps({ getUserId: () => null });
    await new CourseDownloader(deps).run();
    expect(stored.size).toBe(0);
  });
});
