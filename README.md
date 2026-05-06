# Clade-Design

> A local-first design workspace that runs in your browser, talks to a local daemon, and delegates generation to the AI coding agent CLI you already use.

Clade-Design is a Next.js + Express application for generating and refining design artifacts. The web app provides projects, chat, previews, files, comments, design-system pickers, skills, prompt templates, media configuration, and the Clade Brain brand-memory pane. The daemon owns local data, SQLite, agent spawning, artifact files, media jobs, and the REST/SSE API.

The project is TypeScript-first and uses pnpm workspaces. Runtime data is local by default under `./.od/`.

## What Is In The Current Codebase

- `apps/web`: Next.js 16 App Router + React 18 UI. It serves the project workspace and rewrites `/api/*`, `/artifacts/*`, and `/frames/*` to the daemon during `next dev`.
- `apps/daemon`: Express + SQLite daemon and `clade` CLI. It serves `/api/*`, scans skills/design systems, spawns agent CLIs, stores projects, and runs media jobs.
- `apps/desktop`: Electron host shell source.
- `apps/packaged`: packaged Electron entry that starts daemon/web sidecars for bundled builds.
- `packages/contracts`: pure TypeScript DTOs, SSE/API shapes, and prompt helpers shared by web and daemon.
- `packages/sidecar-proto`, `packages/sidecar`, `packages/platform`: sidecar protocol, generic sidecar runtime, and OS process primitives.
- `e2e`: Playwright UI specs plus Vitest/jsdom integration tests.
- `skills/`: 54 bundled `SKILL.md` workflows.
- `design-systems/`: 137 bundled `DESIGN.md` systems.
- `prompt-templates/`: 94 image/video prompt templates.
- `craft/`: reusable design craft references that skills can opt into.

There is no active lifecycle-helper workspace package in this checkout; use the package-scoped commands shown below.

## Requirements

- Node.js `~24` as declared by `package.json#engines`.
- pnpm `10.33.2`, selected through Corepack from `packageManager`.
- At least one local agent CLI on `PATH` for local generation, or provider keys configured in Settings/API mode.

Common local agent CLIs detected by the daemon include `claude`, `codex`, `devin`, `gemini`, `opencode`, `hermes`, `kimi`, `cursor-agent`, `qwen`, `copilot`, `pi`, and `kiro-cli`.

## Quick Start

Install dependencies:

```bash
corepack enable
pnpm install
```

Start the daemon in one terminal:

```bash
pnpm --filter @clade/daemon dev
```

Start the web app in a second terminal:

```bash
pnpm --filter @clade/web dev
```

Open the URL printed by Next.js. By default the daemon listens on `http://127.0.0.1:7456`, and the web dev server uses Next.js defaults unless you set `PORT`.

To use explicit ports in PowerShell:

```powershell
$env:OD_PORT = "7456"; pnpm --filter @clade/daemon dev
```

```powershell
$env:OD_PORT = "7456"; $env:PORT = "17573"; pnpm --filter @clade/web dev
```

Then open `http://127.0.0.1:17573`.

## Main Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm check:residual-js
pnpm test:ui
pnpm test:ui:headed
pnpm test:e2e:live
```

Useful package commands:

```bash
pnpm --filter @clade/daemon dev
pnpm --filter @clade/daemon build
pnpm --filter @clade/daemon test
pnpm --filter @clade/web dev
pnpm --filter @clade/web build
pnpm --filter @clade/web test
pnpm --filter @clade/web typecheck
pnpm --filter @clade/desktop build
pnpm --filter @clade/packaged build
pnpm --filter @clade/sidecar-proto test
pnpm --filter @clade/sidecar test
pnpm --filter @clade/platform test
```

## Environment Variables

Local runtime:

- `OD_PORT`: daemon port. Defaults to `7456`.
- `PORT`: Next.js web dev server port.
- `OD_DATA_DIR`: daemon data directory relative to the repo root. Defaults to `.od`.
- `OD_RESOURCE_ROOT`: packaged/runtime resource root for `skills/`, `design-systems/`, `craft/`, `frames/`, community pets, and prompt templates.
- `OD_CODEX_DISABLE_PLUGINS=1`: makes daemon-spawned Codex runs pass `--disable plugins`.
- `OD_ALLOW_TEST_FIXTURES=1`: enables test-only Clade Brain fixture routes.
- `OD_HOST`: web sidecar host override, defaulting to `127.0.0.1`.

Web build/sidecar:

- `OD_WEB_DIST_DIR`: custom Next output directory.
- `OD_WEB_TSCONFIG_PATH`: custom web tsconfig path.
- `OD_WEB_OUTPUT_MODE=server`: packaged web sidecar runs Next in server mode instead of static export.
- `OD_WEB_PROD=1`: packaged production web mode.
- `OD_WEB_PORT`: web sidecar port.

Packaged/runtime sidecars:

- `OD_SIDECAR_BASE`, `OD_SIDECAR_IPC_BASE`, `OD_SIDECAR_IPC_PATH`, `OD_SIDECAR_NAMESPACE`, `OD_SIDECAR_SOURCE`, `OD_TOOLS_DEV_PARENT_PID`
- `OD_PACKAGED_CONFIG_PATH`, `OD_PACKAGED_NAMESPACE`, `OD_DESKTOP_LOG_ECHO`

Media provider keys:

- OpenAI/Azure: `OD_OPENAI_API_KEY`, `OPENAI_API_KEY`, `AZURE_API_KEY`, `AZURE_OPENAI_API_KEY`
- Volcengine: `OD_VOLCENGINE_API_KEY`, `ARK_API_KEY`, `VOLCENGINE_API_KEY`
- xAI/Grok: `OD_GROK_API_KEY`, `XAI_API_KEY`
- BFL: `OD_BFL_API_KEY`, `BFL_API_KEY`
- Fal: `OD_FAL_KEY`, `FAL_KEY`
- Replicate: `OD_REPLICATE_API_TOKEN`, `REPLICATE_API_TOKEN`
- Google/Gemini: `OD_GOOGLE_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_API_KEY`
- Kling: `OD_KLING_API_KEY`, `KLING_API_KEY`
- MiniMax: `OD_MINIMAX_API_KEY`, `MINIMAX_API_KEY`
- ElevenLabs: `OD_ELEVENLABS_API_KEY`, `ELEVENLABS_API_KEY`
- FishAudio: `OD_FISHAUDIO_API_KEY`, `FISH_AUDIO_API_KEY`
- Also supported: `OD_MIDJOURNEY_API_KEY`, `OD_SUNO_API_KEY`, `OD_UDIO_API_KEY`

Media/testing switches:

- `OD_MEDIA_ALLOW_STUBS=1`: writes labelled stub media instead of failing when a provider is unavailable.
- `OD_VOLCENGINE_VIDEO_MAX_POLL_MS`, `OD_GROK_VIDEO_MAX_POLL_MS`: extend long video polling budgets.
- `OD_RUNTIME_LIVE_TIMEOUT_MS`, `OD_E2E_RUNTIMES`: live runtime-adapter test controls.

## How Generation Works

1. The web app loads agents, skills, design systems, prompt templates, projects, and app version from the daemon.
2. A project stores conversations, files, tabs, comments, runs, deployments, and Clade Brain data in SQLite plus `./.od/projects/<id>/`.
3. On send, the app builds prompt context from discovery rules, identity prompt, live Clade Brain or selected design system, craft references, skill body, project metadata, and media/deck contracts when relevant.
4. The daemon spawns the selected local agent CLI with cwd set to the project directory, or the web app uses configured API providers.
5. Output streams back over SSE, artifacts are parsed, files are shown in the workspace, and Clade Brain candidates can be promoted or rejected.

## `clade` CLI

The root package exposes a `clade` bin after the daemon is built. The shipped CLI supports:

```bash
pnpm --filter @clade/daemon build
node apps/daemon/dist/cli.js --help
node apps/daemon/dist/cli.js --no-open
node apps/daemon/dist/cli.js media --help
```

The daemon injects these variables into spawned agent sessions for media workflows: `OD_BIN`, `OD_DAEMON_URL`, `OD_PROJECT_ID`, and `OD_PROJECT_DIR`.

## Documentation

- Beginner setup: `QUICKSTART.md`
- Architecture: `docs/architecture.md`
- Agent adapters: `docs/agent-adapters.md`
- Skills protocol: `docs/skills-protocol.md`
- Modes: `docs/modes.md`
- Product spec and roadmap: `docs/spec.md`, `docs/roadmap.md`
- Testing strategy: `docs/TESTING.md`

## Acknowledgements

Clade-Design is built on the shoulders of two exceptional open-source projects.

- **[Huashu Design](https://github.com/alchaincyf/huashu-design)** — a rigorous, philosophy-driven design workflow system. Huashu contributed the 20×5 direction matrix, the Brand Asset Protocol, the local animation pipeline (`render-video.js` + ffmpeg + audio), and the anti-slop rules that prevent agents from regressing to the visual corpus average. The insight that *brand extraction should happen before the first pixel* is Huashu's, and it is the direct ancestor of Clade-Design's Clade Brain.
- **[Open Design](https://github.com/nexu-io/open-design)** — the open-source alternative to Claude Design. Open Design contributed the platform infrastructure that Clade-Design runs on: the Express daemon, SQLite schema, 13 agent adapters, 54 skills, 137 design systems, and the entire Next.js frontend.

The product name "Clade" is a hat tip to [Claude Design](https://claude.ai/design) — a *clade* is a group sharing a common ancestor, which captures how every artifact you generate shares DNA with your Clade Brain.

## License

MIT
