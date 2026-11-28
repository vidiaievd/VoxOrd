import { ApiError } from '../../api/client';
import { loadErrorLine } from './loadErrorLine';

const t = (key: string) => `t:${key}`;

describe('loadErrorLine', () => {
  it('words a timeout and a lost connection instead of showing the API path', () => {
    const timeout = new ApiError({
      message: 'Request timed out after 15000ms: /api/v1/progress/units/u1/contents',
      status: null,
      code: 'TIMEOUT',
    });
    const offline = new ApiError({ message: 'Network request failed', status: null, code: 'NETWORK_ERROR' });
    expect(loadErrorLine(timeout, t)).toBe('t:courseHome.unitNotSaved');
    expect(loadErrorLine(offline, t)).toBe('t:courseHome.unitNotSaved');
  });

  it('keeps the message of any other failure', () => {
    expect(loadErrorLine(new ApiError({ message: 'Not found', status: 404 }), t)).toBe('Not found');
    expect(loadErrorLine(null, t)).toBe('');
  });
});
