import {
  buildConversationTitlePrompt,
  CONVERSATION_TITLE_DEFAULT_MAX_MESSAGES,
  CONVERSATION_TITLE_MANIFEST,
  createPassHookResult,
  normalizePositiveInteger,
  readConversationMessages,
  readConversationSummary,
  readConversationTitleConfig,
  resolveConversationTitleRuntimeConfig,
  sanitizeConversationTitle,
  shouldGenerateConversationTitle,
} from '@garlic-claw/plugin-sdk/authoring';
import type { BuiltinPluginDefinition } from '../builtin-plugin-definition';

export const BUILTIN_CONVERSATION_TITLE_PLUGIN: BuiltinPluginDefinition = {
  governance: {
    builtinRole: 'system-optional',
    canDisable: true,
    defaultEnabled: true,
  },
  manifest: CONVERSATION_TITLE_MANIFEST,
  hooks: {
    'chat:after-model': async (_payload, context) => {
      const runtimeConfig = resolveConversationTitleRuntimeConfig(
        readConversationTitleConfig(await context.host.getConfig()),
      );
      const conversation = readConversationSummary(
        await context.host.getConversation(),
      );

      if (!shouldGenerateConversationTitle(conversation.title, runtimeConfig.defaultTitle)) {
        return createPassHookResult();
      }

      const prompt = buildConversationTitlePrompt(
        readConversationMessages(await context.host.listConversationMessages()),
        normalizePositiveInteger(
          runtimeConfig.maxMessages,
          CONVERSATION_TITLE_DEFAULT_MAX_MESSAGES,
        ),
      );
      if (!prompt) {
        return createPassHookResult();
      }

      const generated = await context.host.generateText({
        prompt,
        transportMode: 'stream-collect',
      });
      const nextTitle = sanitizeConversationTitle(generated.text);
      if (!nextTitle || nextTitle === conversation.title) {
        return createPassHookResult();
      }

      await context.host.setConversationTitle(nextTitle);
      return createPassHookResult();
    },
  },
};
