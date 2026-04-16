import type {
  AutomationAfterRunHookPayload,
  AutomationBeforeRunHookPayload,
  ChatAfterModelHookPayload,
  ChatBeforeModelHookPayload,
  ChatWaitingModelHookPayload,
  ConversationCreatedHookPayload,
  MessageCreatedHookPayload,
  MessageDeletedHookPayload,
  MessageReceivedHookPayload,
  MessageUpdatedHookPayload,
  PluginCallContext,
  PluginErrorHookPayload,
  PluginLoadedHookPayload,
  PluginSubagentRunResult,
  PluginUnloadedHookPayload,
  ResponseAfterSendHookPayload,
  ResponseBeforeSendHookPayload,
  SubagentAfterRunHookPayload,
  SubagentBeforeRunHookPayload,
  ToolAfterCallHookPayload,
  ToolBeforeCallHookPayload,
} from './types/plugin';

export type HookPayloadInput<TPayload> = {
  context: PluginCallContext;
  payload: TPayload;
};

export type HookSpec<TPayload, TResult> = [payload: TPayload, result: TResult];

export type InboundHookFamily<TChatBeforeModelResult, TMessageReceivedResult> = {
  'chat:before-model': HookSpec<ChatBeforeModelHookPayload, TChatBeforeModelResult>;
  'message:received': HookSpec<MessageReceivedHookPayload, TMessageReceivedResult>;
};

export type MessageHookFamily = {
  'chat:after-model': HookSpec<ChatAfterModelHookPayload, ChatAfterModelHookPayload>;
  'message:created': HookSpec<MessageCreatedHookPayload, MessageCreatedHookPayload>;
  'message:updated': HookSpec<MessageUpdatedHookPayload, MessageUpdatedHookPayload>;
};

export type OperationHookFamily<TAutomationBeforeRunResult, TToolBeforeCallResult> = {
  'automation:before-run': HookSpec<AutomationBeforeRunHookPayload, TAutomationBeforeRunResult>;
  'automation:after-run': HookSpec<AutomationAfterRunHookPayload, AutomationAfterRunHookPayload>;
  'tool:before-call': HookSpec<ToolBeforeCallHookPayload, TToolBeforeCallResult>;
  'tool:after-call': HookSpec<ToolAfterCallHookPayload, ToolAfterCallHookPayload>;
  'response:before-send': HookSpec<ResponseBeforeSendHookPayload, ResponseBeforeSendHookPayload>;
};

export type BroadcastHookFamily = {
  'chat:waiting-model': HookSpec<ChatWaitingModelHookPayload, void>;
  'conversation:created': HookSpec<ConversationCreatedHookPayload, void>;
  'message:deleted': HookSpec<MessageDeletedHookPayload, void>;
  'response:after-send': HookSpec<ResponseAfterSendHookPayload, void>;
};

export type LifecycleBroadcastHookFamily = {
  'plugin:loaded': HookSpec<PluginLoadedHookPayload, void>;
  'plugin:unloaded': HookSpec<PluginUnloadedHookPayload, void>;
  'plugin:error': HookSpec<PluginErrorHookPayload, void>;
};

export type AllBroadcastHookFamily = BroadcastHookFamily & LifecycleBroadcastHookFamily;

export type SubagentHookFamily = {
  'subagent:before-run': HookSpec<
    SubagentBeforeRunHookPayload,
    | { action: 'continue'; payload: SubagentBeforeRunHookPayload }
    | { action: 'short-circuit'; result: PluginSubagentRunResult }
  >;
  'subagent:after-run': HookSpec<SubagentAfterRunHookPayload, SubagentAfterRunHookPayload>;
};

export type HookFamilyInput<
  TFamily extends Record<string, HookSpec<unknown, unknown>>,
  TName extends keyof TFamily,
> = {
  hookName: TName;
  context: PluginCallContext;
  payload: TFamily[TName][0];
};

export type HookChainInput<TPayload, TInvokeHook> = {
  records: Iterable<unknown>;
  context: PluginCallContext;
  payload: TPayload;
  invokeHook: TInvokeHook;
};

export type HookChainRunnerMap<
  TFamily extends Record<string, HookSpec<unknown, unknown>>,
  TInvokeHook,
  TRecord = unknown,
> = {
  [TName in keyof TFamily]: (
    input: HookChainInput<TFamily[TName][0], TInvokeHook> & { records: Iterable<TRecord> },
  ) => Promise<TFamily[TName][1]> | TFamily[TName][1];
};
