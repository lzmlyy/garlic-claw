import type { PluginCallContext, PluginScopeSettings } from '@garlic-claw/shared';

/**
 * 运行时最小会话等待态标识。
 */
export interface RuntimeConversationSessionRef {
  pluginId: string;
  conversationId: string;
}

/**
 * 判断插件在当前上下文是否启用。
 * @param scope 插件作用域
 * @param context 当前调用上下文
 * @returns 是否启用
 */
export function isPluginEnabledForContext(
  scope: PluginScopeSettings,
  context: Pick<PluginCallContext, 'conversationId'>,
): boolean {
  const conversationId = context.conversationId;
  if (conversationId) {
    const scoped = scope.conversations[conversationId];
    if (typeof scoped === 'boolean') {
      return scoped;
    }
  }

  return scope.defaultEnabled;
}

/**
 * 找出某个插件当前应该被剔除的活动会话等待态。
 * @param sessions 当前运行时等待态引用
 * @param pluginId 插件 ID
 * @param scope 最新作用域
 * @returns 需要删除的会话 ID 列表
 */
export function collectDisabledConversationSessionIds(
  sessions: Iterable<RuntimeConversationSessionRef>,
  pluginId: string,
  scope: PluginScopeSettings,
): string[] {
  const conversationIds: string[] = [];
  for (const session of sessions) {
    if (session.pluginId !== pluginId) {
      continue;
    }
    if (!isPluginEnabledForContext(scope, { conversationId: session.conversationId })) {
      conversationIds.push(session.conversationId);
    }
  }

  return conversationIds;
}
