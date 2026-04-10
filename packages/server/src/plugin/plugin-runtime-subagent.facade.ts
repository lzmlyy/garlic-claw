import {
  applySubagentAfterRunMutation,
  applySubagentBeforeRunMutation,
  buildResolvedSubagentAfterRunPayload,
  buildResolvedSubagentRunResult,
  buildSubagentToolSetRequest,
  collectSubagentRunResult,
  cloneSubagentAfterRunPayload,
  cloneSubagentBeforeRunPayload,
  hasImagePart,
  listDispatchableHookRecords,
  normalizeSubagentAfterRunHookResult,
  normalizeSubagentBeforeRunHookResult,
  runMutatingHookChain,
  runShortCircuitingHookChain,
  type PluginCallContext,
  type PluginHookName,
  type PluginManifest,
  type PluginSubagentRequest,
  type PluginSubagentRunResult,
  type SubagentAfterRunHookPayload,
  type SubagentBeforeRunHookPayload,
} from '@garlic-claw/shared';
import type { Tool } from 'ai';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { JsonValue } from '../common/types/json-value';
import { AiModelExecutionService, createStepLimit } from '../ai';
import { toAiSdkMessages } from '../chat/sdk-message-converter';

type DispatchableSubagentHookRecord = {
  manifest: PluginManifest;
  governance: {
    scope: {
      defaultEnabled: boolean;
      conversations: Record<string, boolean>;
    };
  };
};

type InvokeSubagentHook = (input: {
  pluginId: string;
  hookName: PluginHookName;
  context: PluginCallContext;
  payload: JsonValue;
}) => Promise<JsonValue | null | undefined>;

type SubagentHookInput<TPayload> = {
  records: Iterable<DispatchableSubagentHookRecord>;
  context: PluginCallContext;
  payload: TPayload;
  invokeHook: InvokeSubagentHook;
};

function resolveCachedServicePromise<T>(input: {
  current: Promise<T> | undefined;
  resolve: () => Promise<T | undefined>;
  cache: (value: Promise<T>) => void;
  notFoundMessage: string;
}): Promise<T> {
  if (input.current) {
    return input.current;
  }

  const promise = (async () => {
    const resolved = await input.resolve();
    if (!resolved) {
      throw new NotFoundException(input.notFoundMessage);
    }

    return resolved;
  })();
  input.cache(promise);
  return promise;
}

@Injectable()
export class PluginRuntimeSubagentFacade {
  private toolRegistryPromise?: Promise<{
    buildToolSet: (input: {
      context: PluginCallContext;
      allowedToolNames?: string[];
      excludedSources?: Array<{
        kind: 'plugin' | 'mcp' | 'skill';
        id: string;
      }>;
    }) => Promise<Record<string, Tool> | undefined>;
  }>;

  constructor(
    private readonly aiModelExecution: AiModelExecutionService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async executeRequest(input: {
    records: Iterable<DispatchableSubagentHookRecord>;
    pluginId: string;
    context: PluginCallContext;
    request: PluginSubagentRequest;
    invokeHook: InvokeSubagentHook;
  }): Promise<PluginSubagentRunResult> {
    const records = [...input.records];
    const beforeRunResult = await this.runBeforeHooks({
      records,
      context: input.context,
      payload: {
        context: {
          ...input.context,
        },
        pluginId: input.pluginId,
        request: structuredClone(input.request),
      },
      invokeHook: input.invokeHook,
    });
    if (beforeRunResult.action === 'short-circuit') {
      return beforeRunResult.result;
    }

    const request = beforeRunResult.payload.request;
    const modelConfig = this.aiModelExecution.resolveModelConfig(
      request.providerId,
      request.modelId,
    );
    if (hasImagePart(request.messages) && !modelConfig.capabilities.input.image) {
      throw new BadRequestException('subagent.run 当前模型不支持图片输入');
    }

    const prepared = this.aiModelExecution.prepareResolved({
      modelConfig,
      sdkMessages: toAiSdkMessages(request.messages),
    });
    const toolSetRequest = buildSubagentToolSetRequest({
      pluginId: input.pluginId,
      context: input.context,
      providerId: String(modelConfig.providerId),
      modelId: String(modelConfig.id),
      toolNames: request.toolNames,
    });
    const tools = toolSetRequest
      ? await (await this.getToolRegistry()).buildToolSet(toolSetRequest)
      : undefined;
    const executed = this.aiModelExecution.streamPrepared({
      prepared,
      system: request.system,
      tools,
      stopWhen: createStepLimit(request.maxSteps),
      variant: request.variant,
      providerOptions: request.providerOptions,
      headers: request.headers,
      maxOutputTokens: request.maxOutputTokens,
    });
    const result = await collectSubagentRunResult({
      modelConfig,
      fullStream: executed.result.fullStream,
      finishReason: executed.result.finishReason,
    });

    const afterRunPayload = await this.runAfterHooks({
      records,
      context: input.context,
      payload: buildResolvedSubagentAfterRunPayload({
        context: input.context,
        pluginId: input.pluginId,
        request,
        modelConfig,
        result,
      }),
      invokeHook: input.invokeHook,
    });

    return afterRunPayload.result;
  }

  async runBeforeHooks(input: SubagentHookInput<SubagentBeforeRunHookPayload>): Promise<
    | { action: 'continue'; payload: SubagentBeforeRunHookPayload }
    | { action: 'short-circuit'; result: PluginSubagentRunResult }
  > {
    return runShortCircuitingHookChain({
      records: listDispatchableHookRecords({
        records: input.records,
        hookName: 'subagent:before-run',
        context: input.context,
      }),
      hookName: 'subagent:before-run',
      context: input.context,
      payload: cloneSubagentBeforeRunPayload(input.payload),
      invokeHook: input.invokeHook,
      normalizeResult: normalizeSubagentBeforeRunHookResult,
      applyMutation: applySubagentBeforeRunMutation,
      buildShortCircuitReturn: ({ payload, result }) => {
        const modelConfig = this.aiModelExecution.resolveModelConfig(
          result.providerId ?? payload.request.providerId,
          result.modelId ?? payload.request.modelId,
        );

        return {
          action: 'short-circuit',
          result: buildResolvedSubagentRunResult({
            modelConfig,
            text: result.text,
            finishReason: result.finishReason,
            toolCalls: result.toolCalls,
            toolResults: result.toolResults,
          }),
        };
      },
    });
  }

  async runAfterHooks(
    input: SubagentHookInput<SubagentAfterRunHookPayload>,
  ): Promise<SubagentAfterRunHookPayload> {
    return runMutatingHookChain({
      records: listDispatchableHookRecords({
        records: input.records,
        hookName: 'subagent:after-run',
        context: input.context,
      }),
      hookName: 'subagent:after-run',
      context: input.context,
      payload: cloneSubagentAfterRunPayload(input.payload),
      invokeHook: input.invokeHook,
      normalizeResult: normalizeSubagentAfterRunHookResult,
      applyMutation: applySubagentAfterRunMutation,
    });
  }

  private async getToolRegistry() {
    return resolveCachedServicePromise({
      current: this.toolRegistryPromise,
      resolve: async () => {
        const { ToolRegistryService } = await import('../tool/tool-registry.service');
        return this.moduleRef.get(ToolRegistryService, {
          strict: false,
        });
      },
      cache: (value) => {
        this.toolRegistryPromise = value;
      },
      notFoundMessage: 'ToolRegistryService is not available',
    });
  }
}
