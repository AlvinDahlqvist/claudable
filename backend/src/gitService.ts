import { execa } from 'execa';
import { config } from './config.js';

export interface CommitResult { committed: boolean; message?: string; sha?: string }
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
    const sha = (await execa('git', ['rev-parse', '--short', 'HEAD'], { cwd })).stdout.trim();
    return { committed: true, message, sha };
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
