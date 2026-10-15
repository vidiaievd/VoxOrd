import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { isNetworkError } from '../api/isNetworkError';
import { getContainer, getMyCourses, type CourseListItem } from '../api/courses';
import type { Container, UnitContentsItem, UnitSummary } from '../api/types';
import { getVocabularyList, type VocabularyListReaderContent } from '../api/vocabulary';
import { translate } from '../i18n';
import {
  courseHomeResource,
  exerciseDisplayResource,
  exerciseKeyResource,
  grammarRuleResource,
  lessonReaderResource,
  unitContentsResource,
  vocabularyListResource,
  type CourseResource,
} from '../lib/courseResources';
import { collectMediaIds } from '../lib/mediaIds';
import { needsKey } from '../lib/offlineGrading';
import { setMemoryCache, writeCacheSnapshot } from '../lib/swrCache';
import { buildImportPlan } from '../repositories/vocabularyImportMapping';
import { vocabularyImportRepository } from '../repositories/VocabularyImportRepository';
import { authStore } from '../store/authStore';
import { settingsStore, ALL_UNITS } from '../store/settingsStore';
import { mediaCache } from './mediaCache';

/** A course downloaded this recently is not walked again by the automatic run. */
export const DOWNLOAD_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** Requests in flight at once — enough to be quick, few enough to leave the phone usable. */
const CONCURRENCY = 4;
/** Media files in flight at once: they are large, and the screen may be playing one. */
const MEDIA_CONCURRENCY = 2;

export interface CourseDownloadStatus {
  running: boolean;
  /** Epoch ms of the last walk that finished, or null when none has. */
  lastFinishedAt: number | null;
  /** Items the last walk could not fetch — locked, removed, refused. */
  lastFailed: number;
}

/** What the last walk of one course left, kept so a skipped course still knows its media. */
export interface CourseRun {
  at: number;
  /** The media the course's window refers to. */
  mediaIds: string[];
  /** Whether those media were downloaded, or skipped (no Wi-Fi, media off). */
  mediaDone: boolean;
}

export interface CourseDownloadDeps {
  getUserId(): string | null;
  getUiLanguage(): string;
  /** Units to keep beyond the current one; `ALL_UNITS` for the whole course. */
  getUnitsAhead(): number;
  /** Whether media may be downloaded now — Wi-Fi, or the learner allowed mobile data. */
  mediaAllowed(): Promise<boolean>;
  getMyCourses(): Promise<CourseListItem[]>;
  getContainer(courseId: string): Promise<Container>;
  /** Writes a fetched value where the screen with this key will read it. */
  store(key: string, value: unknown): Promise<void>;
  /** Puts a course vocabulary list into the phone's decks, unless it is there already. */
  importList(listId: string, reader: VocabularyListReaderContent, uiLanguage: string): Promise<void>;
  media: {
    download(id: string): Promise<boolean>;
    retainOnly(ids: Set<string>): Promise<void>;
  };
  getRun(key: string): Promise<CourseRun | null>;
  setRun(key: string, run: CourseRun): Promise<void>;
  now(): number;
}

/** Stops the whole walk: without the network every next request would fail the same way. */
class OfflineAbort extends Error {}

/**
 * The units kept on the phone: the one the learner is on and `ahead` after it. The one they
 * are on is the first not done — under open gating every unit reads `active`, so «active»
 * would always point at the first. A finished course keeps its last unit.
 */
export function unitWindow(units: UnitSummary[], ahead: number): UnitSummary[] {
  if (units.length === 0) return [];
  if (ahead === ALL_UNITS) return units;
  const firstOpen = units.findIndex(unit => unit.status !== 'done');
  const from = firstOpen === -1 ? units.length - 1 : firstOpen;
  return units.slice(from, from + 1 + Math.max(0, ahead));
}

/**
 * Downloads what the learner is about to study, for use without the network (offline plan, B3).
 *
 * For every active course: the course home, then — for the current unit and the number ahead
 * the settings name — each unit's contents and every lesson, grammar rule, vocabulary list and
 * exercise in it, written under the cache key the screen reading it uses
 * (`lib/courseResources`). Offline the screens find their content in their ordinary cache.
 * Vocabulary lists also go into the phone's decks, where offline word review draws its words
 * (B1). The media those units refer to — narration, images, clips, pronunciations — go to
 * `mediaCache`, over Wi-Fi unless the learner allowed mobile data; files outside every
 * course's window are dropped, so the phone keeps what is ahead and nothing behind.
 *
 * Runs once the session comes online (`sessionSync`). A course is walked again when its window
 * moved, when its media are still missing and may now be fetched, or after
 * `DOWNLOAD_INTERVAL_MS`; the settings screen can force it. A lost connection ends the walk;
 * what was fetched stays, and the next run starts over.
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
    const last = await this.deps.getRun(finishedKey(userId));
    if (last !== null && this.status.lastFinishedAt === null) {
      this.setStatus({ lastFinishedAt: last.at });
    }
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
    const ahead = this.deps.getUnitsAhead();
    this.setStatus({ running: true });

    let failed = 0;
    let finished = false;
    // Every course's media, walked now or remembered from its last walk: what the cache keeps.
    const keep = new Set<string>();
    let keepComplete = true;
    try {
      const mediaAllowed = await this.deps.mediaAllowed();
      const courses = await this.deps.getMyCourses();
      // The course list screen reads this key too.
      await this.deps.store(`courses:${userId}`, courses);

      for (const { container } of courses) {
        // Read every time: it is one request, and it says where the learner is now.
        const home = await this.fetch(courseHomeResource(container.id));
        if (home === null) {
          failed += 1;
          keepComplete = false;
          continue;
        }
        const window = unitWindow(home.units, ahead);
        const runKey = `${userId}:${container.id}:${uiLanguage}:${window.map(u => u.id).join(',')}`;
        const last = await this.deps.getRun(runKey);
        const fresh = last !== null && this.deps.now() - last.at < DOWNLOAD_INTERVAL_MS;
        if (!force && last !== null && fresh && (last.mediaDone || !mediaAllowed)) {
          last.mediaIds.forEach(id => keep.add(id));
          continue;
        }

        const walked = await this.walkUnits(window, container.id, uiLanguage);
        failed += walked.failed;
        walked.mediaIds.forEach(id => keep.add(id));

        let mediaDone = false;
        if (mediaAllowed) {
          failed += await this.downloadMedia(walked.mediaIds);
          mediaDone = true;
        }
        // A course whose session changed hands is not this learner's to mark.
        if (this.deps.getUserId() !== userId) return;
        await this.deps.setRun(runKey, {
          at: this.deps.now(),
          mediaIds: [...walked.mediaIds],
          mediaDone,
        });
      }

      if (keepComplete) await this.deps.media.retainOnly(keep);
      finished = true;
      await this.deps.setRun(finishedKey(userId), {
        at: this.deps.now(),
        mediaIds: [],
        mediaDone: true,
      });
    } catch (e) {
      if (!(e instanceof OfflineAbort) && !isNetworkError(e)) throw e;
    } finally {
      this.setStatus({
        running: false,
        ...(finished ? { lastFinishedAt: this.deps.now(), lastFailed: failed } : {}),
      });
    }
  }

  /** The units' screens, stored; the items that could not be fetched and the media they name. */
  private async walkUnits(
    units: UnitSummary[],
    courseId: string,
    uiLanguage: string,
  ): Promise<{ failed: number; mediaIds: Set<string> }> {
    let failed = 0;
    const mediaIds = new Set<string>();
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

    for (const unit of units) {
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
        this.fetchItem(item, courseId, uiLanguage, containerOf, mediaIds),
      );
      failed += results.filter(ok => !ok).length;
    }
    return { failed, mediaIds };
  }

  private async fetchItem(
    item: UnitContentsItem,
    courseId: string,
    uiLanguage: string,
    containerOf: (id: string) => Promise<Container>,
    mediaIds: Set<string>,
  ): Promise<boolean> {
    const kept = <T>(value: T | null): value is T => {
      if (value !== null) collectMediaIds(value, mediaIds);
      return value !== null;
    };
    switch (item.contentType) {
      case 'lesson':
        return kept(
          await this.fetch(lessonReaderResource(item.contentId, courseId, uiLanguage, containerOf)),
        );
      case 'grammar_rule':
        return kept(
          await this.fetch(grammarRuleResource(item.contentId, courseId, uiLanguage, containerOf)),
        );
      case 'exercise': {
        const display = await this.fetch(exerciseDisplayResource(item.contentId, uiLanguage));
        if (!kept(display)) return false;
        // The key goes along only for the templates the phone grades itself offline.
        if (!needsKey(display.templateCode, display.content)) return true;
        return (await this.fetch(exerciseKeyResource(item.contentId))) !== null;
      }
      case 'vocabulary_list': {
        const reader = await this.fetch(vocabularyListResource(item.contentId, uiLanguage));
        if (!kept(reader)) return false;
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

  /** The number of media files that could not be kept. A lost connection ends the walk. */
  private async downloadMedia(ids: Set<string>): Promise<number> {
    const results = await mapLimit([...ids], MEDIA_CONCURRENCY, async id => {
      try {
        return await this.deps.media.download(id);
      } catch (e) {
        if (isNetworkError(e)) throw new OfflineAbort();
        console.warn(`[CourseDownload] Media ${id} not kept:`, e);
        return false;
      }
    });
    return results.filter(ok => !ok).length;
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
  getUnitsAhead: () => settingsStore.getAll().offlineUnitsAhead,
  mediaAllowed: async () => {
    if (settingsStore.getAll().offlineMediaOnCellular) return true;
    try {
      return (await NetInfo.fetch()).type === 'wifi';
    } catch {
      return false;
    }
  },
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
  media: {
    download: id => mediaCache.download(id),
    retainOnly: ids => mediaCache.retainOnly(ids),
  },
  getRun: async key => {
    try {
      const raw = await runStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CourseRun | number;
      // Runs before the window was kept were a bare time.
      return typeof parsed === 'number' ? { at: parsed, mediaIds: [], mediaDone: false } : parsed;
    } catch {
      return null;
    }
  },
  setRun: async (key, run) => {
    try {
      await runStorage.setItem(key, JSON.stringify(run));
    } catch {
      // Losing it costs one more walk, nothing else.
    }
  },
  now: () => Date.now(),
});
