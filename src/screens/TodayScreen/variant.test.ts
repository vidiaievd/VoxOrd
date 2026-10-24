import { aiCaps, hasSchool, resolveVariant, type EntitlementsLike } from './variant';

const school = (status: string, groupId: string | null) => ({ status, groupId });

const entitled = (...keys: string[]): EntitlementsLike => ({
  features: Object.fromEntries(keys.map((k) => [k, { enabled: true, monthlyCredits: null }])),
});

describe('resolveVariant', () => {
  it('a school with no AI is A', () => {
    expect(resolveVariant({ schools: [school('active', 'g1')], entitlements: entitled() })).toBe('school');
  });

  it('a school whose teachers get AI drafts is C', () => {
    expect(
      resolveVariant({ schools: [school('active', 'g1')], entitlements: entitled('ai.review_draft') }),
    ).toBe('school_ai');
  });

  it('a school learner with the assistant is C', () => {
    expect(
      resolveVariant({ schools: [school('active', 'g1')], entitlements: entitled('ai.student_assist') }),
    ).toBe('school_ai');
  });

  it('direct review and the practice plan do not make a school learner C', () => {
    expect(
      resolveVariant({
        schools: [school('active', 'g1')],
        entitlements: entitled('ai.review_direct', 'ai.practice'),
      }),
    ).toBe('school');
  });

  it('a learner on their own with no AI is B', () => {
    expect(resolveVariant({ schools: [], entitlements: entitled() })).toBe('solo');
  });

  it('a learner on their own with any learner AI is D', () => {
    for (const key of ['ai.review_direct', 'ai.student_assist', 'ai.practice']) {
      expect(resolveVariant({ schools: [], entitlements: entitled(key) })).toBe('solo_ai');
    }
  });

  it('a membership still in onboarding, or with no group, is not a school yet', () => {
    expect(
      resolveVariant({
        schools: [school('onboarding', 'g1'), school('active', null)],
        entitlements: entitled('ai.review_draft'),
      }),
    ).toBe('solo');
  });

  it('nothing loaded is B: no school, no AI, until the sources say otherwise', () => {
    expect(resolveVariant({ schools: null, entitlements: null })).toBe('solo');
  });
});

describe('hasSchool', () => {
  it('needs one active membership with a group among several', () => {
    expect(hasSchool([school('past', 'g0'), school('active', 'g1')])).toBe(true);
    expect(hasSchool(null)).toBe(false);
  });
});

describe('aiCaps', () => {
  it('reads a key switched off as off, and its credits as none', () => {
    const caps = aiCaps({
      features: {
        'ai.review_direct': { enabled: false, monthlyCredits: '30' },
        'ai.student_assist': { enabled: true, monthlyCredits: null },
      },
    });
    expect(caps).toEqual({
      reviewDraft: false,
      reviewDirect: false,
      assist: true,
      practicePlan: false,
      directCredits: null,
    });
  });

  it('passes direct-review credits through as the decimal string they are', () => {
    expect(
      aiCaps({ features: { 'ai.review_direct': { enabled: true, monthlyCredits: '30' } } }).directCredits,
    ).toBe('30');
  });
});
