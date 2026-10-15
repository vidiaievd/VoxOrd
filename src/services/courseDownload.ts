import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { isNetworkError } from '../api/isNetworkError';
import { getContainer, getMyCourses, type CourseListItem } from '../api/courses';
import type { Container, UnitContentsItem } from '../api/types';
import { getVocabularyList, type VocabularyListReaderContent } from '../api/vocabulary';
import { translate } from '../i18n';
import {
  courseHomeResource,
  exerciseDisplayResource,
  grammarRuleResource,
  lessonReaderResource,
  unitContentsResource,
  vocabularyListResource,
  type CourseResource,
} from '../lib/courseResources';
import { setMemoryCache, writeCacheSnapshot } from '../lib/swrCache';
import { buildImportPlan } from '../repositories/vocabularyImportMapping';
import { vocabularyImportRepository } from '../repositories/VocabularyImportRepository';
import { authStore } from '../store/authStore';
import { settingsStore } from '../store/settingsStore';

/** A course downloaded this recently is not walked again by the automatic run. */
export const DOWNLOAD_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** Requests in flight at once — enough to be quick, few enough to leave the phone usable. */
const CONCURRENCY = 4;

export interface CourseDownloadStatus {
  running: boolean;
  /** Epoch ms of the last walk that finished, or null when none has. */
  lastFinishedAt: number | null;
  /** Items the last walk could not fetch — locked, removed, refused. */
  lastFailed: number;
}

export interface CourseDownloadDeps {
  getUserId(): string | null;
  getUiLanguage(): string;
  getMyCourses(): Promise<CourseListItem[]>;
  getContainer(courseId: string): Promise<Container>;
  /** Writes a fetched value where the screen with this key will read it. */
  store(key: string, value: unknown): Promise<void>;
  /** Puts a course vocabulary list into the phone's decks, unless it is there already. */
  importList(listId: string, reader: VocabularyListReaderContent, uiLanguage: string): Promise<void>;
  /** When each course was last walked, per learner and language. */
  getLastRun(key: string): Promise<number | null>;
  setLastRun(key: string, at: number): Promise<void>;
  now(): number;
}

/** Stops the whole walk: without the network every next request would fail the same way. */
class OfflineAbort extends Error {}

/**
 * Downloads the learner's courses for use without the network (offline plan, B3).
 *
 * Walks every active course — course home, every unit's contents, and each lesson, grammar
 * rule, vocabulary list and exercise in it — and writes each response under the cache key
 * the screen reading it uses (`lib/courseResources`). Offline, the screens find their content
 * in their ordinary cache. Vocabulary lists are also put into the phone's decks, which is
 * where the offline word review draws its words from (B1).
 *
 * Runs after the session comes online (`sessionSync`), at most every `DOWNLOAD_INTERVAL_MS`
 * per course; the settings screen can force it. Text only — media files are a later step.
 * A lost connection ends the walk; what was fetched stays, the next run starts over.
 */
export class CourseDownloader {
  private status: CourseDownloadStatus = { running: false, lastFinishedAt: null, lastFailed: 0 };
  private running: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  constructor(private readonly deps: CourseDownloadDeps) {}

  getStatus(): CourseDownloadStatus {
    return { ...this.status };
  }

  /** Picks up when the signed-in learner's courses were last downloaded, in an earlier run. */
  async loadStatus(): Promise<void> {
    const userId = this.deps.getUserId();
    if (!userId || this.status.lastFinishedAt !== null) return;
    const last = await this.deps.getLastRun(finishedKey(userId));
    if (last !== null && this.status.lastFinishedAt === null) this.setStatus({ lastFinishedAt: last });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Single-flight; `force` walks every course whatever its last run. */
  run(force = false): Promise<void> {
    if (!this.running) {
      this.running = this.walk(force).finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async walk(force: boolean): Promise<void> {
    const userId = this.deps.getUserId();
    if (!userId) return;
    const uiLanguage = this.deps.getUiLanguage();
    this.setStatus({ running: true });

    let failed = 0;
    let finished = false;
    try {
      const courses = await this.deps.getMyCourses();
      // The course list screen reads this key too.
      await this.deps.store(`courses:${userId}`, courses);

      for (const { container } of courses) {
        const runKey = `${userId}:${container.id}:${uiLanguage}`;
        const last = await this.deps.getLastRun(runKey);
        if (!force && last !== null && this.deps.now() - last < DOWNLOAD_INTERVAL_MS) continue;

        failed += await this.walkCourse(container.id, uiLanguage);
        // A course whose session changed hands is not this learner's to mark.
        if (this.deps.getUserId() !== userId) return;
        await this.deps.setLastRun(runKey, this.deps.now());
      }
      finished = true;
      await this.deps.setLastRun(finishedKey(userId), this.deps.now());
    } catch (e) {
      if (!(e instanceof OfflineAbort) && !isNetworkError(e)) throw e;
    } finally {
      this.setStatus({
        running: false,
        ...(finished ? { lastFinishedAt: this.deps.now(), lastFailed: failed } : {}),
      });
    }
  }

  /** The number of items that could not be fetched. */
  private async walkCourse(courseId: string, uiLanguage: string): Promise<number> {
    let failed = 0;
    // One container request per course, not one per lesson.
    const containers = new Map<string, Promise<Container>>();
    const containerOf = (id: string) => {
      let container = containers.get(id);
      if (!container) {
        container = this.deps.getContainer(id);
        containers.set(id, container);
      }
      return container;
    };

    const home = await this.fetch(courseHomeResource(courseId));
    if (home === null) return 1;

    for (const unit of home.units) {
      const contents = await this.fetch(unitContentsResource(unit.id));
      if (contents === null) {
        failed += 1;
        continue;
      }
      const items = [
        ...contents.sections.flatMap(section => section.items),
        ...contents.ungroupedItems,
      ];
      const results = await mapLimit(items, CONCURRENCY, item =>
        this.fetchItem(item, courseId, uiLanguage, containerOf),
      );
      failed += results.filter(ok => !ok).length;
    }
    return failed;
  }

  private async fetchItem(
    item: UnitContentsItem,
    courseId: string,
    uiLanguage: string,
    containerOf: (id: string) => Promise<Container>,
  ): Promise<boolean> {
    switch (item.contentType) {
      case 'lesson':
        return (
          (await this.fetch(lessonReaderResource(item.contentId, courseId, uiLanguage, containerOf))) !==
          null
        );
      case 'grammar_rule':
        return (
          (await this.fetch(grammarRuleResource(item.contentId, courseId, uiLanguage, containerOf))) !==
          null
        );
      case 'exercise':
        return (await this.fetch(exerciseDisplayResource(item.contentId, uiLanguage))) !== null;
      case 'vocabulary_list': {
        const reader = await this.fetch(vocabularyListResource(item.contentId, uiLanguage));
        if (reader === null) return false;
        try {
          await this.deps.importList(item.contentId, reader, uiLanguage);
        } catch (e) {
          if (isNetworkError(e)) throw new OfflineAbort();
          console.warn(`[CourseDownload] Importing list ${item.contentId} failed:`, e);
          return false;
        }
        return true;
      }
      default:
        // Nested containers and anything newer than this build: nothing to read offline.
        return true;
    }
  }

  /** The value, stored where its screen reads it; null when refused. Offline ends the walk. */
  private async fetch<T>(resource: CourseResource<T>): Promise<T | null> {
    try {
      const value = await resource.load();
      await this.deps.store(resource.key, value);
      return value;
    } catch (e) {
      if (isNetworkError(e)) throw new OfflineAbort();
      return null;
    }
  }

  private setStatus(patch: Partial<CourseDownloadStatus>): void {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach(l => l());
  }
}

function finishedKey(userId: string): string {
  return `${userId}:finished`;
}

/** Runs `fn` over `items` with at most `limit` in flight, results in input order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

const runStorage = createAsyncStorage('voxord_course_download');

export const courseDownloader = new CourseDownloader({
  getUserId: () => authStore.getState().user?.id ?? null,
  getUiLanguage: () => settingsStore.getAll().uiLanguage,
  getMyCourses,
  getContainer,
  store: async (key, value) => {
    setMemoryCache(key, value);
    await writeCacheSnapshot(key, value);
  },
  importList: async (listId, reader, uiLanguage) => {
    if ((await vocabularyImportRepository.findDeckIdForList(listId)) !== null) return;
    const list = await getVocabularyList(listId);
    const plan = buildImportPlan(list, reader, uiLanguage);
    await vocabularyImportRepository.importList(plan, {
      coursesGroupTitle: translate('vocabulary.coursesGroup'),
    });
  },
  getLastRun: async key => {
    try {
      const raw = await runStorage.getItem(key);
      return raw ? Number(raw) : null;
    } catch {
      return null;
    }
  },
  setLastRun: async (key, at) => {
    try {
      await runStorage.setItem(key, String(at));
    } catch {
      // Losing it costs one more walk, nothing else.
    }
  },
  now: () => Date.now(),
});
