import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { AutomationService } from '../automation/automation.service';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import type { MemoryService } from '../memory/memory.service';
import type { PluginGateway } from '../plugin/plugin.gateway';

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
 * AI 可调用工具（函数调用）的注册表。
 * 工具使用 Vercel AI SDK 的 `tool()` 辅助函数定义。
 */
export function getBuiltinTools() {
  return {
    getCurrentTime: tool({
      description: '获取当前日期和时间',
      inputSchema: z.object({}),
      execute: async () => {
        return { time: new Date().toISOString() };
      },
    }),

    getSystemInfo: tool({
      description: '获取服务器的基本系统信息',
      inputSchema: z.object({}),
      execute: async () => {
        return {
          platform: process.platform,
          nodeVersion: process.version,
          uptime: Math.floor(process.uptime()),
          memoryUsage: Math.floor(
            process.memoryUsage().heapUsed / 1024 / 1024,
          ),
        };
      },
    }),

    calculate: tool({
      description: '执行数学计算',
      inputSchema: z.object({
        expression: z
          .string()
          .describe('一个简单的数学表达式，例如 "2 + 3 * 4"'),
      }),
      execute: async ({ expression }: { expression: string }) => {
        // 只允许安全的数学字符
        if (!/^[\d\s+\-*/().]+$/.test(expression)) {
          return { error: '无效的表达式。只允许数字和 +, -, *, /, (, )。' };
        }
        try {
          // 使用 Function 构造函数进行安全的数学计算
          const fn = new Function(`"use strict"; return (${expression});`);
          const result = fn();
          return { expression, result: Number(result) };
        } catch {
          return { error: '表达式计算失败' };
        }
      },
    }),
  } satisfies Record<string, Tool>;
}

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
 * 从连接的插件能力动态构建 AI 工具。
 * 每个能力变成一个名为 `<pluginName>__<capabilityName>` 的工具。
 */
export function getPluginTools(gateway: PluginGateway) {
  const allCaps = gateway.getAllCapabilities();
  const tools: Record<string, Tool> = {};

  for (const [pluginName, caps] of allCaps) {
    for (const cap of caps) {
      const toolName = `${pluginName}__${cap.name}`;
      tools[toolName] = tool({
        description: `[设备：${pluginName}] ${cap.description}`,
        inputSchema: paramSchemaToZod(cap.parameters),
        execute: async (args: JsonObject) => {
          try {
            return await gateway.executeCommand(pluginName, cap.name, args);
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      });
    }
  }

  return tools;
}

/**
 * 构建长期记忆（保存/回忆）的 AI 工具。
 */
export function getMemoryTools(memoryService: MemoryService, userId: string) {
  return {
    save_memory: tool({
      description:
        '将重要信息保存到长期记忆中，以便将来对话时使用。当用户分享偏好、个人事实、指令或任何值得记住的内容时使用此工具。',
      inputSchema: z.object({
        content: z.string().describe('要记住的信息'),
        category: z
          .enum(['preference', 'fact', 'instruction', 'general'])
          .describe('记忆类别'),
        keywords: z
          .string()
          .optional()
          .describe('逗号分隔的关键词，便于检索'),
      }),
      execute: async ({
        content,
        category,
        keywords,
      }: {
        content: string;
        category: string;
        keywords?: string;
      }) => {
        const memory = await memoryService.saveMemory(
          userId,
          content,
          category,
          keywords,
        );
        return { saved: true, id: memory.id };
      },
    }),

    recall_memory: tool({
      description:
        '搜索长期记忆中之前保存的关于用户的信息。当用户引用过去的对话或需要之前会话的上下文时使用此工具。',
      inputSchema: z.object({
        query: z.string().describe('搜索查询，用于查找相关记忆'),
      }),
      execute: async ({ query }: { query: string }) => {
        const memories = await memoryService.searchMemories(userId, query, 10);
        return {
          count: memories.length,
          memories: memories.map((m) => ({
            content: m.content,
            category: m.category,
            date: m.createdAt.toISOString().split('T')[0],
          })),
        };
      },
    }),
  } satisfies Record<string, Tool>;
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

export type BuiltinTools = ReturnType<typeof getBuiltinTools>;
