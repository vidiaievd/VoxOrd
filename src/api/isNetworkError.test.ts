import { isNetworkError } from './isNetworkError';
import { ApiError } from './client';

describe('isNetworkError', () => {
  it('is true for NETWORK_ERROR', () => {
    expect(isNetworkError(new ApiError({ message: 'x', status: null, code: 'NETWORK_ERROR' }))).toBe(true);
  });

  it('is true for TIMEOUT', () => {
    expect(isNetworkError(new ApiError({ message: 'x', status: null, code: 'TIMEOUT' }))).toBe(true);
  });

  it('is false for an application error (e.g. 404)', () => {
    expect(isNetworkError(new ApiError({ message: 'x', status: 404, code: 'NOT_FOUND' }))).toBe(false);
  });

  it('is false for a non-ApiError', () => {
    expect(isNetworkError(new Error('plain error'))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});
