import { decodeJwtPayload, isTokenExpired } from './jwt';

// Tests run under Node; declared locally to avoid adding @types/node to the
// React Native app's type surface just for a test helper.
declare const Buffer: {
  from(input: string, encoding: string): { toString(encoding: string): string };
};

/** Builds an unsigned JWT with the given payload (signature is never checked client-side). */
export function makeJwt(payload: Record<string, unknown>): string {
  const encode = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.sig`;
}

describe('decodeJwtPayload', () => {
  it('decodes the claims emitted by the auth service', () => {
    const token = makeJwt({
      sub: '11111111-2222-3333-4444-555555555555',
      email: 'student@example.com',
      token_type: 'access',
      role: 'student',
      exp: 1893456000,
    });

    expect(decodeJwtPayload(token)).toEqual({
      sub: '11111111-2222-3333-4444-555555555555',
      email: 'student@example.com',
      roles: ['student'],
      exp: 1893456000,
      tokenType: 'access',
    });
  });

  it('reads multiple roles from an array claim', () => {
    const token = makeJwt({ sub: 'u1', role: ['student', 'tutor'] });
    expect(decodeJwtPayload(token)?.roles).toEqual(['student', 'tutor']);
  });

  it('falls back to the long .NET role claim URI', () => {
    const token = makeJwt({
      sub: 'u1',
      'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': 'school_admin',
    });
    expect(decodeJwtPayload(token)?.roles).toEqual(['school_admin']);
  });

  it('decodes non-ASCII claim values', () => {
    const token = makeJwt({ sub: 'u1', email: 'dmytro+тест@example.com' });
    expect(decodeJwtPayload(token)?.email).toBe('dmytro+тест@example.com');
  });

  it('returns an empty role list when the token carries no role claim', () => {
    const token = makeJwt({ sub: 'u1' });
    expect(decodeJwtPayload(token)?.roles).toEqual([]);
  });

  it('returns null for malformed input', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('a.b')).toBeNull();
    expect(decodeJwtPayload('a.!!!not-base64-json!!!.c')).toBeNull();
  });

  it('returns null when the sub claim is missing', () => {
    expect(decodeJwtPayload(makeJwt({ email: 'x@y.z' }))).toBeNull();
  });
});

describe('isTokenExpired', () => {
  const nowSeconds = () => Math.floor(Date.now() / 1000);

  it('treats a comfortably future expiry as valid', () => {
    const payload = decodeJwtPayload(makeJwt({ sub: 'u1', exp: nowSeconds() + 3600 }));
    expect(isTokenExpired(payload)).toBe(false);
  });

  it('treats a past expiry as expired', () => {
    const payload = decodeJwtPayload(makeJwt({ sub: 'u1', exp: nowSeconds() - 10 }));
    expect(isTokenExpired(payload)).toBe(true);
  });

  it('treats an expiry inside the clock-skew window as expired', () => {
    const payload = decodeJwtPayload(makeJwt({ sub: 'u1', exp: nowSeconds() + 5 }));
    expect(isTokenExpired(payload, 30)).toBe(true);
  });

  it('treats a token without exp as not expired', () => {
    const payload = decodeJwtPayload(makeJwt({ sub: 'u1' }));
    expect(isTokenExpired(payload)).toBe(false);
  });

  it('treats a null payload as not expired (nothing to judge)', () => {
    expect(isTokenExpired(null)).toBe(false);
  });
});
