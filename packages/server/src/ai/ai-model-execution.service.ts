/**
 * AI 模型统一执行服务
 *
 * 输入:
 * - provider/model 选择或已解析模型配置
 * - 已转换好的 AI SDK 消息
 * - 可选的系统提示词、工具、停止条件与请求覆盖项
 *
 * 输出:
 * - 已解析模型配置
 * - 可直接执行的语言模型实例
 * - 规范化后的 SDK 消息
 * - 最终生成结果
 *
 * 预期行为:
 * - 把模型解析、请求参数归一、provider-specific 消息规范化收口到 ai 层
 * - 让 chat / diagnostics / vision 这类后端服务复用同一套执行边界
 */

import { Injectable } from '@nestjs/common';
import type {
  AiModelRouteTarget,
  AiUtilityModelRole,
} from '@garlic-claw/shared';
import {
  runGenerateText,
  runStreamText,
  type AiSdkLanguageModel,
  type AiSdkMessage,
  type AiSdkStopCondition,
  type AiSdkStreamTextResult,
  type AiSdkToolSet,
} from './sdk-adapter';
import { AiProviderService } from './ai-provider.service';
import { ConfigManagerService } from './config/config-manager.service';
import type { ModelConfig } from './types/provider.types';
import {
  resolveChatModelInvocationRequestOptions,
  type ChatModelInvocationRequestOptionsInput,
} from '../chat/chat-model-invocation-options';
import { normalizeChatModelInvocationMessages } from '../chat/chat-model-invocation-message-normalizer';

/**
 * 统一准备执行时的输入。
 */
export interface PrepareAiModelExecutionInput {
  /** provider ID，可选。 */
  providerId?: string;
  /** model ID，可选。 */
  modelId?: string;
  /** utility model role，可选。 */
  utilityRole?: AiUtilityModelRole;
  /** 已转换好的 SDK 消息。 */
  sdkMessages: AiSdkMessage[];
}

/**
 * 使用已解析模型配置准备执行时的输入。
 */
export interface PrepareResolvedAiModelExecutionInput {
  /** 已解析模型配置。 */
  modelConfig: ModelConfig;
  /** 已转换好的 SDK 消息。 */
  sdkMessages: AiSdkMessage[];
}

/**
 * 统一准备好的执行载荷。
 */
export interface PreparedAiModelExecution {
  /** 已解析模型配置。 */
  modelConfig: ModelConfig;
  /** 已创建的语言模型。 */
  model: AiSdkLanguageModel;
  /** 已规范化的 SDK 消息。 */
  sdkMessages: AiSdkMessage[];
  /** 原始 SDK 消息，用于重新选择 fallback 模型时再次归一化。 */
  sourceSdkMessages: AiSdkMessage[];
}

/**
 * 已准备执行载荷时的流式输入。
 */
export interface StreamPreparedAiModelExecutionInput
  extends ChatModelInvocationRequestOptionsInput {
  /** 已准备好的执行载荷。 */
  prepared: PreparedAiModelExecution;
  /** 是否启用聊天 fallback model 链。 */
  allowFallbackChatModels?: boolean;
  /** 可选系统提示词。 */
  system?: string;
  /** 可选工具集合。 */
  tools?: AiSdkToolSet;
  /** 可选停止条件。 */
  stopWhen?: AiSdkStopCondition;
  /** 可选中止信号。 */
  abortSignal?: AbortSignal;
}

@Injectable()
export class AiModelExecutionService {
  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly configManager: ConfigManagerService,
  ) {}

  /**
   * 统一解析模型配置。
   * @param providerId provider ID，可选
   * @param modelId model ID，可选
   * @returns 已解析模型配置
   */
  resolveModelConfig(
    providerId?: string,
    modelId?: string,
    utilityRole?: AiUtilityModelRole,
  ): ModelConfig {
    if (utilityRole) {
      const target = this.resolveUtilityRoleTarget(utilityRole);
      if (target) {
        return this.aiProvider.getModelConfig(target.providerId, target.modelId);
      }
    }

    return this.aiProvider.getModelConfig(providerId, modelId);
  }

  /**
   * 解析 provider/model 后统一准备执行载荷。
   * @param input 准备输入
   * @returns 统一准备好的执行载荷
   */
  prepare(
    input: PrepareAiModelExecutionInput,
  ): PreparedAiModelExecution {
    const modelConfig = this.resolveModelConfig(
      input.providerId,
      input.modelId,
      input.utilityRole,
    );

    return this.prepareResolved({
      modelConfig,
      sdkMessages: input.sdkMessages,
    });
  }

  /**
   * 使用已解析模型配置统一准备执行载荷。
   * @param input 准备输入
   * @returns 统一准备好的执行载荷
   */
  prepareResolved(
    input: PrepareResolvedAiModelExecutionInput,
  ): PreparedAiModelExecution {
    return {
      modelConfig: input.modelConfig,
      model: this.aiProvider.getModel(
        input.modelConfig.providerId as string,
        input.modelConfig.id as string,
      ),
      sourceSdkMessages: input.sdkMessages,
      sdkMessages: normalizeChatModelInvocationMessages({
        modelConfig: input.modelConfig,
        sdkMessages: input.sdkMessages,
      }),
    };
  }

  /**
   * 一次性执行非流式文本生成。
   * @param input 执行输入与请求覆盖项
   * @returns 统一准备载荷与最终生成结果
   */
  async generateText(
    input: PrepareAiModelExecutionInput & ChatModelInvocationRequestOptionsInput & {
      allowFallbackChatModels?: boolean;
      system?: string;
    },
  ): Promise<
    PreparedAiModelExecution & {
      result: Awaited<ReturnType<typeof runGenerateText>>;
    }
  > {
    const prepared = this.prepare(input);
    return this.generatePrepared({
      prepared,
      system: input.system,
      allowFallbackChatModels: input.allowFallbackChatModels,
      variant: input.variant,
      providerOptions: input.providerOptions,
      headers: input.headers,
      maxOutputTokens: input.maxOutputTokens,
    });
  }

  /**
   * 基于已准备载荷执行非流式文本生成。
   * @param input 执行输入
   * @returns 统一准备载荷与最终生成结果
   */
  async generatePrepared(
    input: {
      prepared: PreparedAiModelExecution;
      allowFallbackChatModels?: boolean;
      system?: string;
    } & ChatModelInvocationRequestOptionsInput,
  ): Promise<
    PreparedAiModelExecution & {
      result: Awaited<ReturnType<typeof runGenerateText>>;
    }
  > {
    const execution = await this.executeWithOptionalChatFallback(
      input.prepared,
      input.allowFallbackChatModels === true,
      async (prepared) => {
        const requestOptions = resolveChatModelInvocationRequestOptions({
          modelConfig: prepared.modelConfig,
          requestOptions: input,
        });

        return runGenerateText({
          model: prepared.model,
          system: input.system,
          messages: prepared.sdkMessages,
          providerOptions: requestOptions.providerOptions,
          headers: requestOptions.headers,
          maxOutputTokens: requestOptions.maxOutputTokens,
        });
      },
    );

    return execution;
  }

  /**
   * 基于已准备载荷执行流式文本生成。
   * @param input 流式执行输入
   * @returns 统一准备载荷与流式结果
   */
  streamPrepared(
    input: StreamPreparedAiModelExecutionInput,
  ): PreparedAiModelExecution & {
    result: AiSdkStreamTextResult;
  } {
    return this.executeStreamingWithOptionalChatFallback(
      input.prepared,
      input.allowFallbackChatModels === true,
      (prepared) => {
        const requestOptions = resolveChatModelInvocationRequestOptions({
          modelConfig: prepared.modelConfig,
          requestOptions: input,
        });

        return runStreamText({
          model: prepared.model,
          system: input.system,
          messages: prepared.sdkMessages,
          tools: input.tools,
          stopWhen: input.stopWhen,
          abortSignal: input.abortSignal,
          providerOptions: requestOptions.providerOptions,
          headers: requestOptions.headers,
          maxOutputTokens: requestOptions.maxOutputTokens,
        });
      },
    );
  }

  private async executeWithOptionalChatFallback<T>(
    prepared: PreparedAiModelExecution,
    allowFallbackChatModels: boolean,
    execute: (prepared: PreparedAiModelExecution) => Promise<T>,
  ): Promise<PreparedAiModelExecution & { result: T }> {
    const candidates = this.buildExecutionCandidates(
      prepared,
      allowFallbackChatModels,
    );
    let lastError: unknown = null;

    for (const candidate of candidates) {
      try {
        return {
          ...candidate,
          result: await execute(candidate),
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  private executeStreamingWithOptionalChatFallback(
    prepared: PreparedAiModelExecution,
    allowFallbackChatModels: boolean,
    execute: (prepared: PreparedAiModelExecution) => AiSdkStreamTextResult,
  ): PreparedAiModelExecution & { result: AiSdkStreamTextResult } {
    const candidates = this.buildExecutionCandidates(
      prepared,
      allowFallbackChatModels,
    );
    let lastError: unknown = null;

    for (const candidate of candidates) {
      try {
        return {
          ...candidate,
          result: execute(candidate),
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  private buildExecutionCandidates(
    prepared: PreparedAiModelExecution,
    allowFallbackChatModels: boolean,
  ): PreparedAiModelExecution[] {
    if (!allowFallbackChatModels) {
      return [prepared];
    }

    const fallbackTargets = this.configManager
      .getHostModelRoutingConfig()
      .fallbackChatModels.filter(
        (target) =>
          target.providerId !== prepared.modelConfig.providerId
          || target.modelId !== prepared.modelConfig.id,
      );

    return [
      prepared,
      ...fallbackTargets.map((target) =>
        this.prepareResolved({
          modelConfig: this.aiProvider.getModelConfig(
            target.providerId,
            target.modelId,
          ),
          sdkMessages: prepared.sourceSdkMessages,
        }),
      ),
    ];
  }

  private resolveUtilityRoleTarget(
    utilityRole: AiUtilityModelRole,
  ): AiModelRouteTarget | null {
    return this.configManager.getHostModelRoutingConfig().utilityModelRoles[
      utilityRole
    ] ?? null;
  }
}
