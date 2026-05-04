# Clade-Design

> The design platform that learns your brand — and gets better every time you use it.

Clade-Design is a **local-first web application + daemon** that generates design artifacts through any AI coding agent CLI you already have installed, while continuously building a **clade-brain** — a living brand intelligence stored in SQLite that learns from every artifact and makes each subsequent generation more on-brand than the last.

The name is a hat tip to [Claude Design](https://claude.ai/design). *Clade* (a group of organisms sharing a common ancestor) captures the core idea: every artifact you generate shares DNA with your clade-brain, and the lineage grows stronger over time.

---

## Why this exists

Three problems with existing tools:

**Static brand context.** Tools like Open Design ship pre-built `DESIGN.md` files — accurate for a named brand at a point in time, but they never update and never learn from your real decisions. Your outputs drift from your actual brand silently.

**No memory between sessions.** Per-task brand extraction (e.g. Huashu's protocol) is rigorous but ephemeral — every session starts from scratch with no memory of what you decided last time.

**Subscription lock-in.** Claude Design demonstrated what a senior-designer-grade prompt stack can do. Then it stayed cloud-only, subscription-gated, locked to one model. You can't self-host it, bring your own agent, or run it offline.

Clade-Design solves all three: brand knowledge accumulates across every session, runs entirely on your machine, and works with any agent CLI you already have.

---

## The core loop

```
Brief
  → Clade Brain filters creative options
  → Agent generates artifact
  → Patterns extracted automatically (30s grace period)
  → Clade Brain learns from accepted decisions
  → Next brief starts with richer context
  → Output improves continuously
```

This loop is the product's fundamental innovation. The longer you use Clade-Design, the harder it becomes to leave — not because of lock-in, but because of accumulated brand value that cannot be replicated from scratch.

---

## Architecture

```
Frontend (Next.js 16 + React 18) — dual-pane
  LEFT (320px): Clade Brain workspace
    ├── Hierarchy tab  — brand node + health score (0–100, red/amber/green)
    ├── Queue tab      — governance queue with promote/reject
    └── History tab    — immutable audit log of every brand decision
  RIGHT (flex): Generation workspace
    ├── Chat pane      — conversations with your agent
    └── File workspace — live preview, tabs, export
          ↕ SSE + REST
Local Daemon (Node + Express)
  ├── Clade Brain engine  ← the new thing; reads/writes on every generation
  ├── Agent adapters      ← 13 CLI adapters (Claude Code, Codex, Gemini, etc.)
  ├── Animation router    ← local (Huashu pipeline) ↔ cloud (Seedance/HyperFrames)
  ├── Skill registry      ← 52 SKILL.md bundles
  └── SQLite              ← projects + conversations + clade-brain (4 new tables)
        ↓ spawn(cli, { cwd: .od/projects/<id>/ })
Agent CLI
  Reads: 9-layer prompt stack (Layer 3 = live brand snapshot, replaces static DESIGN.md)
  Writes: artifacts to project directory
```

---

## Clade Brain

The clade-brain is four SQLite tables that accumulate knowledge across every generation session:

| Table | Purpose |
|---|---|
| `clade_nodes` | One node per project (V1 is flat; hierarchy in V2) |
| `clade_fields` | One row per brand dimension — section, key, value, confidence, locked |
| `clade_history` | Immutable audit log — every promote, reject, extraction, direction pick |
| `clade_candidates` | Patterns extracted from artifacts awaiting governance decision |

**Health score:** `(completeness × 0.4) + (consistency × 0.4) + (avg confidence × 0.2)` → 0–100. Colour bands: 0–49 red, 50–74 amber, 75–100 green.

**Confidence algorithm:** +0.1 per extraction (cap 1.0). Promote → 0.9. Reject → 0.0, locked until 10 more occurrences.

**9 brand sections:** `colors` · `typography` · `spacing` · `layout` · `components` · `motion` · `voice` · `anti-patterns` · `atmosphere`

---

## 9-layer prompt stack

Every generation assembles a prompt from 9 layers in order:

| Layer | Content |
|---|---|
| 1 | DISCOVERY directives (Huashu workflow — batch questions, checkpoint gates) |
| 2 | Identity charter (anti-slop rules, fact-verification P0) |
| 3 | **Clade Brain snapshot** (confidence-gated fields ≥ 0.5) |
| 4 | Active SKILL.md body |
| 5 | Craft references (per skill's `od.craft.requires`) |
| 6 | Direction philosophy (from 20×5 matrix, when advisor fires) |
| 7 | Conversation history |
| 8 | Device/format context |
| 9 | Skill side files |

Layer 3 is the core innovation. It replaces the static `DESIGN.md` picker from Open Design with a live snapshot of everything the clade-brain has learned.

---

## Direction advisor

When a brief is vague (fewer than 15 words, or all style-only keywords like "modern / clean / minimal") **or** clade-brain health is below 30, the direction advisor fires.

It reads `craft/huashu-references/design-styles.md` — a 20-philosophy × 5-school matrix — and selects 3 directions from different schools:

- Information Architecture
- Motion Poetics  
- Minimalism
- Experimental
- Eastern Philosophy

The user picks one. The pick is recorded in `clade_history` with `action: direction_pick` and `confidence: 0.85` — the strongest signal the clade-brain can receive.

---

## Bootstrap flows

New projects start the clade-brain via one of three paths:

**Path A — Seed from library (fastest)**
Pick from 137 pre-built design system files (Stripe, Linear, Figma, Nike, Apple, etc.). Clade Brain populates at confidence 0.35. Health ≈ 40. Shown automatically on first open.

**Path B — Upload brand assets (higher fidelity)**
Drop a logo, screenshot, URL, or PDF. An agent run using the Huashu Brand Asset Protocol extracts colors, typography, and identity into `brand-spec.md`. Daemon parses it into clade_fields at confidence 0.65. Health ≈ 55–65.

**Path C — Start blank**
Skip bootstrap. Clade Brain starts at health 0. Direction advisor always fires on the first generation. After 10–15 sessions the clade-brain accumulates enough real decisions to produce consistent output without prompting.

---

## Animation router

Animation generation dispatches based on the clade-brain's `motion.animation.pipeline` preference:

| Preference | Route |
|---|---|
| `local` | Huashu pipeline: `render-video.js` → `convert-formats.sh` → `add-music.sh` (ffmpeg) |
| `cloud` | Seedance 2.0 / HyperFrames / Kling via existing media APIs |
| `ask` | Choice presented in the Brand pane (default for new projects) |

Cloud prompts are automatically pre-filled with clade-brain context — primary color, atmosphere, voice tone — before the user sees them.

---

## Supported agent CLIs

13 adapters auto-detected on your `PATH`:

Claude Code · Codex · Gemini CLI · Cursor Agent · Devin for Terminal · OpenCode · GitHub Copilot CLI · Qwen · Hermes · Kimi · Pi · Kiro · BYOK proxy (any OpenAI-compatible endpoint)

---

## Skills

52 composable SKILL.md bundles covering: landing pages, slide decks, dashboards, mobile apps, editorial layouts, motion graphics, brand identity, data visualizations, and more.

Skills can declare two new clade-brain fields:

```yaml
od:
  clade_brain:
    injection: auto        # auto | conditional | never
    manages_direction: true
```

---

## Getting started

**Prerequisites:** Node ≥ 22, pnpm 10, at least one supported agent CLI on your PATH.

```bash
git clone https://github.com/az9713/Clade-Design
cd Clade-Design
pnpm install
pnpm --filter @clade/daemon dev
# In a second terminal:
pnpm --filter @clade/web dev
```

Open `http://localhost:17573`. Create a project, choose a bootstrap path, and start generating.

---

## Development

```bash
# Run daemon unit tests (325 tests, ~5s)
pnpm --filter @clade/daemon test

# Typecheck frontend
pnpm --filter @clade/web typecheck

# Run all E2E tests (Playwright — starts daemon + web automatically)
cd e2e && npx playwright test -c playwright.config.ts --project=chromium

# Full suite
pnpm test
```

---

## What is net-new

Clade-Design adds 11 original components on top of the two foundational repos. Everything else is inherited:

1. **Clade Brain SQLite schema** — `clade_nodes`, `clade_fields`, `clade_history`, `clade_candidates`
2. **Cascade resolver** — flat in V1 (single node per project); hierarchy in V2
3. **Clade Brain prompt injector** — 9-layer stack; Layer 3 = live brand snapshot replacing static DESIGN.md
4. **Pattern extractor** — post-generation hook; extracts hex colors, font families, spacing from artifact HTML
5. **Governance queue** — promote/reject candidates with confidence rules and lock counter
6. **Health score calculator** — `(completeness × 0.4) + (consistency × 0.4) + (avg confidence × 0.2)`
7. **Left pane UI** — 320px `BrandPane` with Hierarchy / Queue / History tabs, always visible
8. **Bootstrap flows** — Path A (137-brand library grid) + Path B (asset upload → Huashu protocol → `brand-spec.md`)
9. **Direction advisor** — full 20×5 philosophy matrix parsed from `design-styles.md`; clade-brain-informed in V2
10. **Animation router** — local Huashu pipeline ↔ cloud dispatch + brand context pre-fill for cloud prompts
11. **E2E Playwright suite** — 13 tests covering the full clade-brain learning loop

---

## What was reused

### From Open Design

**Taken unchanged:**
- Next.js 16 + React 18 frontend shell — all existing views, routing, SSE streaming, file workspace
- Express daemon + SQLite infrastructure — `db.ts` (we added 4 tables to it)
- All 13 agent CLI adapters (`agents.ts`) — Claude Code, Codex, Gemini CLI, Cursor Agent, Devin, OpenCode, Copilot CLI, Qwen, Hermes, Kimi, Pi, Kiro, BYOK proxy
- All 52 skill bundles + skill loader (`skills.ts` — we extended it with 2 new `od:` frontmatter fields)
- All 137 design system `DESIGN.md` files — repurposed as Bootstrap Path A seeds
- Media generation infrastructure (`media.ts`, `media-models.ts`, `media-config.ts`) — animation router hooks in on top
- Craft references system, conversation management, project management, SSE event handling

**Taken and extended:**
- `db.ts` — 4 new clade-brain tables + indexes + CRUD helpers
- `server.ts` — ~15 new brand endpoints + media dispatch hook + pattern extraction hook
- `skills.ts` — added `cladeBrainInjection` and `cladeBrainManagesDirection` parsing
- `prompts/system.ts` — added Layer 3 (brand snapshot) and Layer 6 (direction philosophy)
- `ProjectView.tsx` — wired in `BrandPane`, `BootstrapScreen`, `DirectionPicker`

### From Huashu Design

**Taken unchanged:**
- Local animation pipeline — `render-video.js`, `convert-formats.sh`, `add-music.sh` → `packages/huashu-scripts/`
- Animation runtime — `animations.jsx`, `deck_stage.js`, device frame components → `packages/huashu-assets/`
- Direction matrix — `design-styles.md` (20 philosophies × 5 schools) → `craft/huashu-references/`
- `verify.py` for Playwright integration

**Concepts reimplemented with persistence:**
- Brand Asset Protocol (SKILL.md §1) — reimplemented as Bootstrap Path B + `parseBrandSpec()`
- Per-task pattern extraction — reimplemented as persistent `pattern-extractor.ts` with SQLite memory
- Anti-slop rules and workflow discipline — folded into prompt stack Layers 1 and 2

---

## Acknowledgements

Clade-Design is built on the shoulders of two exceptional open-source projects.

**[Open Design](https://github.com/nexu-io/open-design)** — the open-source alternative to Claude Design. Open Design proved that a local-first, multi-agent design platform was buildable, and contributed the infrastructure that Clade-Design runs on: the Express daemon, SQLite schema, 13 agent adapters, 52 skills, 137 design systems, and the entire Next.js frontend. Without Open Design, Clade-Design would have taken years instead of days.

**Huashu Design** — a rigorous, philosophy-driven design workflow system built around the principle that quality gates and brand discipline are non-negotiable. Huashu contributed Clade-Design's creative soul: the 20×5 direction matrix, the Brand Asset Protocol, the local animation pipeline, and the anti-slop rules that prevent every agent from regressing to purple gradients and rounded cards. The insight that *brand extraction should happen before the first pixel* is Huashu's, and it is the direct ancestor of Clade-Design's clade-brain.

---

## Non-goals

- Figma-level vector editing
- Real-time collaborative editing (V3)
- Hosted SaaS (V3, optional)
- Electron desktop shell (deferred)
- Telemetry or phone-home (local-first = local-only)
- Reinventing the agent loop (Clade-Design orchestrates CLIs, it does not replace them)

---

## License

MIT
