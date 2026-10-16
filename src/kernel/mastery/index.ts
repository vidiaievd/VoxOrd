// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/mastery/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

// The mastery profile's arithmetic — plan 55 §3.9. Pure; the projection is in analytics.

export type {
  EwmaOptions,
  MasteryCell,
  MasteryObservation,
  MasteryState,
} from './model';
export { cellsFor } from './model';

export type { WeightInput } from './weight';
export { evidenceWeight, failureWeight, succeededAt, successWeight } from './weight';

export { foldAttempt } from './ewma';

export type {
  CellProfile,
  CellVerdict,
  UncertainCell,
  WeaknessReason,
  WeakestCells,
  WeakestCellsOptions,
} from './verdict';
export { weakestCells } from './verdict';
