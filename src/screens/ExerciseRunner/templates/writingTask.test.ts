import {
  appendPhrase,
  buildWritingTaskAnswer,
  formatClock,
  measure,
  readWritingTaskContent,
  submitGate,
  togglePoint,
  words,
  type WritingTaskContent,
} from './writingTask';

/** A minimal projection, as content-service's `studentSafeContent` sends it. */
const projection = (over: Partial<WritingTaskContent> = {}): unknown => ({
  mode: 'letter',
  instruction: 'Skriv et brev.',
  prompt: 'Skriv til utleieren om vannlekkasjen.',
  points: [
    { id: 'p1', text: 'Beskriv problemet', required: true },
    { id: 'p2', text: 'Foreslå en løsning', required: true },
  ],
  phrases: ['Med vennlig hilsen'],
  rubricMax: 15,
  settings: { minWords: 10, maxWords: 20 },
  ...over,
});

describe('readWritingTaskContent', () => {
  it('reads a projection and fills the settings from the defaults', () => {
    const task = readWritingTaskContent(projection())!;

    expect(task.mode).toBe('letter');
    expect(task.points.map(p => p.id)).toEqual(['p1', 'p2']);
    expect(task.settings.minWords).toBe(10);
    // Untouched by the wire object, so the author's own default stands.
    expect(task.settings.showPlan).toBe(true);
    expect(task.settings.revision).toBe('return');
  });

  it('refuses a document that still carries the answer key', () => {
    // Both are proof that the server did not project: refusing keeps that visible
    // instead of stripping the key on the client.
    expect(readWritingTaskContent(projection({ model: 'Kjære utleier …' } as never))).toBeNull();
    expect(
      readWritingTaskContent(
        projection({ points: [{ id: 'p1', text: 'Beskriv', required: true, keywords: ['lekkasje'] }] } as never),
      ),
    ).toBeNull();
  });

  it('refuses the old seeded shape, which has no mode and no points', () => {
    expect(
      readWritingTaskContent({ prompt: 'Skriv en tekst', min_words: 120, options: [] }),
    ).toBeNull();
  });

  it('refuses anything without a prompt', () => {
    expect(readWritingTaskContent(projection({ prompt: '   ' }))).toBeNull();
    expect(readWritingTaskContent(null)).toBeNull();
    expect(readWritingTaskContent([])).toBeNull();
  });

  it('drops malformed points and phrases rather than the whole task', () => {
    const task = readWritingTaskContent(
      projection({ points: [{ id: 'p1', text: 'Beskriv', required: true }, { id: 7 }] as never, phrases: ['hei', 3] as never }),
    )!;

    expect(task.points).toHaveLength(1);
    expect(task.phrases).toEqual(['hei']);
  });

  it('derives rubricMax from the rubric when the server did not send it', () => {
    const criterion = (id: string, weight: number) => ({
      id,
      name: id,
      desc: '',
      weight,
      levels: ['', '', '', ''],
    });
    const task = readWritingTaskContent(
      projection({ rubricMax: 0, rubric: [criterion('c1', 2), criterion('c2', 1)] as never }),
    )!;

    expect(task.rubricMax).toBe(9);
  });
});

describe('words', () => {
  it('counts the kernel way: punctuation stripped, whitespace collapsed', () => {
    expect(words('Familien bor i Bergen.')).toHaveLength(4);
    expect(words('hei   på   deg')).toHaveLength(3);
    expect(words('«Hei!» sa han — og gikk.')).toEqual(['hei', 'sa', 'han', 'og', 'gikk']);
  });

  it('is empty for empty and whitespace-only text', () => {
    expect(words('')).toEqual([]);
    expect(words('   \n  ')).toEqual([]);
  });
});

describe('measure', () => {
  const range = { minWords: 3, maxWords: 5 };

  it('names the four states of a text against the range', () => {
    expect(measure(range, '')).toEqual({ words: 0, length: 'empty' });
    expect(measure(range, 'ett to')).toEqual({ words: 2, length: 'short' });
    expect(measure(range, 'ett to tre')).toEqual({ words: 3, length: 'ok' });
    expect(measure(range, 'ett to tre fire fem seks')).toEqual({ words: 6, length: 'long' });
  });

  it('treats maxWords: 0 as no ceiling', () => {
    expect(measure({ minWords: 3, maxWords: 0 }, 'ett to tre fire fem seks').length).toBe('ok');
  });
});

describe('submitGate', () => {
  const range = { minWords: 3, maxWords: 5 };

  it('blocks an empty text', () => {
    expect(submitGate(range, '  ')).toEqual({ canSubmit: false, block: 'empty', remaining: 0 });
  });

  it('says how many words a short text still needs', () => {
    expect(submitGate(range, 'ett to')).toEqual({ canSubmit: false, block: 'short', remaining: 1 });
  });

  it('blocks a text over the ceiling', () => {
    expect(submitGate(range, 'ett to tre fire fem seks').block).toBe('long');
  });

  it('opens once the text is in range', () => {
    expect(submitGate(range, 'ett to tre')).toEqual({
      canSubmit: true,
      block: null,
      remaining: 0,
    });
  });
});

describe('buildWritingTaskAnswer', () => {
  it('sends the text and the ticked checklist', () => {
    expect(buildWritingTaskAnswer('  Kjære utleier  ', ['p1'])).toEqual({
      text: 'Kjære utleier',
      ticked: ['p1'],
    });
  });

  it('keeps the paragraph breaks inside the text', () => {
    expect(buildWritingTaskAnswer('Første avsnitt.\n\nAndre avsnitt.\n', [])?.text).toBe(
      'Første avsnitt.\n\nAndre avsnitt.',
    );
  });

  it('is null while there is nothing to send', () => {
    expect(buildWritingTaskAnswer('', ['p1'])).toBeNull();
    expect(buildWritingTaskAnswer('   ', [])).toBeNull();
  });
});

describe('togglePoint', () => {
  it('ticks a point on and off without mutating the input', () => {
    const ticked = ['p1'];
    expect(togglePoint(ticked, 'p2')).toEqual(['p1', 'p2']);
    expect(togglePoint(ticked, 'p1')).toEqual([]);
    expect(ticked).toEqual(['p1']);
  });
});

describe('appendPhrase', () => {
  it('starts the text with the phrase when there is none yet', () => {
    expect(appendPhrase('', 'Med vennlig hilsen')).toBe('Med vennlig hilsen ');
  });

  it('leaves exactly one space between the text and the phrase', () => {
    expect(appendPhrase('Hei.', 'Videre')).toBe('Hei. Videre ');
    expect(appendPhrase('Hei.   ', 'Videre')).toBe('Hei. Videre ');
  });
});

describe('formatClock', () => {
  it('formats minutes and seconds, floored at zero', () => {
    expect(formatClock(615)).toBe('10:15');
    expect(formatClock(59)).toBe('0:59');
    expect(formatClock(-4)).toBe('0:00');
  });
});
