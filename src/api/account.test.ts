import { ApiError } from './client';
import { deletionRefusal, parseAccountDeletion } from './account';

const err = (status: number, code: string) =>
  new ApiError({ message: code, status, code });

describe('parseAccountDeletion', () => {
  it('reads the receipt', () => {
    expect(
      parseAccountDeletion({ deletionRequestedAt: 'a', purgeAfter: 'b', x: 1 }),
    ).toEqual({ requestedAt: 'a', purgeAfter: 'b' });
  });
  it('is null for anything else', () => {
    expect(parseAccountDeletion(null)).toBeNull();
    expect(parseAccountDeletion({ purgeAfter: 'b' })).toBeNull();
  });
});

describe('deletionRefusal', () => {
  it('names the three refusals', () => {
    expect(deletionRefusal(err(403, 'INVALID_PASSWORD'))).toBe('wrong_password');
    expect(deletionRefusal(err(409, 'CONTACT_SUPPORT'))).toBe('contact_support');
    expect(deletionRefusal(err(423, 'LOCKED'))).toBe('locked');
  });
  it('leaves other failures alone', () => {
    expect(deletionRefusal(err(500, 'X'))).toBeNull();
    expect(deletionRefusal(new Error('x'))).toBeNull();
  });
});
