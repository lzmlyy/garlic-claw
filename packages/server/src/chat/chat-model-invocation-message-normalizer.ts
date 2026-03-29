/**
 * 聊天模型调用消息规范化
 *
 * 输入:
 * - 已转换成 AI SDK 形态的消息
 * - 目标模型配置
 *
 * 输出:
 * - provider 可接受的规范化消息数组
 *
 * 预期行为:
 * - 只做 provider 明确要求的轻量清洗
 * - 不改动已有图片降级与消息组装语义
 * - 让统一调用层而不是业务层承担 provider-specific 消息修正
 */

import type { ModelConfig } from '../ai/types/provider.types';
import type { AiSdkMessage } from '../ai/sdk-adapter';

/**
 * 按目标模型归一化 SDK 消息。
 * @param input 模型配置与 SDK 消息
 * @returns 规范化后的 SDK 消息
 */
export function normalizeChatModelInvocationMessages(input: {
  modelConfig: ModelConfig;
  sdkMessages: AiSdkMessage[];
}): AiSdkMessage[] {
  if (shouldNormalizeAnthropicMessages(input.modelConfig)) {
    return normalizeAnthropicMessages(input.sdkMessages);
  }

  return input.sdkMessages;
}

/**
 * 判断当前模型是否需要 Anthropic 风格的空消息清洗。
 * @param modelConfig 模型配置
 * @returns 是否启用 Anthropic 消息规范化
 */
function shouldNormalizeAnthropicMessages(modelConfig: ModelConfig): boolean {
  return (
    modelConfig.api.npm === '@ai-sdk/anthropic' ||
    modelConfig.api.npm === '@ai-sdk/google-vertex/anthropic' ||
    modelConfig.api.id.toLowerCase().includes('claude')
  );
}

/**
 * 清理 Anthropic 不接受的空消息和空 text part。
 * @param messages SDK 消息数组
 * @returns 清理后的消息数组
 */
function normalizeAnthropicMessages(messages: AiSdkMessage[]): AiSdkMessage[] {
  const normalized: AiSdkMessage[] = [];

  for (const message of messages) {
    if (typeof message.content === 'string') {
      if (message.content !== '') {
        normalized.push(message);
      }
      continue;
    }

    const filteredContent = message.content.filter((part) => {
      if (part.type !== 'text') {
        return true;
      }

      return part.text !== '';
    });

    if (filteredContent.length > 0) {
      normalized.push({
        ...message,
        content: filteredContent,
      });
    }
  }

  return normalized;
}
