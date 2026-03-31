/**
 * AI 配置管理服务
 *
 * 输入:
 * - provider 配置的增删改查请求
 * - 视觉转述配置读写请求
 *
 * 输出:
 * - 持久化到项目根目录 config/ai-settings.json 的配置结果
 *
 * 预期行为:
 * - 用单一 JSON 文件持久化 provider 与 vision fallback 配置
 * - 不再依赖历史 .env 兼容路径
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import type { JsonValue } from '../../common/types/json-value';
import type {
  AiSettingsFile,
  StoredAiHostModelRoutingConfig,
  StoredAiProviderConfig,
  StoredVisionFallbackConfig,
} from './config-manager.types';
import { normalizeAiSettingsFile } from './config-manager.loader';
import { resolveConfigFilePath } from './config-path.util';

export type {
  AiSettingsFile,
  StoredAiHostModelRoutingConfig,
  StoredAiProviderConfig,
  StoredVisionFallbackConfig,
} from './config-manager.types';

@Injectable()
export class ConfigManagerService {
  private static readonly CURRENT_VERSION = 3;

  private readonly logger = new Logger(ConfigManagerService.name);
  private readonly settingsPath: string;
  private settings: AiSettingsFile;

  constructor() {
    this.settingsPath = resolveConfigFilePath(
      'GARLIC_CLAW_AI_SETTINGS_PATH',
      'ai-settings.json',
    );
    this.settings = this.loadSettings();
  }

  /**
   * 获取全部 provider 配置。
   * @returns provider 配置列表
   */
  listProviders(): StoredAiProviderConfig[] {
    return this.settings.providers.map((provider) => ({
      ...provider,
      models: [...provider.models],
    }));
  }

  /**
   * 获取单个 provider 配置。
   * @param providerId provider ID
   * @returns provider 配置，不存在时返回 null
   */
  getProviderConfig(providerId: string): StoredAiProviderConfig | null {
    const provider = this.settings.providers.find((item) => item.id === providerId);
    return provider
      ? { ...provider, models: [...provider.models] }
      : null;
  }

  /**
   * 新增或更新 provider 配置。
   * @param providerId provider ID
   * @param config provider 配置
   * @returns 写入后的 provider 配置
   */
  upsertProvider(
    providerId: string,
    config: Omit<StoredAiProviderConfig, 'id'>,
  ): StoredAiProviderConfig {
    const normalized: StoredAiProviderConfig = {
      id: providerId,
      name: config.name,
      mode: config.mode,
      driver: config.driver,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      defaultModel: config.defaultModel,
      models: [...config.models],
    };

    const index = this.settings.providers.findIndex((item) => item.id === providerId);
    if (index >= 0) {
      this.settings.providers[index] = normalized;
    } else {
      this.settings.providers.push(normalized);
    }

    this.saveSettings();
    return { ...normalized, models: [...normalized.models] };
  }

  /**
   * 删除 provider 配置。
   * @param providerId provider ID
   * @returns 是否删除成功
   */
  removeProvider(providerId: string): boolean {
    const before = this.settings.providers.length;
    this.settings.providers = this.settings.providers.filter(
      (item) => item.id !== providerId,
    );

    if (this.settings.providers.length === before) {
      return false;
    }

    this.saveSettings();
    return true;
  }

  /**
   * 获取视觉转述配置。
   * @returns 当前视觉转述配置
   */
  getVisionFallbackConfig(): StoredVisionFallbackConfig {
    return { ...this.settings.visionFallback };
  }

  /**
   * 更新视觉转述配置。
   * @param config 新配置
   * @returns 写入后的配置
   */
  updateVisionFallbackConfig(
    config: StoredVisionFallbackConfig,
  ): StoredVisionFallbackConfig {
    this.settings.visionFallback = { ...config };
    this.saveSettings();
    return { ...this.settings.visionFallback };
  }

  /**
   * 获取宿主模型路由配置。
   * @returns 当前宿主模型路由配置
   */
  getHostModelRoutingConfig(): StoredAiHostModelRoutingConfig {
    return cloneHostModelRoutingConfig(this.settings.hostModelRouting);
  }

  /**
   * 更新宿主模型路由配置。
   * @param config 新配置
   * @returns 写入后的配置
   */
  updateHostModelRoutingConfig(
    config: StoredAiHostModelRoutingConfig,
  ): StoredAiHostModelRoutingConfig {
    this.settings.hostModelRouting = cloneHostModelRoutingConfig(config);
    this.saveSettings();
    return cloneHostModelRoutingConfig(this.settings.hostModelRouting);
  }

  /**
   * 加载设置文件。
   * @returns 已加载的设置
   */
  private loadSettings(): AiSettingsFile {
    if (!fs.existsSync(this.settingsPath)) {
      const empty = this.createEmptySettings();
      fs.writeFileSync(this.settingsPath, JSON.stringify(empty, null, 2), 'utf-8');
      return empty;
    }

    try {
      const normalized = normalizeAiSettingsFile(
        JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8')) as JsonValue,
        ConfigManagerService.CURRENT_VERSION,
      );
      if (normalized.changed) {
        const migratedAt = new Date().toISOString();
        fs.writeFileSync(
          this.settingsPath,
          JSON.stringify(
            {
              ...normalized.settings,
              updatedAt: migratedAt,
            },
            null,
            2,
          ),
          'utf-8',
        );

        return {
          ...normalized.settings,
          updatedAt: migratedAt,
        };
      }

      return normalized.settings;
    } catch (error) {
      this.logger.warn(`AI 设置文件损坏，已重置为空配置: ${String(error)}`);
      const empty = this.createEmptySettings();
      fs.writeFileSync(this.settingsPath, JSON.stringify(empty, null, 2), 'utf-8');
      return empty;
    }
  }

  /**
   * 写回设置文件。
   */
  private saveSettings(): void {
    this.settings.updatedAt = new Date().toISOString();
    fs.writeFileSync(
      this.settingsPath,
      JSON.stringify(this.settings, null, 2),
      'utf-8',
    );
  }

  /**
   * 创建空配置。
   * @returns 默认配置对象
   */
  private createEmptySettings(): AiSettingsFile {
    return {
      version: ConfigManagerService.CURRENT_VERSION,
      updatedAt: new Date().toISOString(),
      providers: [],
      visionFallback: {
        enabled: false,
      },
      hostModelRouting: {
        fallbackChatModels: [],
        utilityModelRoles: {},
      },
    };
  }

}

function cloneHostModelRoutingConfig(
  config: StoredAiHostModelRoutingConfig,
): StoredAiHostModelRoutingConfig {
  return {
    fallbackChatModels: config.fallbackChatModels.map((target) => ({
      ...target,
    })),
    ...(config.compressionModel
      ? { compressionModel: { ...config.compressionModel } }
      : {}),
    utilityModelRoles: Object.fromEntries(
      Object.entries(config.utilityModelRoles).map(([role, target]) => [
        role,
        target ? { ...target } : target,
      ]),
    ) as StoredAiHostModelRoutingConfig['utilityModelRoles'],
  };
}
