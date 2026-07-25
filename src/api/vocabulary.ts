import { apiClient } from './client';

const VOCABULARY_LIST_PATH = (listId: string) => `/api/v1/vocabulary-lists/${listId}`;

const VOCABULARY_LIST_READER_PATH = (listId: string) =>
  `/api/v1/vocabulary-lists/${listId}/reader`;

/**
 * `GET /vocabulary-lists/:listId/reader` (content-service). Confirmed against
 * services/content-service/src/modules/vocabulary/presentation/controllers/
 * vocabulary-list.controller.ts (`getReaderContent` →
 * `VocabularyListReaderContentResponseDto`) and proxied by the gateway's
 * `location /api/v1/vocabulary-lists` prefix block in nginx.dev.conf.
 *
 * Deliberate divergence from the web app: its BFF route
 * (ssz-platform-web/src/app/api/content/vocabulary-lists/[listId]/items/route.ts)
 * fetches the paginated item summaries and then fans out one authoring-detail
 * request per item, because a code comment there assumes no batch endpoint
 * exists. It does — `/reader` resolves every item's translation (with language
 * fallback) and examples server-side in a single round trip, which is what a
 * phone on mobile data needs. The summary endpoint
 * (`/vocabulary-lists/:listId/items`) is not used here at all: it carries no
 * translations.
 */
export interface VocabularyItemTranslationDisplay {
  id: string;
  language: string;
  primaryTranslation: string;
  alternativeTranslations: string[];
  definition: string | null;
  usageNotes: string | null;
  falseFriendWarning: string | null;
  /** True when the server had to fall back to a language other than the requested one. */
  fallbackUsed: boolean;
}

export interface VocabularyExampleTranslationDisplay {
  id: string;
  language: string;
  translatedText: string;
  fallbackUsed: boolean;
}

export interface VocabularyExampleDisplay {
  id: string;
  exampleText: string;
  position: number;
  audioMediaId: string | null;
  contextNote: string | null;
  translation: VocabularyExampleTranslationDisplay | null;
  /** True when no usable translation exists — show the original text only. */
  immersionMode: boolean;
}

export interface VocabularyItemDisplay {
  itemId: string;
  listId: string;
  word: string;
  position: number;
  partOfSpeech: string | null;
  ipaTranscription: string | null;
  pronunciationAudioMediaId: string | null;
  /**
   * Free-form JSON blob, validated by the app layer rather than the DB. Its
   * shape varies by author and course — see `parseGrammaticalForms`.
   */
  grammaticalProperties: Record<string, unknown> | null;
  register: string | null;
  notes: string | null;
  translation: VocabularyItemTranslationDisplay | null;
  immersionMode: boolean;
  examples: VocabularyExampleDisplay[];
}

export interface VocabularyListReaderContent {
  id: string;
  title: string;
  items: VocabularyItemDisplay[];
}

/**
 * `GET /vocabulary-lists/:listId` — list metadata. The reader endpoint returns
 * only `{id, title, items}`, so the language and CEFR level a local deck needs
 * come from here. Only the fields VoxOrd uses are modeled; ownership,
 * visibility and media fields exist on the wire and are ignored.
 */
export interface VocabularyListSummary {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  targetLanguage: string;
  difficultyLevel: string;
  createdAt: string;
}

export async function getVocabularyList(listId: string): Promise<VocabularyListSummary> {
  return apiClient.get<VocabularyListSummary>(VOCABULARY_LIST_PATH(listId));
}

export interface VocabularyReaderQuery {
  /** BCP-47 tag of the student's preferred translation language. */
  translationLanguage: string;
  includeExamples?: boolean;
  examplesLimit?: number;
}

export async function getVocabularyListReader(
  listId: string,
  query: VocabularyReaderQuery,
): Promise<VocabularyListReaderContent> {
  return apiClient.get<VocabularyListReaderContent>(VOCABULARY_LIST_READER_PATH(listId), {
    query: {
      translationLanguage: query.translationLanguage,
      includeExamples: query.includeExamples ?? true,
      examplesLimit: query.examplesLimit ?? 3,
    },
  });
}

/** A single displayable inflection/grammar fact of a vocabulary item. */
export interface GrammaticalForm {
  /** Raw property key, e.g. `present_tense`. Used as a React key. */
  key: string;
  value: string;
}

const MAX_FORM_VALUE_LENGTH = 200;

function isDisplayableValue(value: unknown): value is string | number | boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return typeof value === 'number' || typeof value === 'boolean';
}

/**
 * Flattens `grammaticalProperties` into displayable label/value pairs.
 *
 * Two shapes are accepted because the platform has two in circulation:
 *  - `{ forms: [[label, value], ...] }` — the only shape the web BFF's
 *    `map-vocabulary-item.ts` recognizes;
 *  - a flat object of scalars, e.g.
 *    `{ verb_class: 'weak_1', present_tense: 'danser', past_tense: 'danset' }`
 *    — what the seeded ny-i-norge-a2 / norsk-b1 courses actually store.
 *
 * Because the web only handles the first, its "all forms" drawer is silently
 * empty for every seeded course. Mobile handles both so the data authors
 * entered is actually visible. Nested objects/arrays and empty values are
 * dropped rather than stringified; key order is preserved.
 */
export function parseGrammaticalForms(
  properties: Record<string, unknown> | null | undefined,
): GrammaticalForm[] {
  if (!properties || typeof properties !== 'object') return [];

  const forms: GrammaticalForm[] = [];

  const push = (key: string, value: unknown) => {
    if (!isDisplayableValue(value)) return;
    const text = String(value).trim().slice(0, MAX_FORM_VALUE_LENGTH);
    if (text.length === 0) return;
    forms.push({ key, value: text });
  };

  for (const [key, value] of Object.entries(properties)) {
    if (key === 'forms' && Array.isArray(value)) {
      // Web shape: an array of [label, value] pairs.
      value.forEach((pair, index) => {
        if (Array.isArray(pair) && pair.length >= 2 && typeof pair[0] === 'string') {
          push(`${pair[0]}#${index}`, pair[1]);
        }
      });
      continue;
    }
    push(key, value);
  }

  return forms;
}

/**
 * Turns a raw property key into a readable label (`present_tense` →
 * `Present tense`). Keys are author-defined and open-ended, so they cannot go
 * through the typed i18n dictionary; this is a best-effort fallback that keeps
 * unknown keys legible instead of hiding them.
 */
export function humanizeFormKey(key: string): string {
  const withoutIndex = key.replace(/#\d+$/, '');
  const spaced = withoutIndex.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (spaced.length === 0) return withoutIndex;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The translation line to show for an item, or null in immersion mode.
 * Alternatives are appended after the primary translation, matching how the
 * authoring UI presents them (primary first, comma-separated synonyms).
 */
export function formatTranslation(item: VocabularyItemDisplay): string | null {
  const translation = item.translation;
  if (!translation || item.immersionMode) return null;
  const parts = [translation.primaryTranslation, ...translation.alternativeTranslations]
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return parts.length > 0 ? parts.join(', ') : null;
}
