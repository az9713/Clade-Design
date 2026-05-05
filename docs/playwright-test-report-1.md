# Playwright Test Report — Clade Brain

**Date:** 2026-05-04  
**Suite:** `e2e/specs/clade-brain.spec.ts`  
**Browser:** Chromium (headless)  
**Result:** 14 passed, 0 failed — 8.8 seconds total

---

## How the tests were run

### Infrastructure

The current repository exposes Playwright through root package scripts. The Playwright config starts the daemon and web server for CI runs and can reuse existing local servers in non-CI mode.

```bash
pnpm test:ui
```

For headed browser runs:

```bash
pnpm test:ui:headed
```

The Playwright config is `e2e/playwright.config.ts`.

### Running the suite

```bash
pnpm test:ui
```

To run with a visible browser:
```bash
pnpm test:ui:headed
```

For focused local Playwright debugging, use the package scripts in `e2e/package.json` as the source of truth and add Playwright flags there when needed.

### Two test modes in the same suite

Playwright supports two fixture types. Both were used:

- **`request` fixture** — makes raw HTTP calls through Chromium's network stack. No browser window opens. Used for all API-level tests (tests 1–12).
- **`page` fixture** — launches a real Chromium browser, navigates to the app URL, and interacts with DOM elements. Used for UI tests (tests 13–14).

---

## The 14 tests

### Group 1 — Clade Brain bootstrap (3 tests)

These verify that the Path A bootstrap flow (seeding from the 137-brand library) works correctly end-to-end.

| # | Test | Duration | What it asserts |
|---|---|---|---|
| 1 | Path A: seeding from library populates Clade Brain and raises health | 168ms | POST `/api/clade/:id/bootstrap/seed` with `designSystemId: 'stripe'` returns health > 0; history contains an `import` entry |
| 2 | seed raises health and writes import history entry | 162ms | Health is > 0 after seeding; history entry's `newValue` contains `'stripe'`; the import entry has section `'meta'` and key `'bootstrap'` |
| 3 | Path A: clear resets health to 0 | 156ms | After seeding, POST `/api/clade/:id/bootstrap/clear` resets health to 0 |

### Group 2 — Governance queue (3 tests)

These verify the promote/reject lifecycle. Because bootstrap seeding creates candidates below the 3-occurrence display threshold, a dedicated test fixture endpoint (`POST /api/clade/:id/candidates/fixture`, only active when `OD_ALLOW_TEST_FIXTURES=1`) is used to inject candidates with a controllable occurrence count — making assertions unconditional.

| # | Test | Duration | What it asserts |
|---|---|---|---|
| 4 | promote increases health and writes history entry | 311ms | Promoting a candidate raises health above 0; history contains a `promote` entry; the promoted value appears in the brand snapshot at `colors.primary` |
| 5 | reject writes history entry and does not destroy a promoted field with a different value | 326ms | Rejecting a candidate whose value differs from an already-promoted field leaves the promoted field intact in the snapshot — tests the conflict safety fix from the Codex adversarial review |
| 6 | clearCladeNodeFields purges candidates from the queue | 212ms | After inserting a fixture candidate, bootstrap clear removes it from the candidates endpoint |

### Group 3 — Animation pipeline preference (4 tests)

These verify the animation routing preference stored in the Clade Brain.

| # | Test | Duration | What it asserts |
|---|---|---|---|
| 7 | default pipeline is ask | 78ms | New project returns `{ pipeline: 'ask' }` from `GET /api/clade/:id/animation-pipeline` |
| 8 | PUT stores and GET reflects the new preference | 104ms | Setting pipeline to `'local'` via PUT is immediately readable back via GET |
| 9 | PUT rejects invalid pipeline values | 88ms | Sending `{ pipeline: 'turbo' }` returns HTTP 400 |
| 10 | check-local endpoint responds | 241ms | `GET /api/clade/:id/animation-pipeline/check-local` returns a JSON object with an `ok: boolean` field |

### Group 4 — Direction advisor (2 tests)

These verify the vague brief detection logic that fires the 20×5 philosophy matrix.

| # | Test | Duration | What it asserts |
|---|---|---|---|
| 11 | vague brief triggers advisor with 3 directions from different schools | 122ms | `GET /api/clade/:id/directions?message=make+it+look+good` returns `advisorFired: true` with 3 directions, each from a distinct school |
| 12 | specific long brief does not trigger advisor after seeding | 155ms | After seeding (health > 30), a 17-word specific brief returns `advisorFired: false` |

### Group 5 — Bootstrap screen UI (2 tests)

These are the only tests that open a real Chromium browser window, navigate to the app, and interact with the DOM.

| # | Test | Duration | What it asserts |
|---|---|---|---|
| 13 | new project shows bootstrap screen on first open | 5.0s | Navigating to `/projects/:id` for a project with health=0 and no history makes the text "Start from a library brand" visible within 10 seconds |
| 14 | skip dismisses bootstrap screen | 4.1s | Clicking the "Skip" button (matched by role=button with name matching /Skip/) makes "Start from a library brand" disappear within 5 seconds |

---

## Test results

```
14 passed  ·  0 failed  ·  0 skipped  ·  8.8s total
Browser: Chromium (headless)
Workers: 6 parallel
```

All 14 tests passed across two separate runs on 2026-05-04.

---

## What we can infer from these results

### Confirmed working

- **Bootstrap Path A** — seeding a Clade Brain from the 137-brand library writes fields, updates health, and records history correctly.
- **Bootstrap reset** — clearing a brand node wipes both `clade_fields` and `clade_candidates` atomically (this was a bug fixed in the Codex adversarial review).
- **Governance queue** — promote raises health and writes the field to the brand snapshot; reject with a conflicting value does not destroy an already-promoted field (this was the critical data-loss bug fixed in the adversarial review).
- **Animation pipeline** — preference is stored and retrieved correctly; invalid values are rejected with a proper 400 error.
- **Direction advisor** — vague brief detection fires correctly; health-gated suppression works after seeding.
- **Bootstrap screen UI** — the screen auto-appears for empty projects and dismisses when skipped; the full React component tree renders and responds to user interaction through a real browser.

### Not covered by these tests

- **Pattern extraction from generated artifacts** — the 30-second post-generation hook that extracts hex colors, font families, and spacing from HTML is not tested here. It requires a real agent CLI run. The unit tests in `clade-brain.test.ts` cover the extraction logic in isolation.

- **Full generation loop** — the 9-layer prompt stack with the Clade Brain snapshot injected at Layer 3 is not exercised. These tests confirm the API produces the right data; they do not confirm an agent receives and uses it correctly.

- **Bootstrap Path B** — the guided agent run (upload brand assets → extract → populate Clade Brain) is not tested. Path B requires a real agent run and network access to brand websites.

- **Cloud and local animation generation** — the animation router's local pipeline (ffmpeg + huashu scripts) and cloud dispatch (Seedance/HyperFrames) are not exercised. The `check-local` test only confirms the endpoint responds; it does not trigger a render.

- **Direction picker UI interaction** — tests 11–12 confirm the advisor fires via API. They do not test the frontend `DirectionPicker` overlay, picking a direction, or the pick being recorded in history. That requires a full browser test with a running agent.

- **Concurrent users / race conditions** — all tests run against isolated projects with fresh UUIDs. No test exercises two simultaneous writes to the same brand node.

- **Database migration** — the `ALTER TABLE brand_* RENAME TO clade_*` migration in `db.ts` is not explicitly tested. It is exercised implicitly whenever a test runs against a database that was created before the rename, but all test runs use a fresh `e2e/.od-data` directory.

---

## How to view the full report

After a UI test run, inspect the generated files under `e2e/reports/`. The HTML report contains per-test timelines, network requests, and screenshots on failure.
