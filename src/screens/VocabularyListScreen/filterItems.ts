import { formatTranslation, type VocabularyItemDisplay } from '../../api/vocabulary';

/** The words whose spelling or translation contains the query, ignoring case and spaces at the ends. */
export function filterItems(
  items: readonly VocabularyItemDisplay[],
  query: string,
): VocabularyItemDisplay[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...items];
  return items.filter(
    item =>
      item.word.toLowerCase().includes(needle) ||
      (formatTranslation(item) ?? '').toLowerCase().includes(needle),
  );
}
