import type { ConversationHostServices } from '@garlic-claw/shared';

export const DEFAULT_CONVERSATION_HOST_SERVICES: ConversationHostServices = {
  sessionEnabled: true,
  llmEnabled: true,
  ttsEnabled: true,
};

/**
 * 解析并归一化会话级宿主服务设置。
 * @param raw 持久化 JSON
 * @returns 归一化后的设置
 */
export function normalizeConversationHostServices(
  raw?: string | null,
): ConversationHostServices {
  if (!raw) {
    return { ...DEFAULT_CONVERSATION_HOST_SERVICES };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ConversationHostServices>;
    return {
      sessionEnabled:
        typeof parsed.sessionEnabled === 'boolean'
          ? parsed.sessionEnabled
          : DEFAULT_CONVERSATION_HOST_SERVICES.sessionEnabled,
      llmEnabled:
        typeof parsed.llmEnabled === 'boolean'
          ? parsed.llmEnabled
          : DEFAULT_CONVERSATION_HOST_SERVICES.llmEnabled,
      ttsEnabled:
        typeof parsed.ttsEnabled === 'boolean'
          ? parsed.ttsEnabled
          : DEFAULT_CONVERSATION_HOST_SERVICES.ttsEnabled,
    };
  } catch {
    return { ...DEFAULT_CONVERSATION_HOST_SERVICES };
  }
}

/**
 * 在现有设置上合并新的局部更新。
 * @param current 当前归一化设置
 * @param patch 新的局部变更
 * @returns 合并后的设置
 */
export function mergeConversationHostServices(
  current: ConversationHostServices,
  patch: Partial<ConversationHostServices>,
): ConversationHostServices {
  return {
    ...current,
    ...(typeof patch.sessionEnabled === 'boolean'
      ? { sessionEnabled: patch.sessionEnabled }
      : {}),
    ...(typeof patch.llmEnabled === 'boolean'
      ? { llmEnabled: patch.llmEnabled }
      : {}),
    ...(typeof patch.ttsEnabled === 'boolean'
      ? { ttsEnabled: patch.ttsEnabled }
      : {}),
  };
}
