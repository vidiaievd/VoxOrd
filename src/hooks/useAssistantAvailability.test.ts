import { AVAILABILITY_TTL_MS, isFresh } from './useAssistantAvailability';

describe('isFresh', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');

  it('goes by an answer for ten minutes, not after', () => {
    expect(isFresh({ available: true, reason: null, checkedAt: now - AVAILABILITY_TTL_MS + 1 }, now)).toBe(true);
    expect(isFresh({ available: true, reason: null, checkedAt: now - AVAILABILITY_TTL_MS }, now)).toBe(false);
    expect(isFresh(null, now)).toBe(false);
  });
});
