import { parseInlines, readerBlocks } from './readerBlocks';

describe('readerBlocks', () => {
  it('reads a dialogue turn, joining the hard-wrapped lines', () => {
    const blocks = readerBlocks(
      '**Erik:** Her holder det med én side, maks to. Ingen forventer bilde på\nCV-en.',
    );
    expect(blocks).toEqual([
      {
        kind: 'turn',
        speaker: 'Erik',
        inlines: [{ text: 'Her holder det med én side, maks to. Ingen forventer bilde på CV-en.' }],
      },
    ]);
  });

  it('takes the speaker without the stage direction', () => {
    const [turn] = readerBlocks('**Taras (svar):** Ja, gjerne.');
    expect(turn).toMatchObject({ kind: 'turn', speaker: 'Taras' });
  });

  it('does not take a bold label that introduces what follows for a speaker', () => {
    expect(readerBlocks('**Vi tilbyr:**')[0]).toMatchObject({ kind: 'text' });
    expect(readerBlocks('**Hva gjør du nå?** Svar kort.')[0]).toMatchObject({ kind: 'text' });
  });

  it('shows nothing for a paragraph that is only the narration token', () => {
    expect(readerBlocks('\n[audio:42b043bf-7b9b-4bbd-9113-271a33cfc6e9]')).toEqual([]);
  });

  it('reads a quoted document, with its labels as content and its list', () => {
    const [doc] = readerBlocks(
      [
        '> **Taras Kovalenko** — Backend-utvikler',
        '>',
        '> **Erfaring:**',
        '> - Backend-utvikler, TechSolutions (2021–nå): Utviklet',
        '>   API-er for en netthandelsplattform.',
        '> - Junior utvikler, DataFlow (2019–2021).',
      ].join('\n'),
    );
    expect(doc!.kind).toBe('document');
    const inner = (doc as { blocks: unknown[] }).blocks;
    expect(inner[0]).toMatchObject({ kind: 'text' });
    expect(inner[1]).toMatchObject({ kind: 'text' });
    expect(inner[2]).toEqual({
      kind: 'list',
      items: [
        [{ text: 'Backend-utvikler, TechSolutions (2021–nå): Utviklet API-er for en netthandelsplattform.' }],
        [{ text: 'Junior utvikler, DataFlow (2019–2021).' }],
      ],
    });
  });

  it('reads a table with its header row', () => {
    const [table] = readerBlocks('| Del | Innhold |\n|---|---|\n| Profil | Backend-utvikler |');
    expect(table).toEqual({
      kind: 'table',
      header: [[{ text: 'Del' }], [{ text: 'Innhold' }]],
      rows: [[[{ text: 'Profil' }], [{ text: 'Backend-utvikler' }]]],
    });
  });

  it('reads an image placed on its own line', () => {
    expect(readerBlocks('![Et kontor](media://abc-123)')).toEqual([
      { kind: 'image', alt: 'Et kontor', mediaId: 'abc-123' },
    ]);
  });

  it('keeps a heading apart from the paragraph under it', () => {
    expect(readerBlocks('## Søknaden\nHan skriver kort.')).toEqual([
      { kind: 'heading', inlines: [{ text: 'Søknaden' }] },
      { kind: 'text', inlines: [{ text: 'Han skriver kort.' }] },
    ]);
  });
});

describe('parseInlines', () => {
  it('reads bold and italic, and leaves an underscore inside a word alone', () => {
    expect(parseInlines('**Profil:** en _kort_ tekst om snake_case')).toEqual([
      { text: 'Profil:', bold: true },
      { text: ' en ' },
      { text: 'kort', italic: true },
      { text: ' tekst om snake_case' },
    ]);
  });
});
