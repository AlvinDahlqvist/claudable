import { Router } from 'express';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { AddProjectRequest } from '@claudable/shared/types.js';
import { config } from './config.js';
import { ProjectStore } from './projectStore.js';
import { GitService } from './gitService.js';
import { McpService } from './mcpService.js';
import { PreviewManager } from './previewManager.js';
import { WsHub } from './wsHub.js';
import { runClaude } from './claudeRunner.js';

export function createRoutes(deps: {
  store: ProjectStore;
  git: GitService;
  mcp: McpService;
  preview: PreviewManager;
  hub: WsHub;
}): Router {
  const { store, git, mcp, preview, hub } = deps;
  const r = Router();

  // List projects (with live preview + mcp status).
  r.get('/projects', async (_req, res) => {
    const projects = store.list();
    const enriched = await Promise.all(projects.map(async (p) => ({
      ...p,
      preview: preview.status(p.id),
      supabaseConnected: (await mcp.status(p.path)).connected,
    })));
    res.json(enriched);
  });

  // Add a project: existing local path OR clone a GitHub URL.
  r.post('/projects', async (req, res) => {
    const body = req.body as AddProjectRequest;
    try {
      let projectPath: string;
      let name: string;
      if (body.gitUrl) {
        name = body.name ?? body.gitUrl.split('/').pop()!.replace(/\.git$/, '').replace(/\/$/, '');
        if (!name) return res.status(400).json({ error: 'Could not derive a name from gitUrl' });
        projectPath = path.join(config.repoRoot, 'workspace', name);
        await fs.mkdir(path.dirname(projectPath), { recursive: true });
        await git.clone(body.gitUrl, projectPath);
      } else if (body.path) {
        projectPath = path.resolve(body.path);
        name = body.name ?? path.basename(projectPath);
      } else {
        return res.status(400).json({ error: 'Provide either path or gitUrl' });
      }
      const project = await store.add({ name, path: projectPath });
      res.status(201).json(project);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  r.delete('/projects/:id', async (req, res) => {
    await preview.stop(req.params.id);
    await store.remove(req.params.id);
    res.status(204).end();
  });

  // Send a chat message -> run claude -> auto commit/push.
  r.post('/projects/:id/message', async (req, res) => {
    const project = store.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Unknown project' });
    const prompt = String(req.body?.prompt ?? '').trim();
    if (!prompt) return res.status(400).json({ error: 'Empty prompt' });

    res.status(202).json({ accepted: true }); // run happens async, streamed over WS
    try {
      const result = await runClaude(
        { cwd: project.path, prompt, sessionId: project.sessionId },
        {
          onEvent: (event) => hub.broadcast({ channel: 'claude', projectId: project.id, event }),
          onLine: (line) => hub.broadcast({ channel: 'terminal', projectId: project.id, source: 'claude', line }),
        },
      );
      if (result.sessionId) await store.update(project.id, { sessionId: result.sessionId });
      if (result.success) {
        const commit = await git.commitAll(project.path, `Claudable: ${prompt.slice(0, 60)}`);
        hub.broadcast({ channel: 'terminal', projectId: project.id, source: 'git',
          line: commit.committed ? `Committed: ${commit.message}` : 'Nothing to commit' });
        if (commit.committed) {
          const push = await git.push(project.path);
          hub.broadcast({ channel: 'terminal', projectId: project.id, source: 'git',
            line: push.pushed ? 'Pushed to origin' : `Push skipped: ${push.reason}` });
        }
      }
    } catch (err: any) {
      hub.broadcast({ channel: 'terminal', projectId: project.id, source: 'git',
        line: `Error: ${err.message}` });
    }
  });

  // Start/stop preview.
  r.post('/projects/:id/preview/start', async (req, res) => {
    const project = store.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Unknown project' });
    const run = await preview.resolve(project.path, project.settings);
    if (!run) return res.status(422).json({ error: 'Could not detect a run command. Set one in settings.' });
    const status = await preview.start(project.id, project.path, run);
    hub.broadcast({ channel: 'preview', projectId: project.id, status });
    res.json(status);
  });

  r.post('/projects/:id/preview/stop', async (req, res) => {
    await preview.stop(req.params.id);
    const status = { running: false };
    hub.broadcast({ channel: 'preview', projectId: req.params.id, status });
    res.json(status);
  });

  // Update per-project settings (run command / port).
  r.patch('/projects/:id/settings', async (req, res) => {
    const project = store.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Unknown project' });
    const incoming = req.body ?? {};
    const patch: { runCommand?: string; port?: number } = {};
    if (typeof incoming.runCommand === 'string') patch.runCommand = incoming.runCommand;
    if (typeof incoming.port === 'number') patch.port = incoming.port;
    const updated = await store.update(req.params.id, { settings: { ...project.settings, ...patch } });
    res.json(updated);
  });

  // Connect Supabase via MCP.
  r.post('/projects/:id/supabase/connect', async (req, res) => {
    const project = store.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Unknown project' });
    if (!config.supabaseToken) {
      return res.status(400).json({ error: 'SUPABASE_ACCESS_TOKEN is not set in .env' });
    }
    await mcp.connectSupabase(project.path, config.supabaseToken);
    res.json({ connected: true });
  });

  return r;
}
