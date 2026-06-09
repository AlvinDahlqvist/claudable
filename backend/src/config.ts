import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from the repo root regardless of cwd.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });

export const config = {
  repoRoot,
  port: Number(process.env.PORT ?? 4000),
  claudeBin: process.env.CLAUDE_BIN ?? 'claude',
  permissionMode: process.env.CLAUDE_PERMISSION_MODE ?? 'acceptEdits',
  supabaseToken: process.env.SUPABASE_ACCESS_TOKEN ?? '',
  gitAuthorName: process.env.GIT_AUTHOR_NAME ?? 'Claudable',
  gitAuthorEmail: process.env.GIT_AUTHOR_EMAIL ?? 'claudable@localhost',
  dataDir: path.join(repoRoot, 'data'),
  projectsFile: path.join(repoRoot, 'data', 'projects.json'),
};
