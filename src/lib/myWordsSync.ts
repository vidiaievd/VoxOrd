import { ApiError } from '../api/client';
import {
  getMyWordsReader,
  listMyWords,
  type PersonalWord,
} from '../api/personalVocabulary';
import {
  CARD_STATES_MAX_IDS,
  getCardStates,
  introduceCard,
  suspendCard,
  unsuspendCard,
} from '../api/srs';
import type { VocabularyListSummary } from '../api/vocabulary';
import { buildImportPlan } from '../repositories/vocabularyImportMapping';
import { vocabularyImportRepository } from '../repositories/VocabularyImportRepository';
import { translate } from '../i18n';

/** The id prefix of «My words» decks — `personal:<language>`, one deck per language. */
export const MY_WORDS_DECK_PREFIX = 'personal:';

export interface MyWordsSyncResult {
  words: PersonalWord[];
  /** Translated words put into review by this run. */
  introduced: number;
  /** The day's new-card budget ran out; the rest go in on a later run. */
  limitReached: boolean;
}

/**
 * Brings the phone in line with «My words» on the server (plan 75, phase 4).
 *
 * Review on the phone is the server's SRS: a due card is drilled against a local word row
 * found by its platform item id. So a word of one's own needs two things — a card, and a
 * row — and this gives it both:
 *  - every language's words are imported into a local «My words» deck, with the same
 *    importer as a course list (a word dropped on the server leaves the deck with it);
 *  - every translated word without a card is introduced, oldest first, until the day's
 *    new-card budget says no. An untranslated word gets neither: there is nothing to drill.
 */
export function syncMyWords(
  translationLanguage: string,
): Promise<MyWordsSyncResult> {
  if (running) return running;
  running = run(translationLanguage).finally(() => {
    running = null;
  });
  return running;
}

let running: Promise<MyWordsSyncResult> | null = null;

async function run(translationLanguage: string): Promise<MyWordsSyncResult> {
  const words = await listMyWords({ translationLanguage });

  // Languages with words, and languages whose deck exists but whose words are all gone —
  // that deck must be emptied, not forgotten.
  const languages = new Set(words.map(w => w.targetLanguage));
  for (const listId of await vocabularyImportRepository.listDeckListIds(
    MY_WORDS_DECK_PREFIX,
  )) {
    languages.add(listId.slice(MY_WORDS_DECK_PREFIX.length));
  }
  for (const language of languages) {
    await importDeck(language, translationLanguage);
  }

  const { introduced, limitReached } = await introduceTranslated(words);
  return { words, introduced, limitReached };
}

async function importDeck(
  targetLanguage: string,
  translationLanguage: string,
): Promise<void> {
  const reader = await getMyWordsReader({
    targetLanguage,
    translationLanguage,
  });
  const title = translate('myWords.deckTitle');
  // The reader of «My words» carries no list metadata; a personal deck spans every level.
  const summary: VocabularyListSummary = {
    id: reader.id,
    slug: null,
    title,
    description: null,
    targetLanguage,
    difficultyLevel: '',
    createdAt: new Date(0).toISOString(),
  };
  const plan = buildImportPlan(
    summary,
    { ...reader, title },
    translationLanguage,
  );
  await vocabularyImportRepository.importList(plan, {
    coursesGroupTitle: translate('vocabulary.coursesGroup'),
  });
}

async function introduceTranslated(
  words: PersonalWord[],
): Promise<{ introduced: number; limitReached: boolean }> {
  // Oldest first: the budget goes to the words that have waited longest.
  const translated = words.filter(w => w.status === 'resolved').reverse();
  const ids = [...new Set(translated.map(w => w.vocabularyItemId))];
  if (ids.length === 0) return { introduced: 0, limitReached: false };

  const withCard = new Set<string>();
  const suspended: string[] = [];
  for (let i = 0; i < ids.length; i += CARD_STATES_MAX_IDS) {
    const { states } = await getCardStates(
      'VOCABULARY_WORD',
      ids.slice(i, i + CARD_STATES_MAX_IDS),
    );
    for (const s of states) {
      withCard.add(s.contentId);
      if (s.state.toUpperCase() === 'SUSPENDED') suspended.push(s.contentId);
    }
  }

  // A word deleted from «My words» had its card suspended (see `removeMyWord`); added
  // again, it comes back into review with its history rather than as a new card.
  for (const id of suspended) {
    const card = await introduceCard('VOCABULARY_WORD', id);
    await unsuspendCard(card.id);
  }

  let introduced = 0;
  for (const id of ids) {
    if (withCard.has(id)) continue;
    try {
      await introduceCard('VOCABULARY_WORD', id);
      introduced += 1;
    } catch (e) {
      if (e instanceof ApiError && e.status === 429)
        return { introduced, limitReached: true };
      throw e;
    }
  }
  return { introduced, limitReached: false };
}

/**
 * Takes a word out of «My words». A word of the student's own also leaves review — its
 * card is suspended, not deleted, so adding the word again restores its history. A course
 * word keeps its card: the course put it in review, not the student.
 */
export async function removeMyWord(
  word: PersonalWord,
  remove: () => Promise<void>,
): Promise<void> {
  await remove();
  if (!word.ownWord) return;
  const { states } = await getCardStates('VOCABULARY_WORD', [
    word.vocabularyItemId,
  ]);
  const state = states[0];
  if (!state || state.state.toUpperCase() === 'SUSPENDED') return;
  const card = await introduceCard('VOCABULARY_WORD', word.vocabularyItemId);
  await suspendCard(card.id);
}
