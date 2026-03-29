import type {
  PluginAvailableToolSummary,
  PluginInvocationSource,
} from '@garlic-claw/shared';
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import type { PluginRuntimeService } from '../plugin/plugin-runtime.service';

/**
 * 插件参数 schema 的最小形状。
 */
interface PluginParameterSchema {
  /** 参数类型。 */
  type: string;
  /** 参数描述。 */
  description?: string;
  /** 是否必填。 */
  required?: boolean;
}

/**
 * 任意 JSON 值 schema。
 */
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

/**
 * 将 PluginParamSchema 记录转换为 Zod 对象模式。
 */
function paramSchemaToZod(params: Record<string, PluginParameterSchema>) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, schema] of Object.entries(params)) {
    let zType: z.ZodTypeAny;
    switch (schema.type) {
      case 'number':
        zType = z.number();
        break;
      case 'boolean':
        zType = z.boolean();
        break;
      case 'array':
        zType = z.array(jsonValueSchema);
        break;
      case 'object':
        zType = z.record(z.string(), jsonValueSchema);
        break;
      default:
        zType = z.string();
    }
    if (schema.description) {
      zType = zType.describe(schema.description);
    }
    if (!schema.required) {
      zType = zType.optional();
    }
    shape[key] = zType;
  }
  return z.object(shape);
}

/**
 * 从统一插件 runtime 动态构建 AI 工具。
 * 远程插件保留 `<pluginId>__<toolName>` 命名，内建插件直接暴露原始工具名。
 */
export function getPluginTools(
  runtime: PluginRuntimeService,
  context: {
    source?: PluginInvocationSource;
    userId: string;
    conversationId: string;
    activeProviderId: string;
    activeModelId: string;
    activePersonaId?: string;
  },
) {
  const toolEntries = runtime.listTools({
    source: context.source ?? 'chat-tool',
    userId: context.userId,
    conversationId: context.conversationId,
    activeProviderId: context.activeProviderId,
    activeModelId: context.activeModelId,
    activePersonaId: context.activePersonaId,
  });
  const tools: Record<string, Tool> = {};

  for (const entry of toolEntries) {
    const toolName = entry.runtimeKind === 'builtin'
      ? entry.tool.name
      : `${entry.pluginId}__${entry.tool.name}`;
    tools[toolName] = tool({
      description: entry.runtimeKind === 'builtin'
        ? entry.tool.description
        : `[插件：${entry.pluginId}] ${entry.tool.description}`,
      inputSchema: paramSchemaToZod(entry.tool.parameters),
      execute: async (args: JsonObject) => {
        try {
          return await runtime.executeTool({
            pluginId: entry.pluginId,
            toolName: entry.tool.name,
            params: args,
            context: {
              source: context.source ?? 'chat-tool',
              userId: context.userId,
              conversationId: context.conversationId,
              activeProviderId: context.activeProviderId,
              activeModelId: context.activeModelId,
              activePersonaId: context.activePersonaId,
            },
          });
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    });
  }

  return tools;
}

/**
 * 输出聊天侧当前可见的插件工具摘要。
 * @param runtime 统一插件运行时
 * @param context 当前聊天上下文
 * @returns 可序列化工具摘要列表
 */
export function getPluginToolSummaries(
  runtime: PluginRuntimeService,
  context: {
    source?: PluginInvocationSource;
    userId: string;
    conversationId: string;
    activeProviderId: string;
    activeModelId: string;
    activePersonaId?: string;
  },
): PluginAvailableToolSummary[] {
  return runtime.listTools({
    source: context.source ?? 'chat-tool',
    userId: context.userId,
    conversationId: context.conversationId,
    activeProviderId: context.activeProviderId,
    activeModelId: context.activeModelId,
    activePersonaId: context.activePersonaId,
  }).map((entry) => ({
    name: entry.runtimeKind === 'builtin'
      ? entry.tool.name
      : `${entry.pluginId}__${entry.tool.name}`,
    description: entry.runtimeKind === 'builtin'
      ? entry.tool.description
      : `[插件：${entry.pluginId}] ${entry.tool.description}`,
    parameters: entry.tool.parameters,
    pluginId: entry.pluginId,
    runtimeKind: entry.runtimeKind,
  }));
}

/**
 * 按允许名单裁剪工具集合。
 * @param tools 原始工具集合
 * @param allowedToolNames 可选允许名单
 * @returns 裁剪后的工具集合；若为空则返回 undefined
 */
export function filterToolSet(
  tools: Record<string, Tool>,
  allowedToolNames?: string[],
): Record<string, Tool> | undefined {
  if (!allowedToolNames) {
    return Object.keys(tools).length > 0 ? tools : undefined;
  }

  const allowed = new Set(allowedToolNames);
  const filtered = Object.fromEntries(
    Object.entries(tools).filter(([toolName]) => allowed.has(toolName)),
  );

  return Object.keys(filtered).length > 0 ? filtered : undefined;
}
