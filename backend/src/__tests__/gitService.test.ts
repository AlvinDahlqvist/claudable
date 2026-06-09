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
    expect(res.sha).toMatch(/^[0-9a-f]{7,}$/);
    const head = await execa('git', ['rev-parse', '--short', 'HEAD'], { cwd: dir });
    expect(res.sha).toBe(head.stdout.trim());
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
