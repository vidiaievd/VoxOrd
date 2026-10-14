/**
 * One paragraph of a text lesson, read into the blocks the reader draws.
 *
 * The server hands the reader each paragraph as the Markdown the author wrote
 * (`MarkdownParagraphSplitterService`): dialogue turns as `**Erik:** text`, documents as
 * block quotes, lists, the odd table, images as `![alt](media://id)`, and the narration's
 * `[audio:id]` token. Shown as plain text, all of that markup reached the screen. This turns
 * it into blocks; it does not try to be a Markdown engine — only the shapes lesson texts use.
 *
 * Who counts as a speaker follows the narration script's rule (`@ssz/shared-kernel/narration`,
 * `speakerOf`): a bold label ending in a colon, at most four words and no punctuation. Inside
 * a quoted document a bold label is content (`**Profil:**`), never a turn.
 */

export interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type ReaderBlock =
  | { kind: 'text'; inlines: Inline[] }
  | { kind: 'heading'; inlines: Inline[] }
  | { kind: 'turn'; speaker: string; inlines: Inline[] }
  | { kind: 'list'; items: Inline[][] }
  | { kind: 'table'; header: Inline[][] | null; rows: Inline[][][] }
  | { kind: 'image'; mediaId: string; alt: string }
  | { kind: 'document'; blocks: ReaderBlock[] };

/** Media the reader plays elsewhere or not at all: the narration strip has the recording. */
const PLAYED_ELSEWHERE = /\[(?:audio|video):[A-Za-z0-9_-]+(?:\s+"[^"]*")?\]/g;
const IMAGE_LINE = /^!\[([^\]]*)\]\(media:\/\/([A-Za-z0-9_-]+)\)\s*$/;
const HEADING = /^#{1,6}\s+(.*)$/;
const LIST_ITEM = /^\s*[-*•]\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-*:?\s*\|?\s*$/;
/** `**Erik:** text` and `**Erik**: text`. */
const TURN = /^\*\*([^*]+?)(?::\*\*|\*\*:)\s*(.*)$/;
/** `**Taras (svar):**` is spoken by Taras. */
const STAGE_DIRECTION = /^(.*?)\s*\([^)]*\)\s*$/;

/** The blocks of one paragraph; empty when it held nothing to show (a lone `[audio:…]`). */
export function readerBlocks(markdown: string): ReaderBlock[] {
  return parseBlocks(markdown.replace(PLAYED_ELSEWHERE, ''), false);
}

function parseBlocks(source: string, inDocument: boolean): ReaderBlock[] {
  const lines = source.split('\n');
  const blocks: ReaderBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (trimmed === '') {
      i += 1;
      continue;
    }

    // A quoted document: every line of the run belongs to it, `>` and all.
    if (trimmed.startsWith('>')) {
      const quoted: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('>')) {
        quoted.push(lines[i]!.trim().replace(/^>\s?/, ''));
        i += 1;
      }
      const inner = parseBlocks(quoted.join('\n'), true);
      if (inner.length > 0) blocks.push({ kind: 'document', blocks: inner });
      continue;
    }

    const image = IMAGE_LINE.exec(trimmed);
    if (image) {
      blocks.push({ kind: 'image', alt: image[1]!.trim(), mediaId: image[2]! });
      i += 1;
      continue;
    }

    const heading = HEADING.exec(trimmed);
    if (heading) {
      blocks.push({ kind: 'heading', inlines: parseInlines(heading[1]!) });
      i += 1;
      continue;
    }

    if (TABLE_ROW.test(line)) {
      const rows: string[] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i]!)) {
        rows.push(lines[i]!);
        i += 1;
      }
      blocks.push(readTable(rows));
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i]!;
        const item = LIST_ITEM.exec(current);
        if (item) {
          items.push(item[1]!);
        } else if (current.trim() !== '' && /^\s{2,}/.test(current) && items.length > 0) {
          // A wrapped item continues on an indented line.
          items[items.length - 1] += ` ${current.trim()}`;
        } else {
          break;
        }
        i += 1;
      }
      blocks.push({ kind: 'list', items: items.map(parseInlines) });
      continue;
    }

    // A paragraph or a turn: the lines up to the next block, joined — the author's hard
    // wraps are not line breaks a reader should see.
    const body: string[] = [trimmed];
    i += 1;
    while (i < lines.length && !startsBlock(lines[i]!)) {
      body.push(lines[i]!.trim());
      i += 1;
    }
    const text = body.join(' ');
    const turn = inDocument ? null : speakerOf(text);
    blocks.push(
      turn
        ? { kind: 'turn', speaker: turn.speaker, inlines: parseInlines(turn.rest) }
        : { kind: 'text', inlines: parseInlines(text) },
    );
  }

  return blocks;
}

/** Whether `line` opens a block of its own rather than continuing the paragraph above. */
function startsBlock(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed === '' ||
    trimmed.startsWith('>') ||
    IMAGE_LINE.test(trimmed) ||
    HEADING.test(trimmed) ||
    TABLE_ROW.test(line) ||
    LIST_ITEM.test(line) ||
    speakerOf(trimmed) !== null
  );
}

function speakerOf(line: string): { speaker: string; rest: string } | null {
  const match = TURN.exec(line);
  if (!match) return null;
  const label = match[1]!.trim();
  const speaker = (STAGE_DIRECTION.exec(label)?.[1] ?? label).trim();
  const rest = match[2]!.trim();
  if (!speaker || /[.!?…:;«»"()]/.test(speaker) || speaker.split(/\s+/).length > 4) return null;
  // A bold label alone on its line introduces what follows; it is not someone speaking.
  if (rest === '') return null;
  return { speaker, rest };
}

function readTable(rows: string[]): ReaderBlock {
  const cells = (row: string) =>
    row
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(cell => parseInlines(cell.trim()));

  const ruleAt = rows.findIndex(row => TABLE_RULE.test(row));
  if (ruleAt === 1) {
    return { kind: 'table', header: cells(rows[0]!), rows: rows.slice(2).map(cells) };
  }
  return { kind: 'table', header: null, rows: rows.filter(r => !TABLE_RULE.test(r)).map(cells) };
}

/** `**bold**`, `*italic*` and `_italic_` inside a line; anything else is text as written. */
export function parseInlines(source: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|(?<![\w])_([^_]+)_(?![\w])/g;
  let at = 0;
  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > at) out.push({ text: source.slice(at, start) });
    if (match[1] !== undefined) out.push({ text: match[1], bold: true });
    else out.push({ text: (match[2] ?? match[3])!, italic: true });
    at = start + match[0].length;
  }
  if (at < source.length) out.push({ text: source.slice(at) });
  return out.filter(inline => inline.text !== '');
}

/** The words of a run of inlines, for searching and for screen readers. */
export function plainText(inlines: Inline[]): string {
  return inlines.map(inline => inline.text).join('');
}
