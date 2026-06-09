import { execa, type ResultPromise } from 'execa';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import type { PreviewStatus } from '@claudable/shared/types.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolve true once something is listening on the given localhost port. */
export function probePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
  });
}

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

/** True when the project has a package.json but no installed node_modules. */
export async function needsInstall(cwd: string): Promise<boolean> {
  try { await fs.access(path.join(cwd, 'package.json')); } catch { return false; }
  try { await fs.access(path.join(cwd, 'node_modules')); return false; } catch { return true; }
}

/** Pick the install command from the project's lockfile (defaults to npm). */
function installCommand(cwd: string): { cmd: string; args: string[] } {
  if (existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return { cmd: 'pnpm', args: ['install'] };
  if (existsSync(path.join(cwd, 'yarn.lock'))) return { cmd: 'yarn', args: ['install'] };
  return { cmd: 'npm', args: ['install'] };
}

interface Running {
  /** The currently active child process (the installer, then the dev server). */
  child?: ResultPromise;
  status: PreviewStatus;
  /** Set when stop() is called so background boot work bails out. */
  canceled: boolean;
}

export class PreviewManager {
  private running = new Map<string, Running>();

  constructor(
    private readonly onLine: (projectId: string, line: string) => void,
    /** Optional: notified when a preview's status changes (booting, ready, stopped). */
    private readonly onStatus?: (projectId: string, status: PreviewStatus) => void,
  ) {}

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

  /**
   * Start a preview. Returns immediately with a "starting" status; the install
   * (if needed) and dev-server boot happen in the background and are reported
   * via onStatus + onLine. The iframe should load only once status is ready.
   */
  async start(projectId: string, cwd: string, run: DetectedRun): Promise<PreviewStatus> {
    await this.stop(projectId);
    const entry: Running = {
      status: { running: true, starting: true, phase: 'starting', port: run.defaultPort, url: `http://localhost:${run.defaultPort}` },
      canceled: false,
    };
    this.running.set(projectId, entry);
    void this.boot(projectId, cwd, run, entry);
    return entry.status;
  }

  /** Update + broadcast a preview's status (only if it's still the active entry). */
  private set(projectId: string, entry: Running, status: PreviewStatus): void {
    entry.status = status;
    if (this.running.get(projectId) === entry) this.onStatus?.(projectId, status);
  }

  /** Tear down a preview and report it as not running. */
  private fail(projectId: string, entry: Running): void {
    if (this.running.get(projectId) === entry) {
      this.running.delete(projectId);
      this.onStatus?.(projectId, { running: false });
    }
  }

  private alive(projectId: string, entry: Running): boolean {
    return this.running.get(projectId) === entry && !entry.canceled;
  }

  private pipe(projectId: string, child: ResultPromise): void {
    child.stdout?.on('data', (d) => this.onLine(projectId, String(d)));
    child.stderr?.on('data', (d) => this.onLine(projectId, String(d)));
  }

  private async boot(projectId: string, cwd: string, run: DetectedRun, entry: Running): Promise<void> {
    try {
      // 1. Install dependencies on first run (freshly cloned repos have no node_modules).
      if (await needsInstall(cwd)) {
        this.set(projectId, entry, { ...entry.status, phase: 'installing' });
        const inst = installCommand(cwd);
        this.onLine(projectId, `› Installing dependencies with ${inst.cmd} (first run, this can take a minute)…`);
        const installer = execa(inst.cmd, inst.args, { cwd, reject: false });
        entry.child = installer;
        this.pipe(projectId, installer);
        const res = await installer;
        if (!this.alive(projectId, entry)) return;
        if (res.exitCode !== 0) {
          this.onLine(projectId, `✖ Dependency install failed (exit ${res.exitCode}).`);
          this.fail(projectId, entry);
          return;
        }
        this.onLine(projectId, '› Dependencies installed. Starting dev server…');
      }
      if (!this.alive(projectId, entry)) return;

      // 2. Spawn the dev server.
      const [cmd, ...args] = run.command.split(' ');
      const child = execa(cmd, args, { cwd, reject: false, env: { PORT: String(run.defaultPort), BROWSER: 'none' } });
      entry.child = child;
      this.pipe(projectId, child);
      child.on('exit', () => {
        // If the server dies on its own (e.g. crash, port conflict), tell the UI.
        if (this.alive(projectId, entry)) {
          this.onLine(projectId, '✖ Dev server stopped.');
          this.running.delete(projectId);
          this.onStatus?.(projectId, { running: false });
        }
      });
      this.set(projectId, entry, { running: true, starting: true, phase: 'starting', port: run.defaultPort, url: `http://localhost:${run.defaultPort}` });

      // 3. Wait until the port is actually accepting connections, then go ready.
      await this.awaitReady(projectId, run.defaultPort, child, entry);
    } catch (err: any) {
      this.onLine(projectId, `✖ Preview error: ${err.message}`);
      this.fail(projectId, entry);
    }
  }

  /** Poll the dev-server port; once it accepts connections, flip status to ready. */
  private async awaitReady(projectId: string, port: number, child: ResultPromise, entry: Running): Promise<void> {
    for (let i = 0; i < 240; i++) {
      if (this.running.get(projectId)?.child !== child || entry.canceled) return; // stopped/replaced
      if (await probePort(port)) {
        this.set(projectId, entry, { running: true, starting: false, port, url: `http://localhost:${port}` });
        return;
      }
      await delay(500);
    }
  }

  async stop(projectId: string): Promise<void> {
    const e = this.running.get(projectId);
    if (e) { e.canceled = true; e.child?.kill('SIGTERM'); this.running.delete(projectId); }
  }

  async stopAll(): Promise<void> {
    for (const id of [...this.running.keys()]) await this.stop(id);
  }
}
