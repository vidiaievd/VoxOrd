// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT.
// Source: ssz-platform/packages/shared-kernel/src/analytics/index.ts
// Regenerate with `npm run kernel:sync`; verify with `npm run kernel:check`.
// ---------------------------------------------------------------------------

// The language the analytics surfaces share — plan 58. Pure; the projections are in
// analytics-service and the drawing is in the web client.

export type { CellState, CellStateInput } from './model';
export { CELL_STATES, LOW_THRESHOLD, cellStateOf, isMeasured } from './model';

export type { Distribution, PositionBand } from './scale';
export { bandOf, distributionOf, pct, percentileOf } from './scale';
