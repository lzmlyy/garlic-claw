/**
 * 模型能力配置持久化存储
 *
 * 输入:
 * - providerId
 * - modelId
 * - ModelCapabilities
 *
 * 输出:
 * - JSON 文件中的能力配置读写结果
 *
 * 预期行为:
 * - 将模型能力覆盖项持久化到项目根目录下的 config/model-capabilities.json
 * - 模块初始化时自动加载已有配置
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { JsonObject, JsonValue } from '../../common/types/json-value';
import type { ModelCapabilities } from '../types/provider.types';
import { normalizeModelCapabilitiesEntry } from './model-capabilities-normalizer';

/**
 * 单个模型能力条目。
 */
export interface ModelCapabilitiesEntry {
  /** 供应商 ID。 */
  providerId: string;
  /** 模型 ID。 */
  modelId: string;
  /** 模型能力配置。 */
  capabilities: ModelCapabilities;
  /** 更新时间。 */
  updatedAt: string;
}

/**
 * 配置文件结构。
 */
interface ModelCapabilitiesConfig {
  /** 配置版本号。 */
  version: number;
  /** 最近更新时间。 */
  lastUpdated: string;
  /** 全部模型能力条目。 */
  models: ModelCapabilitiesEntry[];
}

/**
 * 模型能力配置存储服务。
 */
@Injectable()
export class ModelCapabilitiesStorage implements OnModuleInit {
  private static readonly CURRENT_VERSION = 1;

  private readonly logger = new Logger(ModelCapabilitiesStorage.name);
  private readonly configPath: string;
  private config: ModelCapabilitiesConfig;

  constructor() {
    const projectRoot = this.findProjectRoot();
    const configDir = path.join(projectRoot, 'config');

    fs.mkdirSync(configDir, { recursive: true });

    this.configPath = path.join(configDir, 'model-capabilities.json');
    this.config = this.createEmptyConfig();
  }

  /**
   * 模块初始化时加载能力配置。
   */
  onModuleInit(): void {
    this.loadFromFile();
  }

  /**
   * 保存模型能力。
   * @param providerId 供应商 ID
   * @param modelId 模型 ID
   * @param capabilities 模型能力
   */
  saveCapabilities(
    providerId: string,
    modelId: string,
    capabilities: ModelCapabilities,
  ): void {
    const entry: ModelCapabilitiesEntry = {
      providerId,
      modelId,
      capabilities,
      updatedAt: new Date().toISOString(),
    };

    const index = this.config.models.findIndex(
      (item) => item.providerId === providerId && item.modelId === modelId,
    );

    if (index >= 0) {
      this.config.models[index] = entry;
    } else {
      this.config.models.push(entry);
    }

    this.saveToFile();
  }

  /**
   * 读取模型能力。
   * @param providerId 供应商 ID
   * @param modelId 模型 ID
   * @returns 持久化能力配置
   */
  loadCapabilities(
    providerId: string,
    modelId: string,
  ): ModelCapabilities | null {
    const entry = this.config.models.find(
      (item) => item.providerId === providerId && item.modelId === modelId,
    );
    return entry?.capabilities ?? null;
  }

  /**
   * 删除单个模型能力条目。
   * @param providerId 供应商 ID
   * @param modelId 模型 ID
   * @returns 是否删除成功
   */
  deleteCapabilities(providerId: string, modelId: string): boolean {
    const before = this.config.models.length;
    this.config.models = this.config.models.filter(
      (item) => !(item.providerId === providerId && item.modelId === modelId),
    );

    if (this.config.models.length === before) {
      return false;
    }

    this.saveToFile();
    return true;
  }

  /**
   * 删除供应商下的全部模型能力条目。
   * @param providerId 供应商 ID
   * @returns 删除条目数量
   */
  deleteProviderCapabilities(providerId: string): number {
    const before = this.config.models.length;
    this.config.models = this.config.models.filter(
      (item) => item.providerId !== providerId,
    );

    const deleted = before - this.config.models.length;
    if (deleted > 0) {
      this.saveToFile();
    }

    return deleted;
  }

  /**
   * 获取全部模型能力条目。
   * @returns 持久化条目列表
   */
  getAllCapabilities(): ModelCapabilitiesEntry[] {
    return [...this.config.models];
  }

  /**
   * 创建空配置。
   * @returns 默认配置对象
   */
  private createEmptyConfig(): ModelCapabilitiesConfig {
    return {
      version: ModelCapabilitiesStorage.CURRENT_VERSION,
      lastUpdated: new Date().toISOString(),
      models: [],
    };
  }

  /**
   * 加载配置文件。
   */
  private loadFromFile(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.saveToFile();
        return;
      }

      const content = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(content) as JsonValue;

      if (!isJsonObjectValue(parsed) || !Array.isArray(parsed.models)) {
        this.logger.warn('模型能力配置文件格式无效，已重置为空配置');
        this.config = this.createEmptyConfig();
        this.saveToFile();
        return;
      }

      const normalizedConfig: ModelCapabilitiesConfig = {
        version:
          typeof parsed.version === 'number'
            ? parsed.version
            : ModelCapabilitiesStorage.CURRENT_VERSION,
        lastUpdated:
          typeof parsed.lastUpdated === 'string'
            ? parsed.lastUpdated
            : new Date().toISOString(),
        models: parsed.models
          .map((entry: JsonValue) => normalizeModelCapabilitiesEntry(entry))
          .filter(
            (
              entry: ReturnType<typeof normalizeModelCapabilitiesEntry>,
            ): entry is ModelCapabilitiesEntry => entry !== null,
          ),
      };

      this.config = normalizedConfig;
      if (JSON.stringify(parsed) !== JSON.stringify(normalizedConfig)) {
        this.saveToFile();
      }
    } catch (error) {
      this.logger.error(`加载模型能力配置失败: ${String(error)}`);
      this.config = this.createEmptyConfig();
      this.saveToFile();
    }
  }

  /**
   * 写回配置文件。
   */
  private saveToFile(): void {
    this.config.lastUpdated = new Date().toISOString();
    fs.writeFileSync(
      this.configPath,
      JSON.stringify(this.config, null, 2),
      'utf-8',
    );
  }

  /**
   * 查找项目根目录。
   * @returns 项目根目录绝对路径
   */
  private findProjectRoot(): string {
    const candidates = [
      path.resolve(__dirname, '..', '..', '..', '..', '..', '..'),
      path.resolve(process.cwd(), '..', '..'),
      path.resolve(process.cwd(), '..'),
      process.cwd(),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(path.join(candidate, 'package.json'))) {
        return candidate;
      }
    }

    return process.cwd();
  }
}

/**
 * 判断 JSON 值是否为普通对象。
 * @param value 任意 JSON 值
 * @returns 是否可按对象结构读取
 */
function isJsonObjectValue(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
