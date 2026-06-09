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
