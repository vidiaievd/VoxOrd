/**
 * Frozen FSRS parameter profile — the mobile mirror of learning-service's
 * `src/modules/srs/infrastructure/scheduler/fsrs-profile.ts` (ssz-platform
 * `78218cf`). The two files must stay byte-equivalent in their values.
 *
 * Why freeze at all: without explicit parameters both sides silently inherit
 * whatever `ts-fsrs` defaults to, so a library upgrade on either side would
 * quietly reschedule existing cards with no migration and no way to tell the
 * before/after numbers apart. With the profile pinned and stamped onto every
 * card as `profileId`, such a change becomes explicit and migratable.
 *
 * Changing `w` or `generation` is NOT a config tweak: it is a new `profileId`
 * plus a migration, on both sides.
 */

/** Learning/relearning step, e.g. `10m`. Mirrors ts-fsrs's `Steps` element type. */
export type FsrsStep = `${number}m` | `${number}h` | `${number}d`;

export interface FsrsProfile {
  readonly id: string;
  readonly generation: 'fsrs-5' | 'fsrs-6';
  readonly w: readonly number[];
  readonly requestRetention: number;
  readonly maximumIntervalDays: number;
  readonly enableShortTerm: boolean;
  readonly enableFuzz: boolean;
  readonly learningSteps: readonly FsrsStep[];
  readonly relearningSteps: readonly FsrsStep[];
}

/**
 * ts-fsrs 5.4.0 defaults, captured verbatim. Note this is FSRS-6 (21 weights),
 * not FSRS-5 (19) — the integration plan's original sketch was wrong about the
 * generation, corrected after checking `generatorParameters()` of the installed
 * version and the server's measured first-review spread.
 */
export const SSZ_FSRS_PROFILE: FsrsProfile = {
  id: 'fsrs-6-default-v1',
  generation: 'fsrs-6',
  w: [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
    0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425,
    0.0912, 0.0658, 0.1542,
  ],
  requestRetention: 0.9,
  maximumIntervalDays: 365,
  enableShortTerm: true,
  enableFuzz: false,
  learningSteps: ['1m', '10m'],
  relearningSteps: ['10m'],
};
