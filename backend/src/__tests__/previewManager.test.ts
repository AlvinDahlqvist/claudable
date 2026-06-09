import { describe, it, expect } from 'vitest';
import os from 'node:os';
import net from 'node:net';
import type { PreviewStatus } from '@claudable/shared/types.js';
import { detectRunCommand, PreviewManager, probePort } from '../previewManager.js';

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

describe('PreviewManager', () => {
  it('status returns {running:false} for an unknown project', () => {
    const pm = new PreviewManager(() => {});
    expect(pm.status('unknown-project')).toEqual({ running: false });
  });

  it('stopAll() resolves with no running projects after spawning a long-lived process', async () => {
    const pm = new PreviewManager(() => {});
    const projectId = 'test-stopall';
    const cwd = os.tmpdir();
    await pm.start(projectId, cwd, { command: 'node -e "setTimeout(()=>{},10000)"', defaultPort: 9999 });
    expect(pm.status(projectId).running).toBe(true);
    await pm.stopAll();
    expect(pm.status(projectId).running).toBe(false);
  }, 5000);

  it('status returns {running:false} after the child process exits on its own', async () => {
    const pm = new PreviewManager(() => {});
    const projectId = 'test-exit-cleanup';
    const cwd = os.tmpdir();
    // Spawn a process that exits immediately
    await pm.start(projectId, cwd, { command: 'node -e "process.exit(0)"', defaultPort: 9998 });
    // Wait for the exit handler to fire
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    expect(pm.status(projectId).running).toBe(false);
  }, 5000);
});

describe('probePort', () => {
  it('resolves true for a listening port and false for a closed one', async () => {
    const server = net.createServer();
    const port: number = await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port));
    });
    expect(await probePort(port)).toBe(true);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await probePort(port)).toBe(false);
  }, 5000);

  it('PreviewManager flips a preview to ready (starting:false) once the port listens', async () => {
    // A server already listening stands in for a booted dev server.
    const server = net.createServer();
    const port: number = await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port));
    });
    const updates: PreviewStatus[] = [];
    const pm = new PreviewManager(() => {}, (_id, status) => updates.push(status));
    // A long-lived child (split-safe, no quoted args) so the entry survives until
    // readiness is detected. The port itself is held by the net server above.
    const initial = await pm.start('ready-test', os.tmpdir(), {
      command: 'sleep 5',
      defaultPort: port,
    });
    expect(initial.starting).toBe(true);
    // Wait for awaitReady to probe and report ready.
    await new Promise<void>((resolve) => setTimeout(resolve, 1200));
    expect(updates.some((s) => s.running && s.starting === false && s.port === port)).toBe(true);
    expect(pm.status('ready-test').starting).toBe(false);
    await pm.stopAll();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }, 8000);
});
