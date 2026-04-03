import {
  createRouteInspectorContextResponse,
  readConversationSummary,
  ROUTE_INSPECTOR_MANIFEST_ROUTES,
} from '@garlic-claw/plugin-sdk';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

/**
 * 创建一个用于验证插件 Web Route 能力的内建插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `routes` 声明和 route handler 的内建插件定义
 *
 * 预期行为:
 * - 通过统一 Route 协议返回当前用户、插件和可选会话摘要
 * - 仅通过统一 Host API 读取宿主上下文
 */
export function createRouteInspectorPlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.route-inspector',
      name: '路由探针',
      version: '1.0.0',
      runtime: 'builtin',
      description: '用于查看插件 Web Route 可见上下文的内建诊断插件。',
      permissions: ['conversation:read', 'user:read'],
      tools: [],
      routes: ROUTE_INSPECTOR_MANIFEST_ROUTES,
    },
    routes: {
      /**
       * 返回当前用户、插件和可选会话摘要。
       * @param _request Route 请求
       * @param context 插件执行上下文
       * @returns JSON Route 响应
       */
      'inspect/context': async (_request, context) => {
        const plugin = await context.host.getPluginSelf();
        const user = await context.host.getUser();
        let conversation: {
          id?: string;
          title?: string;
        } | null = null;
        let messageCount = 0;

        if (context.callContext.conversationId) {
          conversation = readConversationSummary(await context.host.getConversation());
          const messages = await context.host.listConversationMessages();
          messageCount = Array.isArray(messages) ? messages.length : 0;
        }

        return createRouteInspectorContextResponse({
          plugin,
          user,
          conversation,
          messageCount,
        });
      },
    },
  };
}
