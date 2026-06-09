import type { Project, AddProjectRequest, PreviewStatus } from '@claudable/shared/types.js';

export type ProjectView = Project & { preview: PreviewStatus; supabaseConnected: boolean };

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json() as Promise<T>;
}

export const api = {
  listProjects: () => fetch('/api/projects').then(json<ProjectView[]>),
  addProject: (body: AddProjectRequest) =>
    fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json<Project>),
  removeProject: (id: string) => fetch(`/api/projects/${id}`, { method: 'DELETE' }),
  sendMessage: (id: string, prompt: string) =>
    fetch(`/api/projects/${id}/message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) }),
  startPreview: (id: string) => fetch(`/api/projects/${id}/preview/start`, { method: 'POST' }).then(json<PreviewStatus>),
  stopPreview: (id: string) => fetch(`/api/projects/${id}/preview/stop`, { method: 'POST' }).then(json<PreviewStatus>),
  updateSettings: (id: string, settings: { runCommand?: string; port?: number }) =>
    fetch(`/api/projects/${id}/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }).then(json<Project>),
  connectSupabase: (id: string) => fetch(`/api/projects/${id}/supabase/connect`, { method: 'POST' }).then(json<{ connected: boolean }>),
};
