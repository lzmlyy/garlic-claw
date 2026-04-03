import {
  applySubagentAfterRunMutation,
  applySubagentBeforeRunMutation,
  cloneSubagentAfterRunPayload,
  cloneSubagentBeforeRunPayload,
} from '@garlic-claw/shared';
import type {
  PluginCallContext,
  PluginManifest,
  PluginSubagentRequest,
  PluginSubagentRunResult,
  PluginHookName,
  SubagentAfterRunHookPayload,
  SubagentBeforeRunHookPayload,
} from '@garlic-claw/shared';
import type { Tool } from 'ai';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AiModelExecutionService } from '../ai/ai-model-execution.service';
import { toAiSdkMessages } from '../chat/sdk-message-converter';
import { listDispatchableHookRecords } from './plugin-runtime-dispatch.helpers';
import {
  runMutatingHookChain,
  runShortCircuitingHookChain,
} from './plugin-runtime-hook-runner.helpers';
import {
  normalizeSubagentAfterRunHookResult,
  normalizeSubagentBeforeRunHookResult,
} from './plugin-runtime-hook-result.helpers';
import {
  buildResolvedSubagentRunResult,
  assertSubagentRequestInputSupported,
  buildResolvedSubagentAfterRunPayload,
  buildSubagentStreamPreparedInput,
  buildSubagentToolSetRequest,
  collectSubagentRunResult,
} from './plugin-runtime-subagent.helpers';
import { resolveCachedRuntimeServicePromise } from './plugin-runtime-module.helpers';

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
  payload: unknown;
}) => Promise<unknown>;

type SubagentHookInput<TPayload> = {
  records: Iterable<DispatchableSubagentHookRecord>;
  context: PluginCallContext;
  payload: TPayload;
  invokeHook: InvokeSubagentHook;
};

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
    runAfterHooks: (input: {
      context: PluginCallContext;
      payload: SubagentAfterRunHookPayload;
    }) => Promise<SubagentAfterRunHookPayload>;
  }): Promise<PluginSubagentRunResult> {
    const beforeRunResult = await this.runBeforeHooks({
      records: input.records,
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

    assertSubagentRequestInputSupported({
      request,
      modelConfig,
    });

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
    const executed = this.aiModelExecution.streamPrepared(
      buildSubagentStreamPreparedInput({
        prepared,
        request,
        tools,
      }),
    );
    const result = await collectSubagentRunResult({
      modelConfig,
      fullStream: executed.result.fullStream,
      finishReason: executed.result.finishReason,
    });

    const afterRunPayload = await input.runAfterHooks({
      context: input.context,
      payload: buildResolvedSubagentAfterRunPayload({
        context: input.context,
        pluginId: input.pluginId,
        request,
        modelConfig,
        result,
      }),
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
      invokeHook: (hookInput) => input.invokeHook(hookInput),
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
      invokeHook: (hookInput) => input.invokeHook(hookInput),
      normalizeResult: normalizeSubagentAfterRunHookResult,
      applyMutation: applySubagentAfterRunMutation,
    });
  }

  private async getToolRegistry() {
    return resolveCachedRuntimeServicePromise({
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
