import { type JsonObject, type JsonValue, type PluginCallContext, type PluginHostMethod, type PluginLlmMessage, type PluginLlmTransportMode } from '@garlic-claw/shared';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { AiModelExecutionService } from '../../ai/ai-model-execution.service';
import { AiManagementService } from '../../ai-management/ai-management.service';
import { createSingleUserProfile } from '../../auth/single-user-auth';
import { AutomationService } from '../../execution/automation/automation.service';
import { PersonaService } from '../../persona/persona.service';
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
import { asJsonValue, readJsonObject, readOptionalString, readPluginLlmMessages, readRequiredString, requireContextField, type AssistantCustomBlockEntry } from './runtime-host-values';

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

  constructor(private readonly pluginBootstrapService: PluginBootstrapService, private readonly automationService: AutomationService, private readonly runtimeHostConversationMessageService: RuntimeHostConversationMessageService, private readonly runtimeHostConversationRecordService: RuntimeHostConversationRecordService, private readonly aiModelExecutionService: AiModelExecutionService, private readonly aiManagementService: AiManagementService, private readonly runtimeHostKnowledgeService: RuntimeHostKnowledgeService, private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService, private readonly runtimeHostPluginRuntimeService: RuntimeHostPluginRuntimeService, private readonly runtimeHostSubagentRunnerService: RuntimeHostSubagentRunnerService, private readonly runtimeHostUserContextService: RuntimeHostUserContextService, private readonly personaService: PersonaService) {
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
    return handler({ ...input, method, plugin });
  }

  private assertHostPermission(plugin: RegisteredPluginRecord, method: PluginHostMethod): void {
    const requiredPermission = PLUGIN_HOST_METHOD_PERMISSION_MAP[method];
    if (!requiredPermission || plugin.manifest.permissions.includes(requiredPermission)) {return;}
    throw new ForbiddenException(`Plugin ${plugin.pluginId} is missing permission ${requiredPermission}`);
  }

  private buildCallHandlers(): Record<RuntimeHostMethod, RuntimeHostCallHandler> {
    const readConversationId = (context: RuntimeHostCallInput['context']) => requireContextField(context, 'conversationId');
    const readPersonaId = (params: RuntimeHostCallInput['params']) => readRequiredString(params, 'personaId');
    const readUserId = (context: RuntimeHostCallInput['context']) => requireContextField(context, 'userId');
    const runStoreMutation = (surface: 'state' | 'storage', action: 'deleteStoreValue' | 'getStoreValue' | 'listStoreValues' | 'setStoreValue', input: RuntimeHostCallInput) => this.runtimeHostPluginRuntimeService[action](surface, input.pluginId, input.context, input.params);
    const createLlmHandler = (method: 'llm.generate' | 'llm.generate-text') => ({ context, params, plugin }: RuntimeHostCallInput) => this.executeLlmGenerate(plugin, context, params, method);

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
      'conversation.messages.list': ({ context }) => this.runtimeHostConversationRecordService.requireConversation(readConversationId(context)).messages.map((message) => structuredClone(message)),
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
      'persona.activate': ({ context, params }) => asJsonValue(this.personaService.activatePersona({ conversationId: readConversationId(context), personaId: readPersonaId(params), userId: context.userId })),
      'persona.current.get': ({ context }) => asJsonValue(this.personaService.readCurrentPersona({ context, ...(context.conversationId ? { conversationId: context.conversationId } : {}) })),
      'persona.get': ({ params }) => asJsonValue(this.personaService.readPersona(readRequiredString(params, 'personaId'))),
      'persona.list': () => asJsonValue(this.personaService.listPersonas()),
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

  private async executeLlmGenerate(plugin: RegisteredPluginRecord, context: RuntimeHostCallInput['context'], params: JsonObject, method: 'llm.generate' | 'llm.generate-text'): Promise<JsonValue> {
    const request = readRuntimeHostLlmRequest({ context, method, params, plugin });
    const result = await this.aiModelExecutionService.generateText({
      allowFallbackChatModels: true,
      headers: request.headers,
      maxOutputTokens: request.maxOutputTokens,
      messages: request.messages,
      modelId: request.modelId,
      providerId: request.providerId,
      providerOptions: request.providerOptions,
      system: request.system,
      transportMode: request.transportMode,
      variant: request.variant,
    });
    const metadata = result.customBlocks?.length
      ? asJsonValue({
          customBlocks: result.customBlocks.map((block) => createRuntimeHostCustomBlock(
            result.providerId,
            result.customBlockOrigin ?? 'ai-sdk.response-body',
            block,
          )),
        })
      : null;

    if (method === 'llm.generate-text') {
      return asJsonValue({
        modelId: result.modelId,
        ...(metadata ? { metadata } : {}),
        providerId: result.providerId,
        text: result.text,
        ...(result.usage !== undefined ? { usage: result.usage } : {}),
      });
    }
    return asJsonValue({
      ...(result.finishReason !== undefined ? { finishReason: result.finishReason } : {}),
      message: {
        content: result.text,
        ...(metadata ? { metadata } : {}),
        role: 'assistant',
      },
      modelId: result.modelId,
      ...(metadata ? { metadata } : {}),
      providerId: result.providerId,
      text: result.text,
      toolCalls: [],
      toolResults: [],
      ...(result.usage !== undefined ? { usage: result.usage } : {}),
    });
  }
}

function readRuntimeHostLlmRequest(input: {
  context: RuntimeHostCallInput['context'];
  method: 'llm.generate' | 'llm.generate-text';
  params: JsonObject;
  plugin: RegisteredPluginRecord;
}): {
  headers?: Record<string, string>;
  maxOutputTokens?: number;
  messages: PluginLlmMessage[];
  modelId?: string;
  providerOptions?: JsonObject;
  providerId?: string;
  system?: string;
  transportMode?: PluginLlmTransportMode;
  variant?: string;
} {
  const headers = readJsonObject(input.params.headers);
  const pluginModelId = input.plugin.llmPreference.mode === 'override' ? input.plugin.llmPreference.modelId ?? undefined : undefined;
  const pluginProviderId = input.plugin.llmPreference.mode === 'override' ? input.plugin.llmPreference.providerId ?? undefined : undefined;
  const modelId = readOptionalString(input.params, 'modelId') ?? pluginModelId ?? input.context.activeModelId;
  const providerOptions = readJsonObject(input.params.providerOptions);
  const providerId = readOptionalString(input.params, 'providerId') ?? pluginProviderId ?? input.context.activeProviderId;
  const system = readOptionalString(input.params, 'system');
  const transportMode = readTransportMode(input.params);
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
    ...(transportMode ? { transportMode } : {}),
    ...(variant ? { variant } : {}),
  };
}

function createRuntimeHostCustomBlock(
  providerId: string,
  origin: 'ai-sdk.raw' | 'ai-sdk.response-body',
  block: AssistantCustomBlockEntry,
): JsonValue {
  const title = block.key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ') || block.key;

  return block.kind === 'text'
    ? asJsonValue({
        id: `custom-field:${block.key}`,
        kind: 'text',
        source: {
          key: block.key,
          origin,
          providerId,
        },
        state: 'done',
        text: block.value,
        title,
      })
    : asJsonValue({
        data: block.value,
        id: `custom-field:${block.key}`,
        kind: 'json',
        source: {
          key: block.key,
          origin,
          providerId,
        },
        state: 'done',
        title,
      });
}

function readTransportMode(params: JsonObject): PluginLlmTransportMode | null {
  const value = readOptionalString(params, 'transportMode');
  if (!value) {
    return null;
  }
  if (value === 'generate' || value === 'stream-collect') {
    return value;
  }
  throw new BadRequestException('transportMode must be generate or stream-collect');
}
