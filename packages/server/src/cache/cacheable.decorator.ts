import type { CacheService } from "./cache.service";

type AsyncMethod = (...args: unknown[]) => Promise<unknown>;

interface CacheableHost {
  cacheService?: CacheService;
}

/**
 * Cache async method result by args for a fixed TTL.
 */
export function Cacheable(
  ttlSeconds: number,
  prefix?: string,
): MethodDecorator {
  return (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const originalMethod = descriptor.value as
      | ((...args: unknown[]) => unknown)
      | undefined;
    if (typeof originalMethod !== "function") {
      return;
    }

    descriptor.value = async function (
      this: CacheableHost,
      ...args: unknown[]
    ) {
      const cacheService = this.cacheService;
      if (!cacheService) {
        return originalMethod.apply(this, args);
      }

      const cachePrefix =
        prefix ?? `${target.constructor.name}:${String(propertyKey)}`;
      const cacheKey = serializeArguments(args);

      return cacheService.getOrSet({
        prefix: cachePrefix,
        key: cacheKey,
        ttlSeconds,
        factory: async () => originalMethod.apply(this, args),
      });
    } as AsyncMethod;
  };
}

function serializeArguments(args: unknown[]): string {
  try {
    return JSON.stringify(args) ?? "[]";
  } catch {
    return "[unserializable]";
  }
}
