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
