import { describe, it, expect } from 'vitest';
import { parseStreamLine } from '../claudeRunner.js';

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
