import type {
  GenerateTextOptions,
  GenerateTextResult,
  JSONValue,
  StopCondition,
  StreamTextOptions,
  StreamTextResult,
  Tool,
  ToolOptions,
} from './ai-sdk-stub-core';

/**
 * 创建工具。
 * @param options 工具定义
 * @returns 轻量工具对象
 */
export function tool<TArgs = never, TResult = JSONValue>(
  options: ToolOptions<TArgs, TResult>,
): Tool {
  throw new Error(`tool is a type-check stub only: ${String(options.description ?? '')}`);
}

/**
 * 流式文本生成。
 * @param options 输入参数
 * @returns 轻量流式结果
 */
export function streamText(options: StreamTextOptions): StreamTextResult {
  throw new Error(`streamText is a type-check stub only: ${String(options.system ?? '')}`);
}

/**
 * 非流式文本生成。
 * @param options 输入参数
 * @returns 轻量生成结果
 */
export async function generateText(
  options: GenerateTextOptions,
): Promise<GenerateTextResult> {
  throw new Error(`generateText is a type-check stub only: ${options.messages.length}`);
}

/**
 * 创建步数限制器。
 * @param count 最大步数
 * @returns 停止条件
 */
export function stepCountIs(count: number): StopCondition {
  throw new Error(`stepCountIs is a type-check stub only: ${count}`);
}
