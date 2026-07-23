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
- **Two SRS systems coexist and do not talk to each other** in this
  iteration. Local word SRS (6-stage) stays; platform FSRS cards are only
  reviewed through platform endpoints if the user opts in later (Phase 8,
  optional). Do not attempt to merge or sync them.
- **No new heavy libraries.** `fetch` is built into React Native — no axios.
  No state-management library — follow the existing store pattern. The only
  planned new dependencies:
  - `react-native-keychain` (secure refresh-token storage) — Phase 1.
  - An audio player lib (e.g. `react-native-sound` or
    `react-native-track-player`) — Phase 7 only, decided then with the user.

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

### ⚠️ Gateway gap found — must be fixed before Phase 6/8 need them

`nginx.dev.conf` (and `nginx.conf`) do **not** proxy these existing
controllers — calls to them will 404 at the gateway even though the service
implements them:

- `learning-service`: `@Controller('mastery')` (course/grammar-rule mastery)
  and `@Controller('can-do/progress')`
- `content-service`: `@Controller('can-do/descriptors')` and
  `@Controller('content-relations')` (`ContentRelationController`)

None of these are needed until **Phase 6** (mastery/can-do enrichment). When
that phase starts, first add the missing `location` blocks to
`infrastructure/nginx/nginx.dev.conf` (and prod/us configs, coordinate with
the user) — this is a platform-repo change, flag it explicitly rather than
routing around it client-side.

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

### Step 1.4 — Login screen + Courses tab shell
- Add a third bottom tab **Courses** in `RootNavigator.tsx` (`Tab` union +
  tab bar). Extend the `Screen` union with `{ name: 'Courses' }` and
  `{ name: 'CourseLogin' }`.
- `src/screens/CoursesScreen/`: if signedOut → login form (email/password,
  error display, loading state; MFA users are out of scope — show a clear
  "MFA not supported yet" error if the login response demands an MFA
  challenge). If signedIn → placeholder list (Phase 2 fills it).
- Settings additions: signed-in account row + logout; developer section with
  editable API base URL (persisted in settings).
- **User test checkpoint:** login against local docker platform succeeds,
  token survives app restart, logout works, word learning untouched.

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

### Step 4.1 — Runner skeleton + attempt flow
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

## Phase 5 — Vocabulary lists in courses (read-only)

- Render a vocabulary-list item from a unit: word list with translations and
  usage examples (content-service data, web reference in student feature).
- Add a **"Save to VoxOrd deck"** action: import the vocabulary list into a
  local deck (this is the ONLY place course code writes into the local DB).
  - New migration in `src/db/migrations.ts` only if a linkage column is
    needed (e.g. `decks.platform_list_id` for idempotent re-import).
  - Reuse existing `DeckRepository` / `WordRepository` APIs; map platform
    vocabulary items → local word rows (language codes, part of speech,
    examples). Unmappable fields are dropped, not forced.
  - Idempotent: re-importing the same list updates instead of duplicating.
- After import, the words are ordinary VoxOrd words: local SRS, all existing
  exercise modes work with zero changes.
- **User test checkpoint:** import a list, learn it offline.

---

## Phase 6 — Course-home enrichment & resilience

- Add the blocks skipped in 2.2: mastery, can-do progress, SRS-due counters
  (display only).
- Lightweight response caching (in-memory + AsyncStorage snapshot) for course
  list / course home so reopening is instant; refetch in background
  (stale-while-revalidate). No write queueing — mutations remain online-only.
- Global "offline" banner on course screens when requests fail with network
  errors; word tabs unaffected.

## Phase 7 — Media (audio first)

- Decide the audio library with the user (`react-native-track-player` vs
  simpler). Streaming lesson audio from media-service URLs (check how the web
  reader obtains signed/proxied media URLs).
- Listening stages of lessons (model `LessonListeningStage`) — staged
  listening UI per web reader.
- Video (`LessonVideoCue`, `LessonVideoQuestion`) is explicitly **out of
  scope** for this plan; note it as a follow-up.

## Phase 8 (optional, discuss before starting) — Platform SRS review on mobile

- Read-only first: show due-card counts from `GET /api/v1/srs/...`.
- Then a review session screen driving platform FSRS cards through the review
  endpoint (`.../cards/:id/review`), fully server-authoritative.
- Keep it a separate tab section from local word SRS; never mix queues.

---

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
