/**
 * 聊天模型统一调用服务
 *
 * 输入:
 * - 会话 ID
 * - provider/model 选择
 * - 聊天运行时消息
 *
 * 输出:
 * - 已解析的模型配置
 * - 可直接调用的语言模型实例
 * - 已完成降级转换的 AI SDK 消息
 *
 * 预期行为:
 * - 把模型解析、消息降级、SDK 消息转换收口到单一服务
 * - 让后端服务做非流式/流式模型调用时都不必手动串接多个步骤
 */

import { Injectable } from '@nestjs/common';
import {
  AiModelExecutionService,
  type PreparedAiModelExecution,
  type StreamPreparedAiModelExecutionInput,
} from '../ai/ai-model-execution.service';
import type { AiSdkStopCondition, AiSdkToolSet } from '../ai/sdk-adapter';
import type { ModelConfig } from '../ai/types/provider.types';
import { toAiSdkMessages } from './sdk-message-converter';
import type { ChatRuntimeMessage } from './chat-message-session';
import {
  ChatMessageTransformService,
  type ChatMessageTransformResult,
} from './chat-message-transform.service';
import type { ChatModelInvocationRequestOptionsInput } from './chat-model-invocation-options';

/**
 * 统一准备调用时的输入。
 */
export interface PrepareChatModelInvocationInput {
  /** 会话 ID，用于图片降级缓存。 */
  conversationId: string;
  /** provider ID，可选。 */
  providerId?: string;
  /** model ID，可选。 */
  modelId?: string;
  /** 运行时消息列表。 */
  messages: ChatRuntimeMessage[];
}

/**
 * 已解析模型配置时的准备输入。
 */
export interface PrepareResolvedChatModelInvocationInput {
  /** 会话 ID，用于图片降级缓存。 */
  conversationId: string;
  /** 已解析模型配置。 */
  modelConfig: ModelConfig;
  /** 运行时消息列表。 */
  messages: ChatRuntimeMessage[];
}

/**
 * 统一准备好的调用载荷。
 */
export interface PreparedChatModelInvocation extends PreparedAiModelExecution {
  transformResult?: ChatMessageTransformResult;
}

/**
 * 已准备调用载荷时的流式输入。
 */
export interface StreamPreparedChatModelInvocationInput
  extends ChatModelInvocationRequestOptionsInput {
  /** 已准备好的调用载荷。 */
  prepared: PreparedChatModelInvocation;
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
export class ChatModelInvocationService {
  constructor(
    private readonly aiModelExecution: AiModelExecutionService,
    private readonly messageTransform: ChatMessageTransformService,
  ) {}

  /**
   * 解析 provider/model 后统一准备调用载荷。
   * @param input 准备输入
   * @returns 统一准备好的调用载荷
   */
  async prepare(
    input: PrepareChatModelInvocationInput,
  ): Promise<PreparedChatModelInvocation> {
    const modelConfig = this.aiModelExecution.resolveModelConfig(
      input.providerId,
      input.modelId,
    );

    return this.prepareResolved({
      conversationId: input.conversationId,
      modelConfig,
      messages: input.messages,
    });
  }

  /**
   * 使用已解析模型配置准备调用载荷。
   * @param input 准备输入
   * @returns 统一准备好的调用载荷
   */
  async prepareResolved(
    input: PrepareResolvedChatModelInvocationInput,
  ): Promise<PreparedChatModelInvocation> {
    const transformResult = await this.messageTransform.transformMessages(
      input.conversationId,
      input.messages,
      input.modelConfig,
    );
    const prepared = await this.aiModelExecution.prepareResolved({
      modelConfig: input.modelConfig,
      sdkMessages: toAiSdkMessages(transformResult.messages),
    });

    return {
      ...prepared,
      transformResult,
    };
  }

  /**
   * 一次性执行非流式文本生成。
   * @param input 准备输入与生成参数
   * @returns 统一准备载荷与最终生成结果
   */
  async generateText(
    input: PrepareChatModelInvocationInput & ChatModelInvocationRequestOptionsInput & {
      system?: string;
    },
  ): Promise<
    PreparedChatModelInvocation & {
      result: Awaited<ReturnType<AiModelExecutionService['generatePrepared']>>['result'];
    }
  > {
    const prepared = await this.prepare(input);
    return this.aiModelExecution.generatePrepared({
      prepared,
      system: input.system,
      variant: input.variant,
      providerOptions: input.providerOptions,
      headers: input.headers,
      maxOutputTokens: input.maxOutputTokens,
    });
  }

  /**
   * 基于已准备载荷执行流式文本生成。
   * @param input 流式生成输入
   * @returns 准备载荷与流式结果
   */
  streamPrepared(
    input: StreamPreparedChatModelInvocationInput,
  ): ReturnType<AiModelExecutionService['streamPrepared']> {
    return this.aiModelExecution.streamPrepared(
      input as StreamPreparedAiModelExecutionInput,
    );
  }
}
