import { isPlaced } from '../../api/schools';

/**
 * Which of the four Today layouts a learner gets (Home spec §5). Two independent facts decide
 * it: a school (placed in a group there) and AI (any AI feature the payer has on).
 */
export type HomeVariant = 'school' | 'solo' | 'school_ai' | 'solo_ai';

/** The AI feature keys Today asks about, as subscription-service names them (plan 78 §2). */
export type AiFeatureKey =
  | 'ai.review_draft'
  | 'ai.review_direct'
  | 'ai.student_assist'
  | 'ai.practice';

/** The part of a school membership the variant reads; `StudentSchool` (step 2) fits it. */
export interface SchoolMembershipLike {
  status: string;
  groupId: string | null;
}

/** The part of `/subscriptions/me` the variant reads; `Entitlements` (step 2) fits it. */
export interface EntitlementsLike {
  features: Partial<Record<string, { enabled: boolean; monthlyCredits: string | null }>>;
}

export interface VariantInputs {
  /** null: not loaded, or failed — read as no school. */
  schools: readonly SchoolMembershipLike[] | null;
  /** null: not loaded, offline without a cache, or expired — read as no AI. */
  entitlements: EntitlementsLike | null;
}

export interface AiCaps {
  /** School: the model drafts the teacher's review. */
  reviewDraft: boolean;
  /** No school: the model reviews on its own. */
  reviewDirect: boolean;
  /** The assistant line and the Assistant screen. */
  assist: boolean;
  /** «Plan for today» (variant D). */
  practicePlan: boolean;
  /** Credits a month for direct reviews; a decimal string, null = unmetered or not on. */
  directCredits: string | null;
}

/**
 * Placed in a group at some school. The spec asked for an active membership as well; placement
 * is what opens a group, and a school can place a learner still `onboarding` (see `isPlaced`).
 */
export function hasSchool(schools: readonly SchoolMembershipLike[] | null): boolean {
  return (schools ?? []).some(isPlaced);
}

export function aiCaps(e: EntitlementsLike | null): AiCaps {
  const on = (k: AiFeatureKey) => e?.features[k]?.enabled === true;
  const direct = e?.features['ai.review_direct'];
  return {
    reviewDraft: on('ai.review_draft'),
    reviewDirect: on('ai.review_direct'),
    assist: on('ai.student_assist'),
    practicePlan: on('ai.practice'),
    directCredits: direct?.enabled === true ? direct.monthlyCredits : null,
  };
}

/**
 * Only the features that mean something on each side count: a school learner's work is
 * reviewed by the teacher, so `review_direct` and the practice plan do not make them C.
 */
export function resolveVariant({ schools, entitlements }: VariantInputs): HomeVariant {
  const school = hasSchool(schools);
  const ai = aiCaps(entitlements);
  if (school) return ai.assist || ai.reviewDraft ? 'school_ai' : 'school';
  return ai.assist || ai.reviewDirect || ai.practicePlan ? 'solo_ai' : 'solo';
}
