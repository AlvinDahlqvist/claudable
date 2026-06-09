import { execa, type ExecaChildProcess } from 'execa';
import readline from 'node:readline';
import type { ClaudeEvent } from '@claudable/shared/types.js';
import { config } from './config.js';

/** Parse one line of `claude --output-format stream-json` output into events. */
export function parseStreamLine(line: string): ClaudeEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let obj: any;
  try { obj = JSON.parse(trimmed); } catch { return []; }

  switch (obj.type) {
    case 'assistant': {
      const blocks = obj.message?.content ?? [];
      const events: ClaudeEvent[] = [];
      for (const b of blocks) {
        if (b.type === 'text') events.push({ type: 'assistant', text: b.text });
        else if (b.type === 'tool_use') events.push({ type: 'tool_use', name: b.name, input: b.input });
      }
      return events;
    }
    case 'user': {
      const blocks = obj.message?.content ?? [];
      const events: ClaudeEvent[] = [];
      for (const b of blocks) {
        if (b.type === 'tool_result') {
          const text = typeof b.content === 'string'
            ? b.content
            : Array.isArray(b.content)
              ? b.content.map((c: any) => c.text ?? '').join('')
              : '';
          events.push({ type: 'tool_result', text });
        }
      }
      return events;
    }
    case 'result':
      return [{ type: 'result', success: obj.is_error === false, sessionId: obj.session_id }];
    default:
      return [];
  }
}

export interface RunHandlers {
  onEvent: (event: ClaudeEvent) => void;
  /** Raw stdout/stderr lines, for the terminal panel. */
  onLine: (line: string) => void;
}

export interface RunResult {
  success: boolean;
  sessionId?: string;
}

/**
 * Run the claude CLI in `cwd` with `prompt`. Resumes `sessionId` if provided.
 * Streams normalized events + raw lines via handlers; resolves when the run ends.
 */
export async function runClaude(
  opts: { cwd: string; prompt: string; sessionId?: string },
  handlers: RunHandlers,
): Promise<RunResult> {
  const args = [
    '-p', opts.prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', config.permissionMode,
  ];
  if (opts.sessionId) args.push('--resume', opts.sessionId);

  let child: ExecaChildProcess;
  try {
    child = execa(config.claudeBin, args, { cwd: opts.cwd, reject: false });
  } catch (err: any) {
    handlers.onEvent({ type: 'error', message: `Failed to start claude: ${err.message}` });
    return { success: false };
  }

  let result: RunResult = { success: false };
  const rl = readline.createInterface({ input: child.stdout! });
  rl.on('line', (line) => {
    handlers.onLine(line);
    for (const event of parseStreamLine(line)) {
      handlers.onEvent(event);
      if (event.type === 'result') result = { success: event.success, sessionId: event.sessionId };
    }
  });
  child.stderr?.on('data', (d) => handlers.onLine(String(d)));

  const exit = await child;
  if (exit.exitCode !== 0 && !result.sessionId) {
    handlers.onEvent({
      type: 'error',
      message: exit.exitCode === 127
        ? `claude CLI not found. Install it and ensure it is on PATH.`
        : `claude exited with code ${exit.exitCode}`,
    });
    return { success: false };
  }
  return result;
}
