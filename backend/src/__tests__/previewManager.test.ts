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
