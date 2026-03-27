/**
 * AI SDK 轻量适配层
 *
 * 输入:
 * - 业务层整理后的简单参数对象
 *
 * 输出:
 * - 透传给 AI SDK 的调用结果
 *
 * 预期行为:
 * - 在单点位置隔离复杂泛型
 * - 让业务代码不再直接依赖 AI SDK 的重类型签名
 */

import {
  generateText,
  stepCountIs,
  streamText,
  type GenerateTextResult,
  type LanguageModel,
  type ModelMessage,
  type StopCondition,
  type StreamTextResult,
  type Tool,
} from 'ai';

/**
 * AI SDK 语言模型轻量别名。
 */
export type AiSdkLanguageModel = LanguageModel;

/**
 * AI SDK 消息轻量别名。
 */
export type AiSdkMessage = ModelMessage;

/**
 * AI SDK 工具轻量别名。
 */
export type AiSdkTool = Tool;

/**
 * AI SDK 工具集合轻量别名。
 */
export type AiSdkToolSet = Record<string, Tool>;

/**
 * AI SDK 停止条件轻量别名。
 */
export type AiSdkStopCondition = StopCondition;

/**
 * 创建工具调用步数限制器。
 * @param maxSteps 最大工具调用轮次
 * @returns SDK 可消费的 stopWhen 条件
 */
export function createStepLimit(maxSteps: number): AiSdkStopCondition {
  return stepCountIs(maxSteps);
}

/**
 * 运行流式文本生成。
 * @param params 业务层整理后的调用参数
 * @returns AI SDK 的原始流式结果
 */
export function runStreamText(params: {
  model: AiSdkLanguageModel;
  system?: string;
  messages: AiSdkMessage[];
  tools?: AiSdkToolSet;
  stopWhen?: AiSdkStopCondition;
  abortSignal?: AbortSignal;
}): StreamTextResult {
  return streamText(params);
}

/**
 * 运行非流式文本生成。
 * @param params 业务层整理后的调用参数
 * @returns AI SDK 的原始生成结果
 */
export function runGenerateText(params: {
  model: AiSdkLanguageModel;
  messages: AiSdkMessage[];
  maxOutputTokens?: number;
}): Promise<GenerateTextResult> {
  return generateText(params);
}
