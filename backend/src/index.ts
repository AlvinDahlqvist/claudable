import express from 'express';
import http from 'node:http';
import { config } from './config.js';
import { ProjectStore } from './projectStore.js';
import { GitService } from './gitService.js';
import { McpService } from './mcpService.js';
import { PreviewManager } from './previewManager.js';
import { WsHub } from './wsHub.js';
import { createRoutes } from './routes.js';

async function main() {
  const app = express();
  app.use(express.json());

  const server = http.createServer(app);
  const hub = new WsHub(server);

  const store = new ProjectStore(config.projectsFile);
  await store.load();
  const git = new GitService();
  const mcp = new McpService();
  const preview = new PreviewManager((projectId, line) =>
    hub.broadcast({ channel: 'terminal', projectId, source: 'preview', line }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', createRoutes({ store, git, mcp, preview, hub }));

  server.listen(config.port, () => {
    console.log(`Claudable backend listening on http://localhost:${config.port}`);
  });

  const shutdown = async () => { await preview.stopAll(); server.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => { console.error(err); process.exit(1); });
