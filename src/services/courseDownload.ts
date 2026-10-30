import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { isNetworkError } from '../api/isNetworkError';
import { getContainer, getMyCourses, type CourseListItem } from '../api/courses';
import type { Container, UnitContentsItem, UnitSummary } from '../api/types';
import { getVocabularyList, type VocabularyListReaderContent } from '../api/vocabulary';
import { currentUiLanguage, translate } from '../i18n';
import { currentTranslationLanguage } from '../lib/translationLanguage';
import {
  courseHomeResource,
  exerciseDisplayResource,
  exerciseKeyResource,
  probeHistoryResource,
  grammarRuleResource,
  lessonReaderResource,
  unitContentsResource,
  vocabularyListResource,
  type CourseResource,
} from '../lib/courseResources';
import { collectMediaIds } from '../lib/mediaIds';
import { fromPersisted as mpFromPersisted, TEMPLATE_CODE as MINIMAL_PAIRS } from '../kernel/minimal-pairs';
import { isGradedOffline, type ExerciseKey } from '../offline/engine/grading';
import { setMemoryCache, writeCacheSnapshot } from '../lib/swrCache';
import { buildImportPlan } from '../repositories/vocabularyImportMapping';
import { vocabularyImportRepository } from '../repositories/VocabularyImportRepository';
import { authStore } from '../store/authStore';
import { settingsStore, ALL_UNITS } from '../store/settingsStore';
import { freeStorageBytes, mediaCache } from './mediaCache';

/** A course downloaded this recently is not walked again by the automatic run. */
export const DOWNLOAD_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** Requests in flight at once — enough to be quick, few enough to leave the phone usable. */
const CONCURRENCY = 4;
/** Media files in flight at once: they are large, and the screen may be playing one. */
const MEDIA_CONCURRENCY = 2;

/**
 * Free space the phone keeps for itself (offline plan, B7.2): below it media are not
 * downloaded. The course window bounds what is kept, not what the phone has left, and a full
 * phone fails worse than a missing clip — the app's own database stops taking answers.
 */
export const MIN_FREE_BYTES = 500 * 1024 * 1024;

export interface CourseDownloadStatus {
  running: boolean;
  /** Epoch ms of the last walk that finished, or null when none has. */
  lastFinishedAt: number | null;
  /** Items the last walk could not fetch — locked, removed, refused. */
  lastFailed: number;
  /** The last walk skipped media because the phone had less than `MIN_FREE_BYTES` free. */
  lowStorage?: boolean;
}

export type ItemDownloadState = 'queued' | 'downloading' | 'done' | 'failed';

/** How the last walk treated one unit — in memory, so it is gone after a restart. */
export interface UnitProgress {
  /** The walk has finished with the unit (or ended early); until then it is being fetched. */
  complete: boolean;
  /** The unit's materials by `UnitContentsItem.id`; empty until its contents are fetched. */
  items: Record<string, ItemDownloadState>;
  /** Bytes of the unit's media on the phone, once known. */
  sizeBytes: number | null;
}

/** What the last walk of one course left, kept so a skipped course still knows its media. */
export interface CourseRun {
  at: number;
  /** The media the course's window refers to. */
  mediaIds: string[];
  /** Whether those media were downloaded, or skipped (no Wi-Fi, media off). */
  mediaDone: boolean;
}

/** The two languages a walk fetches in: interface (texts, exercises) and word translations. */
interface Languages {
  ui: string;
  translation: string;
}

export interface CourseDownloadDeps {
  getUserId(): string | null;
  getUiLanguage(): string;
  /** Word translations in vocabulary lists: the learner's choice, else the interface language. */
  getTranslationLanguage(): string;
  /** Units to keep beyond the current one; `ALL_UNITS` for the whole course. */
  getUnitsAhead(): number;
  /** Whether media may be downloaded now — Wi-Fi, or the learner allowed mobile data. */
  mediaAllowed(): Promise<boolean>;
  /** Bytes free on the phone's storage; null when it cannot be read. */
  freeBytes(): Promise<number | null>;
  getMyCourses(): Promise<CourseListItem[]>;
  getContainer(courseId: string): Promise<Container>;
  /** Writes a fetched value where the screen with this key will read it. */
  store(key: string, value: unknown): Promise<void>;
  /** Puts a course vocabulary list into the phone's decks, unless it is there already. */
  importList(
    listId: string,
    reader: VocabularyListReaderContent,
    translationLanguage: string,
  ): Promise<void>;
  media: {
    download(id: string): Promise<boolean>;
    retainOnly(ids: Set<string>): Promise<void>;
    /** Bytes the given media take on the phone. */
    sizeOf(ids: Iterable<string>): Promise<number>;
  };
  /** Courses the learner keeps whole, whatever the «units ahead» setting says. */
  getPinned(userId: string): Promise<string[]>;
  setPinned(userId: string, courseIds: string[]): Promise<void>;
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
  private unitProgress = new Map<string, UnitProgress>();
  private pinned = new Set<string>();

  constructor(private readonly deps: CourseDownloadDeps) {}

  getStatus(): CourseDownloadStatus {
    return { ...this.status };
  }

  /** Picks up when the signed-in learner's courses were last downloaded, in an earlier run. */
  async loadStatus(): Promise<void> {
    const userId = this.deps.getUserId();
    if (!userId) return;
    const pinned = await this.deps.getPinned(userId);
    if (pinned.length !== this.pinned.size || pinned.some(id => !this.pinned.has(id))) {
      this.pinned = new Set(pinned);
      this.listeners.forEach(l => l());
    }
    if (this.status.lastFinishedAt !== null) return;
    const last = await this.deps.getRun(finishedKey(userId));
    if (last !== null && this.status.lastFinishedAt === null) {
      this.setStatus({ lastFinishedAt: last.at });
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The last walk's account of one unit, or undefined when none walked it since the start. */
  getUnitProgress(unitId: string): UnitProgress | undefined {
    return this.unitProgress.get(unitId);
  }

  /** Whether the learner keeps this course whole. */
  isPinned(courseId: string): boolean {
    return this.pinned.has(courseId);
  }

  /**
   * Single-flight; `force` walks every course whatever its last run. With `onlyCourse` the walk
   * is that course alone (and prunes nothing, since it has not seen the others' media); it waits
   * for a walk already running.
   */
  run(force = false, onlyCourse?: string): Promise<void> {
    if (this.running) {
      return onlyCourse === undefined
        ? this.running
        : this.running.then(() => this.run(force, onlyCourse));
    }
    this.running = this.walk(force, onlyCourse).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Keeps the whole course on the phone, now and in every later walk. */
  async downloadCourse(courseId: string): Promise<void> {
    await this.setPinned(courseId, true);
    await this.run(true, courseId);
  }

  /** Lets the course go back to the «units ahead» window; the next walk drops what is beyond. */
  async releaseCourse(courseId: string): Promise<void> {
    await this.setPinned(courseId, false);
    await this.run(false);
  }

  private async setPinned(courseId: string, on: boolean): Promise<void> {
    const userId = this.deps.getUserId();
    if (!userId) return;
    const next = new Set(this.pinned);
    if (on) next.add(courseId);
    else next.delete(courseId);
    this.pinned = next;
    await this.deps.setPinned(userId, [...next]);
    this.listeners.forEach(l => l());
  }

  private patchUnit(unitId: string, patch: (p: UnitProgress) => UnitProgress): void {
    const current = this.unitProgress.get(unitId);
    if (!current) return;
    this.unitProgress.set(unitId, patch(current));
    this.listeners.forEach(l => l());
  }

  private setItemState(unitId: string, itemId: string, state: ItemDownloadState): void {
    this.patchUnit(unitId, p => ({ ...p, items: { ...p.items, [itemId]: state } }));
  }

  private async walk(force: boolean, onlyCourse?: string): Promise<void> {
    const userId = this.deps.getUserId();
    if (!userId) return;
    const langs: Languages = {
      ui: this.deps.getUiLanguage(),
      translation: this.deps.getTranslationLanguage(),
    };
    const ahead = this.deps.getUnitsAhead();
    this.setStatus({ running: true });
    // Units this walk took on; whatever it leaves unfinished is closed in `finally`.
    const walkedUnits = new Set<string>();

    let failed = 0;
    let finished = false;
    let lowStorage = false;
    // Every course's media, walked now or remembered from its last walk: what the cache keeps.
    const keep = new Set<string>();
    let keepComplete = true;
    try {
      const mediaAllowed = await this.deps.mediaAllowed();
      const courses = await this.deps.getMyCourses();
      // The course list screen reads this key too.
      await this.deps.store(`courses:${userId}`, courses);

      for (const { container } of courses) {
        if (onlyCourse !== undefined && container.id !== onlyCourse) continue;
        // Read every time: it is one request, and it says where the learner is now.
        const home = await this.fetch(courseHomeResource(container.id));
        if (home === null) {
          failed += 1;
          keepComplete = false;
          continue;
        }
        // A course kept whole is walked whole; the setting only sizes the others.
        const window = unitWindow(home.units, this.pinned.has(container.id) ? ALL_UNITS : ahead);
        for (const unit of window) {
          walkedUnits.add(unit.id);
          this.unitProgress.set(unit.id, { complete: false, items: {}, sizeBytes: null });
        }
        this.listeners.forEach(l => l());
        const runKey = `${userId}:${container.id}:${langs.ui}:${langs.translation}:${window.map(u => u.id).join(',')}`;
        const last = await this.deps.getRun(runKey);
        const fresh = last !== null && this.deps.now() - last.at < DOWNLOAD_INTERVAL_MS;
        if (!force && last !== null && fresh && (last.mediaDone || !mediaAllowed)) {
          last.mediaIds.forEach(id => keep.add(id));
          // Nothing was walked, so there is no account of these units: the status speaks for them.
          for (const unit of window) {
            walkedUnits.delete(unit.id);
            this.unitProgress.delete(unit.id);
          }
          continue;
        }

        const walked = await this.walkUnits(window, container.id, langs);
        failed += walked.failed;
        walked.mediaIds.forEach(id => keep.add(id));

        let mediaDone = false;
        // Read per course: the previous course's media may have just taken the room.
        if (mediaAllowed && !(await this.hasRoom())) lowStorage = true;
        if (mediaAllowed && !lowStorage) {
          failed += await this.downloadMedia(walked.mediaIds);
          mediaDone = true;
        }
        for (const [unitId, ids] of walked.mediaByUnit) {
          const sizeBytes = await this.deps.media.sizeOf(ids).catch(() => null);
          this.patchUnit(unitId, p => ({ ...p, complete: true, sizeBytes }));
        }
        // A course whose session changed hands is not this learner's to mark.
        if (this.deps.getUserId() !== userId) return;
        await this.deps.setRun(runKey, {
          at: this.deps.now(),
          mediaIds: [...walked.mediaIds],
          mediaDone,
        });
      }

      if (onlyCourse === undefined) {
        if (keepComplete) await this.deps.media.retainOnly(keep);
        finished = true;
        await this.deps.setRun(finishedKey(userId), {
          at: this.deps.now(),
          mediaIds: [],
          mediaDone: true,
        });
      }
    } catch (e) {
      if (!(e instanceof OfflineAbort) && !isNetworkError(e)) throw e;
    } finally {
      // A walk that ended early (offline) leaves its units as they were reached, not spinning.
      for (const unitId of walkedUnits) {
        this.patchUnit(unitId, p =>
          p.complete
            ? p
            : {
                ...p,
                complete: true,
                items: Object.fromEntries(
                  Object.entries(p.items).map(([id, st]) => [id, st === 'downloading' ? 'queued' : st]),
                ),
              },
        );
      }
      this.setStatus({
        running: false,
        ...(finished ? { lastFinishedAt: this.deps.now(), lastFailed: failed, lowStorage } : {}),
      });
    }
  }

  /** Room for media, or nothing known against it — an unreadable reading does not block them. */
  private async hasRoom(): Promise<boolean> {
    try {
      const free = await this.deps.freeBytes();
      return free === null || free >= MIN_FREE_BYTES;
    } catch {
      return true;
    }
  }

  /** The units' screens, stored; the items that could not be fetched and the media they name. */
  private async walkUnits(
    units: UnitSummary[],
    courseId: string,
    langs: Languages,
  ): Promise<{ failed: number; mediaIds: Set<string>; mediaByUnit: Map<string, Set<string>> }> {
    let failed = 0;
    const mediaIds = new Set<string>();
    const mediaByUnit = new Map<string, Set<string>>();
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
        // Nothing of the unit is known: it is closed at once, with nothing on the phone.
        this.patchUnit(unit.id, p => ({ ...p, complete: true }));
        continue;
      }
      const items = [
        ...contents.sections.flatMap(section => section.items),
        ...contents.ungroupedItems,
      ];
      // A container is a heading with nothing to fetch.
      const tracked = items.filter(i => i.contentType !== 'container');
      this.patchUnit(unit.id, p => ({
        ...p,
        items: Object.fromEntries(tracked.map(i => [i.id, 'queued' as ItemDownloadState])),
      }));
      const unitMedia = new Set<string>();
      mediaByUnit.set(unit.id, unitMedia);
      const results = await mapLimit(items, CONCURRENCY, async item => {
        if (item.contentType === 'container') return true;
        this.setItemState(unit.id, item.id, 'downloading');
        const ok = await this.fetchItem(item, courseId, langs, containerOf, unitMedia);
        this.setItemState(unit.id, item.id, ok ? 'done' : 'failed');
        return ok;
      });
      unitMedia.forEach(id => mediaIds.add(id));
      failed += results.filter(ok => !ok).length;
    }
    return { failed, mediaIds, mediaByUnit };
  }

  private async fetchItem(
    item: UnitContentsItem,
    courseId: string,
    { ui: uiLanguage, translation }: Languages,
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
        // The key goes along only for the templates the phone grades itself offline. Its media
        // too: a `minimal_pairs` projection names no clip, the key holds them all.
        if (!isGradedOffline(display.templateCode)) return true;
        const key = await this.fetch(exerciseKeyResource(item.contentId));
        if (!kept(key)) return false;
        if (display.templateCode === MINIMAL_PAIRS && dealsWeakest(key)) {
          // Without it a `weakest` sitting offline deals as on a first sitting; not a failure.
          await this.fetch(probeHistoryResource(item.contentId));
        }
        return true;
      }
      case 'vocabulary_list': {
        const reader = await this.fetch(vocabularyListResource(item.contentId, translation));
        if (!kept(reader)) return false;
        try {
          await this.deps.importList(item.contentId, reader, translation);
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

/** A `minimal_pairs` set that deals from the learner's misses, and so needs their record. */
function dealsWeakest(key: ExerciseKey): boolean {
  return mpFromPersisted(key.content, key.expectedAnswers).set.sampling === 'weakest';
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
  getUiLanguage: currentUiLanguage,
  getTranslationLanguage: currentTranslationLanguage,
  getUnitsAhead: () => settingsStore.getAll().offlineUnitsAhead,
  mediaAllowed: async () => {
    if (settingsStore.getAll().offlineMediaOnCellular) return true;
    try {
      return (await NetInfo.fetch()).type === 'wifi';
    } catch {
      return false;
    }
  },
  freeBytes: () => freeStorageBytes(),
  getMyCourses,
  getContainer,
  store: async (key, value) => {
    setMemoryCache(key, value);
    await writeCacheSnapshot(key, value);
  },
  importList: async (listId, reader, translationLanguage) => {
    if ((await vocabularyImportRepository.findDeckIdForList(listId)) !== null) return;
    const list = await getVocabularyList(listId);
    const plan = buildImportPlan(list, reader, translationLanguage);
    await vocabularyImportRepository.importList(plan, {
      coursesGroupTitle: translate('vocabulary.coursesGroup'),
    });
  },
  media: {
    download: id => mediaCache.download(id),
    retainOnly: ids => mediaCache.retainOnly(ids),
    sizeOf: ids => mediaCache.bytesOf(ids),
  },
  getPinned: async userId => {
    try {
      const raw = await runStorage.getItem(`${userId}:pinned`);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  },
  setPinned: async (userId, courseIds) => {
    try {
      await runStorage.setItem(`${userId}:pinned`, JSON.stringify(courseIds));
    } catch {
      // Losing it means the course falls back to the window at the next start.
    }
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
