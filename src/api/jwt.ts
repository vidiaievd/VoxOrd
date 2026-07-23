/**
 * Minimal JWT payload decoding.
 *
 * The client NEVER verifies the signature — that is the API gateway's and the
 * services' job (RS256, public key). We decode only to read `sub`, `email`,
 * `role` and `exp` for UI purposes. Treat every value here as untrusted
 * display data, not as an authorization decision.
 *
 * Claim shape confirmed against
 * ssz-platform/services/auth-service/src/AuthService.Infrastructure/Security/JwtTokenService.cs
 * (`GenerateAccessToken`): sub, email, jti, iat, token_type=access, plus one
 * `ClaimTypes.Role` claim per role. `JwtSecurityTokenHandler` applies
 * `DefaultOutboundClaimTypeMap`, which shortens `ClaimTypes.Role` to the `role`
 * claim — emitted as a string for a single role and an array for several.
 */

const B64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Long .NET claim URI, kept as a defensive fallback in case outbound claim mapping is ever disabled server-side. */
const DOTNET_ROLE_CLAIM =
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

export interface JwtPayload {
  sub: string;
  email: string | null;
  roles: string[];
  /** Unix seconds, or null when the token carries no `exp`. */
  exp: number | null;
  tokenType: string | null;
}

function base64ToBytes(b64: string): number[] {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < b64.length; i++) {
    const idx = B64_ALPHABET.indexOf(b64[i]);
    if (idx === -1) continue; // padding and stray characters
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return bytes;
}

/**
 * Decodes UTF-8 bytes without depending on TextDecoder/atob, which are not
 * guaranteed across Hermes versions and the Jest environment.
 */
function utf8BytesToString(bytes: number[]): string {
  let out = '';
  let i = 0;

  while (i < bytes.length) {
    const b1 = bytes[i++];
    if (b1 < 0x80) {
      out += String.fromCharCode(b1);
    } else if (b1 < 0xe0) {
      const b2 = bytes[i++] ?? 0;
      out += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
    } else if (b1 < 0xf0) {
      const b2 = bytes[i++] ?? 0;
      const b3 = bytes[i++] ?? 0;
      out += String.fromCharCode(
        ((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f),
      );
    } else {
      const b2 = bytes[i++] ?? 0;
      const b3 = bytes[i++] ?? 0;
      const b4 = bytes[i++] ?? 0;
      const codePoint =
        ((b1 & 0x07) << 18) |
        ((b2 & 0x3f) << 12) |
        ((b3 & 0x3f) << 6) |
        (b4 & 0x3f);
      out += String.fromCodePoint(codePoint);
    }
  }

  return out;
}

function normalizeRoles(raw: any): string[] {
  const candidate = raw?.role ?? raw?.roles ?? raw?.[DOTNET_ROLE_CLAIM];
  if (typeof candidate === 'string') return [candidate];
  if (Array.isArray(candidate)) {
    return candidate.filter((r): r is string => typeof r === 'string');
  }
  return [];
}

/** Returns null for anything that is not a decodable JWT with a `sub` claim. */
export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const raw = JSON.parse(utf8BytesToString(base64ToBytes(base64)));

    if (!raw || typeof raw.sub !== 'string' || raw.sub.length === 0) {
      return null;
    }

    return {
      sub: raw.sub,
      email: typeof raw.email === 'string' ? raw.email : null,
      roles: normalizeRoles(raw),
      exp: typeof raw.exp === 'number' ? raw.exp : null,
      tokenType: typeof raw.token_type === 'string' ? raw.token_type : null,
    };
  } catch {
    return null;
  }
}

/**
 * True when the token is at or past its expiry. A token without `exp` is
 * treated as NOT expired — the server remains the authority; we only use this
 * to avoid obviously pointless requests.
 */
export function isTokenExpired(
  payload: JwtPayload | null,
  skewSeconds = 30,
): boolean {
  if (!payload || payload.exp === null) return false;
  return Date.now() / 1000 >= payload.exp - skewSeconds;
}
