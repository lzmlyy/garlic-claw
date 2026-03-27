/**
 * 供应商注册表服务
 *
 * 输入:
 * - 供应商配置
 * - 供应商工厂函数
 * - 供应商实例创建选项
 *
 * 输出:
 * - 已注册供应商配置
 * - 对应的 provider instance
 *
 * 预期行为:
 * - 提供统一的供应商注册、查询、实例缓存与注销能力
 * - 相同 provider + 相同 options 命中缓存实例
 */

import { Injectable, Logger } from '@nestjs/common';
import type {
  ProviderConfig,
  ProviderFactory,
  ProviderId,
  ProviderInstance,
  ProviderLoader,
  ProviderOptions,
} from '../types';

/**
 * 注册表内部条目。
 */
interface ProviderEntry {
  /** 供应商配置。 */
  config: ProviderConfig;
  /** 供应商工厂函数。 */
  factory: ProviderFactory;
  /** 可选的自定义加载器。 */
  loader?: ProviderLoader;
  /** 已缓存的 provider instance。 */
  instance?: ProviderInstance;
  /** 当前缓存实例对应的选项哈希。 */
  optionsHash?: string;
}

/**
 * 供应商注册表服务。
 */
@Injectable()
export class ProviderRegistryService {
  private readonly logger = new Logger(ProviderRegistryService.name);
  private readonly providers = new Map<ProviderId, ProviderEntry>();

  /**
   * 注册供应商。
   * @param config 供应商配置
   * @param factory 供应商工厂函数
   * @param loader 可选加载器
   */
  registerProvider(
    config: ProviderConfig,
    factory: ProviderFactory,
    loader?: ProviderLoader,
  ): void {
    const providerId =
      typeof config.id === 'string'
        ? (config.id as ProviderId)
        : config.id;

    if (this.providers.has(providerId)) {
      this.logger.warn(`Provider "${config.id}" already registered, overwriting`);
    }

    this.providers.set(providerId, {
      config: {
        ...config,
        id: providerId,
      },
      factory,
      loader,
    });
  }

  /**
   * 注册供应商的别名方法。
   * @param config 供应商配置
   * @param factory 供应商工厂函数
   * @param loader 可选加载器
   */
  register(
    config: ProviderConfig,
    factory: ProviderFactory,
    loader?: ProviderLoader,
  ): void {
    this.registerProvider(config, factory, loader);
  }

  /**
   * 获取供应商配置。
   * @param id 供应商 ID
   * @returns 供应商配置
   */
  getProviderConfig(id: ProviderId): ProviderConfig | undefined {
    return this.providers.get(id)?.config;
  }

  /**
   * 根据显式选项获取供应商实例。
   * @param id 供应商 ID
   * @param options 供应商选项
   * @returns 供应商实例
   */
  getProviderInstance(
    id: ProviderId,
    options: ProviderOptions,
  ): ProviderInstance | undefined {
    const entry = this.providers.get(id);
    if (!entry) {
      return undefined;
    }

    const optionsHash = this.hashOptions(options);
    if (entry.instance && entry.optionsHash === optionsHash) {
      return entry.instance;
    }

    const instance = entry.factory(options);
    entry.instance = instance;
    entry.optionsHash = optionsHash;
    return instance;
  }

  /**
   * 获取默认实例。
   * @param id 供应商 ID
   * @returns 供应商实例
   */
  getProvider(id: ProviderId | string): ProviderInstance | undefined {
    return this.getProviderInstance(id as ProviderId, {});
  }

  /**
   * 获取供应商加载器。
   * @param id 供应商 ID
   * @returns 加载器配置
   */
  getProviderLoader(id: ProviderId): ProviderLoader | undefined {
    return this.providers.get(id)?.loader;
  }

  /**
   * 列出所有供应商配置。
   * @returns 供应商配置列表
   */
  listProviders(): ProviderConfig[] {
    return Array.from(this.providers.values()).map((entry) => entry.config);
  }

  /**
   * 列出所有供应商 ID。
   * @returns 供应商 ID 列表
   */
  listProviderIds(): ProviderId[] {
    return Array.from(this.providers.keys());
  }

  /**
   * 检查供应商是否已注册。
   * @param id 供应商 ID
   * @returns 是否已注册
   */
  hasProvider(id: ProviderId | string): boolean {
    return this.providers.has(id as ProviderId);
  }

  /**
   * 检查供应商是否可用。
   * @param id 供应商 ID
   * @param envGetter 环境变量读取函数
   * @returns 是否可用
   */
  isProviderAvailable(
    id: ProviderId,
    envGetter: (key: string) => string | undefined,
  ): boolean {
    const config = this.providers.get(id)?.config;
    if (!config) {
      return false;
    }

    for (const envKey of config.env ?? []) {
      if (!envGetter(envKey)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 获取可用的供应商 ID 列表。
   * @param envGetter 环境变量读取函数
   * @returns 可用供应商 ID 列表
   */
  getAvailableProviderIds(
    envGetter: (key: string) => string | undefined,
  ): ProviderId[] {
    return this.listProviderIds().filter((id) =>
      this.isProviderAvailable(id, envGetter),
    );
  }

  /**
   * 注销供应商。
   * @param id 供应商 ID
   * @returns 是否注销成功
   */
  unregisterProvider(id: ProviderId): boolean {
    const removed = this.providers.delete(id);
    if (removed) {
      this.logger.log(`Unregistered provider: ${id}`);
    }
    return removed;
  }

  /**
   * 清空缓存实例。
   */
  clearInstances(): void {
    for (const entry of this.providers.values()) {
      entry.instance = undefined;
      entry.optionsHash = undefined;
    }
  }

  /**
   * 获取注册数量。
   * @returns 注册的供应商数量
   */
  getProviderCount(): number {
    return this.providers.size;
  }

  /**
   * 计算 provider options 的稳定哈希。
   * @param options 供应商选项
   * @returns 哈希字符串
   */
  private hashOptions(options: ProviderOptions): string {
    return JSON.stringify({
      name: options.name ?? '',
      apiKey: options.apiKey ?? '',
      baseURL: options.baseURL ?? '',
      timeout: options.timeout ?? '',
    });
  }
}
