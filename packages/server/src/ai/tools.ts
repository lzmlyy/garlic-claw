import type { PluginParamSchema } from '@garlic-claw/shared';
import { tool } from 'ai';
import { z } from 'zod';
import type { AutomationService } from '../automation/automation.service';
import type { MemoryService } from '../memory/memory.service';
import type { PluginGateway } from '../plugin/plugin.gateway';

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
        const startTime = Date.now();
        console.log(`[工具调用] getCurrentTime 开始执行`);
        const result = { time: new Date().toISOString() };
        const duration = Date.now() - startTime;
        console.log(`[工具调用] getCurrentTime 完成，耗时: ${duration}ms`);
        return result;
      },
    }),

    getSystemInfo: tool({
      description: '获取服务器的基本系统信息',
      inputSchema: z.object({}),
      execute: async () => {
        const startTime = Date.now();
        console.log(`[工具调用] getSystemInfo 开始执行`);
        const result = {
          platform: process.platform,
          nodeVersion: process.version,
          uptime: Math.floor(process.uptime()),
          memoryUsage: Math.floor(
            process.memoryUsage().heapUsed / 1024 / 1024,
          ),
        };
        const duration = Date.now() - startTime;
        console.log(`[工具调用] getSystemInfo 完成，耗时: ${duration}ms`);
        return result;
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
        const startTime = Date.now();
        console.log(`[工具调用] calculate 开始执行，表达式: ${expression}`);
        // 只允许安全的数学字符
        if (!/^[\d\s+\-*/().]+$/.test(expression)) {
          const result = { error: '无效的表达式。只允许数字和 +, -, *, /, (, )。' };
          const duration = Date.now() - startTime;
          console.log(`[工具调用] calculate 完成（失败），耗时: ${duration}ms`);
          return result;
        }
        try {
          // 使用 Function 构造函数进行安全的数学计算
          const fn = new Function(`"use strict"; return (${expression});`);
          const result = fn();
          const duration = Date.now() - startTime;
          console.log(`[工具调用] calculate 完成，结果: ${result}，耗时: ${duration}ms`);
          return { expression, result: Number(result) };
        } catch {
          const duration = Date.now() - startTime;
          console.log(`[工具调用] calculate 完成（计算失败），耗时: ${duration}ms`);
          return { error: '表达式计算失败' };
        }
      },
    }),
  };
}

/**
 * 将 PluginParamSchema 记录转换为 Zod 对象模式。
 */
function paramSchemaToZod(params: Record<string, PluginParamSchema>) {
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
        zType = z.array(z.unknown());
        break;
      case 'object':
        zType = z.record(z.string(), z.unknown());
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};

  for (const [pluginName, caps] of allCaps) {
    for (const cap of caps) {
      const toolName = `${pluginName}__${cap.name}`;
      tools[toolName] = tool({
        description: `[设备：${pluginName}] ${cap.description}`,
        inputSchema: paramSchemaToZod(cap.parameters),
        execute: async (args: Record<string, unknown>) => {
          const startTime = Date.now();
          console.log(`[工具调用] ${toolName} 开始执行，参数: ${JSON.stringify(args)}`);
          try {
            const result = await gateway.executeCommand(pluginName, cap.name, args);
            const duration = Date.now() - startTime;
            console.log(`[工具调用] ${toolName} 完成，耗时: ${duration}ms`);
            return result;
          } catch (err) {
            const duration = Date.now() - startTime;
            console.log(`[工具调用] ${toolName} 失败，耗时: ${duration}ms，错误: ${err instanceof Error ? err.message : String(err)}`);
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
        const startTime = Date.now();
        console.log(`[工具调用] save_memory 开始执行，内容: ${content.substring(0, 50)}...`);
        const memory = await memoryService.saveMemory(
          userId,
          content,
          category,
          keywords,
        );
        const duration = Date.now() - startTime;
        console.log(`[工具调用] save_memory 完成，耗时: ${duration}ms`);
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
        const startTime = Date.now();
        console.log(`[工具调用] recall_memory 开始执行，查询: ${query}`);
        const memories = await memoryService.searchMemories(userId, query, 10);
        const duration = Date.now() - startTime;
        console.log(`[工具调用] recall_memory 完成，找到 ${memories.length} 条记忆，耗时: ${duration}ms`);
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
  };
}

/**
 * 构建自动化管理的 AI 工具。
 */
export function getAutomationTools(automationService: AutomationService, userId: string) {
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
              params: z.record(z.string(), z.unknown()).optional().describe('能力的参数'),
            }),
          )
          .describe('要执行的动作列表'),
      }),
      execute: async ({
        name,
        triggerType,
        cronInterval,
        actions,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }: any) => {
        const startTime = Date.now();
        console.log(`[工具调用] create_automation 开始执行，名称: ${name}`);
        const trigger = { type: triggerType, cron: cronInterval };
        const result = await automationService.create(userId, name, trigger, actions);
        const duration = Date.now() - startTime;
        console.log(`[工具调用] create_automation 完成，耗时: ${duration}ms`);
        return { created: true, id: result.id, name: result.name };
      },
    }),

    list_automations: tool({
      description: '列出当前用户的所有自动化。',
      inputSchema: z.object({}),
      execute: async () => {
        const startTime = Date.now();
        console.log(`[工具调用] list_automations 开始执行`);
        const automations = await automationService.findAllByUser(userId);
        const duration = Date.now() - startTime;
        console.log(`[工具调用] list_automations 完成，找到 ${automations.length} 条，耗时: ${duration}ms`);
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
        const startTime = Date.now();
        console.log(`[工具调用] toggle_automation 开始执行，ID: ${automationId}`);
        const result = await automationService.toggle(automationId, userId);
        const duration = Date.now() - startTime;
        if (!result) {
          console.log(`[工具调用] toggle_automation 失败，耗时: ${duration}ms`);
          return { error: '未找到自动化' };
        }
        console.log(`[工具调用] toggle_automation 完成，耗时: ${duration}ms`);
        return { id: result.id, enabled: result.enabled };
      },
    }),

    run_automation: tool({
      description: '手动触发自动化立即执行。',
      inputSchema: z.object({
        automationId: z.string().describe('要运行的自动化 ID'),
      }),
      execute: async ({ automationId }: { automationId: string }) => {
        const startTime = Date.now();
        console.log(`[工具调用] run_automation 开始执行，ID: ${automationId}`);
        const result = await automationService.executeAutomation(automationId);
        const duration = Date.now() - startTime;
        console.log(`[工具调用] run_automation 完成，耗时: ${duration}ms`);
        return result ?? { error: '未找到自动化或已禁用' };
      },
    }),
  };
}

/**
 * 将 JSON Schema 转换为 Zod schema
 */
function jsonSchemaToZod(schema: any): z.ZodTypeAny {
  if (!schema) {
    return z.object({});
  }

  // 如果已经是 Zod schema，直接返回
  if (schema && typeof schema.parse === 'function') {
    return schema;
  }

  const type = schema.type;

  switch (type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'integer':
      return z.number().int();
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(jsonSchemaToZod(schema.items || {}));
    case 'object':
      if (!schema.properties) {
        return z.record(z.string(), z.unknown());
      }
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const isRequired = schema.required?.includes(key);
        let zType = jsonSchemaToZod(propSchema);
        if (!isRequired) {
          zType = zType.optional();
        }
        shape[key] = zType;
      }
      return z.object(shape);
    default:
      return z.unknown();
  }
}

/**
 * 构建 MCP 工具的 AI 工具。
 * @param mcpService MCP 服务实例
 * @param cacheService 缓存服务实例
 */
export async function getMcpTools(mcpService: any, cacheService?: any) {
  try {
    const mcpTools = await mcpService.getTools();
    const tools: Record<string, any> = {};

    for (const [name, toolConfig] of Object.entries(mcpTools)) {
      const config = toolConfig as {
        description: string;
        inputSchema: any;
        execute: (args: any) => Promise<any>;
      };
      const originalExecute = config.execute;

      tools[name] = tool({
        description: config.description,
        inputSchema: jsonSchemaToZod(config.inputSchema),
        execute: async (args: any) => {
          const startTime = Date.now();
          console.log(`[工具调用] MCP工具 ${name} 开始执行，参数: ${JSON.stringify(args)}`);

          try {
            // 生成缓存键（工具名 + 参数的哈希）
            const cacheKey = `mcp:${name}:${JSON.stringify(args)}`;

            // 检查缓存
            if (cacheService) {
              try {
                const cachedResult = await cacheService.get(cacheKey);
                if (cachedResult !== null) {
                  const duration = Date.now() - startTime;
                  console.log(`[工具调用] MCP工具 ${name} 缓存命中，耗时: ${duration}ms`);
                  return cachedResult;
                }
              } catch (cacheError) {
                console.warn(`[工具调用] MCP工具 ${name} 缓存读取失败: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`);
              }
            }

            // 执行工具调用（带有超时保护）
            const result = await Promise.race([
              originalExecute(args),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`工具调用超时: ${name}`)), 10000)
              ),
            ]);

            const duration = Date.now() - startTime;
            console.log(`[工具调用] MCP工具 ${name} 完成，耗时: ${duration}ms`);

            // 缓存结果（如果成功）
            if (cacheService && !result.error) {
              try {
                // 根据工具类型设置不同的缓存时间
                // 搜索类工具缓存 5 分钟，其他工具缓存 10 分钟
                const cacheTTL = name.includes('search') ? 300 : 600;
                await cacheService.set(cacheKey, result, cacheTTL);
                console.log(`[工具调用] MCP工具 ${name} 结果已缓存，TTL: ${cacheTTL}s`);
              } catch (cacheError) {
                console.warn(`[工具调用] MCP工具 ${name} 缓存写入失败: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`);
              }
            }

            return result;
          } catch (err) {
            const duration = Date.now() - startTime;
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.log(`[工具调用] MCP工具 ${name} 失败，耗时: ${duration}ms，错误: ${errorMessage}`);

            // 降级策略：返回友好的错误信息
            if (errorMessage.includes('超时')) {
              return {
                error: '工具调用超时，请稍后重试',
                fallback: '由于服务响应较慢，暂时无法完成此操作'
              };
            } else if (errorMessage.includes('连接') || errorMessage.includes('网络')) {
              return {
                error: '网络连接失败',
                fallback: '无法连接到外部服务，请检查网络连接'
              };
            } else {
              return {
                error: errorMessage,
                fallback: '工具执行失败，请稍后重试或使用其他方式'
              };
            }
          }
        },
      });
    }

    return tools;
  } catch (error) {
    console.error('获取 MCP 工具失败:', error);
    // 降级策略：返回空对象而不是抛出错误
    return {};
  }
}

export type BuiltinTools = ReturnType<typeof getBuiltinTools>;
