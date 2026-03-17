import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private memoryCache = new Map<string, CacheEntry<any>>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private useRedis: boolean;

  constructor(private configService: ConfigService) {
    this.useRedis = this.configService.get<string>('REDIS_URL') !== undefined;

    if (this.useRedis) {
      this.logger.log('使用 Redis 作为缓存后端');
      // TODO: 初始化 Redis 客户端
    } else {
      this.logger.log('使用内存作为缓存后端');
      this.startCleanupInterval();
    }
  }

  /**
   * 设置缓存值
   * @param key 缓存键
   * @param value 缓存值
   * @param ttl 过期时间（秒），默认 300 秒（5 分钟）
   */
  async set<T>(key: string, value: T, ttl: number = 300): Promise<void> {
    const expiresAt = Date.now() + ttl * 1000;

    if (this.useRedis) {
      // TODO: 实现 Redis 缓存
      // await this.redisClient.set(key, JSON.stringify(value), 'EX', ttl);
      this.logger.debug(`设置 Redis 缓存: ${key}, TTL: ${ttl}s`);
    } else {
      this.memoryCache.set(key, { value, expiresAt });
      this.logger.debug(`设置内存缓存: ${key}, TTL: ${ttl}s`);
    }
  }

  /**
   * 获取缓存值
   * @param key 缓存键
   * @returns 缓存值，如果不存在或已过期则返回 null
   */
  async get<T>(key: string): Promise<T | null> {
    if (this.useRedis) {
      // TODO: 实现 Redis 缓存获取
      // const value = await this.redisClient.get(key);
      // return value ? JSON.parse(value) : null;
      return null;
    }

    const entry = this.memoryCache.get(key);

    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * 删除缓存
   * @param key 缓存键
   */
  async delete(key: string): Promise<void> {
    if (this.useRedis) {
      // TODO: 实现 Redis 删除
      // await this.redisClient.del(key);
      this.logger.debug(`删除 Redis 缓存: ${key}`);
    } else {
      this.memoryCache.delete(key);
      this.logger.debug(`删除内存缓存: ${key}`);
    }
  }

  /**
   * 检查缓存是否存在且未过期
   * @param key 缓存键
   */
  async has(key: string): Promise<boolean> {
    if (this.useRedis) {
      // TODO: 实现 Redis 存在检查
      // return (await this.redisClient.exists(key)) === 1;
      return false;
    }

    const entry = this.memoryCache.get(key);

    if (!entry) {
      return false;
    }

    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    if (this.useRedis) {
      // TODO: 实现 Redis 清空
      // await this.redisClient.flushDb();
      this.logger.debug('清空 Redis 缓存');
    } else {
      this.memoryCache.clear();
      this.logger.debug('清空内存缓存');
    }
  }

  /**
   * 获取或设置缓存（缓存穿透保护）
   * @param key 缓存键
   * @param factory 缓存未命中时的值工厂函数
   * @param ttl 过期时间（秒）
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl: number = 300): Promise<T> {
    const cached = await this.get<T>(key);

    if (cached !== null) {
      this.logger.debug(`缓存命中: ${key}`);
      return cached;
    }

    this.logger.debug(`缓存未命中: ${key}, 执行工厂函数`);
    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * 批量获取缓存
   * @param keys 缓存键数组
   */
  async getMany<T>(keys: string[]): Promise<Map<string, T | null>> {
    const result = new Map<string, T | null>();

    for (const key of keys) {
      result.set(key, await this.get<T>(key));
    }

    return result;
  }

  /**
   * 批量设置缓存
   * @param entries 键值对数组
   * @param ttl 过期时间（秒）
   */
  async setMany<T>(entries: Array<{ key: string; value: T }>, ttl: number = 300): Promise<void> {
    for (const { key, value } of entries) {
      await this.set(key, value, ttl);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    if (this.useRedis) {
      return {
        backend: 'redis',
        keys: 0, // TODO: 从 Redis 获取
      };
    }

    const now = Date.now();
    let expiredCount = 0;
    let validCount = 0;

    for (const entry of this.memoryCache.values()) {
      if (now > entry.expiresAt) {
        expiredCount++;
      } else {
        validCount++;
      }
    }

    return {
      backend: 'memory',
      totalKeys: this.memoryCache.size,
      validKeys: validCount,
      expiredKeys: expiredCount,
    };
  }

  /**
   * 清理过期的内存缓存条目
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (now > entry.expiresAt) {
        this.memoryCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`清理了 ${cleanedCount} 个过期缓存条目`);
    }
  }

  /**
   * 启动定时清理任务
   */
  private startCleanupInterval(): void {
    // 每 60 秒清理一次过期缓存
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000);

    this.logger.debug('启动缓存清理定时任务（每 60 秒）');
  }

  /**
   * 模块销毁时清理资源
   */
  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.debug('停止缓存清理定时任务');
    }

    if (this.useRedis) {
      // TODO: 关闭 Redis 连接
      // await this.redisClient.quit();
    }
  }
}