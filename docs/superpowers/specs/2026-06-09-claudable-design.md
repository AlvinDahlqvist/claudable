# Claudable — Design Spec

**Date:** 2026-06-09
**Status:** Approved (brainstorming)

## Summary

Claudable is an open-source, local-first alternative to Lovable, powered by your own
local Claude Code. It runs entirely on localhost: a Lovable-style web UI with a project
switcher, a chat that drives your local `claude` CLI to modify the selected repository,
a live application preview, and a terminal/log panel — all on one page. After a
successful Claude modification it automatically commits and (if a remote exists) pushes
to `main`, mirroring Lovable's workflow. It can connect a project to Supabase by wiring
the Supabase MCP server into the project's local Claude config.

It is download-and-go: clone the repo, configure a `.env`, point it at your local repos,
and chat.

## Goals

- Lovable-like single-page experience: project switcher (left), chat (center), live
  preview (right), terminal/logs (bottom).
- Drive the **local** `claude` CLI inside the currently selected repository, streaming
  output to the browser in real time over WebSockets.
- Works on a **Claude Pro plan** — uses the CLI's existing subscription auth, no API key.
- Support multiple local repositories; switching project switches the active repo.
- Auto `git add` + `commit` after a successful Claude run; `push` to `origin main` if a
  remote exists.
- Per-project Supabase connection via MCP, surfaced with a status panel.
- Simple, flat, well-commented architecture that contributors can understand quickly.

## Non-Goals (v1 / YAGNI)

- No authentication or multi-user support.
- No cloud deployment of Claudable itself.
- No database — a JSON file is the only persistent store.
- No direct file editing in the UI (Claude performs all edits).
- No per-repo git policy toggles — global policy: always commit, push if remote.
- No Agent SDK / API-key path — CLI only, to stay on the Pro subscription.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Claude invocation | Shell out to `claude` CLI in headless streaming mode | Uses Pro subscription auth; matches "run Claude Code locally"; supports multi-turn via session resume |
| Preview | Per-repo run command with framework auto-detect | Zero-config for common stacks, override for the rest |
| Repo registry | UI add, persisted to `data/projects.json` | `.env` holds only global secrets/settings; per-repo metadata needs structure |
| Add repo | Local path **or** clone from GitHub URL | Smooth "switch GitHub repository" experience |
| Git flow | Always add+commit; push if `origin` exists | Lovable-like auto-push without breaking remote-less repos |
| Supabase | Write Supabase MCP into project `.mcp.json` + status panel | In-page DB integration with no bespoke Supabase code |

## Architecture

Monorepo with two apps and a shared type contract. The backend is the only component
that touches the filesystem, child processes, and git. The frontend is a pure client
(REST for CRUD, WebSocket for live streams).

```
claudable/
├── frontend/                 # React + TypeScript + Vite (Lovable-style UI)
├── backend/                  # Node + Express + ws (orchestration)
├── shared/                   # Shared TS types: WebSocket event + REST contracts
├── data/                     # projects.json (gitignored) — registered repos + settings
├── .env.example              # documented global settings/secrets
├── .mcp.json.example         # example MCP servers (Supabase, etc.)
├── docker-compose.yml        # optional
├── Dockerfile                # optional
├── package.json              # root scripts: `npm run dev` runs both apps
└── README.md
```

### How a chat turn flows (the Lovable-style multi-turn loop)

1. User types in the center chat → `POST /api/projects/:id/message`.
2. `claudeRunner` spawns:
   `claude -p "<prompt>" --output-format stream-json --verbose --permission-mode acceptEdits`
   (and `--resume <session_id>` on follow-up turns) in the project directory.
3. The CLI streams JSON events (assistant text, tool calls, file edits, final result).
   `claudeRunner` parses them line-by-line and emits normalized events.
4. `wsHub` relays each event to subscribers for that `projectId`; the frontend renders
   streaming assistant bubbles + tool/edit activity, and mirrors the raw stream to the
   bottom terminal panel.
5. The final `result` event carries a `session_id`, stored per-project for the next turn.
6. On success (exit 0, no error result): `gitService.add()` → `commit()` →
   `push()` if `origin` exists. Results stream to the terminal. On failure, **no commit**.
7. The live preview's dev server picks up the file changes via HMR.

## Backend Components

Each module is a single file with one responsibility and a small, explicit interface.

- **`projectStore`** — load/save `data/projects.json`; CRUD on registered repos and
  per-project settings (run command override, last `session_id`, Supabase ref).
- **`claudeRunner`** — spawn the `claude` CLI, parse `stream-json` output line-by-line
  into normalized events, manage session resume, report success/failure.
- **`gitService`** — `clone(url)`, `add`, `commit(message)`, `push` (only if `origin`
  exists), and status helpers. Returns structured results; never throws on push failure.
- **`previewManager`** — detect framework from `package.json` (Vite / Next / CRA),
  choose a default run command (overridable), spawn one dev server per project, track
  its port + logs, expose the iframe URL, and stop/restart on demand.
- **`mcpService`** — read/write a project's `.mcp.json`; "Connect Supabase" injects the
  Supabase MCP server entry (token sourced from `.env`); report connection status.
- **`wsHub`** — WebSocket server; routes events to subscribers keyed by `projectId`.
  Channels: `claude`, `terminal`, `preview`.
- **`routes/`** — REST endpoints (projects CRUD, add/clone repo, start/stop preview,
  send message, connect Supabase).
- **`index.ts`** — Express + ws bootstrap; loads `.env`.

## Frontend

Single-page app with a persistent shell and four regions:

- **Left sidebar** — project switcher: list of registered repos, "Add repo" (local path
  **or** GitHub URL → clone), select active project, per-project settings (run command,
  Supabase status).
- **Center** — chat: message history, streaming assistant bubbles, tool/edit activity,
  input box.
- **Right** — live preview: `<iframe>` to the dev-server URL with start/stop + reload;
  shows detection prompt if no run command is known.
- **Bottom** — collapsible terminal/log panel, tabbed: Claude stream, dev-server logs,
  git output.

State via React context plus a typed WebSocket client hook (`useProjectStream`) that
subscribes per active project and auto-reconnects.

## Supabase Integration (v1: MCP config + status panel)

- `.env` holds `SUPABASE_ACCESS_TOKEN` (and optional default project ref).
- Per project, a **"Connect Supabase"** action calls `mcpService` to write the Supabase
  MCP server into that project's `.mcp.json`.
- A small **status panel** in the sidebar shows connection state (connected / project
  ref / not configured).
- All actual DB work (migrations, queries, schema) is done by Claude through chat, using
  the now-available Supabase MCP tools — exactly like Lovable's integration.

## Error Handling

- **CLI missing / not authed** → clear actionable error in chat + terminal; run marked
  failed; **no commit**.
- **Git push fails** (auth / no upstream) → surfaced in terminal; run still counts as
  success (local commit kept).
- **Framework not detected** → preview prompts the user for a run command instead of
  guessing.
- **WebSocket drop** → frontend auto-reconnects and re-subscribes for the active project.
- **Supabase token missing** → "Connect Supabase" shows a guided error pointing to `.env`.

## Testing

- Backend unit tests (Vitest):
  - `projectStore` — CRUD round-trips against a temp JSON file.
  - `gitService` — operations against a temp git repo (commit, push-skip when no remote).
  - `claudeRunner` stream parser — against **recorded `stream-json` fixtures**, so CI
    needs no real CLI or network.
  - `mcpService` — `.mcp.json` write/merge correctness.
- No live-CLI or live-Supabase calls in CI.

## Contributor Experience

- Root `package.json` with `npm run dev` running both apps via `concurrently`.
- Heavily commented `.env.example` and `.mcp.json.example`.
- Flat module layout, no DB, no framework magic.
- README covers: prerequisites (Node, `claude` CLI installed + logged in), recommended
  MCP servers (Supabase core; Playwright/Chrome DevTools and Context7 optional), setup
  steps, and a curated **starter prompt** demonstrating the Lovable-style flow
  (e.g. *"Create a Vite + React todo app in this repo, set up Supabase for persistence,
  and commit when done."*).
- Optional Docker via `docker-compose.yml`.

## Open Questions

None blocking. Future follow-ups: per-repo git toggles, in-UI file browser, deploy
targets, more MCP integrations.
