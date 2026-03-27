import {
  createDefaultCapabilities,
  type ModelCapabilities,
} from './types/provider.types';

/**
 * 根据模型 ID 推断能力。
 *
 * 输入:
 * - 模型 ID
 *
 * 输出:
 * - 简化后的模型能力
 *
 * 预期行为:
 * - 未显式配置能力时提供稳定推断
 * - 只保留 text/image + reasoning/toolCall
 */
export function inferModelCapabilities(modelId: string): ModelCapabilities {
  const capabilities = createDefaultCapabilities();
  const normalizedId = modelId.toLowerCase();

  if (
    normalizedId.includes('gpt-4o') ||
    normalizedId.includes('vision') ||
    normalizedId.includes('claude') ||
    normalizedId.includes('gemini') ||
    normalizedId.includes('multimodal') ||
    normalizedId.includes('pixtral') ||
    normalizedId.includes('grok-2-vision')
  ) {
    capabilities.input.image = true;
  }

  if (
    normalizedId.includes('o1') ||
    normalizedId.includes('o3') ||
    normalizedId.includes('reason') ||
    normalizedId.includes('thinking') ||
    normalizedId.includes('r1')
  ) {
    capabilities.reasoning = true;
  }

  if (
    normalizedId.includes('embedding') ||
    normalizedId.includes('transcribe') ||
    normalizedId.includes('whisper')
  ) {
    capabilities.toolCall = false;
  }

  return capabilities;
}
