import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LanguageModel } from 'ai';

export type AiProviderName = 'openai' | 'anthropic' | 'ollama';

@Injectable()
export class AiProviderService {
  private providers = new Map<string, (model: string) => LanguageModel>();

  constructor(private configService: ConfigService) {
    this.registerProviders();
  }

  private registerProviders() {
    const openaiKey = this.configService.get<string>('OPENAI_API_KEY');
    const openaiBaseUrl = this.configService.get<string>('OPENAI_BASE_URL');
    if (openaiKey) {
      const openai = createOpenAI({
        apiKey: openaiKey,
        baseURL: openaiBaseUrl || undefined,
      });
      // 使用 .chat() 用于 Chat Completions API（兼容 Dashscope/Qwen 等）
      // 默认的 openai() 使用 Responses API，第三方提供商不支持
      this.providers.set('openai', (model: string) => openai.chat(model));
    }

    const anthropicKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (anthropicKey) {
      const anthropic = createAnthropic({ apiKey: anthropicKey });
      this.providers.set('anthropic', (model: string) => anthropic(model));
    }

    // Ollama 使用 OpenAI 兼容 API
    const ollamaBaseUrl = this.configService.get<string>('OLLAMA_BASE_URL');
    if (ollamaBaseUrl) {
      const ollama = createOpenAI({
        apiKey: 'ollama',
        baseURL: `${ollamaBaseUrl}/v1`,
      });
      this.providers.set('ollama', (model: string) => ollama.chat(model));
    }
  }

  getModel(provider?: string, model?: string): LanguageModel {
    const providerName =
      provider ||
      this.configService.get<string>('DEFAULT_AI_PROVIDER', 'openai');
    const modelName =
      model || this.configService.get<string>('DEFAULT_AI_MODEL', 'gpt-4o');

    const factory = this.providers.get(providerName);
    if (!factory) {
      throw new Error(
        `AI 提供商 "${providerName}" 未配置。可用的：${[...this.providers.keys()].join(', ')}`,
      );
    }

    return factory(modelName);
  }

  getAvailableProviders(): string[] {
    return [...this.providers.keys()];
  }
}
