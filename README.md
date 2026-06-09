# Claudable

A tiny, local, open-source [Lovable](https://lovable.dev) — powered by your own **Claude Code**.
Chat to build apps, see a live preview, and let Claude auto-commit & push. Runs entirely on localhost.

## Prerequisites
- Node.js 20+
- The Claude Code CLI installed and logged in (`claude` on your PATH). A **Claude Pro** plan works — Claudable uses your CLI login, not an API key.
- `git` (and, for auto-push, a configured GitHub remote + credentials).

## Quick start
```bash
git clone <this-repo> && cd claudable
cp .env.example .env        # fill in SUPABASE_ACCESS_TOKEN if you want Supabase
npm install
npm run dev                 # backend :4000, frontend :5180
```
Open http://localhost:5180.

## Using it
1. **+ Add repo** — paste an absolute local path, or a GitHub URL to clone.
2. **Chat** — describe what to build. Claude edits the repo; output streams live.
3. **Run** — start the dev server; the app appears in the preview pane.
4. Successful changes are auto-committed and pushed to `origin` if a remote exists.

### A good first prompt
> Create a Vite + React todo app in this repo with add/complete/delete,
> persist tasks with Supabase, then commit when done.

## Supabase
Set `SUPABASE_ACCESS_TOKEN` in `.env`, then click **Connect Supabase** on a project.
Claudable writes the Supabase MCP server into the project's `.mcp.json`, so your next
chat run can manage the database directly.

## Recommended MCP servers
- **Supabase** (core, for DB) — wired automatically by "Connect Supabase".
- **Playwright** or **Chrome DevTools** (optional) — let Claude test the preview.
- **Context7** (optional) — up-to-date library docs while editing.

## Architecture
- `backend/` — Express + ws; owns filesystem, the `claude` CLI, git, and previews.
- `frontend/` — React + Vite; pure client (REST + WebSocket).
- `shared/` — TypeScript contract types.
- `data/projects.json` — the only persistent store (gitignored).

## Tests
```bash
npm test     # backend unit tests (Vitest)
```
