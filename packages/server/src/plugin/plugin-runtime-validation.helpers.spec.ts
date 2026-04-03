import type { PluginHookFilterDescriptor } from '@garlic-claw/shared';
import {
  buildFilterRegex,
  hasImagePart,
  isActionConfigArray,
  isChatMessagePartArray,
  isChatMessageStatus,
  isJsonObjectValue,
  isPluginLlmMessageArray,
  isPluginSubagentToolCallArray,
  isPluginSubagentToolResultArray,
  isStringArray,
  isStringRecord,
  matchesMessageCommand,
  normalizePositiveInteger,
  normalizeRoutePath,
} from '@garlic-claw/shared';

describe('plugin-runtime-validation.helpers', () => {
  it('validates json object, string array and string record values', () => {
    expect(isJsonObjectValue({ ok: true })).toBe(true);
    expect(isJsonObjectValue(['x'])).toBe(false);
    expect(isStringArray(['a', 'b'])).toBe(true);
    expect(isStringArray(['a', 1] as never)).toBe(false);
    expect(isStringRecord({ Authorization: 'Bearer token' })).toBe(true);
    expect(isStringRecord({ Authorization: 1 } as never)).toBe(false);
  });

  it('validates chat message structures', () => {
    expect(
      isChatMessagePartArray([
        { type: 'text', text: 'hello' },
        { type: 'image', image: 'data:image/png;base64,abc', mimeType: 'image/png' },
      ]),
    ).toBe(true);
    expect(isChatMessagePartArray([{ type: 'image', image: 1 }] as never)).toBe(false);
    expect(isChatMessageStatus('completed')).toBe(true);
    expect(isChatMessageStatus('done' as never)).toBe(false);
    expect(
      isPluginLlmMessageArray([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
      ]),
    ).toBe(true);
    expect(
      isPluginLlmMessageArray([
        { role: 'user', content: [{ type: 'audio', url: 'x' }] },
      ] as never),
    ).toBe(false);
  });

  it('validates automation and subagent payload arrays', () => {
    expect(
      isActionConfigArray([
        {
          type: 'device_command',
          plugin: 'plugin-pc',
          capability: 'shell.exec',
          params: {
            command: 'echo hi',
          },
        },
        {
          type: 'ai_message',
          message: 'done',
          target: {
            type: 'conversation',
            id: 'conversation-1',
          },
        },
      ]),
    ).toBe(true);
    expect(isActionConfigArray([{ type: 'ai_message', target: { type: 'user' } }] as never)).toBe(
      false,
    );

    expect(
      isPluginSubagentToolCallArray([
        {
          toolCallId: 'tool-call-1',
          toolName: 'demo',
          input: {
            ok: true,
          },
        },
      ]),
    ).toBe(true);
    expect(
      isPluginSubagentToolCallArray([
        {
          toolCallId: 'tool-call-1',
          input: {},
        },
      ] as never),
    ).toBe(false);

    expect(
      isPluginSubagentToolResultArray([
        {
          toolCallId: 'tool-call-1',
          toolName: 'demo',
          output: {
            ok: true,
          },
        },
      ]),
    ).toBe(true);
    expect(
      isPluginSubagentToolResultArray([
        {
          toolCallId: 'tool-call-1',
          output: {},
        },
      ] as never),
    ).toBe(false);
  });

  it('builds regexes and matches message commands', () => {
    const descriptor = {
      pattern: '^/demo',
      flags: 'i',
    } satisfies Exclude<
      NonNullable<NonNullable<PluginHookFilterDescriptor['message']>['regex']>,
      string
    >;

    expect(buildFilterRegex('^/demo').test('/demo')).toBe(true);
    expect(buildFilterRegex(descriptor).test('/DEMO')).toBe(true);
    expect(matchesMessageCommand('  /demo run', '/demo')).toBe(true);
    expect(matchesMessageCommand('/demonstrate', '/demo')).toBe(false);
    expect(matchesMessageCommand('/demo', '   ')).toBe(false);
  });

  it('normalizes route paths, integers and detects image parts', () => {
    expect(normalizeRoutePath('/demo/path/')).toBe('demo/path');
    expect(normalizePositiveInteger(4.9, 1)).toBe(4);
    expect(normalizePositiveInteger(0, 5)).toBe(5);
    expect(
      hasImagePart([
        {
          role: 'user',
          content: [{ type: 'image', image: 'data:image/png;base64,abc' }],
        },
      ]),
    ).toBe(true);
    expect(
      hasImagePart([
        {
          role: 'user',
          content: 'hello',
        },
      ]),
    ).toBe(false);
  });
});
