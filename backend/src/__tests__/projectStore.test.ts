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
