# Clade-Design

> The design platform that learns your brand — and gets better every time you use it.

Clade-Design is a **local-first web application + daemon** that generates design artifacts through any AI coding agent CLI you already have installed, while continuously building a **brand-brain** — a living brand intelligence stored in SQLite that learns from every artifact and makes each subsequent generation more on-brand than the last.

The name is a hat tip to [Claude Design](https://claude.ai/design). *Clade* (a group of organisms sharing a common ancestor) captures the core idea: every artifact you generate shares DNA with your brand-brain, and the lineage grows stronger over time.

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
  → Brand-brain filters creative options
  → Agent generates artifact
  → Patterns extracted automatically (30s grace period)
  → Brand-brain learns from accepted decisions
  → Next brief starts with richer context
  → Output improves continuously
```

This loop is the product's fundamental innovation. The longer you use Clade-Design, the harder it becomes to leave — not because of lock-in, but because of accumulated brand value that cannot be replicated from scratch.

---

## Architecture

```
Frontend (Next.js 16 + React 18) — dual-pane
  LEFT (320px): Brand-brain workspace
    ├── Hierarchy tab  — brand node + health score (0–100, red/amber/green)
    ├── Queue tab      — governance queue with promote/reject
    └── History tab    — immutable audit log of every brand decision
  RIGHT (flex): Generation workspace
    ├── Chat pane      — conversations with your agent
    └── File workspace — live preview, tabs, export
          ↕ SSE + REST
Local Daemon (Node + Express)
  ├── Brand-brain engine  ← the new thing; reads/writes on every generation
  ├── Agent adapters      ← 13 CLI adapters (Claude Code, Codex, Gemini, etc.)
  ├── Animation router    ← local (Huashu pipeline) ↔ cloud (Seedance/HyperFrames)
  ├── Skill registry      ← 52 SKILL.md bundles
  └── SQLite              ← projects + conversations + brand-brain (4 new tables)
        ↓ spawn(cli, { cwd: .od/projects/<id>/ })
Agent CLI
  Reads: 9-layer prompt stack (Layer 3 = live brand snapshot, replaces static DESIGN.md)
  Writes: artifacts to project directory
```

---

## Brand-brain

The brand-brain is four SQLite tables that accumulate knowledge across every generation session:

| Table | Purpose |
|---|---|
| `brand_nodes` | One node per project (V1 is flat; hierarchy in V2) |
| `brand_fields` | One row per brand dimension — section, key, value, confidence, locked |
| `brand_history` | Immutable audit log — every promote, reject, extraction, direction pick |
| `brand_candidates` | Patterns extracted from artifacts awaiting governance decision |

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
| 3 | **Brand-brain snapshot** (confidence-gated fields ≥ 0.5) |
| 4 | Active SKILL.md body |
| 5 | Craft references (per skill's `od.craft.requires`) |
| 6 | Direction philosophy (from 20×5 matrix, when advisor fires) |
| 7 | Conversation history |
| 8 | Device/format context |
| 9 | Skill side files |

Layer 3 is the core innovation. It replaces the static `DESIGN.md` picker from Open Design with a live snapshot of everything the brand-brain has learned.

---

## Direction advisor

When a brief is vague (fewer than 15 words, or all style-only keywords like "modern / clean / minimal") **or** brand-brain health is below 30, the direction advisor fires.

It reads `craft/huashu-references/design-styles.md` — a 20-philosophy × 5-school matrix — and selects 3 directions from different schools:

- Information Architecture
- Motion Poetics  
- Minimalism
- Experimental
- Eastern Philosophy

The user picks one. The pick is recorded in `brand_history` with `action: direction_pick` and `confidence: 0.85` — the strongest signal the brand-brain can receive.

---

## Bootstrap flows

New projects start the brand-brain via one of three paths:

**Path A — Seed from library (fastest)**
Pick from 137 pre-built design system files (Stripe, Linear, Figma, Nike, Apple, etc.). Brand-brain populates at confidence 0.35. Health ≈ 40. Shown automatically on first open.

**Path B — Upload brand assets (higher fidelity)**
Drop a logo, screenshot, URL, or PDF. An agent run using the Huashu Brand Asset Protocol extracts colors, typography, and identity into `brand-spec.md`. Daemon parses it into brand_fields at confidence 0.65. Health ≈ 55–65.

**Path C — Start blank**
Skip bootstrap. Brand-brain starts at health 0. Direction advisor always fires on the first generation. After 10–15 sessions the brand-brain accumulates enough real decisions to produce consistent output without prompting.

---

## Animation router

Animation generation dispatches based on the brand-brain's `motion.animation.pipeline` preference:

| Preference | Route |
|---|---|
| `local` | Huashu pipeline: `render-video.js` → `convert-formats.sh` → `add-music.sh` (ffmpeg) |
| `cloud` | Seedance 2.0 / HyperFrames / Kling via existing media APIs |
| `ask` | Choice presented in the Brand pane (default for new projects) |

Cloud prompts are automatically pre-filled with brand-brain context — primary color, atmosphere, voice tone — before the user sees them.

---

## Supported agent CLIs

13 adapters auto-detected on your `PATH`:

Claude Code · Codex · Gemini CLI · Cursor Agent · Devin for Terminal · OpenCode · GitHub Copilot CLI · Qwen · Hermes · Kimi · Pi · Kiro · BYOK proxy (any OpenAI-compatible endpoint)

---

## Skills

52 composable SKILL.md bundles covering: landing pages, slide decks, dashboards, mobile apps, editorial layouts, motion graphics, brand identity, data visualizations, and more.

Skills can declare two new brand-brain fields:

```yaml
od:
  brand_brain:
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

Everything else is inherited from the two foundational repos. These 11 components are original to Clade-Design:

1. Brand-brain SQLite schema — `brand_nodes`, `brand_fields`, `brand_history`, `brand_candidates`
2. Cascade resolver — flat in V1 (single node per project); hierarchy in V2
3. Brand-brain prompt injector — 9-layer stack; Layer 3 = live brand snapshot
4. Pattern extractor — post-generation hook; extracts hex/font/spacing from artifact HTML
5. Governance queue — promote/reject with confidence rules and lock counter
6. Health score calculator — completeness × consistency × confidence
7. Left pane UI — 320px BrandPane with Hierarchy / Queue / History tabs
8. Bootstrap flows — Path A (137-brand library) + Path B (asset extraction + Huashu protocol)
9. Direction advisor — full 20×5 philosophy matrix; brand-brain-informed in V2
10. Animation router — local Huashu pipeline ↔ cloud dispatch + brand context pre-fill
11. E2E Playwright suite — 13 tests covering the full brand-brain learning loop

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
