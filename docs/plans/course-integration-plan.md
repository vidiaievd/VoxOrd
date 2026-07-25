# VoxOrd — Platform Course Integration Plan

Goal: let a student log in to the SSZ platform from VoxOrd, see their enrolled
courses, read lessons, complete exercises, and have progress tracked on the
platform — **without touching the existing offline word-learning functionality**
(local SQLite decks, SpacedRepetition, SessionEngine stay exactly as they are).

This plan is written to be implemented step by step by an AI coding assistant
(Sonnet). Read the "Ground rules" section first and follow it for every step.

---

## Ground rules (apply to every step)

1. **Do not modify** anything under `src/db/`, `src/learning-engine/`,
   `src/repositories/` unless a step explicitly says so. The word-learning
   feature must keep working unchanged.
2. **Small steps.** Implement exactly one step, then STOP and wait for the user
   to build, run on the emulator, and confirm before continuing. Never batch
   several steps into one change.
3. **Dependencies:** never run `npm install` / `yarn add`. When a step needs a
   package, list the package name, version range, and why it is needed, then
   wait for the user to install it and confirm.
4. **Follow existing VoxOrd conventions:**
   - Navigation is a hand-rolled state machine in
     `src/navigation/RootNavigator.tsx` (a `Screen` discriminated union + a
     `switch`). Do NOT introduce react-navigation; extend the existing union.
   - Stores follow the `settingsStore.ts` pattern: plain class + listeners +
     AsyncStorage persistence + a `useSyncExternalStore`-style hook.
   - Data access goes through repository classes (`src/repositories/*`).
     Remote data access will live in a new `src/api/` layer (see Phase 1) —
     do not mix it into the SQLite repositories.
   - Theming via `useTheme()` from `src/providers/ThemeProvider`, styles via
     `makeStyles(colors)` factories. i18n via `useTranslation()` from
     `src/i18n` (add new keys for every user-visible string, at least `ru`
     and `en`; check `src/i18n` for the actual locale set).
   - Code comments in English only.
5. **Verify endpoint paths before coding against them.** The endpoint map in
   this plan was taken from the platform repos at planning time. Before
   implementing any phase that calls the backend, re-check the actual routes:
   - Gateway routes: `ssz-platform/infrastructure/nginx/nginx.conf`
     (all public routes are under `/api/v1/...`).
   - Auth service: `ssz-platform/services/auth-service/src/AuthService.API/Controllers/AuthController.cs`
     (`POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`,
     `POST /api/v1/auth/logout`, MFA endpoints).
   - Learning service controllers:
     `ssz-platform/services/learning-service/src/modules/*/presentation/controllers/`.
   - Content service controllers:
     `ssz-platform/services/content-service/src/modules/*/presentation/controllers/`.
   - Response shapes: mirror the TypeScript types the web app already uses —
     `ssz-platform-web/src/features/content/types/` and
     `ssz-platform-web/src/features/learning/types/`. Copy the needed types
     into VoxOrd (see Phase 1.2) rather than importing across repos.
6. **Testing:** each phase lists what to unit-test with Jest (existing setup:
   `jest.config.js`, tests colocated or in `__tests__/`). Pure logic
   (composition, token refresh, answer mapping) must have tests; screens are
   verified manually by the user on the emulator.

---

## Model guidance

Most steps are well-constrained enough for Sonnet: the ground rules above
(mandatory endpoint verification, no touching `db/`/`learning-engine/`/
`repositories/`, stop-and-confirm checkpoints) remove exactly the kind of
open-ended judgment calls where a weaker model tends to go wrong. Switch to
**Opus** for the steps below, where the plan cannot hand over a fully
pre-verified answer and the step sets the shape later steps inherit:

- **Step 4.1** (runner skeleton) — the abstraction all 8 exercise templates
  build on; a mistake here means rework across steps 4.2–4.6.
- **Phase 5** (vocabulary → local deck import) — the only place course code
  writes into the local SQLite word database (with a migration). Mistakes
  here risk the user's real word-learning data, not just course state.
- **Phase 6** (nginx gateway fix + mastery/can-do enrichment) — touches the
  `ssz-platform` infrastructure repo (`nginx.dev.conf` and friends), which
  also serves the web app; changes there have blast radius beyond VoxOrd.
- **Phase 9** (SRS engine wrapper + FSRS parity, then retire the 6-stage engine
  and migrate personal words to FSRS) — the wrapper's frozen profile and
  `profileId` contract must match the server exactly (a mistake quietly desyncs
  weights), and the phase overrides ground rule #1 and migrates real user data:
  the highest-blast-radius work in the plan.

Everything else (1.1–1.4 already done, Phase 2, Phase 3, steps 4.2–4.6, most of
6, **Phase 8 in full** — course words are a thin client mirroring the web
contract, no client FSRS — and Phase 7) is in Sonnet's range. Re-set the model
explicitly before starting an Opus item above, and it's fine to drop back to
Sonnet for the step right after.

---

## Architecture decisions (already made — do not re-litigate)

- **Mobile talks to the nginx API Gateway directly** (`/api/v1/...`), NOT to
  the Next.js BFF. The BFF is a web-app implementation detail (it reads the
  auth token from cookies, which mobile doesn't have).
  Consequence: aggregations that the web BFF performs (e.g. its
  `/api/learning/course-home/[courseId]` route fires 5 parallel upstream
  calls) must be re-implemented client-side in VoxOrd's API layer. Use
  `ssz-platform-web/src/app/api/learning/**/route.ts` files as the reference
  spec for what to call and how to merge results.
- **Auth:** JWT Bearer (RS256) from the C# auth service. Access token in
  memory, refresh token in secure storage. Auto-refresh on 401, single-flight
  (concurrent 401s trigger exactly one refresh).
- **Courses are online-only** in this iteration. No offline sync of course
  progress. Words remain offline-first and untouched. If the network is down,
  course screens show a retry state; word learning keeps working.
- **Base URL is configurable** (Settings → developer section). Default for
  Android emulator: `http://10.0.2.2:80` — confirmed: nginx dev gateway
  (`infrastructure/docker-compose.dev.yml`) publishes `80:80`. Note:
  cleartext HTTP to the dev gateway requires
  `android:usesCleartextTraffic="true"` or a network security config
  allowing `10.0.2.2` — add this in Phase 1.
- **Unified word-weight model — FSRS everywhere, authority by word origin**
  (revised 2026-07-24, supersedes the earlier "two SRS systems never talk"
  decision). The server is already a per-word FSRS engine
  (`SrsContentType.VOCABULARY_WORD`, `ts-fsrs`), so word/grammar-rule weight is
  made consistent across web and mobile instead of kept separate:
  - **Course words** (materialized from a platform vocabulary list) →
    **server FSRS is the single source of truth**. Both the web trainer and the
    mobile course trainer review the *same* server card via
    `POST /api/v1/srs/cards/:id/review`. Mobile keeps a local replica for
    offline display and an offline review queue that replays on reconnect; the
    stored weight always reconciles to the server's returned card.
  - **Personal words** (the user's own VoxOrd decks, no platform counterpart) →
    scheduled locally, offline, source of truth on device — but using the *same
    FSRS engine and card shape* as the server (see Phase 9), so they are
    sync-ready later.
  - The self-written 6-stage `SpacedRepetition` is retired in favor of FSRS.
    `word_mode_strength` survives as a **local-only** exercise-mode picker,
    decoupled from the authoritative FSRS weight.
  - Never reconcile a 6-stage weight with an FSRS card for the same word: the
    engine is chosen once, by origin.
  - Grammar rules have no per-rule SRS card server-side; their "weight" is the
    server `mastery` signal (`GET /api/v1/mastery/grammar-rules/:id`) derived
    from exercise attempts, consistent on both platforms by construction.
- **SRS engine behind an anti-corruption wrapper — libraries upgrade
  independently per platform** (see the dedicated section below). Call sites
  depend on an `SrsEngine` port, never on `ts-fsrs` directly; a frozen parameter
  profile (explicit `w`, `requestRetention`, `maximumInterval`) removes
  default-weight drift within an FSRS generation; each stored card carries a
  `profileId` so a generation change is explicit and migratable, never a silent
  divergence.
- **No new heavy libraries.** `fetch` is built into React Native — no axios.
  No state-management library — follow the existing store pattern. The only
  planned new dependencies:
  - `react-native-keychain` (secure refresh-token storage) — Phase 1.
  - `ts-fsrs` pinned to the **exact** version the server runs (currently
    `5.4.0`) — the SRS engine, Phases 8–9. Pure TS, zero deps, Hermes-safe
    (verified: no Node-only APIs in `dist`). Pin exact, not `^`, and keep in
    lockstep with learning-service.
  - An audio player lib (e.g. `react-native-sound` or
    `react-native-track-player`) — Phase 7 only, decided then with the user.

---

## SRS engine abstraction & FSRS parity (engine parity: mobile ↔ server)

Goal: identical word weight wherever it is *computed*, while letting each side
upgrade its FSRS library on its own schedule. Only two places run `ts-fsrs` —
**mobile** (personal offline words) and the **server** (learning-service) — so
the wrapper and parity concern them. The **web is a pure thin client with no
`ts-fsrs`**: it only displays server-computed `predicted` labels and posts a
rating, so it needs no wrapper and no changes for this design. A thin wrapper
does the decoupling; it does NOT pretend two different FSRS *generations* are
numerically identical — it makes any such change explicit and safe.

Same three files, mirrored in VoxOrd (`src/srs/`) and the server-side FSRS
config in learning-service:

- `engine.port.ts` — the stable contract. A domain `SrsCard`
  (`state, stability, difficulty, dueAt, reps, lapses, elapsedDays,
  scheduledDays, learningSteps, lastReviewedAt, profileId`), a `Rating`
  (`AGAIN|HARD|GOOD|EASY`), and `SrsEngine`
  (`introduce`, `review`, `retrievability`, `predict`). No `ts-fsrs` type leaks
  through this boundary.
- `profiles.ts` — the frozen parameter set(s), e.g.
  `SSZ_FSRS_V1 = { generation: 'fsrs-5', w: [...19 explicit weights...],
  requestRetention: 0.9, maximumInterval: 365, enableShortTerm: true }`. Shared
  verbatim with the server (mirror learning-service's FSRS config); explicit
  `w`, never the library default.
- `fsrs-adapter.ts` — `FsrsAdapter implements SrsEngine`, constructed from a
  profile, the ONLY file importing `ts-fsrs`.

Rules:
- What the wrapper fixes: API/signature changes (fully), default-weight drift
  within one generation (via explicit `w`). What it does NOT fix: a generation
  change (FSRS-5 → 6, different formula / `w` length) — that is a new
  `profileId` and a migration, not a silent swap.
- Course (`VOCABULARY_WORD`) cards are server-authoritative: the client sends a
  review *event* (`cardId, rating, reviewedAt`), the server recomputes and
  returns the card, the client overwrites its replica. So the client's library
  version never determines stored truth for shared cards.
- Every persisted card stores `profileId`. A mismatch on read is a signal to
  recompute/migrate, not to trust the number blindly.
- Mobile ships the same `ts-fsrs` *exact* version as the server until there is a
  deliberate reason to diverge; the wrapper exists so that divergence, when it
  comes, is a one-file change plus a profile bump, not a refactor.

---

## Endpoint map (confirmed by reading controllers + `nginx.dev.conf`, 2026-07-19)

Dev gateway: `http://10.0.2.2:80` from the Android emulator. All routes below
are `/api/v1/...` prefixes proxied by nginx; each service's Nest app also
sets `app.setGlobalPrefix('api/v1')` so controller `@Controller()` paths map
1:1 onto gateway paths (e.g. `@Controller('enrollments')` → `/api/v1/enrollments`).

| Purpose | Method & path | Service |
|---|---|---|
| Login | `POST /api/v1/auth/login` (may return `{ mfaRequired: true, challenge }` instead of tokens) | auth-service (C#) |
| Complete MFA login | `POST /api/v1/auth/mfa/challenge` — out of scope, see Risk 2 | auth-service |
| Refresh tokens | `POST /api/v1/auth/refresh` `{ refreshToken }` | auth-service |
| Logout | `POST /api/v1/auth/logout` (Bearer required, revokes all sessions) | auth-service |
| My enrollments | `GET /api/v1/enrollments` | learning-service |
| Enroll | `POST /api/v1/enrollments` | learning-service |
| Course container | `GET /api/v1/containers/:id` | content-service |
| Container by slug | `GET /api/v1/containers/slug/:slug` | content-service |
| Container version items (units) | `GET /api/v1/containers/:containerId/versions/:versionId/items` | content-service |
| Container sections | `GET /api/v1/containers/:containerId/versions/:versionId/sections` | content-service |
| Record progress / attempt | `POST /api/v1/progress` `{ contentType, contentId, timeSpentSeconds, score?, completed }` | learning-service |
| List user progress | `GET /api/v1/progress?contentType=` | learning-service |
| Unit contents (composed) | via `GetUnitContentsQuery` — check `progress.controller.ts` for the exact route (grep `GetUnitContentsQuery` usage); mirror `ssz-platform-web` unit-contents BFF route if no direct one exists | learning-service |
| Lesson metadata | `GET /api/v1/lessons/:id` | content-service |
| Lesson reader payload | `GET /api/v1/lessons/:id/reader` | content-service |
| Lesson variants | `GET /api/v1/lessons/:id/variants`, `GET /api/v1/lessons/:id/variants/best`, `GET /api/v1/lessons/:id/variants/:variantId` | content-service |
| Variant cues/paragraphs/glossary | `GET /api/v1/lessons/:id/variants/:variantId/{cues,paragraphs,glossary-marks,listening-stages,comprehension-question}` | content-service |
| Exercise display (no answers) | `GET /api/v1/exercises/:id/display` | content-service |
| Exercise instructions | `GET /api/v1/exercises/:id/instructions` | content-service |
| Start attempt | `POST /api/v1/exercises/:exerciseId/attempts` | exercise-engine-service (routed via the nginx **regex** location `^/api/v1/exercises/[^/]+/attempts`, which is declared before the content-service `/api/v1/exercises` prefix block — do not reorder) |
| Submit answer | look up the exact sub-path in `attempts.controller.ts` (`SubmitAnswerCommand`) — same controller as above | exercise-engine-service |
| Vocabulary lists | `GET /api/v1/vocabulary-lists`, `GET /api/v1/vocabulary-lists/:listId/items` | content-service |
| SRS due / review (Phase 8) | `GET /api/v1/srs/...` — check `srs.controller.ts` for exact sub-paths | learning-service |

### Gateway gap — FIXED (2026-07-25, ssz-platform commit `1eea7fa`)

Re-verified against actual source (not this table) via Explore agent before
touching anything, per the ground rule below. Corrected facts vs. the
original table above:

- `learning-service`: `GET /api/v1/mastery/course/:containerId` (course
  mastery, the one Phase 6 uses), `GET /api/v1/mastery/grammar-rules/:id`,
  `GET /api/v1/mastery/content?sourceType=&sourceId=`; `GET/PATCH
  /api/v1/can-do/progress` — **these were already routed correctly**, the
  original gap note about `can-do/progress` was wrong.
- `content-service`: `GET /api/v1/can-do/descriptors[/by-module/:moduleId]`
  and `GET/POST/DELETE /api/v1/content-relations` — **these were the real
  gap**: `/api/v1/can-do/descriptors` was silently swallowed by the generic
  `/api/v1/can-do` block (misrouted to learning-service → 404), and
  `content-relations` had no block at all.
- SRS due: `GET /api/v1/srs/due?limit=` returns a bounded **sample**, not a
  total; `GET /api/v1/srs/stats/me` → `dueNowCount` is the real total due
  count. Already routed correctly. `ReviewCardDto.contentType` is
  `'EXERCISE' | 'VOCABULARY_WORD'` (present, contrary to a stale comment
  found in the web BFF claiming it was dropped).

Fix: added specific `location /api/v1/can-do/descriptors` and `location
/api/v1/content-relations` blocks (→ content-service) to
`infrastructure/nginx/nginx.dev.conf` and `nginx.conf`, ahead of the generic
`/api/v1/can-do` block (nginx picks the longest-prefix match regardless of
declaration order). **`nginx.prod.conf`/`nginx.us.conf` were NOT touched** —
user decided (2026-07-25) they're a separate, already-broader staleness
problem (missing `/srs`, `/mastery`, `/can-do` entirely) not specific to
Phase 6; revisit separately if mobile ever targets those environments.

Also found and fixed two pre-existing bugs in
`ssz-platform-web/src/app/api/learning/course-home/[courseId]/route.ts`
(user approved fixing immediately, commit `a1dc329`): SRS due-count used
`cards.length` (capped at the default limit) instead of `/srs/stats/me`'s
`dueNowCount`, and `srsExerciseDue` was hardcoded to `0` instead of reading
the real `contentType`. Mobile's Phase 6 client must use `/srs/stats/me` for
the due count, not replicate the old web pattern. Also deleted a dead,
never-wired-up `/api/learning/can-do` web BFF route that called a
non-existent upstream path — no working reference implementation for
hydrated can-do (progress + descriptor text) exists anywhere yet; mobile
will be the first to build it in Phase 6 below.

If any other needed aggregate has no single gateway endpoint, compose it
client-side in `src/api/` the way the corresponding web BFF route composes
it (`ssz-platform-web/src/app/api/learning/**/route.ts`).

---

## Phase 0 — Planning sanity check (no code)

**Step 0.1 — DONE (2026-07-19).** Endpoint map above is confirmed against
`nginx.dev.conf` and the actual controllers. Findings: gateway dev port is
`80`; the gateway gap (mastery/can-do routes missing) is documented above and
deferred to Phase 6; MFA-login limitation (Risk 2 below) stands. No other
discrepancies with the original plan — architecture decisions all hold.

---

## Phase 1 — Networking foundation & auth

### Step 1.1 — API client core
Create `src/api/client.ts`:
- `ApiClient` class: `baseUrl`, `request<T>(path, options)` wrapper over
  `fetch` with JSON handling, timeouts (AbortController), and a typed
  `ApiError` (status, code, message, retriable flag).
- No auth yet. Base URL read from a new `apiStore` (next step) with a
  hardcoded dev default.
- Unit tests: error mapping, timeout, JSON parse failure.

### Step 1.2 — Shared platform types — DONE (2026-07-19)
Created `src/api/types.ts`: content types (Container, ContainerItem, Lesson,
LessonVariant, glossary/paragraph, vocabulary, exercise display + all 8
`ExerciseTemplateCode` values), learning types (Enrollment, progress,
mastery, can-do, unit contents, unit summary, client-composed
`CourseHomePayload`), minimal SRS types for Phase 8, and `AuthTokensResponse`
(confirmed camelCase wire shape with `accessTokenExpiresAt` /
`refreshTokenExpiresAt`, not a made-up `expiresIn`). Each section links its
source path. Per-template exercise `content` shapes are deliberately NOT
modeled here — those land in Phase 4 next to the body component that reads
them, mirroring how the web reader casts `ExerciseDisplay.content` per
template rather than via a shared discriminated union.

### Step 1.3 — Auth store + token lifecycle — DONE (2026-07-19)
`react-native-keychain@^10.0.0` installed by the user. Files: `src/api/jwt.ts`
(+ test), `src/api/tokenStorage.ts`, `src/store/authStore.ts`,
`src/api/auth.ts` (+ test), `src/hooks/useAuth.ts`, bootstrap wiring in
`App.tsx`. 45 tests green across the api suites.

Decisions worth carrying forward:
- **JWT claims verified against source**, not assumed: `JwtTokenService.
  GenerateAccessToken` adds roles via `ClaimTypes.Role`, and
  `JwtSecurityTokenHandler` applies `DefaultOutboundClaimTypeMap`, so the wire
  claim is the short `role` — a string for one role, an array for several.
  `jwt.ts` handles both plus the long `.NET` URI as a fallback.
- **Base64/UTF-8 decoded by hand** rather than via `atob`/`TextDecoder`, which
  are not guaranteed across Hermes versions and the Jest environment.
- **Refresh-token storage distinguishes rejection from network failure**: a
  server rejection discards the stored token (so cold starts stop replaying a
  doomed refresh), a network error keeps it. Only `performRefresh` touches
  storage; `clearSession()` is memory+state only.
- **Bootstrap does NOT await `restore()`.** It performs a network call, and
  word learning is offline-first — an unreachable backend must never delay app
  start. Course screens render their own `restoring` state instead.
- Also fixed here: `apiSettingsStore.load()` was never called (persisted base
  URL would have been silently dropped on restart once Step 1.4 adds the
  Settings field).

Original spec for reference:
- `src/store/authStore.ts` (settingsStore pattern): state
  `{ status: 'signedOut' | 'signedIn' | 'restoring', user: { id, email, role } | null }`.
- `src/api/auth.ts`: `login(email, password)`, `refresh()`, `logout()` calling
  the auth endpoints; decode the JWT payload (base64) for userId/role/expiry —
  no signature verification client-side.
- Access token kept in memory inside ApiClient; refresh token in Keychain.
  On app start: if a refresh token exists → try refresh → signedIn, else
  signedOut. Wire this into app bootstrap (where DB migrations run now).
- ApiClient interceptor: attach `Authorization: Bearer`; on 401 → one
  single-flight refresh → retry once → on failure, transition store to
  signedOut.
- Unit tests: single-flight refresh (two parallel 401s, one refresh call),
  restore flow, logout clears Keychain.
- Android cleartext config for `10.0.2.2` (see Architecture decisions).

### Step 1.4 — Login screen + Courses tab shell — CODE DONE, needs your on-device test (2026-07-19)
Implemented: third bottom tab **Courses** in `RootNavigator.tsx` (`Tab` union
extended to `Home | Courses | Settings`, `SCREEN_FOR_TAB` map replaces the old
Settings-only ternary). `src/screens/CoursesScreen/index.tsx` switches on
`useAuth().status`: `restoring` → spinner, `signedOut` → `LoginForm`,
`signedIn` → "no courses yet" placeholder (Phase 2 fills this). `LoginForm`
handles the plain-text error case, `MfaNotSupportedError` (distinct message,
per Risk 2 — 2FA accounts must log in on web), and generic `ApiError`.

Settings additions: `AccountSection` (only renders when signed in — email row
+ sign-out, reusing the existing `confirm` modal type) and `DeveloperSection`
(inline base-URL editor persisted via `apiSettingsStore`; no modal reused
here since `ModalProvider` only supports `picker`/`confirm`, not free text —
adding a third modal type would touch shared `ModalRenderer` for one field,
out of scope for this step).

All new i18n keys added to `en`/`ru`/`uk` (`nav.courses`, a new `courses`
namespace, and `settings.account*` / `settings.developer*` / `settings.apiBaseUrl*`).

Verified statically: `tsc --noEmit` clean (only the pre-existing
`WordRepository.ts` error remains, untouched), full Jest suite still
45/45 green. A native Android build could NOT be verified from this
environment — `./gradlew assembleDebug` failed with `npx` not resolving
inside Gradle's subprocess, which is a sandboxing artifact of the harness,
not a code issue (the same shell resolves `npx`/`node` fine). This is exactly
the **user test checkpoint** below — please run it for real before Phase 2.

**User test checkpoint (please run):** login against the local docker
platform succeeds, token survives app restart, logout works, word learning
untouched. Also confirm: entering a bad password shows a readable error, and
if you have an MFA-enabled test account, confirm it shows the
"MFA not supported" message rather than crashing.

---

## Phase 2 — Course list & course home

### Step 2.1 — Enrollments + course list
- `src/api/courses.ts`: `getMyEnrollments()`, then fetch each course's
  container metadata (`GET /api/v1/containers/:id`) — mirror what the web
  student dashboard does (`ssz-platform-web/src/features/student/api/`).
- CoursesScreen: course cards (title, target language, progress % if cheap to
  get). Pull-to-refresh. Empty state ("no courses yet"), error state with
  retry.

### Step 2.2 — Course home (unit list)
- `src/api/courseHome.ts`: `getCourseHome(courseId)` re-implementing the web
  BFF composition from
  `ssz-platform-web/src/app/api/learning/course-home/[courseId]/route.ts`:
  parallel fetch of progress, container, version items; map unit statuses
  (`locked` / `active` / `done`) with the same rules (`mapUnitStatus`).
  Skip mastery / SRS-due / can-do blocks in the first pass — add progress
  only; the rest can come in Phase 6.
- Screen `{ name: 'CourseHome'; courseId: string }`: unit list with status
  badges; tapping an available unit opens the unit contents screen.
- Unit tests for the composition/mapping logic (mock ApiClient).
- **User test checkpoint** with the real seeded course (ny-i-norge-a2).

### Step 2.3 — Unit contents
- Mirror `GET /api/learning/units/[id]/contents` BFF logic → list of items in
  a unit (lessons, vocabulary lists, grammar rules, exercise sets) with
  per-item progress/status.
- Screen `{ name: 'UnitContents'; unitId: string; courseId: string }`.

---

## Phase 3 — Lesson reader (text MVP)

Reference implementation: `ssz-platform-web/src/features/student/reader/`.

### Step 3.1 — Lesson fetch + plain text rendering
- `src/api/lessons.ts`: fetch lesson display data (published content variant
  for the student's level). Render title + paragraphs in a scrollable reader
  screen `{ name: 'LessonReader'; lessonId: string; ... }`.
- Typography consistent with app theme; no media yet.

### Step 3.2 — Glossary marks & paragraph translations
- Render glossary-marked words as tappable highlights → bottom sheet with the
  gloss/translation (data comes with the lesson variant; see
  `LessonVariantGlossaryMark` usage in the web reader).
- Paragraph translation toggle (show/hide per paragraph), mirroring the web
  reader behavior.

### Step 3.3 — Lesson completion
- "Mark as read / continue" action posting lesson progress the same way the
  web reader does; on success update local course-home cache and navigate
  back. **User test checkpoint:** progress set on mobile is visible on web.

---

## Phase 4 — Exercise runner

Reference: `ssz-platform-web/src/features/student/exercises/runner/`.
Validation is **server-side** via the exercise-engine attempts endpoint —
the mobile app never contains answer-checking logic for platform exercises.

### Step 4.1 — Runner skeleton + attempt flow — ⚠️ switch to Opus (see Model guidance)
- `src/api/exercises.ts`: `getExerciseDisplay(id)`, `submitAttempt(...)`
  (find exact contract in exercise-engine `attempts` controller + how the web
  runner calls it).
- `src/screens/ExerciseRunner/`: top bar (progress through the set), body
  slot per template, footer (Check / Continue), feedback bar
  (correct/incorrect + expected answer if the API returns it). State machine:
  `answering → checking → feedback → next`.
- Screen `{ name: 'ExerciseRunner'; itemId: string; ... }` launched from
  UnitContents.

### Step 4.2 — First two templates: `multiple_choice`, `fill_in_blank`
- `multiple_choice`: adapt option-list UI patterns from the existing
  `QuizExercise.tsx` (visual style reuse, not code coupling — the data model
  differs).
- `fill_in_blank`: text with blank slots + keyboard input (reuse patterns from
  `SpellingExercise.tsx`).
- **User test checkpoint** on a real exercise set from the seeded course.

### Step 4.3 — `translate_to_target`, `translate_from_target`, `match_pairs`
- Translate templates: free-text input body (web reference:
  `translate-body.tsx`).
- `match_pairs`: adapt `MatchingExercise.tsx` interaction (two-column tap
  matching) to platform data (`match-body.tsx` as spec).

### Step 4.4 — `short_answer`, `sentence_schema`
- Web references: `short-answer-body.tsx`, `sentence-schema-body.tsx`; the
  validators live in exercise-engine (see recent commits "short-answer and
  sentence-schema validators") — server does the checking.

### Step 4.5 — `writing_task` (minimal)
- Multi-line input + submit; if the platform flow involves revisions/teacher
  review, show "submitted, awaiting review" state. Check the web
  `writing-body.tsx` and submission/revision API before implementing.

### Step 4.6 — Set completion → progress
- On finishing a set: results summary screen (reuse the visual language of
  `SessionResultsScreen`), post set/item progress the same way the web
  runner's `set-progress.tsx` flow does, refresh unit contents on return.
- **User test checkpoint:** complete a unit end-to-end on mobile; verify
  progress parity on web.

---

## Phase 5 — Vocabulary lists in courses (read-only) — ⚠️ switch to Opus (see Model guidance)

### Research findings (2026-07-25, verified against content-service source)

- **Use `GET /api/v1/vocabulary-lists/:listId/reader`**, not the web's item
  path. `vocabulary-list.controller.ts` exposes a `:listId/reader` route
  returning `{id, title, items: VocabularyItemDisplayResponseDto[]}` with each
  item's translation (language fallback applied server-side) and examples
  resolved in one call. The web BFF
  (`app/api/content/vocabulary-lists/[listId]/items/route.ts`) instead fetches
  paginated summaries and fans out one authoring-detail request per item, on the
  (incorrect) premise that no batch endpoint exists. Mobile takes the single
  call. The summary endpoint carries no translations at all.
- **No gateway gap here.** `nginx.dev.conf` has `location
  /api/v1/vocabulary-lists → content-service:3003`; the prefix match covers
  `:listId`, `/items`, `/reader` alike.
- **Unit-contents `contentType` for vocabulary is the lowercase wire value
  `vocabulary_list`** (`ContainerItemType.VOCABULARY_LIST = 'vocabulary_list'`
  in content-service's `item-type.vo.ts`) — the enum *key* is uppercase, the
  value on the wire is not.
- **Seeded data reality** (ny-i-norge-a2, norsk-b1): only `word`, `position`,
  `partOfSpeech`, `grammaticalProperties` and a single `primaryTranslation` are
  populated. `ipaTranscription`, `pronunciationAudioMediaId`, `register`,
  `notes` are always null; `usageExamples` and `alternativeTranslations` are
  always empty. Screens must degrade gracefully, not assume rich items.
- **Known platform bug — deferred to Phase 8, do not route around it.**
  learning-service's `content-client.ts` (axios `baseURL`
  `<content>/api/v1/internal`) calls `getVocabularyListItems` →
  `/internal/vocabulary-lists/:id/items` and `getVocabularyListAutoAddToSrs` →
  `/internal/vocabulary-lists/:id`, but content-service's `InternalController`
  only registers `internal/vocabulary-items/:id`. Both 404. Used by
  `BulkIntroduceFromVocabularyListHandler` (seeding SRS cards from a list) and
  auto-add-to-SRS — i.e. exactly what Phase 8 stands on. Phase 5 is unaffected
  (it calls the public content-service route directly). Fix it at the start of
  Phase 8, in the platform repo.
- **Known web/data mismatch (not fixed, mobile works around it).** The web BFF's
  `map-vocabulary-item.ts` parses `grammaticalProperties` only as
  `{ forms: [[label, value], ...] }` and silently drops everything else; the
  seeds write a flat scalar object (`{verb_class, present_tense, past_tense,
  perfect_tense}`). Result: the web card's "Alle former" drawer is always empty
  for seeded courses. VoxOrd's `parseGrammaticalForms` accepts both shapes, so
  the authored data is actually visible on mobile. Aligning the web is separate
  platform work.

### Decisions taken with the user (2026-07-25)

- **Word identity:** the importer never reads or mutates pre-existing local
  `words`/`translations` rows. Course words always get their own row, keyed by a
  new `words.platform_item_id`; idempotency covers course words only. A personal
  word with the same lemma is left completely alone. Duplicate lemmas across
  decks are acceptable — `word_progress` is already per `(wordId, deckId)`.
- **Deck placement:** imported lists land in a dedicated `deck_groups` row
  ("Courses"), created on first import.
- **UI:** scrollable reference list (word + POS + translation always visible,
  tap to expand forms/examples/notes), not web-style flip cards — the list is
  read alongside the lesson text.

### Step 5.1 — Read-only vocabulary list screen — DONE, on-device test passed (2026-07-25)
`src/api/vocabulary.ts` (reader DTO types + `getVocabularyListReader` + pure
`parseGrammaticalForms` / `humanizeFormKey` / `formatTranslation`),
`src/api/vocabulary.test.ts` (17 tests), `src/hooks/useVocabularyList.ts`,
`src/screens/VocabularyListScreen/{index,VocabularyItemRow}.tsx`, `Screen` union
member `VocabularyList`, `UnitContentsScreen.onVocabularyPress`, i18n keys in
`en`/`ru`/`uk`. `tsc --noEmit` and Jest at baseline (162 tests green).

### Step 5.2 — "Save to VoxOrd deck" — DONE, on-device test passed (2026-07-25)
Files: migration **v8** in `src/db/migrations.ts` (the only edit to a
ground-rule-#1 directory), `src/repositories/vocabularyImportMapping.ts` (+ 23
tests), `src/repositories/VocabularyImportRepository.ts`,
`src/hooks/useVocabularyImport.ts`, footer action in `VocabularyListScreen`,
`getVocabularyList` in `src/api/vocabulary.ts`, i18n keys. `tsc --noEmit` and
Jest at baseline (185 tests green).

**Post-device-test fixes (commits `b677b7b`, `626f4c2`, `5a2c176`):**
- Migration **v9** (repair): devices that ran an intermediate build during
  this step recorded v8 in `schema_migrations` while its body was still
  empty — a recorded version never re-runs, so those installs permanently
  missed the three linkage columns. v9 repeats v8's DDL verbatim,
  idempotent, to reach them.
- `unitContents.ts` now normalizes learning-service's UPPERCASE
  `contentType` wire values to lowercase at the API boundary — the app's UI
  layer expects content-service's lowercase convention.
- Home screen was only ever surfacing a single deck via the continue-CTA;
  added a "My decks" section (`DeckGroupsSection`) showing every
  `deck_group` including "Courses", so imported lists are actually visible
  after import — this was needed for the on-device test checklist itself.
- Added `scripts/start-dev-env.sh` (backend containers → adb reverse →
  Metro) to make repeat device testing less manual.

**Phase 5 on-device test — PASSED (2026-07-25, confirmed by user):** import,
"Courses" group on Home, training from the imported deck, re-import without
resetting progress, old decks untouched.

Migration v8 adds three nullable linkage columns — `decks.platformListId`,
`words.platformItemId`, `deck_groups.systemKey` — each with a *partial* unique
index (`WHERE ... IS NOT NULL`) so existing rows stay unconstrained. The
migration runner wraps nothing in a transaction and SQLite rejects a duplicate
`ADD COLUMN`, so v8 checks `PRAGMA table_info` before each add and is safe to
re-run after a partial failure.

Import semantics, as built:
- A NULL platform id marks a personal row; the importer never reads, updates or
  deletes one. Course words always get their own row even when a personal word
  has the same lemma.
- Re-import is a re-sync: existing words are updated in place, words dropped
  upstream are unlinked and their (course-owned) row deleted, guarded by
  `platformItemId IS NOT NULL` on the final DELETE. Learning state
  (`word_progress`, `word_mode_strength`) is never reset on update. The user
  confirms a re-import; a first import runs straight away.
- `PRAGMA foreign_keys` is off in this app, so ON DELETE CASCADE never fires —
  every child row is deleted explicitly.
- Items with no translation in any language are skipped and counted, not
  imported: `getNextWord` inner-joins `translations`, so such a row would be
  invisible dead weight. When the server falls back to another language, two
  translation rows are written (requested + actual) so the word stays reachable
  from the UI language while the data stays honest.
- Platform `PartOfSpeech` (12 values) maps onto the local 5; anything without a
  local equivalent becomes `phrase`. Known inflection keys are normalized
  (`present_tense` → `present`), unknown ones kept verbatim.
- Imported decks land in a `deck_groups` row with `systemKey = 'courses'`,
  created on first import and sorted after every existing group.

Not fixed (pre-existing, out of scope): `DeckRepository.getAll()` maps
`row.languageCode` but its SELECT never lists `d.languageCode`, so
`Deck.languageCode` is `undefined` for every deck, imported or seeded.

Original spec for reference:
- Add a **"Save to VoxOrd deck"** action: import the vocabulary list into a
  local deck (this is the ONLY place course code writes into the local DB).
  - New migration in `src/db/migrations.ts` only if a linkage column is
    needed (e.g. `decks.platform_list_id` for idempotent re-import).
  - Reuse existing `DeckRepository` / `WordRepository` APIs; map platform
    vocabulary items → local word rows (language codes, part of speech,
    examples). Unmappable fields are dropped, not forced. Note: neither
    repository has any create/insert method today — deck and word creation lives
    only in `src/db/seed.ts`, so 5.2 adds the first ones.
  - Idempotent: re-importing the same list updates instead of duplicating.
  - Every new `deck_words` link MUST get a matching `word_progress` row
    (`status: 'new'`), the way `seed.ts` does — `ProgressRepository.get()` and
    `recordAnswer()` do plain lookups with no LEFT JOIN and silently no-op when
    the row is missing, which would make imported words unlearnable.
- After import, the words are ordinary VoxOrd words: local SRS, all existing
  exercise modes work with zero changes.
- **User test checkpoint:** import a list, learn it offline.

---

## Phase 6 — Course-home enrichment & resilience — ⚠️ switch to Opus (see Model guidance)

**Model note:** user decided (2026-07-25) to stay on Sonnet for the whole
phase, including the nginx gateway fix — the facts were fully pre-verified by
an Explore agent before any edit, which was judged to remove the risk the
Opus recommendation was guarding against. Actual steps 6.1–6.3 also matched
the plan's own "most of 6 is Sonnet range" note.

- Add the blocks skipped in 2.2: mastery, can-do progress, SRS-due counters
  (display only).
- Lightweight response caching (in-memory + AsyncStorage snapshot) for course
  list / course home so reopening is instant; refetch in background
  (stale-while-revalidate). **Course content is offline-readable** from this
  cache (lessons, vocab, exercise display — near-immutable, cache aggressively
  by `contentId + version`).
- **No write queueing — course mutations remain online-only, with ONE
  deliberate exception: the SRS review queue (Phase 8).** Lesson/exercise
  progress stays online-only; SRS reviews are the single mutation where offline
  capability has real learning value and is safe (queued *events* replayed to
  the server, which stays authoritative — never a client-computed weight).
- Global "offline" banner on course screens when requests fail with network
  errors; word tabs unaffected.
- **Contract recap:** offline-first for personal words; online-first but
  offline-tolerant (read-cache + review queue) for courses.

### Step 6.1 — Mastery + SRS-due on course home — DONE (2026-07-25, VoxOrd `7cc211f`)
`src/api/mastery.ts` (`GET /mastery/course/:id`, 0..1 fractions → 0..100
percents per skill) and `src/api/srs.ts` (`GET /srs/stats/me`, minimal —
just what Step 6.1 needs; the full due-review session is Phase 8's
`src/api/srs.ts` extension). Wired into `getCourseHome()`, both non-fatal on
failure (matches the existing `items` fetch pattern) so a stat block failing
doesn't block the rest of the screen. New `CourseStatsSection` renders
mastery bars + reviews-due count as the course-home list header.

Can-do progress stays a stub — **found via Explore agent that the platform
has zero `content_relation` rows linking can-do descriptors to
courses/modules anywhere** (the join mechanism exists in
`CanDoEvaluatorService`/`prisma-can-do-progress.repository.ts` but nothing
populates it), so it would render empty regardless of client work. User
decided (2026-07-25) to skip it rather than build against non-existent data;
revisit once the platform seeds that linkage.

`srsDueCount` is the user's global due count — confirmed `/srs/stats/me` has
no `courseId` filter, same limitation the web BFF has (its `/srs/due` call
is unfiltered too) — labeled as a general "reviews due" stat in the UI copy,
not scoped to the course being viewed.

### Step 6.2 — Stale-while-revalidate cache for course list/home — DONE (2026-07-25, VoxOrd `ef11a23`)
`src/lib/swrCache.ts` (in-memory `Map` + `AsyncStorage` snapshot via
`createAsyncStorage('voxord_swr_cache')`) and `src/hooks/useSwrResource.ts`
(generic hook: renders memory cache, then persisted snapshot on cold start,
instantly, while always kicking a background fetch; a late snapshot never
clobbers fresher network data; a failed refresh keeps the cached value on
screen instead of wiping it). `useMyCourses`/`useCourseHome` now go through
it — same public shape plus a new `stale` flag. Course-list cache is keyed
per `user.id` so switching accounts on one device can't leak a stranger's
cached courses.

**Content caching (lesson reader, vocabulary reader, exercise display —
"near-immutable, cache by contentId+version") is NOT done** — deliberately
scoped out of 6.2, see the open item below.

### Step 6.3 — Offline banner — DONE (2026-07-25, VoxOrd `ddb627b`)
`src/api/isNetworkError.ts` (`ApiError.code === 'NETWORK_ERROR' | 'TIMEOUT'`)
+ `src/components/OfflineBanner.tsx`, shown on `CourseHomeScreen`/
`CoursesScreen` when a background refresh fails with a network error while
`stale` cached data is still on screen. Word/deck tabs untouched.

**On-device test — PASSED (2026-07-25, user-confirmed).** Mastery bars +
reviews-due visible on Course Home; leaving and reopening Course Home /
Courses list is instant; toggling Wi-Fi off then reopening Course Home shows
the cached units/mastery plus the offline banner. Also confirmed: opening
actual lesson **text** while offline still fails — expected, that screen has
no cache yet (see the open item right below; not a bug in 6.1–6.3's scope).

**Wireless-adb gotcha found during this test, not an app bug:** `adb
reverse` tunnels (`tcp:80`, `tcp:8081`) die whenever the Wi-Fi transport
drops and do **not** come back automatically when Wi-Fi reconnects — the
device reappears in `adb devices` but `adb reverse --list` comes back
empty, so the app can't reach the gateway even though Wi-Fi is back, and it
looks identical to a real backend outage. Fix each time: re-run `adb
reverse tcp:80 tcp:80 && adb reverse tcp:8081 tcp:8081` (or just re-run
`scripts/start-dev-env.sh`, which now does this automatically — see its
2026-07-25 Wi-Fi-reconnect update) after every Wi-Fi off/on cycle during
device testing.

### Open item — course-content offline cache (lesson/vocab/exercise, by contentId+version)
Not yet built. `src/api/lessons.ts` (`getLessonReaderContent`),
`src/api/vocabulary.ts` (`getVocabularyListReader`, `getVocabularyList` —
Phase 5), and the exercise-display fetch (Phase 4) would each go through
`useSwrResource` the same way, keyed by `contentId` (+ version once the
content payload exposes one — check whether the reader response carries a
version field before keying on it). Lower urgency than 6.1–6.3: these
screens already work online, this only adds resilience/offline reading.
Confirm scope with the user before starting (touches 3+ more screens'
hooks).

### Offline access — future level 2 (not v1)
The caching above is a *passive* cache ("opens if you were recently there"). A
later enhancement is an explicit **"Download for offline"** toggle per
unit/course (Spotify/Netflix-style pinning): pre-fetch all lesson/vocab/exercise
payloads so the unit is *guaranteed* available offline. It layers on the same
cache + review queue; add it once the passive path is proven. Not required for
the first offline iteration.

## Phase 7 — Media (audio first)

- Decide the audio library with the user (`react-native-track-player` vs
  simpler). Streaming lesson audio from media-service URLs (check how the web
  reader obtains signed/proxied media URLs).
- Listening stages of lessons (model `LessonListeningStage`) — staged
  listening UI per web reader.
- Video (`LessonVideoCue`, `LessonVideoQuestion`) is explicitly **out of
  scope** for this plan; note it as a follow-up.

## Phase 8 — Course word/grammar trainer on mobile (thin client, server-authoritative) — Sonnet

Turns the platform's existing per-word FSRS into a mobile trainer. The engine
already exists server-side AND the web trainer (`ssz-platform-web`
`/student/srs`) is already built as a **thin client** — audited 2026-07-24: the
web client runs NO `ts-fsrs`, it renders a presentation-shape `SrsCard`
(`{id, front, back, predicted: {'1'..'4': {label}}}`) and posts a rating. Mobile
mirrors that contract 1:1, so **no client-side FSRS engine is needed for course
words** — the wrapper is a Phase 9 concern, not a prerequisite here.

### Step 8.1 — Due list + review session (course words) — Sonnet
- `src/api/srs.ts`: `getDue()`,
  `reviewCard(id, {rating, latencyMs, idempotencyKey})`, `getStats()`. Mirror
  the web BFF contract: `ReviewRating = 1|2|3|4` (AGAIN/HARD/GOOD/EASY),
  `ReviewRequest = {rating, latencyMs, idempotencyKey}`, and the `SrsCard`
  presentation shape — copy the types from
  `ssz-platform-web/src/features/learning/types.ts`. Server owns the weight; the
  client never computes FSRS for course words.
- Review screen with the four rating buttons showing the server's `predicted`
  interval labels, driving `VOCABULARY_WORD` cards via
  `POST /api/v1/srs/cards/:id/review`. Reuse `QuizExercise`/`MatchingExercise`
  visual language, not their logic.
- **Offline review queue** (the deliberate, narrow exception to Phase 6's "no
  write queueing"): enqueue `{cardId, rating, latencyMs, reviewedAt,
  idempotencyKey}`, replay on reconnect (single-flight; the server's existing
  `idempotencyKey` makes replay safe), overwrite the local replica with the
  server's returned card. Reads (due list, card content) come from the
  offline-readable content cache. Keep this queue separate from any
  personal-word state.

### Step 8.2 — Grammar (mastery display only) — Sonnet
- No grammar *trainer* exists yet — audited 2026-07-24: the web only shows a
  grammar **mastery %** (skill-index tiles over `/api/v1/mastery/course/:id`),
  and there is no per-rule SRS card server-side (`SrsContentType` is only
  `EXERCISE` / `VOCABULARY_WORD`). So mobile mirrors that: surface the mastery
  signal (`GET /api/v1/mastery/grammar-rules/:id`, needs the gateway blocks from
  Phase 6), driven by ordinary course exercises. A real per-rule grammar drill
  is separate future product work on **both** web and mobile — out of scope
  here.
- **User test checkpoint:** review a course word on mobile → same due date and
  state on web; review one on web → reflected on mobile after refresh.

---

## Phase 9 (heavy — discuss & separate branch) — Retire the 6-stage engine, FSRS for personal words — ⚠️ Opus

⚠️ This phase deliberately **overrides ground rule #1** (do not modify
`src/db/`, `src/learning-engine/`, `src/repositories/`). It rewrites the local
word engine and **migrates real user learning data**. Do it on its own branch,
with a reversible migration and the full Jest suite green before and after.

- **Build the SRS engine wrapper** (`src/srs/`: `engine.port.ts`,
  `profiles.ts`, `fsrs-adapter.ts`) per the "SRS engine abstraction & FSRS
  parity" section — this is where `ts-fsrs` first enters the app (course words
  in Phase 8 need no client FSRS). Mirror the server's frozen profile exactly;
  unit-test with **golden vectors captured from the server** (a fixed
  (card, rating, reviewedAt) triple must reproduce the server's card).
- Replace `SpacedRepetition` (6-stage) with the `FsrsAdapter` for personal
  (non-course) words, so on-device scheduling uses the same engine and card
  shape as the server.
- Migrate `word_progress`: add FSRS columns (`state, stability, difficulty,
  dueAt, reps, lapses, elapsedDays, scheduledDays, learningSteps,
  lastReviewedAt, profileId`); seed them from the existing `memoryStage` /
  strength as a best-effort one-time conversion (document the mapping — it is
  lossy and one-directional). Keep the old columns until the new path is proven,
  then drop them in a later migration.
- Decide the answer→rating input: either map the existing binary
  correct/incorrect to `AGAIN`/`GOOD` (lossy, no UX change) or add Anki-style
  `AGAIN/HARD/GOOD/EASY` buttons (better FSRS signal, UX change). Confirm with
  the user at this step.
- `word_mode_strength` stays as the local-only exercise-mode picker, untouched.
- Personal words remain offline-first: no server sync in this phase; the payoff
  is one engine to maintain and future sync-readiness, not immediate sync.
- **User test checkpoint:** existing decks keep working; scheduling behaves
  sensibly for words mid-progress; the migration is reversible.

## Risks / open questions (track while implementing)

1. Exact gateway paths for learning-service aggregates (progress, unit
   contents) — resolve in Step 0.1; some BFF paths may have no direct
   gateway equivalent and need composition.
2. MFA-enabled accounts can't log in on mobile in this plan (explicit
   limitation; test account should have MFA disabled).
3. Token audience/claims: verify the C# service issues tokens accepted by
   NestJS services when called from mobile (same as web — should be fine,
   confirm in Step 1.4 testing).
4. Media URLs may be short-lived/signed — affects Phase 7 caching.
5. `writing_task` may require teacher-review flows that don't fit mobile MVP —
   confirm scope at Step 4.5.

## Definition of done (for the whole plan, Phases 0–6)

- User can: log in → see courses → open course → read a lesson with glossary
  and translations → complete exercise sets of all 7 non-writing templates →
  see identical progress on the web app.
- Word learning (decks, sessions, stats, settings) behaves byte-for-byte as
  before — verified by running the existing Jest suite and a manual smoke
  test.
- All new pure logic (auth lifecycle, composition, mappers) covered by Jest.
