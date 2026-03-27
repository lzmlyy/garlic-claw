import type {
  PluginAvailableToolSummary,
  PluginInvocationSource,
  PluginParamSchema,
} from '@garlic-claw/shared';
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { AutomationService } from '../automation/automation.service';
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
 * 聊天侧自动化工具摘要。
 * 这里只暴露可序列化的工具描述，供插件 Hook 读取上下文。
 */
const AUTOMATION_TOOL_SUMMARIES = [
  {
    name: 'create_automation',
    description:
      '创建自动化规则。支持 cron 计划（例如 "5m"、"1h"、"30s"）和设备命令。当用户要求设置重复任务或自动化操作时使用此工具。',
    parameters: {
      name: {
        type: 'string',
        required: true,
        description: '此自动化的描述性名称',
      },
      triggerType: {
        type: 'string',
        required: true,
        description: '触发类型：cron 为计划执行，manual 为手动触发',
      },
      cronInterval: {
        type: 'string',
        description: '对于 cron 触发：间隔如 "5m"、"1h"、"30s"',
      },
      actions: {
        type: 'array',
        required: true,
        description: '要执行的动作列表',
      },
    },
  },
  {
    name: 'list_automations',
    description: '列出当前用户的所有自动化。',
    parameters: {},
  },
  {
    name: 'toggle_automation',
    description: '通过 ID 启用或禁用自动化。',
    parameters: {
      automationId: {
        type: 'string',
        required: true,
        description: '要切换的自动化 ID',
      },
    },
  },
  {
    name: 'run_automation',
    description: '手动触发自动化立即执行。',
    parameters: {
      automationId: {
        type: 'string',
        required: true,
        description: '要运行的自动化 ID',
      },
    },
  },
] satisfies PluginAvailableToolSummary[];

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
 * 输出聊天侧自动化工具摘要。
 * @returns 自动化工具摘要列表
 */
export function getAutomationToolSummaries(): PluginAvailableToolSummary[] {
  return AUTOMATION_TOOL_SUMMARIES.map((tool) => ({
    ...tool,
    parameters: cloneToolParameters(tool.parameters as Record<string, PluginParamSchema>),
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

/**
 * 复制一份工具参数 schema，避免后续代码共享同一引用。
 * @param parameters 原始参数 schema
 * @returns 复制后的参数 schema
 */
function cloneToolParameters(
  parameters: Record<string, PluginParamSchema>,
): Record<string, PluginParamSchema> {
  return Object.fromEntries(
    Object.entries(parameters).map(([key, value]) => [key, { ...value }]),
  );
}

/**
 * 构建自动化管理的 AI 工具。
 */
export function getAutomationTools(automationService: AutomationService, userId: string) {
  /**
   * 自动化动作输入。
   */
  interface AutomationActionInput {
    /** 动作类型。 */
    type: 'device_command';
    /** 目标插件。 */
    plugin: string;
    /** 能力名。 */
    capability: string;
    /** 动作参数。 */
    params?: JsonObject;
  }

  /**
   * 创建自动化工具输入。
   */
  interface CreateAutomationInput {
    /** 自动化名称。 */
    name: string;
    /** 触发类型。 */
    triggerType: 'cron' | 'manual';
    /** cron 间隔。 */
    cronInterval?: string;
    /** 动作列表。 */
    actions: AutomationActionInput[];
  }

  return {
    create_automation: tool({
      description:
        '创建自动化规则。支持 cron 计划（例如 "5m"、"1h"、"30s"）和设备命令。当用户要求设置重复任务或自动化操作时使用此工具。',
      inputSchema: z.object({
        name: z.string().describe('此自动化的描述性名称'),
        triggerType: z
          .enum(['cron', 'manual'])
          .describe('触发类型：cron 为计划执行，manual 为手动触发'),
        cronInterval: z
          .string()
          .optional()
          .describe('对于 cron 触发：间隔如 "5m"、"1h"、"30s"'),
        actions: z
          .array(
            z.object({
              type: z.enum(['device_command']).describe('动作类型'),
              plugin: z.string().describe('目标插件名称'),
              capability: z.string().describe('要调用的能力'),
              params: z.record(z.string(), jsonValueSchema).optional().describe('能力的参数'),
            }),
          )
          .describe('要执行的动作列表'),
      }),
      execute: async ({
        name,
        triggerType,
        cronInterval,
        actions,
      }: CreateAutomationInput) => {
        const trigger = { type: triggerType, cron: cronInterval };
        const result = await automationService.create(userId, name, trigger, actions);
        return { created: true, id: result.id, name: result.name };
      },
    }),

    list_automations: tool({
      description: '列出当前用户的所有自动化。',
      inputSchema: z.object({}),
      execute: async () => {
        const automations = await automationService.findAllByUser(userId);
        return automations.map((a) => ({
          id: a.id,
          name: a.name,
          trigger: a.trigger,
          enabled: a.enabled,
          lastRunAt: a.lastRunAt?.toISOString() ?? null,
        }));
      },
    }),

    toggle_automation: tool({
      description: '通过 ID 启用或禁用自动化。',
      inputSchema: z.object({
        automationId: z.string().describe('要切换的自动化 ID'),
      }),
      execute: async ({ automationId }: { automationId: string }) => {
        const result = await automationService.toggle(automationId, userId)
        if (!result) {
          return { error: '未找到自动化' }
        }
        return { id: result.id, enabled: result.enabled }
      },
    }),

    run_automation: tool({
      description: '手动触发自动化立即执行。',
      inputSchema: z.object({
        automationId: z.string().describe('要运行的自动化 ID'),
      }),
      execute: async ({ automationId }: { automationId: string }) => {
        const result = await automationService.executeAutomation(automationId);
        return result ?? { error: '未找到自动化或已禁用' };
      },
    }),
  } satisfies Record<string, Tool>;
}
