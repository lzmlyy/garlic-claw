import type {
  PluginCallContext,
  PluginSubagentRequest,
  PluginSubagentRunResult,
  SubagentAfterRunHookPayload,
} from '@garlic-claw/shared';
import type { Tool } from 'ai';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AiModelExecutionService } from '../ai/ai-model-execution.service';
import { toAiSdkMessages } from '../chat/sdk-message-converter';
import {
  assertSubagentRequestInputSupported,
  buildResolvedSubagentAfterRunPayload,
  buildSubagentStreamPreparedInput,
  buildSubagentToolSetRequest,
  collectSubagentRunResult,
} from './plugin-runtime-subagent.helpers';
import { resolveCachedRuntimeServicePromise } from './plugin-runtime-module.helpers';

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
    pluginId: string;
    context: PluginCallContext;
    request: PluginSubagentRequest;
    runBeforeHooks: (input: {
      context: PluginCallContext;
      payload: {
        context: PluginCallContext;
        pluginId: string;
        request: PluginSubagentRequest;
      };
    }) => Promise<
      | {
        action: 'continue';
        payload: {
          context: PluginCallContext;
          pluginId: string;
          request: PluginSubagentRequest;
        };
      }
      | {
        action: 'short-circuit';
        result: PluginSubagentRunResult;
      }
    >;
    runAfterHooks: (input: {
      context: PluginCallContext;
      payload: SubagentAfterRunHookPayload;
    }) => Promise<SubagentAfterRunHookPayload>;
  }): Promise<PluginSubagentRunResult> {
    const beforeRunResult = await input.runBeforeHooks({
      context: input.context,
      payload: {
        context: {
          ...input.context,
        },
        pluginId: input.pluginId,
        request: structuredClone(input.request),
      },
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
