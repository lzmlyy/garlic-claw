import { type JsonObject, type JsonValue, type PluginCallContext, type PluginHostMethod, type PluginLlmMessage } from '@garlic-claw/shared';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { AiModelExecutionService } from '../../ai/ai-model-execution.service';
import { AiManagementService } from '../../ai-management/ai-management.service';
import { createSingleUserProfile } from '../../auth/single-user-auth';
import { AutomationService } from '../../execution/automation/automation.service';
import { PluginBootstrapService } from '../../plugin/bootstrap/plugin-bootstrap.service';
import { buildPluginSelfSummary, createPluginConfigSnapshot } from '../../plugin/persistence/plugin-read-model';
import type { RegisteredPluginRecord } from '../../plugin/persistence/plugin-persistence.service';
import { RuntimeHostConversationMessageService } from './runtime-host-conversation-message.service';
import { RuntimeHostConversationRecordService } from './runtime-host-conversation-record.service';
import { PLUGIN_HOST_METHOD_PERMISSION_MAP } from './runtime-host.constants';
import { RuntimeHostKnowledgeService } from './runtime-host-knowledge.service';
import { RuntimeHostPluginDispatchService } from './runtime-host-plugin-dispatch.service';
import { RuntimeHostPluginRuntimeService } from './runtime-host-plugin-runtime.service';
import { RuntimeHostSubagentRunnerService } from './runtime-host-subagent-runner.service';
import { RuntimeHostUserContextService } from './runtime-host-user-context.service';
import { asJsonValue, readJsonObject, readOptionalString, readPluginLlmMessages, readRequiredString, requireContextField } from './runtime-host-values';

type RuntimeHostMethod = PluginHostMethod;
type RuntimeHostCallHandler = (input: RuntimeHostCallInput) => JsonValue | Promise<JsonValue>;

interface RuntimeHostCallInput {
  context: PluginCallContext;
  method: RuntimeHostMethod;
  params: JsonObject;
  plugin: RegisteredPluginRecord;
  pluginId: string;
}

@Injectable()
export class RuntimeHostService implements OnModuleInit {
  private readonly callHandlers: Record<RuntimeHostMethod, RuntimeHostCallHandler>;

  constructor(private readonly pluginBootstrapService: PluginBootstrapService, private readonly automationService: AutomationService, private readonly runtimeHostConversationMessageService: RuntimeHostConversationMessageService, private readonly runtimeHostConversationRecordService: RuntimeHostConversationRecordService, private readonly aiModelExecutionService: AiModelExecutionService, private readonly aiManagementService: AiManagementService, private readonly runtimeHostKnowledgeService: RuntimeHostKnowledgeService, private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService, private readonly runtimeHostPluginRuntimeService: RuntimeHostPluginRuntimeService, private readonly runtimeHostSubagentRunnerService: RuntimeHostSubagentRunnerService, private readonly runtimeHostUserContextService: RuntimeHostUserContextService) {
    this.callHandlers = this.buildCallHandlers();
  }

  onModuleInit(): void { this.runtimeHostPluginDispatchService.registerHostCaller((input) => this.call(input)); }

  async call(input: {
    context: PluginCallContext;
    method: PluginHostMethod;
    params: JsonObject;
    pluginId: string;
  }): Promise<JsonValue> {
    const method = input.method as RuntimeHostMethod;
    const handler = this.callHandlers[method];
    if (!handler) {throw new BadRequestException(`Host API ${input.method} is not implemented in the current server runtime`);}
    const plugin = this.pluginBootstrapService.getPlugin(input.pluginId);
    this.assertHostPermission(plugin, method);
    if (input.context.conversationId && input.context.activePersonaId) {this.runtimeHostConversationRecordService.rememberConversationActivePersona(input.context.conversationId, input.context.activePersonaId);}
    this.runtimeHostUserContextService.rememberPersonaContext(input.context);
    return handler({ ...input, method, plugin });
  }

  private assertHostPermission(plugin: RegisteredPluginRecord, method: PluginHostMethod): void {
    const requiredPermission = PLUGIN_HOST_METHOD_PERMISSION_MAP[method];
    if (!requiredPermission || plugin.manifest.permissions.includes(requiredPermission)) {return;}
    throw new ForbiddenException(`Plugin ${plugin.pluginId} is missing permission ${requiredPermission}`);
  }

  private buildCallHandlers(): Record<RuntimeHostMethod, RuntimeHostCallHandler> {
    const readConversationId = (context: RuntimeHostCallInput['context']) => requireContextField(context, 'conversationId');
    const readConversation = (context: RuntimeHostCallInput['context']) => this.runtimeHostConversationRecordService.requireConversation(readConversationId(context));
    const readPersonaId = (params: RuntimeHostCallInput['params']) => readRequiredString(params, 'personaId');
    const readUserId = (context: RuntimeHostCallInput['context']) => requireContextField(context, 'userId');
    const runStoreMutation = (surface: 'state' | 'storage', action: 'deleteStoreValue' | 'getStoreValue' | 'listStoreValues' | 'setStoreValue', input: RuntimeHostCallInput) => this.runtimeHostPluginRuntimeService[action](surface, input.pluginId, input.context, input.params);
    const createLlmHandler = (method: 'llm.generate' | 'llm.generate-text') => ({ context, params, pluginId }: RuntimeHostCallInput) => this.executeLlmGenerate(pluginId, context, params, method);

    const handlers: Record<RuntimeHostMethod, RuntimeHostCallHandler> = {
      'automation.create': ({ context, params }) => this.automationService.create(readUserId(context), params),
      'automation.event.emit': async ({ context, params }) => asJsonValue(await this.automationService.emitEvent(readUserId(context), readRequiredString(params, 'event'))),
      'automation.list': ({ context }) => this.automationService.listByUser(readUserId(context)),
      'automation.run': ({ context, params }) => this.automationService.run(readUserId(context), readRequiredString(params, 'automationId')),
      'automation.toggle': ({ context, params }) => this.automationService.toggle(readUserId(context), readRequiredString(params, 'automationId')),
      'config.get': ({ params, plugin }) => {
        const snapshot = createPluginConfigSnapshot(plugin).values;
        const key = readOptionalString(params, 'key');
        return !key ? snapshot : Object.prototype.hasOwnProperty.call(snapshot, key) ? snapshot[key] : null;
      },
      'cron.delete': ({ params, pluginId }) => this.runtimeHostPluginRuntimeService.deleteCronJob(pluginId, params),
      'cron.list': ({ pluginId }) => this.runtimeHostPluginRuntimeService.listCronJobs(pluginId),
      'cron.register': ({ params, pluginId }) => this.runtimeHostPluginRuntimeService.registerCronJob(pluginId, params),
      'conversation.get': ({ context }) => this.runtimeHostConversationRecordService.readConversationSummary(readConversationId(context)),
      'conversation.messages.list': ({ context }) => readConversation(context).messages.map((message) => structuredClone(message)),
      'conversation.session.finish': ({ context, pluginId }) => this.runtimeHostConversationRecordService.finishPluginConversationSession(pluginId, readConversationId(context)),
      'conversation.session.get': ({ context, pluginId }) => this.runtimeHostConversationRecordService.getConversationSession(pluginId, context),
      'conversation.session.keep': ({ context, params, pluginId }) => this.runtimeHostConversationRecordService.keepConversationSession(pluginId, context, params),
      'conversation.session.start': ({ context, params, pluginId }) => this.runtimeHostConversationRecordService.startConversationSession(pluginId, context, params),
      'conversation.title.set': ({ context, params }) => this.runtimeHostConversationRecordService.writeConversationTitle(readConversationId(context), readRequiredString(params, 'title')),
      'kb.get': ({ params }) => this.runtimeHostKnowledgeService.getKbEntry(params),
      'kb.list': ({ params }) => this.runtimeHostKnowledgeService.listKbEntries(params),
      'kb.search': ({ params }) => this.runtimeHostKnowledgeService.searchKbEntries(params),
      'llm.generate': createLlmHandler('llm.generate'),
      'llm.generate-text': createLlmHandler('llm.generate-text'),
      'log.list': ({ params, pluginId }) => this.runtimeHostPluginRuntimeService.listPluginLogs(pluginId, params),
      'log.write': ({ params, pluginId }) => this.runtimeHostPluginRuntimeService.writePluginLog(pluginId, params),
      'memory.save': ({ context, params }) => this.runtimeHostUserContextService.saveMemory(context, params),
      'memory.search': ({ context, params }) => this.runtimeHostUserContextService.searchMemories(context, params),
      'message.send': ({ context, params }) => this.runtimeHostConversationMessageService.sendMessage(context, params),
      'message.target.current.get': ({ context }) => this.runtimeHostConversationRecordService.readCurrentMessageTarget(readConversationId(context)),
      'persona.activate': ({ context, params }) => this.runtimeHostUserContextService.activatePersona({ conversation: readConversation(context), personaId: readPersonaId(params) }),
      'persona.current.get': ({ context }) => this.runtimeHostUserContextService.readCurrentPersona({ context, conversationActivePersonaId: readConversation(context).activePersonaId }),
      'persona.get': ({ params }) => this.runtimeHostUserContextService.readPersona(readRequiredString(params, 'personaId')),
      'persona.list': () => this.runtimeHostUserContextService.listPersonas(),
      'plugin.self.get': ({ plugin }) => buildPluginSelfSummary(plugin),
      'provider.current.get': ({ context }) => context.activeProviderId && context.activeModelId
        ? { modelId: context.activeModelId, providerId: context.activeProviderId, source: 'context' }
        : asJsonValue(this.aiManagementService.getDefaultProviderSelection()),
      'provider.get': ({ params }) => asJsonValue(this.aiManagementService.getProviderSummary(String(params.providerId))),
      'provider.list': () => this.aiManagementService.listProviders() as unknown as JsonValue,
      'provider.model.get': ({ params }) => asJsonValue(this.aiManagementService.getProviderModelSummary(String(params.providerId), String(params.modelId))),
      'state.delete': (input) => runStoreMutation('state', 'deleteStoreValue', input),
      'state.get': (input) => runStoreMutation('state', 'getStoreValue', input),
      'state.list': (input) => runStoreMutation('state', 'listStoreValues', input),
      'state.set': (input) => runStoreMutation('state', 'setStoreValue', input),
      'storage.delete': (input) => runStoreMutation('storage', 'deleteStoreValue', input),
      'storage.get': (input) => runStoreMutation('storage', 'getStoreValue', input),
      'storage.list': (input) => runStoreMutation('storage', 'listStoreValues', input),
      'storage.set': (input) => runStoreMutation('storage', 'setStoreValue', input),
      'subagent.run': ({ context, params, pluginId }) => this.runtimeHostSubagentRunnerService.runSubagent(pluginId, context, params),
      'subagent.task.get': ({ params, pluginId }) => this.runtimeHostSubagentRunnerService.getTask(pluginId, readRequiredString(params, 'taskId')) as unknown as JsonValue,
      'subagent.task.list': ({ pluginId }) => this.runtimeHostSubagentRunnerService.listTasks(pluginId) as unknown as JsonValue,
      'subagent.task.start': ({ context, params, plugin, pluginId }) => this.runtimeHostSubagentRunnerService.startTask(pluginId, plugin.manifest.name, context, params),
      'user.get': ({ context }) => {
        if (!context.userId) {throw new NotFoundException('User not found: unknown');}
        return asJsonValue(createSingleUserProfile());
      },
    };
    return handlers;
  }

  private async executeLlmGenerate(pluginId: string, context: RuntimeHostCallInput['context'], params: JsonObject, method: 'llm.generate' | 'llm.generate-text'): Promise<JsonValue> {
    const request = readRuntimeHostLlmRequest({ context, method, params, pluginId });
    const result = await this.aiModelExecutionService.generateText({
      allowFallbackChatModels: true,
      headers: request.headers,
      maxOutputTokens: request.maxOutputTokens,
      messages: request.messages,
      modelId: request.modelId,
      providerId: request.providerId,
      providerOptions: request.providerOptions,
      system: request.system,
      variant: request.variant,
    });

    if (method === 'llm.generate-text') {return { modelId: result.modelId, providerId: result.providerId, text: result.text };}
    return {
      ...(result.finishReason !== undefined ? { finishReason: result.finishReason } : {}),
      message: { content: result.text, role: 'assistant' },
      modelId: result.modelId,
      providerId: result.providerId,
      text: result.text,
      toolCalls: [],
      toolResults: [],
      ...(result.usage !== undefined ? { usage: result.usage } : {}),
    };
  }
}

function readRuntimeHostLlmRequest(input: {
  context: RuntimeHostCallInput['context'];
  method: 'llm.generate' | 'llm.generate-text';
  params: JsonObject;
  pluginId: string;
}): {
  headers?: Record<string, string>;
  maxOutputTokens?: number;
  messages: PluginLlmMessage[];
  modelId?: string;
  providerOptions?: JsonObject;
  providerId?: string;
  system?: string;
  variant?: string;
} {
  const headers = readJsonObject(input.params.headers);
  const modelId = readOptionalString(input.params, 'modelId') ?? (input.pluginId === 'builtin.conversation-title' ? input.context.activeModelId : undefined);
  const providerOptions = readJsonObject(input.params.providerOptions);
  const providerId = readOptionalString(input.params, 'providerId') ?? (input.pluginId === 'builtin.conversation-title' ? input.context.activeProviderId : undefined);
  const system = readOptionalString(input.params, 'system');
  const variant = readOptionalString(input.params, 'variant');

  return {
    ...(headers ? { headers: headers as Record<string, string> } : {}),
    ...(typeof input.params.maxOutputTokens === 'number' ? { maxOutputTokens: input.params.maxOutputTokens } : {}),
    messages: input.method === 'llm.generate'
      ? readPluginLlmMessages(input.params.messages, 'llm.generate messages must be a non-empty array', (message) => new Error(message))
      : [{ content: readRequiredString(input.params, 'prompt'), role: 'user' }],
    ...(modelId ? { modelId } : {}),
    ...(providerOptions ? { providerOptions } : {}),
    ...(providerId ? { providerId } : {}),
    ...(system ? { system } : {}),
    ...(variant ? { variant } : {}),
  };
}
