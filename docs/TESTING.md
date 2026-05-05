# Testing — Clade-Design

Last updated: 2026-05-04

This document is the single source of truth for what is tested in Clade-Design, how to run each suite, and what each test actually proves.

There are two layers of tests:

1. **Daemon unit tests** — Vitest, run inside `apps/daemon/`. 21 test files, ~327 tests. Fast (~5 seconds in parallel). Cover internal logic with no real HTTP.
2. **End-to-end Playwright tests** — `e2e/specs/`. 14 tests in `clade-brain.spec.ts` plus the inherited `app.spec.ts` automated UI cases. Cover real HTTP through a running daemon and real Chromium browser interactions.

Linked report:
- [`playwright-test-report-1.md`](./playwright-test-report-1.md) — detailed per-test breakdown of the Clade Brain Playwright suite.

---

## How to run

### Unit tests (fast — no servers needed)

```bash
pnpm --filter @clade/daemon test
```

Runs in ~5 seconds in parallel mode. To run a single file:

```bash
cd apps/daemon
pnpm exec vitest run -c vitest.config.ts tests/clade-brain.test.ts
```

### Playwright E2E tests (requires daemon + web)

The Playwright config (`e2e/playwright.config.ts`) starts both servers automatically when none are running, but the daemon's `dev` script runs a full `tsc` rebuild on every cold start. The fastest workflow is to pre-build the daemon and start both servers in the background, then re-run Playwright as many times as you need:

```bash
# 1. Build daemon once per session (or after any daemon source change)
pnpm --filter @clade/daemon build

# 2. Start daemon on Playwright's port with test fixtures enabled
OD_PORT=17456 OD_DATA_DIR=e2e/.od-data OD_ALLOW_TEST_FIXTURES=1 \
  node apps/daemon/dist/cli.js --no-open &

# 3. Start web dev server
OD_PORT=17456 PORT=17573 pnpm --filter @clade/web dev &

# 4. Wait for Next.js to be ready, then run tests
cd e2e
npx playwright test -c playwright.config.ts --project=chromium clade-brain
```

`reuseExistingServer: !process.env.CI` in the Playwright config means it detects the running servers and skips its own startup.

For a visible browser:

```bash
npx playwright test -c playwright.config.ts --project=chromium clade-brain --headed
```

For a slow-motion visible browser:

```bash
npx playwright test -c playwright.config.ts --project=chromium clade-brain --headed --slow-mo=1000
```

To view the HTML report after a run:

```bash
npx playwright show-report reports/playwright-html-report
```

---

## Daemon unit tests — what each file covers

The 21 unit test files in `apps/daemon/tests/` are organized by feature.

### Clade Brain core (3 files, ~50 tests)

| File | Coverage |
|---|---|
| `clade-brain.test.ts` | Core Clade Brain SQLite engine — node creation, field CRUD, history insertion, candidate lifecycle, snapshot generation, health scoring, confidence rules, lock counter. Includes the regression tests for the two critical bugs from the Codex adversarial review (rejecting a conflicting candidate must not destroy the promoted field; clearing a node must purge candidates). |
| `direction-advisor.test.ts` | The 20×5 philosophy matrix parser and selector — `parseDesignStyles` (reads `craft/huashu-references/design-styles.md` and extracts 20 philosophies across 5 schools), `detectVagueBrief` (word count + style-keyword detection + health gate), `selectDirections` (picks 3 from different schools, prefers unseen). |
| `pattern-extractor.test.ts` | The post-generation HTML pattern extractor — hex colors, OKLch/RGB, CSS variables, `font-family` declarations, `box-shadow`, `transition`, `border-radius`, dominant spacing. Tests for deduplication and minimum-occurrence behavior. |

### Daemon infrastructure inherited from Open Design (18 files)

| File | Coverage |
|---|---|
| `agents.test.ts` | Agent CLI adapter detection on PATH, version probing, BYOK proxy fallback. |
| `app-version.test.ts` | App version metadata reading and channel detection. |
| `artifact-manifest.test.ts` | Artifact manifest creation and inference from legacy formats. |
| `comment-attachments.test.ts` | Preview comment attachments lifecycle. |
| `craft.test.ts` | Craft reference loading and per-skill `od.craft.requires` resolution. |
| `deploy.test.ts` | Deployment record CRUD and cloud target resolution. |
| `json-event-stream.test.ts` | NDJSON parsing for streaming agent output. |
| `lint-artifact.test.ts` | Generated HTML linting (anti-slop rules). |
| `pi-rpc.test.ts` | Pi RPC stream framing. |
| `project-classifiers.test.ts` | Project type detection (deck / web / motion / etc.). |
| `project-status.test.ts` | Project run status machine. |
| `sanitize-name.test.ts` | Project / file name sanitization. |
| `server-cors.test.ts` | CORS rejection of cross-origin media generation requests. |
| `server-paths.test.ts` | Project root resolution and path safety guards. |
| `skills.test.ts` | Skill loader + frontmatter parser, including the new `od.clade_brain.injection` and `od.clade_brain.manages_direction` fields. |
| `sse-response.test.ts` | SSE event encoding for streaming chat responses. |
| `system-prompt-template.test.ts` | The 9-layer prompt stack assembly, including the Clade Brain snapshot at Layer 3 and direction philosophy at Layer 6. |
| `version-route.test.ts` | The `GET /api/version` endpoint. **Note:** This test has an intermittent 5-second timeout in parallel runs; it is a pre-existing flake inherited from Open Design and unrelated to Clade-Design code. Run sequentially or rerun on flake. |

### Latest run

```
326 passed  ·  1 failed (version-route — pre-existing flake)  ·  4 skipped
21 test files  ·  ~5 minutes including TypeScript compilation
```

---

## Playwright E2E tests — what each test covers

The `clade-brain.spec.ts` suite has 14 tests across 5 groups, all passing in 8.8 seconds. Full per-test detail is in [`playwright-test-report-1.md`](./playwright-test-report-1.md). Summary:

| Group | Tests | Covers |
|---|---|---|
| **Clade Brain bootstrap** | 3 | Path A library seeding, health update, history entry, clear/reset behavior |
| **Governance queue** | 3 | Promote increases health and writes to snapshot; reject does not destroy a promoted field with a different value (regression for critical Codex finding); clear purges candidates (regression for high Codex finding) |
| **Animation pipeline preference** | 4 | Default is `ask`; PUT/GET round-trip; invalid values rejected with HTTP 400; `check-local` endpoint responds with `{ ok }` |
| **Direction advisor** | 2 | Vague brief fires advisor with 3 directions from different schools; specific brief with health > 30 does not fire |
| **Bootstrap screen UI** | 2 | The bootstrap screen auto-appears for empty projects and dismisses on Skip — the only tests that drive a real browser DOM |

The suite uses two Playwright fixture types:

- **`request` fixture** for tests 1–12. Makes raw HTTP calls through Chromium's network stack. No browser window opens, but Chromium is still the network engine.
- **`page` fixture** for tests 13–14. Launches a real Chromium browser, navigates to the app URL, and asserts on real DOM elements.

The governance tests rely on a test-only daemon endpoint, `POST /api/clade/:projectId/candidates/fixture`, that injects a candidate with a controllable `occurrences` count. This endpoint is registered only when the daemon starts with `OD_ALLOW_TEST_FIXTURES=1` — never in production.

---

## What the tests prove

### Confirmed working at the code level (unit tests)

- **Clade Brain SQLite schema and CRUD** — all four tables (`clade_nodes`, `clade_fields`, `clade_history`, `clade_candidates`) read and write correctly.
- **Health score formula** — `(completeness × 0.4) + (consistency × 0.4) + (avg confidence × 0.2)`.
- **Confidence algorithm** — +0.1 per extraction (cap 1.0), promote → 0.9, reject → 0.0 with a 10-occurrence lock counter.
- **Snapshot gating** — only fields with confidence ≥ 0.5 surface in the brand snapshot.
- **Pattern extractor** — recognizes hex colors, OKLch, RGB, CSS variables, font families, box-shadow, transitions, border-radius, and spacing rhythms in HTML.
- **Direction advisor** — vague brief detection (word count, style keywords, health gate) and 3-school selection.
- **9-layer prompt stack** — composition includes the Clade Brain snapshot at Layer 3 when present.
- **Skill frontmatter parser** — recognizes the new `od.clade_brain.injection` (auto/conditional/never) and `od.clade_brain.manages_direction` (boolean) fields.

### Confirmed working at the API + UI level (Playwright)

- All Clade Brain HTTP endpoints respond correctly with valid input and produce proper error responses for invalid input.
- The bootstrap screen auto-appears for projects with health=0 and no history, and dismisses on Skip — proven against a real Chromium DOM.
- The reject conflict safety fix (Codex adversarial review Issue 1) holds end-to-end through the API.
- The clear-purges-candidates fix (Codex adversarial review Issue 3) holds end-to-end through the API.

### What is NOT covered by these tests

- **End-to-end agent generation** — the full loop where an agent CLI receives the 9-layer prompt, produces an artifact, and the pattern extractor learns from it. Requires a real agent + API key. Manual test only.
- **Bootstrap Path B** — the guided agent run that reads brand assets and writes `brand-spec.md`. Requires a real agent and network access to brand websites. Manual test only.
- **Local animation pipeline** — `render-video.js` + ffmpeg + `add-music.sh` chain. The `check-local` endpoint confirms availability but no test triggers a render.
- **Cloud animation generation** — Seedance / HyperFrames / Kling dispatch with brand context pre-fill. The brand context assembly is unit-tested but no test calls a real provider.
- **Direction picker UI interaction** — the `DirectionPicker` overlay is rendered correctly in unit/component scope, but no Playwright test clicks a direction card, since that requires a running agent to consume the chosen direction.
- **Concurrency / race conditions** — every test runs against an isolated project. No test exercises two simultaneous writes to the same Clade node.
- **Long-running data growth** — no test simulates hundreds of generations; pattern extractor performance under load is unmeasured.

---

## Adding new tests

### When to write a unit test

- A new pure function or class in `apps/daemon/src/`.
- A new SQL query or db helper.
- A regression test for a bug found in production or in an adversarial review.
- Anything that can be tested without HTTP, browser, or process spawning.

Files go in `apps/daemon/tests/<topic>.test.ts`. Use `// @ts-nocheck` (project convention), `assert from 'node:assert/strict'`, and `vitest`'s `test`/`afterEach`. Use the `createDb()` helper at the top of `clade-brain.test.ts` as a template — it creates an isolated SQLite database in a temp directory.

### When to write a Playwright test

- A new HTTP endpoint that the frontend calls.
- A new UI component that has interactive behavior worth verifying in a real browser.
- An end-to-end behavior that crosses the daemon/web boundary.
- A regression test for a bug that the unit tests cannot catch (race conditions, real network behavior, real DOM).

Files go in `e2e/specs/<topic>.spec.ts`. Use the `request` fixture for API-only assertions. Use `page` only when DOM interaction is needed — it adds ~3 seconds per test for browser launch.

### Test fixture endpoint

If a test needs to manufacture state that production paths don't easily produce (e.g. a candidate with `occurrences ≥ 3`), use the test fixture endpoint pattern: register the endpoint conditionally on `process.env.OD_ALLOW_TEST_FIXTURES === '1'` so it never ships in production.

---

## CI

The existing `.github/workflows/ci.yml` workflow runs `pnpm typecheck`, `pnpm test`, and `pnpm build` on every PR and push to main, across all packages with `--workspace-concurrency=1`. The Playwright suite is not yet part of CI — to run it in CI, add a job that builds the daemon, starts both servers via `pnpm tools-dev` (or the direct-start pattern documented above), then runs `npx playwright test`.
