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

### Open item — course-content offline cache — DONE (2026-07-25, VoxOrd `95d1a4f`)
Checked against content-service source first (Explore agent): neither
`LessonReaderContentResponseDto` nor `VocabularyListReaderContentResponseDto`
carries any version/updatedAt/revision field (their underlying Prisma models
do, but it isn't surfaced) — only the exercise "display" DTO has `updatedAt`.
Since the existing SWR cache (course list/home) never used a TTL anyway —
it always revalidates in the background and only serves the cache as an
instant-paint/offline fallback — a version field wouldn't change behavior
here, so keys are `contentId` + whatever request params affect the response
shape (language, level), with no version suffix, matching the course-home
precedent exactly.

- `useLessonReader` / `useVocabularyList` now go through `useSwrResource`
  (same pattern as `useMyCourses`/`useCourseHome`), keyed
  `lesson-reader:${lessonId}:${courseId}:${uiLanguage}` and
  `vocab-reader:${listId}:${uiLanguage}`.
- Exercise display (`useExerciseRunner`'s load effect) does NOT use
  `useSwrResource` — Check/submit still needs the network regardless of
  cache, so there's no value in painting cached content ahead of a fast
  successful fetch. Instead, only a *failed* fetch now falls back to a
  cached copy (memory, then the `swrCache` AsyncStorage snapshot, keyed
  `exercise-display:${exerciseId}:${uiLanguage}`) before giving up to
  `loadError`, so an already-visited exercise stays readable offline. The
  pure `runnerMachine` reducer is untouched.
- No new Jest tests (hooks only, no new pure logic — matches the
  established "screens/hooks are manually tested" convention). `tsc --noEmit`
  and Jest confirmed at baseline (206 green, only the environmental
  `App.test.tsx` suite failing) after the change.
- **User test checkpoint (not yet run):** open a lesson/vocab list/exercise
  once online, then reopen with Wi-Fi off — content should still render
  (exercise Check still requires network, expected).

### Offline access — future level 2 (not v1)
The caching above is a *passive* cache ("opens if you were recently there"). A
later enhancement is an explicit **"Download for offline"** toggle per
unit/course (Spotify/Netflix-style pinning): pre-fetch all lesson/vocab/exercise
payloads so the unit is *guaranteed* available offline. It layers on the same
cache + review queue; add it once the passive path is proven. Not required for
the first offline iteration.

## Phase 7 — Media (audio first)

### Research findings (2026-07-25, verified against content-service/media-service source)

- **Media asset URLs are just-in-time, not cacheable.** `GET /media/assets/:id`
  (media-service `AssetsController`) returns `{id, mimeType, url, ...}` — `url`
  is a stable direct URL for public assets, or a **pre-signed MinIO URL with a
  1h TTL** for private ones. No CDN/signed-cookie mechanism exists (confirmed
  MinIO backend). Gateway: single `location /api/v1/media` prefix block
  (nginx.dev.conf), no separate byte-streaming route — once the presigned URL
  is returned, the actual audio bytes are fetched directly from MinIO,
  bypassing the gateway. No auth header is needed to play the URL itself
  (the signature is in the query string), only to call `/media/assets/:id`.
- **AUDIO-kind lesson content does NOT use a `[audio:id]` markdown token** —
  that token only exists in the raw `LessonContentVariant.bodyMarkdown` the
  web authoring UI edits (and which the web *reader*'s `listening-lesson-page.tsx`
  happens to parse, via a different endpoint than mobile uses). For the
  `/lessons/:id/reader` endpoint mobile already calls,
  `get-lesson-reader-content.handler.ts` resolves an AUDIO-kind lesson's
  narration media id directly into `mediaIds` (from `lesson_variant_media_ref`
  rows) and its script into `transcript` — no client-side token parsing
  needed. `listeningStages: {position, stageType, exercise}[]` carries the
  gap-fill/comprehension exercises, `stageType` being an open string
  (`gap_fill` / `comprehension` seen in practice).

### Decisions taken with the user (2026-07-25)

- **Audio library: `react-native-sound` ^0.13.0`, not `react-native-track-player`** —
  narration/listening-stage playback is foreground-only in this MVP (no
  lock-screen/background controls needed), so the heavier library's
  playback-service registration and notification setup would be pure
  overhead. Installed by the user; VoxOrd commit `3af6635`.
- **Gap-fill/comprehension stages reuse the existing per-item exercise runner**
  (`useExerciseRunner` + the already-built `fill_in_blank`/`multiple_choice`
  bodies from Phase 4), one exercise at a time with server-side grading —
  **not** the web reader's UX (fill every blank, "Check answers" once for the
  whole stage, graded client-side against a fetched answer key). VoxOrd never
  grades client-side (see `src/api/exercises.ts`'s architecture note), and
  this reuse needed zero new grading logic. Confirmed acceptable scope
  reduction: no bespoke batch-checkable UI to build.

### Step 7.1 — Media asset API + AUDIO reader fields — DONE (2026-07-25, VoxOrd `8190ec4`)
`src/api/media.ts` (`getMediaAsset`), and `LessonReaderContent` (src/api/lessons.ts)
extended with `mediaIds`, `transcript`, `listeningStages` (+ `ListeningStage`/
`ListeningStageExercise` types).

### Step 7.2 — Install `react-native-sound` — DONE (2026-07-25, VoxOrd `3af6635`)

### Step 7.3 — AUDIO-kind lesson screen — DONE (2026-07-25, VoxOrd `9b787d7`)
Pure logic first (commit `9e16574`): `groupListeningStages` (splits
`listeningStages` into ordered gap-fill/comprehension exercise id lists,
dropping exercise-less stages) and `nextAudioLessonStage` (listen → gapfill →
comprehension → done, skipping empty stages) — both unit-tested
(`src/screens/LessonReaderScreen/listening/listeningStages.ts`).

Then the screen: `src/hooks/useAudioPlayer.ts` (wraps `react-native-sound`,
resolves the playback URL just-in-time per the 1h-TTL finding above, one
`Sound` instance per `mediaId`) and
`src/screens/LessonReaderScreen/{AudioLessonView.tsx,listening/*}` — `ListenStage`
(narration, no transcript shown), `ExerciseStage` (shared by gapfill/
comprehension, wraps `useExerciseRunner`), `DoneStage` (reuses
`useMarkLessonRead`, already generic across lesson kinds — no new completion
logic needed, so there was no separate "step 4" to do), `StageTracker` (shows
only stages that exist). `LessonReaderScreen` now dispatches to
`AudioLessonView` for `kind === 'audio'`; video/live remain unsupported.
New `audioLesson` i18n namespace (en/ru/uk).

`tsc --noEmit` and Jest confirmed at baseline (215 green — 206 + 9 new
`listeningStages` tests — only the environmental `App.test.tsx` suite
failing). No component/hook tests for the new screen or the audio player
hook, per the established convention (manual on-device testing only); the
hook also wraps a native module, which isn't practical to unit-test here.

**User test checkpoint (not yet run):** open an AUDIO-kind lesson (a seeded
course needs one — confirm one exists or seed a small test lesson first),
play the narration, complete a gap-fill exercise and a comprehension
exercise (verify Check hits the server and posts progress, matching Phase 4
behavior), reach the done screen, confirm lesson completion is visible on
web afterward. **Native module — needs a rebuild, not just a Metro reload**
(`cd android && ./gradlew ...` / a fresh `npx react-native run-android`; iOS
would need `pod install` first, not applicable on this Android-only dev
setup so far).

Video (`LessonVideoCue`, `LessonVideoQuestion`) remains explicitly **out of
scope** for this plan; note it as a follow-up.

## Phase 8 — Course word/grammar trainer on mobile (thin client, server-authoritative) — Sonnet

Turns the platform's existing per-word FSRS into a mobile trainer. The engine
already exists server-side AND the web trainer (`ssz-platform-web`
`/student/srs`) is already built as a **thin client** — audited 2026-07-24: the
web client runs NO `ts-fsrs`, it renders a presentation-shape `SrsCard`
(`{id, front, back, predicted: {'1'..'4': {label}}}`) and posts a rating. Mobile
mirrors that contract 1:1, so **no client-side FSRS engine is needed for course
words** — the wrapper is a Phase 9 concern, not a prerequisite here.

### Research findings (2026-07-27, verified against actual platform source)

The premise above ("the web trainer is a working thin client, mirror it 1:1")
is **wrong** — re-verified via Explore agent before writing any code, and the
whole `/student/srs` web trainer turns out to be non-functional fiction:

- **The server has no `front`/`back`.** `ReviewCardDto` (learning-service
  `application/dto/srs.dto.ts`) is raw FSRS: `{id, userId, contentType,
  contentId, state, dueAt, stability, difficulty, scheduledDays, reps, lapses,
  predicted[]}`. `predicted` is an **array** of
  `{rating: 'AGAIN'|'HARD'|'GOOD'|'EASY', scheduledDays, label}`, not a
  `{'1'..'4'}` map.
- **The web BFF composes nothing** — `app/api/learning/srs/due/route.ts` casts
  the upstream body to its invented `SrsCard` type and returns it, so
  `card.front.word` is `undefined` at runtime.
- **Review contract mismatch (web is broken):** the server takes
  `{rating: 'AGAIN'|'HARD'|'GOOD'|'EASY', reviewedAt?}`; the web BFF sends a
  numeric `rating: 1..4` plus `latencyMs` + `idempotencyKey`, which the server
  never had → 400. Web's `/srs/stats` (server route is `/srs/stats/me`) and
  `/srs/settings` (no such route) 404 as well. **Fixed the same day** —
  ssz-platform-web `40bfee6` realigned types, all three BFF routes, the card,
  the rating bar and the session store to the real contract; SRS settings were
  removed (no route, no server-side concept) and the stats page now shows the
  counts `/srs/stats/me` actually returns instead of retention/heatmap, which
  need a review log learning-service does not keep. So web and mobile now
  speak the same contract and the Phase 8 parity checkpoint can use the web
  UI directly.
- **`GET /srs/due` takes only `limit`** — no `contentType`, no `courseId`
  filter.
- **A client cannot enrich a card itself:** the card carries only `contentId`
  (a vocabulary item id); the public item route is nested under a `listId` the
  card does not know, and the by-id route is internal-token-only and not
  exposed through the gateway.

### Platform fixes made first (ssz-platform, 2026-07-27)

User chose the full server-side fix over a client-side composition workaround.

1. `9c9c272` **the known Phase 5 bug** — content-service `InternalController`
   gained `GET internal/vocabulary-lists/:id` and `.../items` (unpaginated,
   returns `{id, word, position}[]`). Unblocks `bulk-introduce` (was 422),
   auto-add-to-SRS on enrollment (was a silent no-op — the consumer swallows
   the 404 as "skip", so no list ever seeded cards), the vocabulary roll-up in
   course mastery, and `POST /srs/placement/apply`. Still missing from the same
   controller and still called by the same client, **out of scope, unfixed**:
   `/containers/:id/access-tier`, `/content-items/:type/:id[/visibility]`.
2. `4127811` **card content resolved server-side** — new internal
   `POST internal/vocabulary-items/batch-display` (the batch display query the
   public controller already exposes, minus the list-id nesting), and
   `GetDueCardsHandler` now fills `front {word, partOfSpeech, ipaTranscription,
   audioMediaId, listId}` and `back {translation, alternativeTranslations,
   definition, usageNotes, translationLanguage, fallbackUsed, immersionMode,
   examples[]}` for every VOCABULARY_WORD card in **one** batch call.
   Best-effort: a content failure logs and leaves them null instead of failing
   the queue. EXERCISE cards stay bare. `/srs/due` gained `?language=`
   (default `en`) and `?includeExamples=`. Only `/srs/due` enriches —
   `/srs/cards/:id` and the review response still return bare cards.
3. `1960b23` **idempotency** — there was none, and no review log exists to
   build it from, so a replayed review rescheduled the card twice. Optional
   `idempotencyKey` on the review body, claimed via Redis `SET NX` (7-day TTL);
   a repeat returns the card unchanged and touches nothing, a rejected review
   releases the key. Redis down → every claim succeeds (previous behaviour).
   User chose this over an at-least-once queue or dropping the offline queue.

Mobile therefore consumes: `GET /srs/due?limit&language&includeExamples`,
`POST /srs/cards/:id/review {rating: 'AGAIN'|'HARD'|'GOOD'|'EASY',
reviewedAt?, idempotencyKey?}`, `GET /srs/stats/me`.

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

**Step 8.1 — DONE (2026-07-27), needs on-device test.** Three commits:

- `25322e5` **API layer** — `getDueCards` / `reviewCard` beside the existing
  `getSrsStats` in `src/api/srs.ts`, plus pure `vocabularyCards()` (the due
  queue is global and mixes EXERCISE cards in — `/srs/due` has no filter) and
  `predictedByRating()`, 10 tests. The stale web-derived `SrsCard`/
  `ReviewRating` types in `api/types.ts` were deleted; nothing imported them.
- `424d7a4` **offline queue** — pure logic in `src/lib/reviewQueue.ts`
  (12 tests) + `src/store/reviewQueueStore.ts`. Every answer is persisted
  before it is sent; `submit()` flushes the whole queue rather than its own
  entry so answers keep their order; flush is single-flight and stops at the
  first entry worth retrying. Kept on failure: network error, 401, 429, 5xx.
  Dropped: 404/403/422 — an answer the server can never accept must not block
  the queue behind it.
- `2c76304` **screen** — `useSrsReview` + `src/screens/ReviewSessionScreen/`
  (word → "Show answer" → four rating buttons labelled with the server's
  predicted intervals). Rating advances immediately and submits through the
  queue, so the session survives going offline mid-way. Entry point: the
  reviews-due row on Course Home, now tappable (the only place that count is
  surfaced today). New `review` i18n namespace + `courseHome.startReview` in
  en/ru/uk; new `ReviewSession` member in the navigator's `Screen` union.

`tsc --noEmit` clean apart from the long-standing `WordRepository.ts` error;
Jest 236 passing / 24 suites, only the environmental `App.test.tsx` failing —
same baseline as Phase 7.

Known limitations, deliberate: the review response carries no `predicted` and
no `front`/`back` (the server fills those only on `/srs/due`), so the client
does not try to update a card in place — the next session refetches. The
session is not scoped to a course, because the server has no per-course due
filter. No Jest tests for the hook or screen, per the established convention.

**Backend prep — DONE (2026-07-27).** content-service and learning-service
rebuilt/restarted from the fixed source. 20 cards seeded for `student@example.com`
via `POST /srs/cards/bulk-introduce` against three ny-i-norge-a2 vocabulary
lists ("17C" 16 introduced, "17D" 4 introduced/1 skipped-duplicate, "18A"
0 introduced/1 skipped — already-introduced words are skipped, not
duplicated). `GET /srs/stats/me` confirmed `dueNowCount: 20`.

**Platform bug #4 found and fixed while verifying — ssz-platform `68747f4`.**
The `4127811` due-card content enrichment (front/back) was wired correctly
end-to-end but failed on *every* call and silently no-op'd: content-service's
`POST internal/vocabulary-items/batch-display` validated
`vocabularyItemIds` with `@IsUUID('4', ...)` (v4 only), but the platform's
actual vocabulary item IDs (and `srs_review_cards.content_id`) are
deterministic **UUID v5** — every call 400'd, learning-service logged a
`warn` and returned cards with no `front`/`back` key at all (best-effort
swallow, matches the design intent, just triggered on 100% of calls instead
of 0%). Fixed: `@IsUUID('4', ...)` → `@IsUUID('all', ...)`
(`batch-get-vocabulary-items-for-display.request.dto.ts:26`). Re-verified
post-fix: `GET /srs/due?language=ru&includeExamples=true` now returns real
`front.word` ("danse", "lysere tider") and `back.translation`
("танцевать", "более светлые времена / светлые дни") for the seeded cards.
(`?language=en` correctly returns `immersionMode: true` with no translation —
not a bug, `ny-i-norge-a2` was only ever seeded with `ru` translations per
`seed-ny-i-norge-a2.ts`; `ru` is the right query language for this course.)

**User test checkpoint (not yet run) — backend is ready, needs the phone.**
1. ~~Rebuild/restart content-service and learning-service~~ — done above.
2. ~~Seed cards~~ — done above, 20 due for `student@example.com`.
3. On the phone: Course Home shows a non-zero reviews-due row → tap it → rate a
   few words, confirming the interval labels differ per button. **Use a
   device/emulator client configured for `?language=ru`** if the mobile SRS
   API call has a hardcoded/default language param — check `src/api/srs.ts`
   against what language the account's UI/course is actually set to, since
   `en` will legitimately show blank translations for this course's seed data.
4. Verify the same card's due date/state on the web at `/student/srs` (its
   trainer was realigned to the same contract in ssz-platform-web `40bfee6`).
5. Offline: turn Wi-Fi off mid-session, rate a few more cards (the session must
   keep going and show the offline banner + pending count), turn Wi-Fi back on
   (re-run `adb reverse`, see the Phase 6 gotcha) and reopen the session — the
   queue should replay and those cards should not come back.

### Step 8.1b — REDESIGN: auto-graded multi-mode review + unified study IA (2026-07-27)

User rejected the self-assessment UX built in 8.1 after seeing it on device
("не понравилось, что мы отправляем это на оценивание пользователю") and
separately reported that it was **not discoverable what needs reviewing at
all**. Both are being addressed together as one redesign. The 8.1 API layer,
offline queue and server contract all survive unchanged — only the *rating
input* and the *entry point* change.

#### Server contract de-risked first (curl, no mobile UI) — ALL PASSED

Verified directly against the live gateway before designing anything on top:

| Check | Result |
|---|---|
| Review changes schedule | `NEW → LEARNING`, `dueAt` +10h, `reps` 0→1, `stability` 0→2.3065 |
| Idempotent replay (same key) | Byte-identical card returned, `reps` stayed 1 — no double-schedule |
| Mobile client actually reaches server | `reviewedTodayCount` was already 4 from the user's on-device taps |
| All four ratings discriminate | see spread below |

Empirical first-review spread on a NEW card (this is FSRS-5 with the server's
profile, measured — not assumed):

| Rating | state after | stability | next due |
|---|---|---|---|
| `AGAIN` | LEARNING | 0.212 | immediately |
| `HARD` | LEARNING | 1.293 | ~6 min |
| `GOOD` | LEARNING | 2.307 | ~12 min |
| `EASY` | **REVIEW** | 8.296 | **8 days** |

Two design-relevant consequences:
- `AGAIN`/`HARD`/`GOOD` are nearly indistinguishable *to the user* on a first
  review (all "back in minutes"); they differ in **stability**, which compounds
  over later reviews. So a richer signal than binary is genuinely worth
  building — the payoff is long-run pacing, not the immediate interval.
- `EASY` is qualitatively different: it **skips the learning phase entirely**
  and jumps to 8 days. Auto-awarding it must be conservative.

#### UX audit — why the review queue was invisible (verified in source)

The app **never surfaces pending work anywhere**, for course words *or* local
decks. It only shows completed work.

- `HomeScreenData` (`HomeRepository.ts:7-35`) has no due/review field at all;
  Home renders `wordsLearned` and `dailyProgress.done/goal` — both "done", not
  "waiting".
- `deck.repeatWords` / `newWords` **are already computed in SQL**
  (`DeckRepository.ts:43-44`) and never rendered. `DeckGroupsSection` shows
  only total words + % learned.
- Home has zero knowledge of course SRS — grep for `srs|review` across
  `HomeScreen/`, `HomeRepository`, `useHomeData` returns nothing.
- No tab badges exist; `TabItem` (`RootNavigator.tsx:416-428`) supports only
  icon/label/active-underline.
- The reviews-due row (`CourseStatsSection.tsx:61-66`) is tappable but styled
  as a **plain text row** (no background/border/radius/padding, `:78-88`), sits
  inside the mastery block as its trailing line, two levels deep
  (Courses → course → header row) — **and the tab bar is hidden on CourseHome**
  (`RootNavigator.tsx:365`).
- Dead weight on Home's prime real estate: `TopicsSection` always duplicates
  `ContinueLearningCard` (both built from `continueLearning`,
  `HomeScreen/index.tsx:118-128`); `AIPracticeCard` is `onPress={() => {}}`.

#### Root cause — duplicated source of truth, not just bad layout

Phase 5.2's "Save to VoxOrd deck" was built **before** Phase 8 and gives course
words a **second, independent 6-stage local schedule**, while the same words are
server FSRS cards. This directly violates this plan's own architecture decision
("server FSRS is the single source of truth" / "never reconcile a 6-stage weight
with an FSRS card for the same word"). The user instinctively went to Home
(where the imported deck lives) and never found the server queue on Course Home.

#### Decisions taken with the user (2026-07-27)

1. **Rating is derived from performance, never self-reported** for course words.
2. **Multi-mode session** (option "Полный"): course due-words are drilled
   through several exercise modes, per-word attempts accumulated across the
   whole session, aggregated into **exactly one** rating per card, sent **once**.
   ⚠️ Critical: Deep Session runs the *same word set* through 4 phases
   (`useDeepSession.ts:36`) — naively posting a review per phase would
   reschedule one card 4× (the idempotency key does NOT protect here; those are
   legitimately distinct events).
3. **Imported course deck becomes a view onto the server cards** — it stores
   `cardId`, training it emits review events into the existing offline queue,
   server stays authoritative. One word, one schedule. (Chosen over deleting the
   import, and over keeping two labelled schedules.)
4. **Home becomes the single answer to "what do I study now"** — aggregate due
   across local + course, with breakdown. Courses tab stays for *content*
   (lessons, exercises), not word drilling.

#### Mode audit — what each mode actually measures (verified in source)

⚠️ **`flashcard` is self-report, not a recall test**: `const isCorrect =
direction === 'right'` (`useCard.ts:157`) — swipe right means "I knew it" and
nothing is ever compared. `PHASE_ORDER` in Deep Session *starts* with flashcard
(`useDeepSession.ts:36`), so reusing that session as-is would smuggle the
rejected self-assessment straight back in as phase 1.

| Mode | User action | Direction | Check |
|---|---|---|---|
| `matching` | pair 5 tiles by tapping | NO ↔ translation | id identity; pool narrows, **last pair is free** |
| `quiz` | pick 1 of 4 | NO word → translation | exact string equality |
| `listening` | pick 1 of 4 | TTS audio → translation | same |
| `context` | pick 1 of 4 | NO sentence with `___` → **the NO word** | same |
| `spelling` | **types** the word | translation → **the NO word** | trim+lowercase, no fuzzy |

Retrieval difficulty: `spelling` > `context` > `quiz ≈ listening` > `matching`.

#### Final grading scheme (decided 2026-07-27)

Evaluated top-down, first match wins:

| | Condition | Rating |
|---|---|---|
| 1 | pressed skip in spelling (gave up) | `AGAIN` |
| 2 | first-try miss in `quiz` or `listening` | `AGAIN` |
| 3 | spelling failed ≥2× before correct, or never correct | `AGAIN` |
| 4 | first-try miss in `context` | `HARD` |
| 5 | spelling used the hint, was a **typo**, or took exactly 1 retry | `HARD` |
| 6 | every mode first-try, spelling present, no hint, no typo | `EASY` |
| 7 | otherwise | `GOOD` |

Decisions behind it:
- **Rule 2 stays strict** (user chose this over requiring two misses): failing a
  4-way choice of the *native translation* means the word is not known, so the
  stability reset is earned. It is the main tuning knob if it proves harsh.
- **`EASY` requires production evidence** — measured, it skips the learning
  phase and jumps to ~8 days, so recognition alone can never earn it.
- **`flashcard` = non-scoring preview, NEW cards only** (user choice): you
  cannot test a word never seen, but the swipe must award nothing.
- **`matching` is not scored** — the self-narrowing pool inflates "correct".
- **Timing dropped from v1**: only flashcard (excluded) and spelling populate
  `responseTimeMs`, and spelling's clock starts at question display so it
  *includes previous failed attempts* (`useSpelling.ts:126`) — not a clean
  recall latency. A "fast" threshold on that would be invented, and `EASY` is
  too big a lever to hang on a noisy signal.

Still open:
- Deep Session has a **4h per-deck cooldown** (`useDeepSessionCooldown.ts:4`)
  while FSRS has its own due schedule. For course words FSRS due-ness must win;
  the cooldown is a local-deck concept.
- Existing plumbing cannot carry this signal: `recordAnswer` is strictly binary
  (`ProgressRepository.ts:38`), hint usage is persisted nowhere, and
  `SessionRepository.recordResult` takes only `{isCorrect, responseTimeMs}` — a
  requeued retry is indistinguishable from a first-try success. Course sessions
  therefore accumulate their own evidence in memory (below) and never touch the
  local word DB.

#### Step 8.1b-1 — grading logic — DONE (2026-07-27, VoxOrd `506dbbf`)

`src/lib/sessionGrader.ts` (beside `reviewQueue.ts`, its closest sibling):
`recordAttempt()` folds a stream of binary answers into per-mode `ModeOutcome`s
(retries accumulate into one outcome; a later wrong answer cannot un-earn an
earlier success; `hintUsed`/`gaveUp` latch), and `gradeWord()` collapses them
into one rating. Returns **`null`** when there is no evidence — only a preview
ran, or the session was abandoned before any answer — and the caller must then
send no review event, leaving the card due.

23 tests covering every row of the table plus the edge cases: abandoned
mid-question (presented-but-unanswered must not read as failure), abandonment
capping at `GOOD` so work is not lost, and rule 2 outranking a flawless
spelling result. `tsc --noEmit` and Jest at baseline (259 passing / 25 suites;
only the environmental `App.test.tsx` and the long-standing
`WordRepository.ts` type error remain).

**Scope note:** this is a rebuild of Phase 8 plus a retrofit of Phase 5.2 plus a
Home rework — larger than the original 8.1. Sequence it as pure logic → data
layer → UI with a commit per step, per the working agreement.

#### Step 8.1b-2 — data layer — DONE (2026-07-27, VoxOrd `4aa09be`, `8052e82`)

**The fork from the previous session is resolved: linkage, not new exercise
bodies.** Explore agent over the real sources found that `useQuiz`,
`useListening` and `useSpelling` **already take an `overrideWordIds` argument**
(`useQuiz.ts:33`), threaded into SQL as `AND w.id IN (…)`
(`QuizRepository.ts:16-20`) — `DeepSessionScreen` already drives them over an
arbitrary subset. So the existing exercise machinery can drill a server-due word
set unchanged, and nothing server-backed has to be rewritten.

Facts that shaped the design, all verified in source:

- **`SrsCard.contentId` (VOCABULARY_WORD) *is* `words.platformItemId`** — the
  Phase 5.2 importer already stores the platform vocabulary item id, so no
  schema change is needed to map a due card to a local word.
- **A session must be scoped to one deck**: every exercise query joins
  `deck_words ON dw.deckId = ?` *in addition to* the override filter, so a set
  spanning two imported lists would silently lose words.
- **Sets smaller than 4 produce nothing**: `QuizRepository.ts:45` /
  `ListeningRepository.ts:46` return `[]` when the pool has fewer than 4 words.
- **`useContext` and `useMatching` have no override path** (`useContext.ts:107`,
  `useMatching.ts:59`) — and imported `word_examples` rows are written with
  `isContextSentence = 0` (`VocabularyImportRepository.ts:258`), so the context
  query returns zero rows for course decks regardless. **Context is therefore
  out of the v1 course session**; `sessionGrader` handles its absence fine
  (rule 4 simply never fires). Matching was already excluded as unscored.
- **The hooks emit no per-word outcome**: `onComplete(correctCount)` is the only
  output, retries live in an unexported `queueRef`, and spelling's
  `hintUsed`/`gaveUp` reset per question (`useSpelling.ts:255-256`) and are never
  paired with a wordId. Feeding `recordAttempt` requires adding an
  `onAnswer(wordId, AttemptResult)` prop — that is step 8.1b-3.

Decisions taken with the user (2026-07-27):

1. **cardId is held in session memory, not persisted.** The `platformItemId`
   join is enough to resolve the due set, so there is no migration v10 and no
   stale second copy of server truth on the device. (Rejected: a
   `words.platformCardId` column — it buys offline session start, which course
   reviews do not have anyway since the due list itself comes from the server.)
2. **Small due sets are padded, not skipped.** 1-3 due words are topped up with
   other words from the same deck so quiz/listening still build; padding words
   are drilled but **never graded** and never produce a review event. (Rejected:
   dropping those modes, which would make `EASY` nearly unreachable; and
   blocking the session, which strands genuinely overdue cards.)
3. **`progressRepository.recordAnswer` is suppressed for course words**, so the
   retired 6-stage engine no longer computes a second schedule for a word the
   server owns — this is the root cause identified above.
   `wordModeStrengthRepository` **stays**, since the plan already designates
   `word_mode_strength` a local-only exercise-mode picker decoupled from the
   authoritative weight. Implemented in 8.1b-3 (it needs the hook changes).

Built:

- `src/lib/courseReviewSet.ts` (+ 18 tests) — pure: `resolveDueWords` (matches
  cards to local rows, reports cards whose list was never imported instead of
  dropping them, ignores EXERCISE cards and content-less cards), `groupByDeck`,
  `padNeeded`, `buildReviewSet` (never uses a due word as padding),
  `isGraded` / `cardIdForWord`.
- `src/lib/sessionEvidence.ts` (+ 11 tests) — pure, immutable per-session ledger
  around `sessionGrader`: `recordWordAttempt` accumulates per word across modes,
  `gradeSession` collapses each word to **exactly one** rating, dropping words
  with no usable evidence so the card stays due.
- `src/repositories/CourseReviewRepository.ts` — read-only SELECTs only
  (`getLinkedWords`, `getPaddingCandidates` weakest-first, `getDeckTitles`).
  Writes nothing, modifies no existing repository.
- `src/lib/courseReviewLoader.ts` — composes `/srs/due` + local rows into one
  runnable `DeckReviewSet` per deck; padding fetched only for decks that need it.

`tsc --noEmit` clean apart from the long-standing `WordRepository.ts` error;
Jest **285 passed / 27 suites** (baseline 259/25), only the environmental
`App.test.tsx` failing.

#### Step 8.1b-3 — session driver + screen — DONE (2026-07-27, VoxOrd `7b7f340`, `2acbc8a`, `1989f4b`)

Three commits, pure logic → data → UI.

**Per-answer tracking** (`7b7f340`). New optional 4th argument
`ExerciseTracking` on `useQuiz` / `useListening` / `useSpelling`
(`src/hooks/exerciseTracking.ts`):

- `onAnswer(wordId, {correct, hintUsed, gaveUp})` fires once per submitted
  answer, retries included. Invoked **after** the state update, not inside the
  updater — matching how `onComplete` was already reported — so a re-invoked
  reducer cannot double-count. Spelling's skip reports **one** gave-up event,
  not the three penalty answers the local engine records.
- `skipLocalProgress` suppresses `progressRepository.recordAnswer` only.
  `wordModeStrengthRepository` deliberately still runs — `word_mode_strength` is
  a local-only exercise-mode picker by design.
- Both optional; personal-deck sessions pass nothing and are byte-identical.

**`hintUsed` counts only an *earned* hint** (decided with the user, 2026-07-27):
under `spellingHintMode: 'always'` the hint is on screen for every word, so
counting it would cap every course card at `HARD` forever while carrying no
information about that word. Mistakes still drive grading in that mode. Default
is `after_mistake`, so this only affects users who opted into permanent hints.

**Session driver** (`2acbc8a`) — `src/hooks/useCourseReviewSession.ts`, the
course-word counterpart of `useDeepSession` (which is hardwired to
`loadWordsForDeck(deckId)`). Word set comes from the server queue; the 4h
deep-session cooldown deliberately does **not** apply, since for course words
FSRS due-ness decides when a word returns. Evidence accumulates across phases
and grades once at the end → exactly one review event per card. Preview answers
and padding-word answers are filtered out before reaching the grader.
`planPhases`/`newCardWordIds` added to `courseReviewSet` (7 tests): the 4-option
modes are dropped when even a padded set cannot reach four words, so a small
deck gets a spelling-only session instead of hitting the exercise's "not enough
words" dead end mid-session. `Quiz`/`Spelling`/`ListeningExercise` gained a
pass-through `tracking` prop.

**Screen** (`1989f4b`) — `ReviewSessionScreen` rebuilt on the driver;
`useCourseReviewSets` loads and resolves the queue (deliberately **not** through
`useSwrResource`: a stale due list would have the user drill cards that are no
longer due). `PhaseTracker` shows the phases this session actually has.
`SessionSummary` is the first and only place ratings are surfaced, so the
derivation stays visible; unanswered due words are reported as left-for-next-time
rather than defaulted. Due cards whose list was never imported are reported on
the empty state instead of making the queue look empty. **Deleted**
`useSrsReview` + `RatingButtons` — the rejected self-assessment UX.

`tsc --noEmit` clean apart from the long-standing `WordRepository.ts` error;
Jest **292 passed / 27 suites**; eslint clean on the new files.

**User test checkpoint (not yet run).** Entry point is still the reviews-due row
on Course Home (Home rework is 8.1b-4). Backend is already seeded from the
previous session; re-seed via `POST /srs/cards/bulk-introduce` if the queue has
drained. The account's UI language must be **`ru`** — `ny-i-norge-a2` was seeded
with Russian translations only, and `en` legitimately returns `immersionMode`.
1. Import a course vocabulary list first if none is imported — the session can
   only drill words that exist in a local deck.
2. Course Home → reviews-due row → the session runs listening → quiz → spelling
   (plus a flashcard preview if any card is NEW), **never asking you to rate
   yourself**.
3. The summary shows how many cards got each rating. Verify on web
   (`/student/srs`) that those cards moved.
4. Deliberately fail a quiz answer for one word and ace another; the failed one
   should come back as `AGAIN` in the summary.
5. Offline: turn Wi-Fi off mid-session — the session must keep running, and the
   summary should show a pending-sync count. Turn Wi-Fi back on (re-run `adb
   reverse`, Phase 6 gotcha) and confirm the queue drains.

#### Test-environment fix — enrollment was broken platform-wide (2026-07-27, ssz-platform `16af7d8`, `a8bf338`)

Found while trying to enroll the test account in `ny-i-norge-a2` so its
imported deck could actually resolve the seeded due cards (all 18 due cards
pointed at a list from `ny-i-norge-a2`; the account was enrolled only in
Norsk B1, so there was no in-app path to "Save to VoxOrd deck" for that list
at all). `POST /api/v1/enrollments` 502'd for **any** container, not just this
one — confirmed via Explore agent against real source before touching
anything, per the working agreement.

Two independent one-line platform bugs, both pre-existing (present since the
initial service scaffolds, unrelated to this plan's prior work):

1. **content-service** — `EnrollInContainerHandler` calls
   `GET internal/containers/:id/access-tier` on every enrollment; the route
   never existed (`content-client.ts`'s `getAccessTier` was stubbed against it
   in learning-service's first scaffold commit, never implemented server-side).
   Fixed: added the route to `InternalController`, backed by the existing
   `GetContainerQuery`. The domain's `AccessTier` enum is lowercase
   (`free_within_school`); learning-service's port compares against uppercase
   literals, so the value is upper-cased on the wire — otherwise every tier
   would silently fail to match and access checks would be bypassed rather than
   enforced.
2. **learning-service** — `OrganizationClient`'s axios `baseURL` was
   `${cfg.baseUrl}/internal`, missing organization-service's global `/api/v1`
   prefix. Every call 404'd; `getMemberRole`'s catch treats a 404 as "not a
   member" (indistinguishable from a real not-found), so a **real, active**
   school member was denied `FREE_WITHIN_SCHOOL` enrollment.
   `content-client.ts` already had the prefix right — this was the one
   inconsistent client.

Both rebuilt/restarted; enrollment in `ny-i-norge-a2` verified end-to-end
(`201`, account now enrolled in both courses).

**Separate finding, deliberately not fixed (2026-07-27):** organization-service's
`internal/*` controller has no `InternalAuthGuard` at all — only `@Public()`,
which bypasses the JWT guard but nothing checks the `x-internal-token` header
learning-service sends. Every other service's internal routes (content-service
confirmed) do check it. Out of scope for this plan; flag to the team as an
authz gap in organization-service before anything internal-only relies on it
for real protection.

#### Step 8.1b-3a — Spelling mode reworked (2026-07-27, VoxOrd `7ddadf5`, `85ff6d2`)

Found by the user's first real on-device run: they got stuck in the spelling
phase and could not finish. Investigating turned up four problems, one of them
much more serious than the reported symptom.

**⚠️ `overrideWordIds` never worked — in any of the three exercises.** The
filter `AND w.id IN (...)` was interpolated directly after the LEFT JOIN's `ON`
condition (`QuizRepository.ts`, `ListeningRepository.ts`,
`SpellingRepository.ts`), which made it part of that condition — and a LEFT
JOIN's `ON` never filters the left table. Verified against the real device
database: asking for words `20,21,22` returned `12,13,14`. So Deep Session was
never actually drilling its own phase word set, and the course review session
would have drilled arbitrary deck words instead of the due ones — the whole
linkage would have silently not worked, while looking plausible on screen.
Fixed by giving each query a real `WHERE` clause. **This invalidates any
conclusion drawn from a Deep Session word set before this commit.**

The three spelling-specific problems, all verified in source and in the seeded
data:

1. **The correct spelling was unreachable.** It was rendered only under
   `state.isSkipped`, and skip needs three mistakes — so a word you could not
   guess was a dead end. Now revealed after **two** mistakes and on a typo,
   with the wrong-answer copy pointing at it.
2. **Punctuation had to be typed exactly.** The check was `trim().toLowerCase()`
   with `===`. Seeded entries include `Det gjør ikke noe.` (trailing period) and
   `Alle som er bosatt i Norge, ...` (31 chars, comma + ellipsis), and the
   underscore hint renders punctuation as just another `_` — so the requirement
   was undiscoverable. `normalizeAnswer` now drops punctuation, treats hyphens
   as spaces and collapses whitespace, on both sides. Norwegian letters are
   preserved: folding æ/ø/å would accept genuinely wrong spellings.
3. **Phrases were being letter-perfect drilled.** 7 of the 18 due cards were
   `phrase`; on device, 16 multi-word entries across decks, longest
   `Jeg holdt på å bli sprø.`. That is a memory test, not a spelling test, and
   under grading rule 3 an untypeable phrase would reset its FSRS schedule every
   single session. `SpellingRepository` now excludes `partOfSpeech = 'phrase'`.
   Phrases still run in quiz/listening, where recognition is the right measure.
   Consequence, accepted: a phrase card can never earn `EASY` (rule 6 requires
   spelling evidence), so phrases repeat more often — appropriate for phrases.

**Typo policy (decided with the user, 2026-07-27):** a near-miss within an edit
tolerance is **accepted, but graded `HARD`** — recall was there, production was
imperfect. Tolerance scales with length and is **zero at ≤4 characters**, where
one edit is as likely to be a different word (`tips`/`tid`) as a slip; 1 edit up
to 11 characters, 2 beyond. Rejected: counting it as an ordinary mistake (two
typos would hit rule 3 and reset a well-known word's schedule) and accepting it
silently (it would let sloppy spelling earn `EASY`).

Implementation: `src/lib/answerMatching.ts` (`normalizeAnswer`, `levenshtein`,
`typoTolerance`, `classifyAnswer` → `correct | typo | wrong`), 23 tests.
`sessionGrader` gained a `typo` attempt flag latching into `typoed`; rules 5
and 6 updated above. An empty question set inside a multi-phase session now
auto-advances instead of stranding the user on a "no words available" screen —
newly reachable now that spelling can legitimately have nothing to ask.

**Blast radius, accepted by the user:** this is shared word-learning code
(`src/repositories/`, ground rule #1), so personal decks get the same behaviour.
One spelling mode, one set of rules.

Suite: **318 passed / 28 suites**, only the environmental `App.test.tsx`
failing. The `WordRepository.ts` type error and one `QuizRepository` eslint
warning are both pre-existing and untouched.

#### Step 8.1b-4 — Home as the single "what do I study now" — DONE (2026-07-28, VoxOrd `b1562a8`, `3570ef1`, `6f35b51`, `5d2ac30`)

Aggregated due across local decks and course cards on Home, with a breakdown;
`deck.repeatWords`/`newWords` were already computed in SQL and never rendered
(`DeckRepository.ts:43-44`). The Courses tab stays for content. Also removed the
dead weight found in the UX audit (`TopicsSection` duplicating
`ContinueLearningCard`, the no-op `AIPracticeCard`, `HomeHeader`'s no-op
`onAvatarPress`), and added `ReviewSession`/`VocabularyList` to the tab-bar-hiding
screen list (a pre-existing inconsistency, not new).

**On-device test (2026-07-28) found four bugs, all fixed in `5d2ac30`:**

1. **Race condition — course-due row silently missing on cold start.**
   `HomeRepository.getCourseDueCount()` checked `authStore.getState().status
   !== 'signedIn'` and returned 0 — but on a cold start `useHomeData` fired
   before the stored session finished restoring (`authStore`'s third state,
   `'restoring'`), so it saw a status that wasn't `'signedIn'` *yet* and
   returned 0 with no error, no warning, nothing. Reproduced twice on-device:
   present after a warm tab-switch remount, silently gone on the next cold
   start. Fixed: `useHomeData` now waits out `'restoring'` and reloads on every
   auth status change.
2. **ru/uk pluralization.** `'{count} слов'` was used at every count —
   grammatically wrong for 2-4 ("4 слов" instead of "4 слова"), visible in the
   Study Now widget and identically in `courseHome.reviewsDue`. Added
   `src/i18n/pluralize.ts` (Slavic one/few/many rule, English one/other),
   wired into `t()` via a `{ one, few, many }` value shape. Applied to
   `studyNow.courseDue`, `studyNow.localDue`, `courseHome.reviewsDue`. Not
   applied to `deckWords`/`vocabulary.wordCount`/`writingTaskWordCount` — same
   class of bug, spotted but out of scope for this pass, left as a follow-up.
3. **`ReviewSessionScreen` dead end.** Home's course-due count comes from the
   server's global `dueNowCount`; the review session can only drill due cards
   whose vocabulary list is imported locally (`resolveDueWords`'s
   `unresolvedCardIds`). A due card from a never-imported list landed the user
   on "nothing to review" printed right next to the count that said otherwise
   — verified against the real due queue (`/srs/due` returned 4 valid
   `VOCABULARY_WORD` cards with content, all from one unimported list).
   Decided with the user: offer the import inline rather than only counting
   drillable words on Home (the alternative would hide the unresolved words
   from the user entirely). `unresolvedListIds` (deduped `card.front.listId`)
   now threads from `resolveDueWords()` through `courseReviewLoader` to the
   screen; a new `ImportUnresolvedList` component reuses
   `useVocabularyList`/`useVocabularyImport` (same hooks `VocabularyListScreen`
   uses) to import without needing the course/unit navigation context, and
   calls `reload()` on success. Verified on-device: import button resolves
   straight into a running review session on the just-imported words.
4. Removed a leftover debug `console.log` in `ProgressRepository.recordAnswer`.

**Also observed, not chased further:** two consecutive `useCourseReviewSets()`
loads returned the same 4 due cards in different preview order — the server's
due-queue ordering may not be fully deterministic when cards share a `dueAt`.
Doesn't affect correctness (any due card is legitimately due), not investigated
against the learning-service SQL.

Suite: **346 passed / 30 suites** (was 318/28), only the environmental
`App.test.tsx` failing (native SQLite module unavailable under Jest). `tsc
--noEmit` clean (pre-existing `WordRepository.ts` error untouched).

### Step 8.2 — Grammar (mastery display only) — DONE (2026-07-28, VoxOrd `19bbed1`, `9056607`)
- No grammar *trainer* exists yet — audited 2026-07-24: the web only shows a
  grammar **mastery %** (skill-index tiles over `/api/v1/mastery/course/:id`),
  and there is no per-rule SRS card server-side (`SrsContentType` is only
  `EXERCISE` / `VOCABULARY_WORD`). So mobile mirrors that: surface the mastery
  signal (`GET /api/v1/mastery/grammar-rules/:id`, needs the gateway blocks from
  Phase 6), driven by ordinary course exercises. A real per-rule grammar drill
  is separate future product work on **both** web and mobile — out of scope
  here.
- Shipped: grammar mastery badge on `CourseHomeScreen`/`UnitContentsScreen`
  (`src/api/mastery.ts`), a `GrammarRuleReaderScreen` rendering rule theory as
  markdown (tables, bold/italic, emoji, example blocks, mnemonics with a left
  border) via `react-native-markdown-display`, and a "Перейти к практике" entry
  point that opens the rule's exercise pool through `ExerciseRunner`.
  `ExerciseRunner` gained retry handling for Match Pairs — a wrong attempt
  resets connections and re-colors instead of double-counting progress —
  plus a `FeedbackBar` pass for the new flow.
- **On-device test (2026-07-28)**, course "Ny i Norge — A2", unit
  "17 — Grammatikk og øvelser":
  - Grammar mastery badge renders ("Освоено: N%").
  - Match Pairs: all correct → all green; one wrong → "Попробовать снова"
    appears, connections reset, progress not double-counted.
  - Grammar theory markdown (tables, bold/italic, emoji, example blocks,
    bordered mnemonic) renders correctly and legibly on the dark theme — the
    old invisible-text bug did not reproduce.
  - "Перейти к практике" correctly launches the rule's exercise pool.
  - No regressions found on Home or elsewhere in navigation.
  - **Known gap, not yet verified on-device:** (1) `FeedbackBar` omitting the
    "Ожидаемый ответ: ..." line is untested for a wrong answer; (2) the retry
    button's exclusion for `translate`/`writing_task` at "submitted for
    review" status (vs. an actually-wrong answer) is untested; (3) the
    "Перейти к практике" empty-pool edge case (rule with no exercises) is
    untested — should show "Для этого правила пока нет упражнений" rather than
    a blank screen. Left as a follow-up before fully closing this out.
  - Also found and fixed in this pass (`9056607`): `CourseHomeScreen` showed
    "N слов на повторение" from the global, unfiltered `srsStats.dueNowCount`
    (`/srs/stats/me`), which can be nonzero while the "Повторить" screen
    (which resolves due cards only against locally imported decks via
    `useCourseReviewSets`/`resolveDueWords`) has nothing to run — the same
    dead-end class of bug as Step 8.1b-4's `ReviewSessionScreen` issue, on a
    different screen. Fixed by having `CourseHomeScreen` read
    `useCourseReviewSets().overview.totalDue` instead of `data.srsDueCount`.
- Suite: **360 passed / 31 suites**, only the environmental `App.test.tsx`
  failing (native SQLite module unavailable under Jest). `tsc --noEmit` clean
  (pre-existing `WordRepository.ts` error untouched).
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
