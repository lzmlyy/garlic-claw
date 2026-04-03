export type {
  PluginGenerateTextParams as BuiltinPluginGenerateTextParams,
  PluginScopedStateOptions as BuiltinPluginScopedStateOptions,
} from '@garlic-claw/plugin-sdk';

export {
  buildPluginConversationSessionKeepParams as buildBuiltinConversationSessionKeepParams,
  buildPluginConversationSessionStartParams as buildBuiltinConversationSessionStartParams,
  buildPluginCreateAutomationParams as buildBuiltinCreateAutomationParams,
  buildPluginGenerateParams as buildBuiltinGenerateParams,
  buildPluginGenerateTextParams as buildBuiltinGenerateTextParams,
  buildPluginMessageSendParams as buildBuiltinMessageSendParams,
  buildPluginRegisterCronParams as buildBuiltinRegisterCronParams,
  buildPluginRunSubagentParams as buildBuiltinRunSubagentParams,
  buildPluginStartSubagentTaskParams as buildBuiltinStartSubagentTaskParams,
  toHostJsonValue,
  toScopedStateParams,
} from '@garlic-claw/plugin-sdk';
