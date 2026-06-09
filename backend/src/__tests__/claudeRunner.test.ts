import { describe, it, expect, afterEach } from 'vitest';
import os from 'node:os';
import { parseStreamLine, runClaude } from '../claudeRunner.js';
import { config } from '../config.js';

describe('parseStreamLine', () => {
  it('ignores blank and non-JSON lines', () => {
    expect(parseStreamLine('')).toEqual([]);
    expect(parseStreamLine('not json')).toEqual([]);
  });

  it('extracts assistant text and tool_use blocks', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [
        { type: 'text', text: 'Hello' },
        { type: 'tool_use', name: 'Edit', input: { file: 'a.ts' } },
      ] },
    });
    expect(parseStreamLine(line)).toEqual([
      { type: 'assistant', text: 'Hello' },
      { type: 'tool_use', name: 'Edit', input: { file: 'a.ts' } },
    ]);
  });

  it('extracts tool_result text from user messages', () => {
    const line = JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_result', content: 'done' }] },
    });
    expect(parseStreamLine(line)).toEqual([{ type: 'tool_result', text: 'done' }]);
  });

  it('maps a successful result with session id', () => {
    const line = JSON.stringify({
      type: 'result', subtype: 'success', is_error: false, session_id: 'sess-1',
    });
    expect(parseStreamLine(line)).toEqual([
      { type: 'result', success: true, sessionId: 'sess-1' },
    ]);
  });

  it('maps an error result', () => {
    const line = JSON.stringify({
      type: 'result', subtype: 'error_max_turns', is_error: true, session_id: 'sess-2',
    });
    expect(parseStreamLine(line)).toEqual([
      { type: 'result', success: false, sessionId: 'sess-2' },
    ]);
  });
});

describe('runClaude — missing binary', () => {
  const originalBin = config.claudeBin;
  afterEach(() => { config.claudeBin = originalBin; });

  it('emits a clear error and returns {success:false} when the binary does not exist', async () => {
    config.claudeBin = '/totally/nonexistent/claude-binary-xyz';
    const events: any[] = [];
    const result = await runClaude(
      { cwd: os.tmpdir(), prompt: 'hello' },
      { onEvent: (e) => events.push(e), onLine: () => {} },
    );
    expect(result).toEqual({ success: false });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'error',
      message: 'claude CLI not found. Install it and ensure it is on PATH.',
    });
  }, 5000);
});
