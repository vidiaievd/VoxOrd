import { userRepository }     from './UserRepository';
import { activityRepository } from './ActivityRepository';
import { deckRepository }     from './DeckRepository';
import type { DeckGroup }     from './DeckRepository';
import { statsRepository }    from './StatsRepository';
import { authStore }          from '../store/authStore';
import { getSrsStats }        from '../api/srs';
import { aggregateStudyNow, StudyNowStatus } from '../lib/studyNow';

export interface HomeScreenData {
  profile: {
    name:   string;
    avatar: string;
  };
  stats: {
    xp:     number;
    streak: number;
  };
  continueLearning: {
    deckId:     number;
    deckTitle:  string;
    deckIcon:   string;
    progress:   number;
    wordsLeft:  number;
    totalWords: number;
  } | null;
  dailyProgress: {
    done: number;
    goal: number;
  };
  weekActivity: number[]; // Words studied in the last 7 days
  globalStats: {
    totalWords:   number;
    learnedWords: number;
  };
  /** All deck groups with their decks — the "my decks" section. */
  deckGroups: DeckGroup[];
  /** The single "what to study now" count — local decks + course words. */
  studyNow: StudyNowStatus;
}

class HomeRepository {
  /**
   * `/srs/stats/me` is the user's global due count (no per-course filter,
   * see `src/api/srs.ts`). Only called when signed in — course words are an
   * online-only feature, and Home must never make word learning wait on a
   * network call. A failure here is non-fatal, same pattern as
   * `getCourseHome()`'s mastery/SRS-stats fetch.
   */
  private async getCourseDueCount(): Promise<number> {
    if (authStore.getState().status !== 'signedIn') return 0;
    try {
      const stats = await getSrsStats();
      return stats.dueNowCount;
    } catch (e) {
      console.warn('[Home] Failed to load course SRS due count:', e);
      return 0;
    }
  }

  async getHomeData(): Promise<HomeScreenData> {
    const [
      profile,
      userStats,
      dailyProgress,
      weekActivity,
      decks,
      globalStats,
      courseDueCount,
    ] = await Promise.all([
      userRepository.getProfile(),
      userRepository.getStats(),
      activityRepository.getTodayProgress(),
      activityRepository.getLastDays(7),
      deckRepository.getAll(),
      statsRepository.getGlobalStats(),
      this.getCourseDueCount(),
    ]);

    // Reuses the decks already loaded above — `getAllGrouped()` would
    // otherwise re-run the same aggregate query.
    const deckGroups = await deckRepository.getAllGrouped(decks);

    // Find the last active deck for CTA on home screen
    const activeDeck = decks.find((d) => d.status === 'in_progress')
      ?? decks.find((d) => d.status === 'new')
      ?? null;

    const continueLearning = activeDeck
      ? {
          deckId:     activeDeck.id,
          deckTitle:  activeDeck.title,
          deckIcon:   activeDeck.icon,
          progress:   activeDeck.totalWords > 0
            ? activeDeck.learnedWords / activeDeck.totalWords
            : 0,
          wordsLeft:  activeDeck.totalWords - activeDeck.learnedWords,
          totalWords: activeDeck.totalWords,
        }
      : null;

    return {
      profile: {
        name:   profile?.name   ?? 'User',
        avatar: profile?.avatar ?? '👤',
      },
      stats: {
        xp:     userStats?.xp     ?? 0,
        streak: userStats?.streak ?? 0,
      },
      continueLearning,
      dailyProgress,
      weekActivity: weekActivity.map((d) => d.wordsStudied),
      globalStats: {
        totalWords:   globalStats.totalWords,
        learnedWords: globalStats.learnedWords,
      },
      deckGroups,
      studyNow: aggregateStudyNow(decks.map((d) => d.repeatWords), courseDueCount),
    };
  }
}

export const homeRepository = new HomeRepository();