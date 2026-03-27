import type { JsonValue } from '../../common/types/json-value';
import { toJsonValue } from '../../common/utils/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.transport';

/**
 * Route 探针插件返回的会话摘要。
 */
interface RouteInspectorConversationSummary {
  id?: string;
  title?: string;
}

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
      name: 'Route Inspector',
      version: '1.0.0',
      runtime: 'builtin',
      permissions: ['conversation:read', 'user:read'],
      tools: [],
      routes: [
        {
          path: 'inspect/context',
          methods: ['GET'],
          description: '返回当前插件路由看到的用户与会话上下文',
        },
      ],
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
        let conversation: RouteInspectorConversationSummary | null = null;
        let messageCount = 0;

        if (context.callContext.conversationId) {
          conversation = (await context.host.getConversation()) as RouteInspectorConversationSummary;
          const messages = (await context.host.listConversationMessages()) as JsonValue[];
          messageCount = Array.isArray(messages) ? messages.length : 0;
        }

        return {
          status: 200,
          body: toJsonValue({
            plugin,
            user,
            conversation,
            messageCount,
          }),
        };
      },
    },
  };
}
