import { Injectable, OnModuleDestroy } from "@nestjs/common";

interface MemoryCacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface CacheGetSetOptions<T> {
  prefix: string;
  key: string;
  ttlSeconds?: number;
  factory: () => Promise<T>;
}

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly storage = new Map<string, MemoryCacheEntry<unknown>>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, 60_000);
  }

  async get<T>(prefix: string, key: string): Promise<T | null> {
    const namespacedKey = this.buildKey(prefix, key);
    const entry = this.storage.get(namespacedKey);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.storage.delete(namespacedKey);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(
    prefix: string,
    key: string,
    value: T,
    ttlSeconds = 300,
  ): Promise<void> {
    const namespacedKey = this.buildKey(prefix, key);
    const expiresAt = Date.now() + Math.max(ttlSeconds, 1) * 1000;
    this.storage.set(namespacedKey, {
      value,
      expiresAt,
    });
  }

  async delete(prefix: string, key: string): Promise<void> {
    this.storage.delete(this.buildKey(prefix, key));
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    const prefixToken = `${prefix}:`;
    for (const namespacedKey of this.storage.keys()) {
      if (namespacedKey.startsWith(prefixToken)) {
        this.storage.delete(namespacedKey);
      }
    }
  }

  async getOrSet<T>(options: CacheGetSetOptions<T>): Promise<T> {
    const ttlSeconds = options.ttlSeconds ?? 300;
    const cached = await this.get<T>(options.prefix, options.key);
    if (cached !== null) {
      return cached;
    }

    const value = await options.factory();
    await this.set(options.prefix, options.key, value, ttlSeconds);
    return value;
  }

  buildKey(prefix: string, key: string): string {
    return `${prefix}:${key}`;
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.storage.entries()) {
      if (entry.expiresAt <= now) {
        this.storage.delete(key);
      }
    }
  }
}
