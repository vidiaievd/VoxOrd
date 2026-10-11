import {
  buildTranslateAnswer,
  readTranslateRouting,
  readTranslateTask,
  translateCanSubmit,
} from './translate';

// The shape content-service serves on /display — a seeded exercise, verbatim.
const SEEDED = {
  dir: 'to_target',
  note: '',
  items: [
    {
      id: 's1',
      dir: 'to_target',
      gloss: [{ t: 'familie (en)', w: 'семья' }],
      source: 'Семья живёт в Бергене.',
    },
  ],
  langs: { target: 'Norsk', explain: 'Russisk' },
  format: 'single',
};

describe('readTranslateTask', () => {
  it('reads a seeded document', () => {
    const task = readTranslateTask(SEEDED, 'translate_to_target');
    expect(task.dir).toBe('to_target');
    expect(task.items).toEqual([
      {
        id: 's1',
        dir: 'to_target',
        source: 'Семья живёт в Бергене.',
        sourceLang: 'Russisk',
        answerLang: 'Norsk',
        gloss: [{ w: 'семья', t: 'familie (en)' }],
      },
    ]);
    expect(task.keyboard).toBe(true);
    expect(task.gloss).toBe(true);
  });

  it('runs only the first written sentence of a single', () => {
    const task = readTranslateTask(
      {
        ...SEEDED,
        items: [
          { id: 'a', source: '  ' },
          { id: 'b', source: 'Первое.' },
          { id: 'c', source: 'Второе.' },
        ],
      },
      'translate_to_target',
    );
    expect(task.items.map((item) => item.id)).toEqual(['b']);
  });

  it('runs every written sentence of a set', () => {
    const task = readTranslateTask(
      { ...SEEDED, format: 'set', items: [{ id: 'a', source: 'Раз.' }, { id: 'b', source: 'Два.' }] },
      'translate_to_target',
    );
    expect(task.items.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('swaps the language labels for a sentence read in the target language', () => {
    const task = readTranslateTask(
      { ...SEEDED, dir: undefined, items: [{ id: 'a', source: 'Hei.' }] },
      'translate_from_target',
    );
    expect(task.dir).toBe('from_target');
    expect(task.items[0]).toMatchObject({ dir: 'from_target', sourceLang: 'Norsk', answerLang: 'Russisk' });
  });

  it('gives each sentence of a mixed set its own direction', () => {
    const task = readTranslateTask(
      {
        ...SEEDED,
        dir: 'both',
        format: 'set',
        items: [
          { id: 'a', dir: 'to_target', source: 'Привет.' },
          { id: 'b', dir: 'from_target', source: 'Hei.' },
        ],
      },
      'translate_to_target',
    );
    expect(task.items.map((item) => item.dir)).toEqual(['to_target', 'from_target']);
    expect(task.items[1].answerLang).toBe('Russisk');
  });

  it('carries hint and recording only when written, and the flow switches', () => {
    const task = readTranslateTask(
      {
        ...SEEDED,
        flow: { keyboard: false, gloss: false },
        items: [{ id: 's1', source: 'Да.', hint: 'Короткий ответ', mediaId: 'm-1' }],
      },
      'translate_to_target',
    );
    expect(task.items[0]).toMatchObject({ hint: 'Короткий ответ', mediaId: 'm-1' });
    expect(task.keyboard).toBe(false);
    expect(task.gloss).toBe(false);
  });

  it('survives a document that is not one', () => {
    const task = readTranslateTask(null, 'translate_to_target');
    expect(task.items).toEqual([]);
    expect(task.langs).toEqual({ explain: 'Russisk', target: 'Norsk' });
  });
});

describe('buildTranslateAnswer / translateCanSubmit', () => {
  const items = readTranslateTask(
    { ...SEEDED, format: 'set', items: [{ id: 'a', source: 'Раз.' }, { id: 'b', source: 'Два.' }] },
    'translate_to_target',
  ).items;

  it('sends one trimmed entry per sentence, in order', () => {
    expect(buildTranslateAnswer(items, { b: ' to ', a: 'en' })).toEqual([
      { itemId: 'a', text: 'en' },
      { itemId: 'b', text: 'to' },
    ]);
  });

  it('allows submitting only once every sentence is written', () => {
    expect(translateCanSubmit(items, { a: 'en' })).toBe(false);
    expect(translateCanSubmit(items, { a: 'en', b: '   ' })).toBe(false);
    expect(translateCanSubmit(items, { a: 'en', b: 'to' })).toBe(true);
    expect(translateCanSubmit([], {})).toBe(false);
  });
});

describe('readTranslateRouting', () => {
  it('reads the routing the engine lets through', () => {
    expect(
      readTranslateRouting({
        totalItems: 2,
        passedItems: 1,
        items: [
          { itemId: 'a', routing: 'pass' },
          { itemId: 'b', routing: 'teacher' },
        ],
      }),
    ).toEqual({ a: 'pass', b: 'teacher' });
  });

  it('is empty for missing or malformed details', () => {
    expect(readTranslateRouting(undefined)).toEqual({});
    expect(readTranslateRouting({ items: [{ itemId: 'a', routing: 'maybe' }] })).toEqual({});
  });
});
