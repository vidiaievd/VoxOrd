import {
  EMPTY_EDITS,
  buildEcAnswer,
  changeCount,
  ecCanSubmit,
  insertAt,
  readEcTask,
  restoreWord,
  rewriteWord,
  wordState,
  words,
} from './errorCorrection';

// The display document of a seeded exercise, verbatim.
const DISPLAY = {
  mode: 'sentences',
  note: 'Indirekte tale — setninger om tekst 1A.',
  items: [
    { id: 's-0', wrong: 'Anne sa at søknaden var god, men at han har noen skrivefeil.' },
    { id: 's-2', wrong: 'Kari spør om har han fagbrev som elektriker.' },
    { id: 'empty', wrong: '  ' },
  ],
};

describe('words', () => {
  it('splits the way the kernel does', () => {
    expect(words('  Kari  spør om\nhar han. ')).toEqual(['Kari', 'spør', 'om', 'har', 'han.']);
    expect(words('')).toEqual([]);
  });
});

describe('readEcTask', () => {
  it('renders from the display document, without counts', () => {
    const task = readEcTask(DISPLAY, null);
    expect(task.mode).toBe('sentences');
    expect(task.note).toBe('Indirekte tale — setninger om tekst 1A.');
    expect(task.items.map((item) => item.id)).toEqual(['s-0', 's-2']);
    expect(task.items[1].words).toEqual(['Kari', 'spør', 'om', 'har', 'han', 'fagbrev', 'som', 'elektriker.']);
    expect(task.totalErrors).toBeUndefined();
    expect(task.keyboard).toBe(true);
  });

  it('prefers the attempt projection, with its counts and types', () => {
    const task = readEcTask(DISPLAY, {
      mode: 'passage',
      note: '',
      items: [
        { id: 's-2', wrong: 'Kari spør om har han.', words: ['Kari', 'spør', 'om', 'har', 'han.'], errorCount: 1, errorTypes: ['order', 'nonsense'] },
      ],
      hints: { count: true, hintText: true },
      flow: { keyboard: false },
      totalErrors: 1,
    });
    expect(task.mode).toBe('passage');
    expect(task.items).toEqual([
      { id: 's-2', wrong: 'Kari spør om har han.', words: ['Kari', 'spør', 'om', 'har', 'han.'], errorCount: 1, errorTypes: ['order'] },
    ]);
    expect(task.totalErrors).toBe(1);
    expect(task.keyboard).toBe(false);
  });

  it('keeps a hint only when the author shows hints', () => {
    const doc = { items: [{ id: 'a', wrong: 'Jeg er.', hint: 'Verb' }] };
    expect(readEcTask(doc, null).items[0].hint).toBe('Verb');
    expect(readEcTask({ ...doc, hints: { hintText: false } }, null).items[0].hint).toBeUndefined();
  });
});

describe('edits', () => {
  it('rewrites a word, and an unchanged rewrite is no edit', () => {
    const edited = rewriteWord(EMPTY_EDITS, 3, 'har', 'han');
    expect(edited).toEqual({ marked: { 3: true }, fix: { 3: 'han' }, ins: {} });
    expect(wordState(edited, 3)).toBe('edited');
    expect(rewriteWord(edited, 3, 'har', ' har ')).toEqual({ marked: {}, fix: {}, ins: {} });
    expect(EMPTY_EDITS).toEqual({ marked: {}, fix: {}, ins: {} });
  });

  it('strikes a word out with an empty rewrite, and restores it', () => {
    const struck = rewriteWord(EMPTY_EDITS, 0, 'Kari', '');
    expect(wordState(struck, 0)).toBe('removed');
    expect(restoreWord(struck, 0)).toEqual(EMPTY_EDITS);
  });

  it('inserts at a slot, and an empty insert removes it', () => {
    const inserted = insertAt(EMPTY_EDITS, 4, ' han ');
    expect(inserted.ins).toEqual({ 4: 'han' });
    expect(insertAt(inserted, 4, '').ins).toEqual({});
  });

  it('counts changes as the web does', () => {
    expect(changeCount(undefined)).toBe(0);
    expect(changeCount(insertAt(rewriteWord(EMPTY_EDITS, 3, 'har', ''), 5, 'har'))).toBe(2);
  });
});

describe('answer', () => {
  const items = readEcTask(DISPLAY, null).items;

  it('sends every sentence, untouched ones empty', () => {
    const edited = rewriteWord(EMPTY_EDITS, 7, 'har', 'hadde');
    expect(buildEcAnswer(items, { 's-0': edited })).toEqual({
      items: { 's-0': edited, 's-2': EMPTY_EDITS },
    });
  });

  it('can be handed in once every sentence has a change', () => {
    const one = rewriteWord(EMPTY_EDITS, 0, 'x', 'y');
    expect(ecCanSubmit(items, { 's-0': one })).toBe(false);
    expect(ecCanSubmit(items, { 's-0': one, 's-2': one })).toBe(true);
    expect(ecCanSubmit([], {})).toBe(false);
  });
});
