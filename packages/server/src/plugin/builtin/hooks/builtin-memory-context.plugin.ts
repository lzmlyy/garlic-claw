import {
  asChatBeforeModelPayload,
  clipContextText,
  createPassHookResult,
  MEMORY_CONTEXT_DEFAULT_LIMIT,
  MEMORY_CONTEXT_DEFAULT_PROMPT_PREFIX,
  MEMORY_CONTEXT_MANIFEST,
  readLatestUserTextFromMessages,
  readMemorySearchResults,
  readPromptBlockConfig,
  resolvePromptBlockConfig,
} from '@garlic-claw/plugin-sdk/authoring';
import type { BuiltinPluginDefinition } from '../builtin-plugin-definition';

export const BUILTIN_MEMORY_CONTEXT_PLUGIN: BuiltinPluginDefinition = {
  governance: {
    builtinRole: 'system-optional',
    canDisable: true,
    defaultEnabled: true,
  },
  manifest: MEMORY_CONTEXT_MANIFEST,
  hooks: {
    'chat:before-model': async (payload, context) => {
      const hookPayload = asChatBeforeModelPayload(payload);
      const latestUserText = readLatestUserTextFromMessages(hookPayload.request.messages);
      if (!latestUserText) {
        return createPassHookResult();
      }

      const runtimeConfig = resolvePromptBlockConfig(
        readPromptBlockConfig(await context.host.getConfig()),
        {
          limit: MEMORY_CONTEXT_DEFAULT_LIMIT,
          promptPrefix: MEMORY_CONTEXT_DEFAULT_PROMPT_PREFIX,
        },
      );
      const memories = readMemorySearchResults(
        await context.host.searchMemories(latestUserText, runtimeConfig.limit),
      );
      if (memories.length === 0) {
        return createPassHookResult();
      }

      const lines = memories
        .map((memory) => formatMemoryLine(memory))
        .filter(Boolean);
      if (lines.length === 0) {
        return createPassHookResult();
      }

      const promptBlock = `${runtimeConfig.promptPrefix}：\n${lines.join('\n')}`;
      return {
        action: 'mutate',
        systemPrompt: hookPayload.request.systemPrompt
          ? `${hookPayload.request.systemPrompt}\n\n${promptBlock}`
          : promptBlock,
      };
    },
  },
};

function formatMemoryLine(memory: {
  content?: string;
  category?: string;
}): string {
  const content = clipContextText(memory.content ?? '');
  if (!content) {
    return '';
  }
  return `- [${memory.category ?? 'general'}] ${content}`;
}
