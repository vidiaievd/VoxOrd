import {
  parseGrammaticalForms,
  type VocabularyItemDisplay,
  type VocabularyListReaderContent,
  type VocabularyListSummary,
} from '../api/vocabulary';
import type { NounGender, PartOfSpeech } from '../db/types';

/**
 * Pure translation of a platform vocabulary list into the rows the local word
 * database needs. Kept free of any DB access so the mapping — the part that
 * decides what lands in the user's offline data — is unit-testable in full.
 *
 * Fields the local schema has no place for (IPA, audio media ids, register,
 * false-friend warnings, definitions) are dropped rather than forced into an
 * unrelated column.
 */

export interface PlannedTranslation {
  languageCode: string;
  translation: string;
}

export interface PlannedForm {
  formType: string;
  form: string;
}

export interface PlannedExample {
  sentence: string;
  sentenceLanguage: string;
  translations: PlannedTranslation[];
}

export interface PlannedWord {
  platformItemId: string;
  word: string;
  languageCode: string;
  partOfSpeech: PartOfSpeech;
  gender: NounGender;
  level: string | null;
  translations: PlannedTranslation[];
  forms: PlannedForm[];
  examples: PlannedExample[];
}

export interface ImportPlan {
  platformListId: string;
  deckTitle: string;
  deckLanguageCode: string;
  deckLevel: string | null;
  words: PlannedWord[];
  /**
   * Items the platform has but the local schema cannot use: a word with no
   * translation in any language is invisible to the learning flow, because
   * `getNextWord` inner-joins `translations`. Reported to the user rather than
   * imported as a dead row.
   */
  skippedNoTranslation: number;
}

const LOCAL_PARTS_OF_SPEECH: PartOfSpeech[] = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'phrase',
];

/**
 * content-service's `PartOfSpeech` enum has 12 values; the local schema has 5.
 * The four that exist on both map across; everything else (pronoun,
 * preposition, conjunction, interjection, numeral, particle, other) becomes
 * `phrase` — the local catch-all, and the only value that does not make a
 * false grammatical claim about the word.
 */
export function mapPartOfSpeech(platform: string | null | undefined): PartOfSpeech {
  if (!platform) return 'phrase';
  const normalized = platform.toLowerCase();
  return LOCAL_PARTS_OF_SPEECH.includes(normalized as PartOfSpeech)
    ? (normalized as PartOfSpeech)
    : 'phrase';
}

const LOCAL_GENDERS = ['masculine', 'feminine', 'neuter'] as const;

/** Reads a noun gender out of the free-form `grammaticalProperties` blob. */
export function mapGender(properties: Record<string, unknown> | null | undefined): NounGender {
  const raw = properties?.gender;
  if (typeof raw !== 'string') return null;
  const normalized = raw.toLowerCase();
  return (LOCAL_GENDERS as readonly string[]).includes(normalized)
    ? (normalized as NounGender)
    : null;
}

/**
 * Platform property keys are author-defined; the local `FormType` union is
 * fixed. Known equivalents are normalized so existing exercises recognize
 * them, unknown keys are kept verbatim (the column is free-form TEXT) so no
 * authored form is silently lost.
 */
const FORM_TYPE_ALIASES: Record<string, string> = {
  present_tense: 'present',
  past_tense: 'past',
  perfect_tense: 'perfect',
  infinitive_form: 'infinitive',
  imperative_form: 'imperative',
  plural_form: 'plural',
  comparative_form: 'comparative',
  superlative_form: 'superlative',
};

export function mapFormType(key: string): string {
  const withoutIndex = key.replace(/#\d+$/, '');
  const normalized = withoutIndex.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return FORM_TYPE_ALIASES[normalized] ?? normalized;
}

/**
 * The translation rows for one item.
 *
 * The server applies its own language fallback and reports which language it
 * actually returned. Two rows are written when that differs from what was
 * asked for: one under the requested language, so the word is reachable by the
 * learning flow (which inner-joins on the UI language), and one under the real
 * language, so the data stays honest about its origin.
 */
export function buildTranslations(
  item: VocabularyItemDisplay,
  requestedLanguage: string,
): PlannedTranslation[] {
  const source = item.translation;
  if (!source) return [];

  const parts = [source.primaryTranslation, ...source.alternativeTranslations]
    .map(p => p.trim())
    .filter(p => p.length > 0);
  if (parts.length === 0) return [];

  const text = parts.join(', ');
  const actualLanguage = source.language.trim().toLowerCase();
  const requested = requestedLanguage.trim().toLowerCase();

  const rows: PlannedTranslation[] = [{ languageCode: requested, translation: text }];
  if (actualLanguage.length > 0 && actualLanguage !== requested) {
    rows.push({ languageCode: actualLanguage, translation: text });
  }
  return rows;
}

/** Inflections, de-duplicated: `word_forms` is unique on (wordId, formType). */
export function buildForms(item: VocabularyItemDisplay): PlannedForm[] {
  const seen = new Set<string>();
  const forms: PlannedForm[] = [];
  for (const { key, value } of parseGrammaticalForms(item.grammaticalProperties)) {
    // `gender` is stored on the word row itself, not as an inflected form.
    if (key === 'gender') continue;
    const formType = mapFormType(key);
    if (formType.length === 0 || seen.has(formType)) continue;
    seen.add(formType);
    forms.push({ formType, form: value });
  }
  return forms;
}

export function buildExamples(
  item: VocabularyItemDisplay,
  targetLanguage: string,
): PlannedExample[] {
  return item.examples
    .filter(example => example.exampleText.trim().length > 0)
    .map(example => ({
      sentence: example.exampleText.trim(),
      sentenceLanguage: targetLanguage,
      translations:
        example.translation && !example.immersionMode
          ? [
              {
                languageCode: example.translation.language.trim().toLowerCase(),
                translation: example.translation.translatedText,
              },
            ]
          : [],
    }));
}

export function buildImportPlan(
  list: VocabularyListSummary,
  reader: VocabularyListReaderContent,
  requestedLanguage: string,
): ImportPlan {
  const targetLanguage = list.targetLanguage.trim().toLowerCase();
  const level = list.difficultyLevel?.trim() || null;

  const words: PlannedWord[] = [];
  const seenItemIds = new Set<string>();
  let skippedNoTranslation = 0;

  for (const item of reader.items) {
    if (item.word.trim().length === 0 || seenItemIds.has(item.itemId)) continue;

    const translations = buildTranslations(item, requestedLanguage);
    if (translations.length === 0) {
      skippedNoTranslation += 1;
      continue;
    }
    seenItemIds.add(item.itemId);

    words.push({
      platformItemId: item.itemId,
      word: item.word.trim(),
      languageCode: targetLanguage,
      partOfSpeech: mapPartOfSpeech(item.partOfSpeech),
      gender: mapGender(item.grammaticalProperties),
      level,
      translations,
      forms: buildForms(item),
      examples: buildExamples(item, targetLanguage),
    });
  }

  return {
    platformListId: list.id,
    deckTitle: reader.title.trim() || list.title.trim(),
    deckLanguageCode: targetLanguage,
    deckLevel: level,
    words,
    skippedNoTranslation,
  };
}
