import { apiClient } from './client';
import type { VocabularyListReaderContent } from './vocabulary';

const BASE = '/api/v1/personal-vocabulary';

/**
 * The student's own dictionary in content-service (`personal-vocabulary` module, plan 75).
 * A word is saved with or without a translation; `pending` is one still waiting for it.
 */
export type PersonalWordStatus = 'pending' | 'resolved';

export interface PersonalWord {
  entryId: string;
  /** The vocabulary item — what a deck and an SRS card are keyed by. */
  vocabularyItemId: string;
  targetLanguage: string;
  /** The item's word: the dictionary form when it came from a course. */
  word: string;
  /** The form tapped in the text. */
  surfaceForm: string;
  partOfSpeech: string | null;
  translation: string | null;
  status: PersonalWordStatus;
  /** False for a course word, which the student cannot edit. */
  ownWord: boolean;
  contextSentence: string | null;
  source: {
    variantId: string | null;
    paragraphIndex: number | null;
    charStart: number | null;
  } | null;
  createdAt: string;
}

/** Where in a text a word was tapped — everything the add sheet needs besides the word. */
export interface WordCaptureSource {
  targetLanguage: string;
  /** The lesson variant shown; it decides which unit deck the word joins. */
  sourceVariantId: string | null;
  sourceParagraph: number | null;
  contextSentence: string | null;
}

export interface CaptureWordRequest {
  targetLanguage: string;
  translationLanguage: string;
  surfaceForm: string;
  translation?: string;
  contextSentence?: string;
  sourceVariantId?: string;
  sourceParagraph?: number;
}

export interface CaptureWordResponse {
  word: PersonalWord;
  /** False when the word was already there. */
  created: boolean;
}

export interface LookupWordResponse {
  surfaceForm: string;
  entry: PersonalWord | null;
  /** What a course already knows about the form; a translation here is the one that will be used. */
  catalog: {
    word: string;
    partOfSpeech: string | null;
    translation: string | null;
  } | null;
}

export function lookupWord(params: {
  targetLanguage: string;
  translationLanguage: string;
  form: string;
}): Promise<LookupWordResponse> {
  return apiClient.get<LookupWordResponse>(`${BASE}/lookup`, { query: params });
}

export function captureWord(
  request: CaptureWordRequest,
): Promise<CaptureWordResponse> {
  return apiClient.post<CaptureWordResponse>(BASE, request);
}

export function listMyWords(params: {
  translationLanguage: string;
  targetLanguage?: string;
}): Promise<PersonalWord[]> {
  return apiClient.get<PersonalWord[]>(BASE, { query: params });
}

/** `translation: ''` removes it; leaving a field out keeps it. */
export function updateMyWord(
  entryId: string,
  body: { translationLanguage: string; translation?: string; word?: string },
): Promise<PersonalWord> {
  return apiClient.patch<PersonalWord>(`${BASE}/${entryId}`, body);
}

export function deleteMyWord(entryId: string): Promise<void> {
  return apiClient.delete<void>(`${BASE}/${entryId}`);
}

/**
 * «My words» shaped like a vocabulary list's reader, id `personal:<language>` — imported
 * into a local deck by the same code as a course list.
 */
export function getMyWordsReader(params: {
  targetLanguage: string;
  translationLanguage: string;
}): Promise<VocabularyListReaderContent> {
  return apiClient.get<VocabularyListReaderContent>(`${BASE}/reader`, {
    query: { ...params, includeExamples: true, examplesLimit: 3 },
  });
}
