# Claudable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, open-source Lovable alternative ("Claudable") that drives the local `claude` CLI inside a selected repository from a web UI, streams output live, auto-commits/pushes, and can wire Supabase via MCP.

**Architecture:** A monorepo with a TypeScript **backend** (Express + `ws`) that owns all filesystem/process/git work, a React + Vite **frontend** that is a pure client (REST for CRUD, WebSocket for streams), and a **shared** package of TypeScript types forming the contract between them. No database — a single `data/projects.json` file is the store.

**Tech Stack:** Node 20+, TypeScript, Express, `ws`, `execa`, `tsx` (dev), Vitest (backend tests), React 18, Vite, `concurrently`. Requires the user's local `claude` CLI (logged in via Claude Pro) on `PATH`.

---

## File Structure

```
claudable/
├── package.json                      # root scripts (dev/build/test) via concurrently
├── tsconfig.base.json                # shared compiler options
├── .env.example                      # documented global settings
├── .mcp.json.example                 # example MCP servers (Supabase)
├── .gitignore                        # (already exists)
├── Dockerfile                        # optional
├── docker-compose.yml                # optional
├── README.md
├── shared/
│   ├── package.json
│   └── types.ts                      # WS + REST contract types
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── index.ts                  # Express + ws bootstrap
│       ├── config.ts                 # reads .env into a typed object
│       ├── projectStore.ts           # CRUD over data/projects.json
│       ├── gitService.ts             # clone/add/commit/push/status
│       ├── claudeRunner.ts           # spawn claude CLI + stream parser
│       ├── previewManager.ts         # framework detect + dev server
│       ├── mcpService.ts             # per-project .mcp.json management
│       ├── wsHub.ts                  # WebSocket pub/sub by projectId
│       └── routes.ts                 # REST endpoints
│       └── __tests__/
│           ├── projectStore.test.ts
│           ├── gitService.test.ts
│           ├── claudeRunner.test.ts
│           ├── previewManager.test.ts
│           └── mcpService.test.ts
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx                   # layout shell (4 regions)
        ├── api.ts                    # REST client
        ├── useProjectStream.ts       # WS client hook
        ├── store.tsx                 # React context state
        ├── styles.css                # Lovable-style theme
        └── components/
            ├── Sidebar.tsx
            ├── Chat.tsx
            ├── Preview.tsx
            └── Terminal.tsx
```

---

## Phase 0 — Monorepo Scaffolding

### Task 0.1: Root workspace + tooling

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.env.example`, `.mcp.json.example`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "claudable",
  "private": true,
  "version": "0.1.0",
  "workspaces": ["shared", "backend", "frontend"],
  "scripts": {
    "dev": "concurrently -n backend,frontend -c blue,magenta \"npm run dev -w backend\" \"npm run dev -w frontend\"",
    "build": "npm run build -w backend && npm run build -w frontend",
    "test": "npm run test -w backend"
  },
  "devDependencies": {
    "concurrently": "^9.1.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 3: Create `.env.example`**

```bash
# Port the Claudable backend listens on
PORT=4000

# Permission mode passed to the claude CLI for autonomous edits.
# acceptEdits = auto-accept file edits but still safe; bypassPermissions = fully unattended.
CLAUDE_PERMISSION_MODE=acceptEdits

# Optional: explicit path to the claude binary (defaults to "claude" on PATH)
CLAUDE_BIN=claude

# Supabase personal access token, used when you click "Connect Supabase".
# Create one at https://supabase.com/dashboard/account/tokens
SUPABASE_ACCESS_TOKEN=

# Git identity used for auto-commits (falls back to your global git config)
GIT_AUTHOR_NAME=Claudable
GIT_AUTHOR_EMAIL=claudable@localhost
```

- [ ] **Step 4: Create `.mcp.json.example`**

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest"],
      "env": { "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}" }
    }
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.base.json .env.example .mcp.json.example
git commit -m "chore: root workspace scaffolding"
```

---

## Phase 1 — Shared Contract

### Task 1.1: Shared types package

**Files:**
- Create: `shared/package.json`, `shared/types.ts`

- [ ] **Step 1: Create `shared/package.json`**

```json
{
  "name": "@claudable/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "types.ts",
  "types": "types.ts"
}
```

- [ ] **Step 2: Create `shared/types.ts`**

```ts
export type ProjectId = string;

export interface ProjectSettings {
  /** Override the auto-detected dev command, e.g. "npm run dev". */
  runCommand?: string;
  /** Override the auto-detected dev-server port. */
  port?: number;
}

export interface Project {
  id: ProjectId;
  name: string;
  /** Absolute path on disk. */
  path: string;
  /** Last claude CLI session id, used to resume the conversation. */
  sessionId?: string;
  /** Connected Supabase project ref, if any. */
  supabaseRef?: string;
  settings: ProjectSettings;
}

/** Normalized events produced by parsing the claude CLI stream-json output. */
export type ClaudeEvent =
  | { type: 'assistant'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'tool_result'; text: string }
  | { type: 'result'; success: boolean; sessionId?: string }
  | { type: 'error'; message: string };

export interface PreviewStatus {
  running: boolean;
  url?: string;
  port?: number;
}

export type TerminalSource = 'claude' | 'preview' | 'git';

/** Messages the server pushes to the browser over WebSocket. */
export type WsServerMessage =
  | { channel: 'claude'; projectId: ProjectId; event: ClaudeEvent }
  | { channel: 'terminal'; projectId: ProjectId; source: TerminalSource; line: string }
  | { channel: 'preview'; projectId: ProjectId; status: PreviewStatus };

/** Messages the browser sends to the server over WebSocket. */
export type WsClientMessage =
  | { type: 'subscribe'; projectId: ProjectId }
  | { type: 'unsubscribe'; projectId: ProjectId };

/** REST: request body for adding a project. */
export interface AddProjectRequest {
  /** Provide either an existing local path... */
  path?: string;
  /** ...or a GitHub URL to clone. */
  gitUrl?: string;
  /** Optional display name (defaults to the folder/repo name). */
  name?: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add shared
git commit -m "feat(shared): WS and REST contract types"
```

---

## Phase 2 — Backend Core Modules (TDD)

### Task 2.1: Backend package + config

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/vitest.config.ts`, `backend/src/config.ts`

- [ ] **Step 1: Create `backend/package.json`**

```json
{
  "name": "@claudable/backend",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@claudable/shared": "*",
    "dotenv": "^16.4.5",
    "execa": "^9.5.0",
    "express": "^4.21.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "@types/ws": "^8.5.12",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `backend/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "..",
    "types": ["node"]
  },
  "include": ["src/**/*", "../shared/**/*"]
}
```

- [ ] **Step 3: Create `backend/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 4: Create `backend/src/config.ts`**

```ts
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from the repo root regardless of cwd.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });

export const config = {
  repoRoot,
  port: Number(process.env.PORT ?? 4000),
  claudeBin: process.env.CLAUDE_BIN ?? 'claude',
  permissionMode: process.env.CLAUDE_PERMISSION_MODE ?? 'acceptEdits',
  supabaseToken: process.env.SUPABASE_ACCESS_TOKEN ?? '',
  gitAuthorName: process.env.GIT_AUTHOR_NAME ?? 'Claudable',
  gitAuthorEmail: process.env.GIT_AUTHOR_EMAIL ?? 'claudable@localhost',
  dataDir: path.join(repoRoot, 'data'),
  projectsFile: path.join(repoRoot, 'data', 'projects.json'),
};
```

- [ ] **Step 5: Install and commit**

```bash
npm install
git add backend/package.json backend/tsconfig.json backend/vitest.config.ts backend/src/config.ts package-lock.json
git commit -m "chore(backend): package, tsconfig, config loader"
```

---

### Task 2.2: projectStore (TDD)

**Files:**
- Create: `backend/src/projectStore.ts`
- Test: `backend/src/__tests__/projectStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectStore } from '../projectStore.js';

async function tmpFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'claudable-'));
  return path.join(dir, 'projects.json');
}

describe('ProjectStore', () => {
  let file: string;
  beforeEach(async () => { file = await tmpFile(); });

  it('starts empty when no file exists', async () => {
    const store = new ProjectStore(file);
    await store.load();
    expect(store.list()).toEqual([]);
  });

  it('adds, persists, and reloads a project', async () => {
    const store = new ProjectStore(file);
    await store.load();
    const p = await store.add({ name: 'demo', path: '/tmp/demo' });
    expect(p.id).toBeTruthy();
    expect(p.settings).toEqual({});

    const store2 = new ProjectStore(file);
    await store2.load();
    expect(store2.list()).toHaveLength(1);
    expect(store2.get(p.id)?.name).toBe('demo');
  });

  it('updates a project and removes it', async () => {
    const store = new ProjectStore(file);
    await store.load();
    const p = await store.add({ name: 'demo', path: '/tmp/demo' });
    await store.update(p.id, { sessionId: 'abc' });
    expect(store.get(p.id)?.sessionId).toBe('abc');
    await store.remove(p.id);
    expect(store.list()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w backend -- projectStore`
Expected: FAIL — cannot find module `../projectStore.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Project } from '@claudable/shared/types.js';

export class ProjectStore {
  private projects: Project[] = [];
  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      this.projects = JSON.parse(raw) as Project[];
    } catch (err: any) {
      if (err.code === 'ENOENT') this.projects = [];
      else throw err;
    }
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(this.projects, null, 2));
  }

  list(): Project[] { return [...this.projects]; }
  get(id: string): Project | undefined { return this.projects.find((p) => p.id === id); }

  async add(input: { name: string; path: string }): Promise<Project> {
    const project: Project = {
      id: randomUUID(),
      name: input.name,
      path: input.path,
      settings: {},
    };
    this.projects.push(project);
    await this.persist();
    return project;
  }

  async update(id: string, patch: Partial<Omit<Project, 'id'>>): Promise<Project> {
    const project = this.get(id);
    if (!project) throw new Error(`Unknown project: ${id}`);
    Object.assign(project, patch);
    await this.persist();
    return project;
  }

  async remove(id: string): Promise<void> {
    this.projects = this.projects.filter((p) => p.id !== id);
    await this.persist();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w backend -- projectStore`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/projectStore.ts backend/src/__tests__/projectStore.test.ts
git commit -m "feat(backend): projectStore with JSON persistence"
```

---

### Task 2.3: claudeRunner stream parser (TDD)

The parser is the pure, testable core. Spawning the real CLI is wired separately and verified manually.

**Files:**
- Create: `backend/src/claudeRunner.ts`
- Test: `backend/src/__tests__/claudeRunner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseStreamLine } from '../claudeRunner.js';

describe('parseStreamLine', () => {
  it('ignores blank and non-JSON lines', () => {
    expect(parseStreamLine('')).toEqual([]);
    expect(parseStreamLine('not json')).toEqual([]);
  });

  it('extracts assistant text and tool_use blocks', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [
        { type: 'text', text: 'Hello' },
        { type: 'tool_use', name: 'Edit', input: { file: 'a.ts' } },
      ] },
    });
    expect(parseStreamLine(line)).toEqual([
      { type: 'assistant', text: 'Hello' },
      { type: 'tool_use', name: 'Edit', input: { file: 'a.ts' } },
    ]);
  });

  it('extracts tool_result text from user messages', () => {
    const line = JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_result', content: 'done' }] },
    });
    expect(parseStreamLine(line)).toEqual([{ type: 'tool_result', text: 'done' }]);
  });

  it('maps a successful result with session id', () => {
    const line = JSON.stringify({
      type: 'result', subtype: 'success', is_error: false, session_id: 'sess-1',
    });
    expect(parseStreamLine(line)).toEqual([
      { type: 'result', success: true, sessionId: 'sess-1' },
    ]);
  });

  it('maps an error result', () => {
    const line = JSON.stringify({
      type: 'result', subtype: 'error_max_turns', is_error: true, session_id: 'sess-2',
    });
    expect(parseStreamLine(line)).toEqual([
      { type: 'result', success: false, sessionId: 'sess-2' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w backend -- claudeRunner`
Expected: FAIL — cannot find module `../claudeRunner.js`.

- [ ] **Step 3: Write minimal implementation (parser + runner)**

```ts
import { execa, type ExecaChildProcess } from 'execa';
import readline from 'node:readline';
import type { ClaudeEvent } from '@claudable/shared/types.js';
import { config } from './config.js';

/** Parse one line of `claude --output-format stream-json` output into events. */
export function parseStreamLine(line: string): ClaudeEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let obj: any;
  try { obj = JSON.parse(trimmed); } catch { return []; }

  switch (obj.type) {
    case 'assistant': {
      const blocks = obj.message?.content ?? [];
      const events: ClaudeEvent[] = [];
      for (const b of blocks) {
        if (b.type === 'text') events.push({ type: 'assistant', text: b.text });
        else if (b.type === 'tool_use') events.push({ type: 'tool_use', name: b.name, input: b.input });
      }
      return events;
    }
    case 'user': {
      const blocks = obj.message?.content ?? [];
      const events: ClaudeEvent[] = [];
      for (const b of blocks) {
        if (b.type === 'tool_result') {
          const text = typeof b.content === 'string'
            ? b.content
            : Array.isArray(b.content)
              ? b.content.map((c: any) => c.text ?? '').join('')
              : '';
          events.push({ type: 'tool_result', text });
        }
      }
      return events;
    }
    case 'result':
      return [{ type: 'result', success: obj.is_error === false, sessionId: obj.session_id }];
    default:
      return [];
  }
}

export interface RunHandlers {
  onEvent: (event: ClaudeEvent) => void;
  /** Raw stdout/stderr lines, for the terminal panel. */
  onLine: (line: string) => void;
}

export interface RunResult {
  success: boolean;
  sessionId?: string;
}

/**
 * Run the claude CLI in `cwd` with `prompt`. Resumes `sessionId` if provided.
 * Streams normalized events + raw lines via handlers; resolves when the run ends.
 */
export async function runClaude(
  opts: { cwd: string; prompt: string; sessionId?: string },
  handlers: RunHandlers,
): Promise<RunResult> {
  const args = [
    '-p', opts.prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', config.permissionMode,
  ];
  if (opts.sessionId) args.push('--resume', opts.sessionId);

  let child: ExecaChildProcess;
  try {
    child = execa(config.claudeBin, args, { cwd: opts.cwd, reject: false });
  } catch (err: any) {
    handlers.onEvent({ type: 'error', message: `Failed to start claude: ${err.message}` });
    return { success: false };
  }

  let result: RunResult = { success: false };
  const rl = readline.createInterface({ input: child.stdout! });
  rl.on('line', (line) => {
    handlers.onLine(line);
    for (const event of parseStreamLine(line)) {
      handlers.onEvent(event);
      if (event.type === 'result') result = { success: event.success, sessionId: event.sessionId };
    }
  });
  child.stderr?.on('data', (d) => handlers.onLine(String(d)));

  const exit = await child;
  if (exit.exitCode !== 0 && !result.sessionId) {
    handlers.onEvent({
      type: 'error',
      message: exit.exitCode === 127
        ? `claude CLI not found. Install it and ensure it is on PATH.`
        : `claude exited with code ${exit.exitCode}`,
    });
    return { success: false };
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w backend -- claudeRunner`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/claudeRunner.ts backend/src/__tests__/claudeRunner.test.ts
git commit -m "feat(backend): claude CLI runner and stream-json parser"
```

---

### Task 2.4: gitService (TDD)

**Files:**
- Create: `backend/src/gitService.ts`
- Test: `backend/src/__tests__/gitService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GitService } from '../gitService.js';

async function tmpRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'claudable-git-'));
  await execa('git', ['init', '-q'], { cwd: dir });
  await execa('git', ['config', 'user.email', 't@t.com'], { cwd: dir });
  await execa('git', ['config', 'user.name', 'Test'], { cwd: dir });
  return dir;
}

describe('GitService', () => {
  let dir: string;
  beforeEach(async () => { dir = await tmpRepo(); });

  it('commits staged changes and reports the commit', async () => {
    await fs.writeFile(path.join(dir, 'a.txt'), 'hi');
    const git = new GitService();
    const res = await git.commitAll(dir, 'add a');
    expect(res.committed).toBe(true);
    const log = await execa('git', ['log', '--oneline'], { cwd: dir });
    expect(log.stdout).toContain('add a');
  });

  it('reports nothing to commit on a clean tree', async () => {
    const git = new GitService();
    const res = await git.commitAll(dir, 'noop');
    expect(res.committed).toBe(false);
  });

  it('skips push when there is no origin remote', async () => {
    await fs.writeFile(path.join(dir, 'a.txt'), 'hi');
    const git = new GitService();
    await git.commitAll(dir, 'add a');
    const res = await git.push(dir);
    expect(res.pushed).toBe(false);
    expect(res.reason).toMatch(/no remote/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w backend -- gitService`
Expected: FAIL — cannot find module `../gitService.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { execa } from 'execa';
import { config } from './config.js';

export interface CommitResult { committed: boolean; message?: string }
export interface PushResult { pushed: boolean; reason?: string }

export class GitService {
  private env() {
    return {
      GIT_AUTHOR_NAME: config.gitAuthorName,
      GIT_AUTHOR_EMAIL: config.gitAuthorEmail,
      GIT_COMMITTER_NAME: config.gitAuthorName,
      GIT_COMMITTER_EMAIL: config.gitAuthorEmail,
    };
  }

  async clone(url: string, dest: string): Promise<void> {
    await execa('git', ['clone', url, dest]);
  }

  async hasChanges(cwd: string): Promise<boolean> {
    const { stdout } = await execa('git', ['status', '--porcelain'], { cwd });
    return stdout.trim().length > 0;
  }

  async commitAll(cwd: string, message: string): Promise<CommitResult> {
    if (!(await this.hasChanges(cwd))) return { committed: false };
    await execa('git', ['add', '-A'], { cwd });
    await execa('git', ['commit', '-m', message], { cwd, env: this.env() });
    return { committed: true, message };
  }

  private async hasOrigin(cwd: string): Promise<boolean> {
    const { stdout } = await execa('git', ['remote'], { cwd });
    return stdout.split('\n').map((s) => s.trim()).includes('origin');
  }

  async push(cwd: string): Promise<PushResult> {
    if (!(await this.hasOrigin(cwd))) return { pushed: false, reason: 'no remote configured' };
    const branch = (await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })).stdout.trim();
    const res = await execa('git', ['push', 'origin', branch], { cwd, reject: false });
    if (res.exitCode !== 0) return { pushed: false, reason: res.stderr || 'push failed' };
    return { pushed: true };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w backend -- gitService`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/gitService.ts backend/src/__tests__/gitService.test.ts
git commit -m "feat(backend): gitService clone/commit/push"
```

---

### Task 2.5: mcpService (TDD)

**Files:**
- Create: `backend/src/mcpService.ts`
- Test: `backend/src/__tests__/mcpService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { McpService } from '../mcpService.js';

async function tmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'claudable-mcp-'));
}

describe('McpService', () => {
  let dir: string;
  beforeEach(async () => { dir = await tmpDir(); });

  it('reports not connected when no .mcp.json exists', async () => {
    const svc = new McpService();
    expect(await svc.status(dir)).toEqual({ connected: false });
  });

  it('connects supabase by writing .mcp.json with the token', async () => {
    const svc = new McpService();
    await svc.connectSupabase(dir, 'tok-123');
    const raw = JSON.parse(await fs.readFile(path.join(dir, '.mcp.json'), 'utf8'));
    expect(raw.mcpServers.supabase.command).toBe('npx');
    expect(raw.mcpServers.supabase.env.SUPABASE_ACCESS_TOKEN).toBe('tok-123');
    expect(await svc.status(dir)).toEqual({ connected: true });
  });

  it('preserves existing servers when adding supabase', async () => {
    await fs.writeFile(
      path.join(dir, '.mcp.json'),
      JSON.stringify({ mcpServers: { other: { command: 'x' } } }),
    );
    const svc = new McpService();
    await svc.connectSupabase(dir, 'tok-123');
    const raw = JSON.parse(await fs.readFile(path.join(dir, '.mcp.json'), 'utf8'));
    expect(raw.mcpServers.other).toBeDefined();
    expect(raw.mcpServers.supabase).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w backend -- mcpService`
Expected: FAIL — cannot find module `../mcpService.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface McpStatus { connected: boolean }

export class McpService {
  private file(cwd: string) { return path.join(cwd, '.mcp.json'); }

  private async read(cwd: string): Promise<any> {
    try {
      return JSON.parse(await fs.readFile(this.file(cwd), 'utf8'));
    } catch (err: any) {
      if (err.code === 'ENOENT') return { mcpServers: {} };
      throw err;
    }
  }

  async status(cwd: string): Promise<McpStatus> {
    const data = await this.read(cwd);
    return { connected: Boolean(data.mcpServers?.supabase) };
  }

  async connectSupabase(cwd: string, token: string): Promise<void> {
    const data = await this.read(cwd);
    data.mcpServers ??= {};
    data.mcpServers.supabase = {
      command: 'npx',
      args: ['-y', '@supabase/mcp-server-supabase@latest'],
      env: { SUPABASE_ACCESS_TOKEN: token },
    };
    await fs.writeFile(this.file(cwd), JSON.stringify(data, null, 2));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w backend -- mcpService`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/mcpService.ts backend/src/__tests__/mcpService.test.ts
git commit -m "feat(backend): mcpService for per-project Supabase MCP"
```

---

### Task 2.6: previewManager framework detection (TDD) + server spawning

**Files:**
- Create: `backend/src/previewManager.ts`
- Test: `backend/src/__tests__/previewManager.test.ts`

- [ ] **Step 1: Write the failing test (pure detection logic)**

```ts
import { describe, it, expect } from 'vitest';
import { detectRunCommand } from '../previewManager.js';

describe('detectRunCommand', () => {
  it('detects Vite', () => {
    expect(detectRunCommand({ devDependencies: { vite: '^5' }, scripts: { dev: 'vite' } }))
      .toEqual({ command: 'npm run dev', defaultPort: 5173 });
  });

  it('detects Next.js', () => {
    expect(detectRunCommand({ dependencies: { next: '^14' }, scripts: { dev: 'next dev' } }))
      .toEqual({ command: 'npm run dev', defaultPort: 3000 });
  });

  it('detects Create React App', () => {
    expect(detectRunCommand({ dependencies: { 'react-scripts': '5' }, scripts: { start: 'react-scripts start' } }))
      .toEqual({ command: 'npm start', defaultPort: 3000 });
  });

  it('returns null when nothing recognizable', () => {
    expect(detectRunCommand({ dependencies: { lodash: '^4' } })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w backend -- previewManager`
Expected: FAIL — cannot find module `../previewManager.js`.

- [ ] **Step 3: Write minimal implementation (detection + manager)**

```ts
import { execa, type ExecaChildProcess } from 'execa';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PreviewStatus } from '@claudable/shared/types.js';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export interface DetectedRun { command: string; defaultPort: number }

/** Decide how to run a project's dev server from its package.json. */
export function detectRunCommand(pkg: PackageJson): DetectedRun | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps.vite) return { command: 'npm run dev', defaultPort: 5173 };
  if (deps.next) return { command: 'npm run dev', defaultPort: 3000 };
  if (deps['react-scripts']) return { command: 'npm start', defaultPort: 3000 };
  return null;
}

interface Running { child: ExecaChildProcess; status: PreviewStatus }

export class PreviewManager {
  private running = new Map<string, Running>();

  constructor(private readonly onLine: (projectId: string, line: string) => void) {}

  status(projectId: string): PreviewStatus {
    return this.running.get(projectId)?.status ?? { running: false };
  }

  /** Resolve the run command + port for a project (override beats detection). */
  async resolve(cwd: string, override?: { runCommand?: string; port?: number }): Promise<DetectedRun | null> {
    if (override?.runCommand) {
      return { command: override.runCommand, defaultPort: override.port ?? 5173 };
    }
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf8'));
      const detected = detectRunCommand(pkg);
      if (detected && override?.port) return { ...detected, defaultPort: override.port };
      return detected;
    } catch {
      return null;
    }
  }

  async start(
    projectId: string,
    cwd: string,
    run: DetectedRun,
  ): Promise<PreviewStatus> {
    await this.stop(projectId);
    const [cmd, ...args] = run.command.split(' ');
    const child = execa(cmd, args, { cwd, reject: false, env: { PORT: String(run.defaultPort), BROWSER: 'none' } });
    child.stdout?.on('data', (d) => this.onLine(projectId, String(d)));
    child.stderr?.on('data', (d) => this.onLine(projectId, String(d)));
    const status: PreviewStatus = {
      running: true,
      port: run.defaultPort,
      url: `http://localhost:${run.defaultPort}`,
    };
    this.running.set(projectId, { child, status });
    return status;
  }

  async stop(projectId: string): Promise<void> {
    const r = this.running.get(projectId);
    if (r) { r.child.kill('SIGTERM'); this.running.delete(projectId); }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w backend -- previewManager`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/previewManager.ts backend/src/__tests__/previewManager.test.ts
git commit -m "feat(backend): previewManager with framework detection"
```

---

## Phase 3 — Backend Server (wiring)

### Task 3.1: wsHub

**Files:**
- Create: `backend/src/wsHub.ts`

- [ ] **Step 1: Write `wsHub.ts`**

```ts
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { WsServerMessage, WsClientMessage } from '@claudable/shared/types.js';

/** Tracks which projectIds each socket is subscribed to and fans out messages. */
export class WsHub {
  private wss: WebSocketServer;
  private subs = new Map<WebSocket, Set<string>>();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (socket) => {
      this.subs.set(socket, new Set());
      socket.on('message', (raw) => {
        let msg: WsClientMessage;
        try { msg = JSON.parse(String(raw)); } catch { return; }
        const set = this.subs.get(socket)!;
        if (msg.type === 'subscribe') set.add(msg.projectId);
        else if (msg.type === 'unsubscribe') set.delete(msg.projectId);
      });
      socket.on('close', () => this.subs.delete(socket));
    });
  }

  /** Send a message to every socket subscribed to its projectId. */
  broadcast(message: WsServerMessage): void {
    const data = JSON.stringify(message);
    for (const [socket, set] of this.subs) {
      if (set.has(message.projectId) && socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/wsHub.ts
git commit -m "feat(backend): WebSocket hub with per-project subscriptions"
```

---

### Task 3.2: routes

**Files:**
- Create: `backend/src/routes.ts`

- [ ] **Step 1: Write `routes.ts`**

```ts
import { Router } from 'express';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { AddProjectRequest } from '@claudable/shared/types.js';
import { config } from './config.js';
import { ProjectStore } from './projectStore.js';
import { GitService } from './gitService.js';
import { McpService } from './mcpService.js';
import { PreviewManager } from './previewManager.js';
import { WsHub } from './wsHub.js';
import { runClaude } from './claudeRunner.js';

export function createRoutes(deps: {
  store: ProjectStore;
  git: GitService;
  mcp: McpService;
  preview: PreviewManager;
  hub: WsHub;
}): Router {
  const { store, git, mcp, preview, hub } = deps;
  const r = Router();

  // List projects (with live preview + mcp status).
  r.get('/projects', async (_req, res) => {
    const projects = store.list();
    const enriched = await Promise.all(projects.map(async (p) => ({
      ...p,
      preview: preview.status(p.id),
      supabaseConnected: (await mcp.status(p.path)).connected,
    })));
    res.json(enriched);
  });

  // Add a project: existing local path OR clone a GitHub URL.
  r.post('/projects', async (req, res) => {
    const body = req.body as AddProjectRequest;
    try {
      let projectPath: string;
      let name: string;
      if (body.gitUrl) {
        name = body.name ?? body.gitUrl.split('/').pop()!.replace(/\.git$/, '');
        projectPath = path.join(config.repoRoot, 'workspace', name);
        await fs.mkdir(path.dirname(projectPath), { recursive: true });
        await git.clone(body.gitUrl, projectPath);
      } else if (body.path) {
        projectPath = path.resolve(body.path);
        name = body.name ?? path.basename(projectPath);
      } else {
        return res.status(400).json({ error: 'Provide either path or gitUrl' });
      }
      const project = await store.add({ name, path: projectPath });
      res.status(201).json(project);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  r.delete('/projects/:id', async (req, res) => {
    await preview.stop(req.params.id);
    await store.remove(req.params.id);
    res.status(204).end();
  });

  // Send a chat message -> run claude -> auto commit/push.
  r.post('/projects/:id/message', async (req, res) => {
    const project = store.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Unknown project' });
    const prompt = String(req.body?.prompt ?? '').trim();
    if (!prompt) return res.status(400).json({ error: 'Empty prompt' });

    res.status(202).json({ accepted: true }); // run happens async, streamed over WS

    const result = await runClaude(
      { cwd: project.path, prompt, sessionId: project.sessionId },
      {
        onEvent: (event) => hub.broadcast({ channel: 'claude', projectId: project.id, event }),
        onLine: (line) => hub.broadcast({ channel: 'terminal', projectId: project.id, source: 'claude', line }),
      },
    );

    if (result.sessionId) await store.update(project.id, { sessionId: result.sessionId });

    if (result.success) {
      const commit = await git.commitAll(project.path, `Claudable: ${prompt.slice(0, 60)}`);
      hub.broadcast({ channel: 'terminal', projectId: project.id, source: 'git',
        line: commit.committed ? `Committed: ${commit.message}` : 'Nothing to commit' });
      if (commit.committed) {
        const push = await git.push(project.path);
        hub.broadcast({ channel: 'terminal', projectId: project.id, source: 'git',
          line: push.pushed ? 'Pushed to origin' : `Push skipped: ${push.reason}` });
      }
    }
  });

  // Start/stop preview.
  r.post('/projects/:id/preview/start', async (req, res) => {
    const project = store.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Unknown project' });
    const run = await preview.resolve(project.path, project.settings);
    if (!run) return res.status(422).json({ error: 'Could not detect a run command. Set one in settings.' });
    const status = await preview.start(project.id, project.path, run);
    hub.broadcast({ channel: 'preview', projectId: project.id, status });
    res.json(status);
  });

  r.post('/projects/:id/preview/stop', async (req, res) => {
    await preview.stop(req.params.id);
    const status = { running: false };
    hub.broadcast({ channel: 'preview', projectId: req.params.id, status });
    res.json(status);
  });

  // Update per-project settings (run command / port).
  r.patch('/projects/:id/settings', async (req, res) => {
    const project = store.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Unknown project' });
    const updated = await store.update(req.params.id, {
      settings: { ...project.settings, ...req.body },
    });
    res.json(updated);
  });

  // Connect Supabase via MCP.
  r.post('/projects/:id/supabase/connect', async (req, res) => {
    const project = store.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Unknown project' });
    if (!config.supabaseToken) {
      return res.status(400).json({ error: 'SUPABASE_ACCESS_TOKEN is not set in .env' });
    }
    await mcp.connectSupabase(project.path, config.supabaseToken);
    res.json({ connected: true });
  });

  return r;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes.ts
git commit -m "feat(backend): REST routes wiring all services"
```

---

### Task 3.3: index.ts bootstrap

**Files:**
- Create: `backend/src/index.ts`

- [ ] **Step 1: Write `index.ts`**

```ts
import express from 'express';
import http from 'node:http';
import { config } from './config.js';
import { ProjectStore } from './projectStore.js';
import { GitService } from './gitService.js';
import { McpService } from './mcpService.js';
import { PreviewManager } from './previewManager.js';
import { WsHub } from './wsHub.js';
import { createRoutes } from './routes.js';

async function main() {
  const app = express();
  app.use(express.json());

  const server = http.createServer(app);
  const hub = new WsHub(server);

  const store = new ProjectStore(config.projectsFile);
  await store.load();
  const git = new GitService();
  const mcp = new McpService();
  const preview = new PreviewManager((projectId, line) =>
    hub.broadcast({ channel: 'terminal', projectId, source: 'preview', line }));

  app.use('/api', createRoutes({ store, git, mcp, preview, hub }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  server.listen(config.port, () => {
    console.log(`Claudable backend listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Verify the backend boots**

Run: `npm run dev -w backend`
Expected: logs `Claudable backend listening on http://localhost:4000`.
In another shell: `curl -s localhost:4000/api/health` → `{"ok":true}`. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat(backend): Express + ws bootstrap"
```

---

## Phase 4 — Frontend Scaffold + Clients

### Task 4.1: Frontend package + Vite + entry

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`, `frontend/src/main.tsx`

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "@claudable/frontend",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@claudable/shared": "*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `frontend/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "noEmit": true
  },
  "include": ["src", "../shared"]
}
```

- [ ] **Step 3: Create `frontend/vite.config.ts`** (proxy API + WS to backend)

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      '/api': 'http://localhost:4000',
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
  },
});
```

- [ ] **Step 4: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claudable</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `frontend/src/main.tsx`**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { StoreProvider } from './store.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 6: Install and commit**

```bash
npm install
git add frontend package-lock.json
git commit -m "chore(frontend): Vite + React scaffold"
```

---

### Task 4.2: REST client + WS hook + store

**Files:**
- Create: `frontend/src/api.ts`, `frontend/src/useProjectStream.ts`, `frontend/src/store.tsx`

- [ ] **Step 1: Create `frontend/src/api.ts`**

```ts
import type { Project, AddProjectRequest, PreviewStatus } from '@claudable/shared/types.js';

export type ProjectView = Project & { preview: PreviewStatus; supabaseConnected: boolean };

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json() as Promise<T>;
}

export const api = {
  listProjects: () => fetch('/api/projects').then(json<ProjectView[]>),
  addProject: (body: AddProjectRequest) =>
    fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json<Project>),
  removeProject: (id: string) => fetch(`/api/projects/${id}`, { method: 'DELETE' }),
  sendMessage: (id: string, prompt: string) =>
    fetch(`/api/projects/${id}/message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) }),
  startPreview: (id: string) => fetch(`/api/projects/${id}/preview/start`, { method: 'POST' }).then(json<PreviewStatus>),
  stopPreview: (id: string) => fetch(`/api/projects/${id}/preview/stop`, { method: 'POST' }).then(json<PreviewStatus>),
  updateSettings: (id: string, settings: { runCommand?: string; port?: number }) =>
    fetch(`/api/projects/${id}/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }).then(json<Project>),
  connectSupabase: (id: string) => fetch(`/api/projects/${id}/supabase/connect`, { method: 'POST' }).then(json<{ connected: boolean }>),
};
```

- [ ] **Step 2: Create `frontend/src/useProjectStream.ts`** (auto-reconnecting WS)

```ts
import { useEffect, useRef } from 'react';
import type { WsServerMessage } from '@claudable/shared/types.js';

/** Subscribe to a project's live stream; calls onMessage for each event. Auto-reconnects. */
export function useProjectStream(projectId: string | null, onMessage: (msg: WsServerMessage) => void) {
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    if (!projectId) return;
    let socket: WebSocket;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${proto}://${location.host}/ws`);
      socket.onopen = () => socket.send(JSON.stringify({ type: 'subscribe', projectId }));
      socket.onmessage = (e) => cbRef.current(JSON.parse(e.data) as WsServerMessage);
      socket.onclose = () => { if (!closed) retry = setTimeout(connect, 1000); };
    };
    connect();

    return () => { closed = true; clearTimeout(retry); socket?.close(); };
  }, [projectId]);
}
```

- [ ] **Step 3: Create `frontend/src/store.tsx`** (global UI state)

```tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ClaudeEvent, PreviewStatus, WsServerMessage } from '@claudable/shared/types.js';
import { api, type ProjectView } from './api.js';
import { useProjectStream } from './useProjectStream.js';

export interface ChatMessage { role: 'user' | 'assistant'; text: string }
export interface TerminalLine { source: string; line: string }

interface StoreState {
  projects: ProjectView[];
  activeId: string | null;
  active: ProjectView | null;
  chat: ChatMessage[];
  terminal: TerminalLine[];
  preview: PreviewStatus;
  refresh: () => Promise<void>;
  select: (id: string) => void;
  send: (prompt: string) => Promise<void>;
}

const Ctx = createContext<StoreState | null>(null);
export const useStore = () => { const c = useContext(Ctx); if (!c) throw new Error('no store'); return c; };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [terminal, setTerminal] = useState<TerminalLine[]>([]);
  const [preview, setPreview] = useState<PreviewStatus>({ running: false });

  const refresh = useCallback(async () => {
    const list = await api.listProjects();
    setProjects(list);
    setActiveId((cur) => cur ?? list[0]?.id ?? null);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const active = projects.find((p) => p.id === activeId) ?? null;
  useEffect(() => { setPreview(active?.preview ?? { running: false }); }, [activeId]);

  const select = useCallback((id: string) => {
    setActiveId(id); setChat([]); setTerminal([]);
  }, []);

  const handleMessage = useCallback((msg: WsServerMessage) => {
    if (msg.channel === 'claude') {
      const ev: ClaudeEvent = msg.event;
      if (ev.type === 'assistant') setChat((c) => [...c, { role: 'assistant', text: ev.text }]);
      else if (ev.type === 'tool_use') setChat((c) => [...c, { role: 'assistant', text: `🔧 ${ev.name}` }]);
      else if (ev.type === 'error') setChat((c) => [...c, { role: 'assistant', text: `⚠️ ${ev.message}` }]);
    } else if (msg.channel === 'terminal') {
      setTerminal((t) => [...t, { source: msg.source, line: msg.line }]);
    } else if (msg.channel === 'preview') {
      setPreview(msg.status);
    }
  }, []);

  useProjectStream(activeId, handleMessage);

  const send = useCallback(async (prompt: string) => {
    if (!activeId) return;
    setChat((c) => [...c, { role: 'user', text: prompt }]);
    await api.sendMessage(activeId, prompt);
  }, [activeId]);

  return (
    <Ctx.Provider value={{ projects, activeId, active, chat, terminal, preview, refresh, select, send }}>
      {children}
    </Ctx.Provider>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.ts frontend/src/useProjectStream.ts frontend/src/store.tsx
git commit -m "feat(frontend): REST client, WS hook, global store"
```

---

## Phase 5 — Frontend UI Regions

### Task 5.1: Layout shell + styles

**Files:**
- Create: `frontend/src/App.tsx`, `frontend/src/styles.css`

- [ ] **Step 1: Create `frontend/src/App.tsx`**

```tsx
import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { Chat } from './components/Chat.js';
import { Preview } from './components/Preview.js';
import { Terminal } from './components/Terminal.js';

export function App() {
  const [terminalOpen, setTerminalOpen] = useState(true);
  return (
    <div className="app">
      <Sidebar />
      <div className="center">
        <div className="workspace">
          <Chat />
          <Preview />
        </div>
        <Terminal open={terminalOpen} onToggle={() => setTerminalOpen((v) => !v)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/styles.css`** (Lovable-inspired dark theme)

```css
:root {
  --bg: #0e0e11; --panel: #16161b; --border: #26262e;
  --text: #e7e7ea; --muted: #9a9aa6; --accent: #ff6b4a; --accent2: #7c5cff;
}
* { box-sizing: border-box; }
body, html, #root { margin: 0; height: 100%; }
body { background: var(--bg); color: var(--text); font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
.app { display: grid; grid-template-columns: 240px 1fr; height: 100vh; }
.center { display: flex; flex-direction: column; min-width: 0; }
.workspace { display: grid; grid-template-columns: 1fr 1fr; flex: 1; min-height: 0; }

.sidebar { background: var(--panel); border-right: 1px solid var(--border); padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.sidebar h1 { font-size: 16px; margin: 4px 0 12px; }
.sidebar h1 span { background: linear-gradient(90deg, var(--accent), var(--accent2)); -webkit-background-clip: text; color: transparent; }
.project { padding: 8px 10px; border-radius: 8px; cursor: pointer; color: var(--muted); }
.project:hover { background: #1d1d24; }
.project.active { background: #20202a; color: var(--text); }
.badge { font-size: 11px; color: var(--accent2); }

.btn { background: var(--accent); color: #fff; border: 0; border-radius: 8px; padding: 8px 10px; cursor: pointer; font-weight: 600; }
.btn.secondary { background: #23232c; color: var(--text); }
.input { background: #1b1b22; border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 8px 10px; width: 100%; }

.chat { display: flex; flex-direction: column; border-right: 1px solid var(--border); min-height: 0; }
.messages { flex: 1; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.msg { padding: 10px 12px; border-radius: 10px; max-width: 85%; white-space: pre-wrap; }
.msg.user { align-self: flex-end; background: var(--accent2); color: #fff; }
.msg.assistant { align-self: flex-start; background: #1c1c24; }
.composer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--border); }

.preview { display: flex; flex-direction: column; min-height: 0; }
.preview .bar { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--border); }
.preview iframe { flex: 1; border: 0; background: #fff; }
.preview .empty { flex: 1; display: grid; place-items: center; color: var(--muted); }

.terminal { background: #0b0b0e; border-top: 1px solid var(--border); }
.terminal .tabs { display: flex; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--border); }
.terminal .tab { padding: 4px 10px; border-radius: 6px; cursor: pointer; color: var(--muted); font-size: 12px; }
.terminal .tab.active { background: #1c1c24; color: var(--text); }
.terminal .lines { height: 180px; overflow: auto; padding: 8px 12px; font-family: ui-monospace, monospace; font-size: 12px; }
.terminal.closed .lines { display: none; }
.line.git { color: #6be29a; } .line.preview { color: #6bb6ff; } .line.claude { color: var(--muted); }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx frontend/src/styles.css
git commit -m "feat(frontend): layout shell and theme"
```

---

### Task 5.2: Sidebar (project switcher + add + supabase status)

**Files:**
- Create: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Write `Sidebar.tsx`**

```tsx
import React, { useState } from 'react';
import { useStore } from '../store.js';
import { api } from '../api.js';

export function Sidebar() {
  const { projects, activeId, active, select, refresh } = useStore();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');

  const add = async () => {
    const v = value.trim();
    if (!v) return;
    const body = v.startsWith('http') || v.endsWith('.git') ? { gitUrl: v } : { path: v };
    await api.addProject(body);
    setValue(''); setAdding(false);
    await refresh();
  };

  const connectSupabase = async () => {
    if (!activeId) return;
    await api.connectSupabase(activeId);
    await refresh();
  };

  return (
    <aside className="sidebar">
      <h1><span>Claudable</span></h1>
      {projects.map((p) => (
        <div key={p.id} className={`project ${p.id === activeId ? 'active' : ''}`} onClick={() => select(p.id)}>
          {p.name}
          {p.supabaseConnected && <div className="badge">supabase ✓</div>}
        </div>
      ))}
      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input className="input" autoFocus placeholder="local path or GitHub URL"
            value={value} onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn" onClick={add}>Add</button>
        </div>
      ) : (
        <button className="btn secondary" onClick={() => setAdding(true)}>+ Add repo</button>
      )}
      <div style={{ flex: 1 }} />
      {active && (
        <button className="btn secondary" onClick={connectSupabase}>
          {active.supabaseConnected ? 'Supabase connected ✓' : 'Connect Supabase'}
        </button>
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat(frontend): sidebar project switcher + supabase connect"
```

---

### Task 5.3: Chat

**Files:**
- Create: `frontend/src/components/Chat.tsx`

- [ ] **Step 1: Write `Chat.tsx`**

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store.js';

export function Chat() {
  const { chat, send, active } = useStore();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  const submit = async () => {
    const t = text.trim();
    if (!t || !active) return;
    setText('');
    await send(t);
  };

  return (
    <section className="chat">
      <div className="messages">
        {!active && <div className="msg assistant">Add a repo to start building.</div>}
        {chat.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.text}</div>)}
        <div ref={endRef} />
      </div>
      <div className="composer">
        <input className="input" placeholder={active ? 'Ask Claude to build something…' : 'Select a project'}
          value={text} disabled={!active}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <button className="btn" onClick={submit} disabled={!active}>Send</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Chat.tsx
git commit -m "feat(frontend): chat panel with live streaming"
```

---

### Task 5.4: Preview

**Files:**
- Create: `frontend/src/components/Preview.tsx`

- [ ] **Step 1: Write `Preview.tsx`**

```tsx
import React, { useState } from 'react';
import { useStore } from '../store.js';
import { api } from '../api.js';

export function Preview() {
  const { active, preview } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0); // force iframe reload

  const start = async () => {
    if (!active) return;
    setError(null);
    try { await api.startPreview(active.id); } catch (e: any) { setError(e.message); }
  };
  const stop = async () => { if (active) await api.stopPreview(active.id); };

  return (
    <section className="preview">
      <div className="bar">
        {preview.running
          ? <button className="btn secondary" onClick={stop}>Stop</button>
          : <button className="btn secondary" onClick={start} disabled={!active}>Run</button>}
        <button className="btn secondary" onClick={() => setNonce((n) => n + 1)} disabled={!preview.running}>Reload</button>
        <span style={{ color: 'var(--muted)' }}>{preview.url ?? 'preview not running'}</span>
      </div>
      {preview.running && preview.url
        ? <iframe key={nonce} src={preview.url} title="preview" />
        : <div className="empty">{error ?? 'Run the app to see a live preview'}</div>}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Preview.tsx
git commit -m "feat(frontend): live preview panel"
```

---

### Task 5.5: Terminal

**Files:**
- Create: `frontend/src/components/Terminal.tsx`

- [ ] **Step 1: Write `Terminal.tsx`**

```tsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useStore } from '../store.js';

const TABS = ['claude', 'preview', 'git'] as const;
type Tab = (typeof TABS)[number];

export function Terminal({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { terminal } = useStore();
  const [tab, setTab] = useState<Tab>('claude');
  const endRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => terminal.filter((l) => l.source === tab), [terminal, tab]);
  useEffect(() => { endRef.current?.scrollIntoView(); }, [lines, open]);

  return (
    <div className={`terminal ${open ? '' : 'closed'}`}>
      <div className="tabs">
        {TABS.map((t) => (
          <div key={t} className={`tab ${t === tab ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</div>
        ))}
        <div style={{ flex: 1 }} />
        <div className="tab" onClick={onToggle}>{open ? '▾' : '▸'}</div>
      </div>
      <div className="lines">
        {lines.map((l, i) => <div key={i} className={`line ${l.source}`}>{l.line}</div>)}
        <div ref={endRef} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Full-stack manual verification**

Run both apps: `npm run dev` (from repo root).
1. Open `http://localhost:5180`.
2. Click **+ Add repo**, enter an absolute path to a small local Vite project, Add.
3. Select it, type *"Add a heading that says Hello Claudable to the home page"*, Send.
4. Expected: assistant text + 🔧 tool lines stream into the chat; raw lines appear under the **claude** terminal tab; on completion a **git** line shows `Committed: …`.
5. Click **Run** in the preview → app loads in the iframe; click **Reload** to see the change.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Terminal.tsx
git commit -m "feat(frontend): terminal/log panel with tabs"
```

---

## Phase 6 — Docs, Docker, Polish

### Task 6.1: README + starter prompt

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with quick start and starter prompt"
```

---

### Task 6.2: Optional Docker

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`

- [ ] **Step 1: Write `Dockerfile`**

```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm install
COPY . .
RUN npm run build
EXPOSE 4000 5180
CMD ["npm", "run", "dev"]
```

> Note in the README: the `claude` CLI and your login are **not** baked into the image;
> Docker is provided for the web app only. For full functionality run Claudable on the host.

- [ ] **Step 2: Write `docker-compose.yml`**

```yaml
services:
  claudable:
    build: .
    ports: ["4000:4000", "5180:5180"]
    volumes:
      - ./data:/app/data
      - ${WORKSPACE:-./workspace}:/app/workspace
    env_file: .env
```

- [ ] **Step 3: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "chore: optional Docker support"
```

---

### Task 6.3: Final verification

- [ ] **Step 1: Run the full backend test suite**

Run: `npm test`
Expected: all suites pass (projectStore, claudeRunner, gitService, mcpService, previewManager).

- [ ] **Step 2: Type-check frontend**

Run: `npm run build -w frontend`
Expected: builds with no type errors.

- [ ] **Step 3: End-to-end smoke (from Task 5.5 Step 2)** — confirm chat → edit → commit → preview works against a real local repo with your `claude` CLI.

- [ ] **Step 4: Final commit (if any polish changed)**

```bash
git add -A
git commit -m "chore: final verification polish"
```

---

## Self-Review Notes (coverage vs. spec)

- Project switcher / chat / preview / terminal → Tasks 5.1–5.5. ✅
- Run `claude` CLI in selected repo + stream over WS → Tasks 2.3, 3.2, 3.3, 4.2. ✅
- Pro-plan (CLI, no API key) → claudeRunner uses `claude` binary only. ✅
- Multiple local repos, JSON store → Task 2.2, 3.2. ✅
- Add via local path OR GitHub clone → Task 2.4 (`clone`), 3.2, 5.2. ✅
- Auto add/commit, push-if-remote → Task 2.4, 3.2. ✅
- Supabase MCP + status panel → Tasks 2.5, 3.2, 5.2. ✅
- Settings in `.env` → Task 0.1, 2.1. ✅
- Error handling (CLI missing, push fail, no detect, WS reconnect) → claudeRunner/gitService/previewManager/useProjectStream. ✅
- Backend tests, no live CLI/Supabase in CI → Phase 2 tests use temp dirs + fixtures. ✅
- Docker optional → Task 6.2. ✅
