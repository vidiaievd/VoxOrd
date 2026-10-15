/**
 * `TextEncoder` as Hermes provides it (React Native 0.74+). The app's TypeScript config
 * carries no DOM library, and one file of the vendored kernel (`src/kernel/narration/sha256.ts`)
 * encodes text to bytes with it.
 */
declare class TextEncoder {
  readonly encoding: string;
  encode(input?: string): Uint8Array;
}
