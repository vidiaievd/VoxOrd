/** A translation string that varies by grammatical number. */
export interface PluralForms {
  one: string;
  few: string;
  many: string;
}

export function isPluralForms(value: unknown): value is PluralForms {
  return (
    typeof value === 'object' &&
    value !== null &&
    'one' in value &&
    'few' in value &&
    'many' in value
  );
}

/**
 * Russian and Ukrainian share this count rule (both East Slavic): 1, 21, 31…
 * take `one`; 2-4, 22-24… take `few`; everything else, including 11-14,
 * takes `many`. English only distinguishes 1 from everything else, so it
 * reuses `many` as the "other" form.
 */
function slavicForm(n: number): keyof PluralForms {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  return 'many';
}

export function pickPlural(count: number, forms: PluralForms, language: string): string {
  const n = Math.abs(count);
  if (language === 'en') return n === 1 ? forms.one : forms.many;
  return forms[slavicForm(n)];
}
