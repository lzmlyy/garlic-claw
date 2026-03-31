/**
 * 供应商注册表服务
 *
 * 输入:
 * - 供应商配置
 *
 * 输出:
 * - 已注册供应商配置
 *
 * 预期行为:
 * - 提供统一的供应商注册、查询与注销能力
 * - 注册表本身只保存 provider 配置，不负责实例创建与缓存
 */

import { Injectable, Logger } from '@nestjs/common';
import type {
  ProviderConfig,
  ProviderId,
} from '../types';
import { createProviderId } from '../types';

/**
 * 供应商注册表服务。
 */
@Injectable()
export class ProviderRegistryService {
  private readonly logger = new Logger(ProviderRegistryService.name);
  private readonly providers = new Map<ProviderId, ProviderConfig>();

  /**
   * 注册供应商。
   * @param config 供应商配置
   */
  registerProvider(
    config: ProviderConfig,
  ): void {
    const providerId =
      typeof config.id === 'string'
        ? createProviderId(config.id)
        : config.id;

    if (this.providers.has(providerId)) {
      this.logger.warn(`Provider "${config.id}" already registered, overwriting`);
    }

    this.providers.set(providerId, {
      ...config,
      id: providerId,
    });
  }

  /**
   * 获取供应商配置。
   * @param id 供应商 ID
   * @returns 供应商配置
   */
  getProviderConfig(id: ProviderId | string): ProviderConfig | undefined {
    const providerId = typeof id === 'string' ? createProviderId(id) : id;
    return this.providers.get(providerId);
  }

  /**
   * 检查供应商是否已注册。
   * @param id 供应商 ID
   * @returns 是否已注册
   */
  hasProvider(id: ProviderId | string): boolean {
    const providerId = typeof id === 'string' ? createProviderId(id) : id;
    return this.providers.has(providerId);
  }

  /**
   * 注销供应商。
   * @param id 供应商 ID
   * @returns 是否注销成功
   */
  unregisterProvider(id: ProviderId | string): boolean {
    const providerId = typeof id === 'string' ? createProviderId(id) : id;
    const removed = this.providers.delete(providerId);
    if (removed) {
      this.logger.log(`Unregistered provider: ${providerId}`);
    }
    return removed;
  }
}
