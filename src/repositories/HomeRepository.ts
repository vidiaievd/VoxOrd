import { userRepository }     from './UserRepository';
import { activityRepository } from './ActivityRepository';
import { deckRepository }     from './DeckRepository';
import type { DeckGroup }     from './DeckRepository';
import { statsRepository }    from './StatsRepository';

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
}

class HomeRepository {
  async getHomeData(): Promise<HomeScreenData> {
    const [
      profile,
      userStats,
      dailyProgress,
      weekActivity,
      decks,
      globalStats,
    ] = await Promise.all([
      userRepository.getProfile(),
      userRepository.getStats(),
      activityRepository.getTodayProgress(),
      activityRepository.getLastDays(7),
      deckRepository.getAll(),
      statsRepository.getGlobalStats(),
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
    };
  }
}

export const homeRepository = new HomeRepository();