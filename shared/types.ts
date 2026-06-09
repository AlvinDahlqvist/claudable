export type ProjectId = string;

export interface ProjectSettings {
  /** Override the auto-detected dev command, e.g. "npm run dev". */
  runCommand?: string;
  /** Override the auto-detected dev-server port. */
  port?: number;
}

export interface Project {
  id: ProjectId;
  name: string;
  /** Absolute path on disk. */
  path: string;
  /** Last claude CLI session id, used to resume the conversation. */
  sessionId?: string;
  /** Connected Supabase project ref, if any. */
  supabaseRef?: string;
  settings: ProjectSettings;
}

/** Normalized events produced by parsing the claude CLI stream-json output. */
export type ClaudeEvent =
  | { type: 'assistant'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'tool_result'; text: string }
  | { type: 'result'; success: boolean; sessionId?: string }
  | { type: 'error'; message: string }
  /** A lifecycle/outcome notice surfaced inline in the chat (run started, committed, etc.). */
  | { type: 'status'; level: 'info' | 'success' | 'error'; text: string };

export interface PreviewStatus {
  running: boolean;
  /** True while the dev server is booting but not yet accepting connections. */
  starting?: boolean;
  /** What the preview is doing while starting: installing deps or booting the server. */
  phase?: 'installing' | 'starting';
  url?: string;
  port?: number;
}

export type TerminalSource = 'claude' | 'preview' | 'git';

/** Messages the server pushes to the browser over WebSocket. */
export type WsServerMessage =
  | { channel: 'claude'; projectId: ProjectId; event: ClaudeEvent }
  | { channel: 'terminal'; projectId: ProjectId; source: TerminalSource; line: string }
  | { channel: 'preview'; projectId: ProjectId; status: PreviewStatus };

/** Messages the browser sends to the server over WebSocket. */
export type WsClientMessage =
  | { type: 'subscribe'; projectId: ProjectId }
  | { type: 'unsubscribe'; projectId: ProjectId };

/** REST: request body for adding a project. */
export interface AddProjectRequest {
  /** Provide either an existing local path... */
  path?: string;
  /** ...or a GitHub URL to clone. */
  gitUrl?: string;
  /** Optional display name (defaults to the folder/repo name). */
  name?: string;
}
