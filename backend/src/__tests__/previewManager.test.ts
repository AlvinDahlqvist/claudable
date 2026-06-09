import { describe, it, expect } from 'vitest';
import os from 'node:os';
import { detectRunCommand, PreviewManager } from '../previewManager.js';

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
