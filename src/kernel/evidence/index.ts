// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/evidence/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

// How much one answer actually proves — plan 36 §B.1, shared by the scheduler that
// clamps a rating and the projection that weighs the same attempt (plan 55 §3.9).

export type { AnswerForm, EvidenceInput, EvidenceStrength, ReviewRatingValue } from './evidence-strength';
export { clampByEvidence, evidenceStrength, ratingRank } from './evidence-strength';

// What one answer proves about one atom inside it — plan 63 phase 5.
export type { AtomEvidenceInput, AtomModality, AtomRole } from './atom-evidence';
export { atomEvidenceStrength, strongerClaim } from './atom-evidence';
