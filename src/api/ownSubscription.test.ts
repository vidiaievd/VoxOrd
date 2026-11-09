import { parseOwnSubscription } from './ownSubscription';

describe('parseOwnSubscription', () => {
  it('reads a subscription', () => {
    expect(
      parseOwnSubscription({
        source: 'subscription',
        plan: { code: 'pro', name: 'Pro', version: 1 },
        subscription: {
          id: 'x',
          status: 'active',
          periodStart: '2026-10-01T00:00:00Z',
          periodEnd: '2026-12-01T00:00:00Z',
        },
        features: {},
      }),
    ).toEqual({
      source: 'subscription',
      planName: 'Pro',
      status: 'active',
      endsAt: '2026-12-01T00:00:00Z',
    });
  });

  it('reads the free plan, and an open-ended subscription', () => {
    expect(
      parseOwnSubscription({
        source: 'free_plan',
        plan: { name: 'Free' },
        subscription: null,
      }),
    ).toEqual({
      source: 'free_plan',
      planName: 'Free',
      status: null,
      endsAt: null,
    });
    expect(
      parseOwnSubscription({
        source: 'subscription',
        plan: null,
        subscription: { status: 'trial', periodEnd: null },
      }),
    ).toEqual({
      source: 'subscription',
      planName: null,
      status: 'trial',
      endsAt: null,
    });
  });

  it('is null for anything else', () => {
    expect(parseOwnSubscription(null)).toBeNull();
    expect(parseOwnSubscription({ source: 'other' })).toBeNull();
    expect(parseOwnSubscription([])).toBeNull();
  });
});
