import type { PluginLlmMessage } from './types/plugin';

export function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

export function hasImagePart(messages: PluginLlmMessage[]): boolean {
  return messages.some((message) =>
    Array.isArray(message.content)
    && message.content.some((part) => part.type === 'image'),
  );
}
