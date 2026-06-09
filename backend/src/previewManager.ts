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
