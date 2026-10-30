import { createContext, useContext } from 'react';

/**
 * What a word tapped in this text needs to be saved to «My words» (plan 75): the text's
 * language, the variant shown and the paragraph it sits in. Null outside a text, and while
 * the course's language is not yet known — words are then shown but not tappable.
 */
export interface ReaderCapture {
  targetLanguage: string;
  variantId: string | null;
  paragraphIndex: number | null;
}

export const ReaderCaptureContext = createContext<ReaderCapture | null>(null);

export function useReaderCapture(): ReaderCapture | null {
  return useContext(ReaderCaptureContext);
}

/** How the paragraphs of this text are drawn: the reader's size and the paragraph's colour. */
export interface ReaderTextStyle {
  fontSize: number;
  /** Colour token key of the paragraph — it follows the narration (Courses §8.1). */
  tone: 'plain' | 'read' | 'current' | 'unread';
}

export const ReaderTextStyleContext = createContext<ReaderTextStyle>({
  fontSize: 17,
  tone: 'plain',
});

export function useReaderTextStyle(): ReaderTextStyle {
  return useContext(ReaderTextStyleContext);
}
