import type { PluginCallContext } from '@garlic-claw/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { SkillExecutionService } from '../skill/skill-execution.service';
import type { ToolProvider, ToolProviderState, ToolProviderTool } from './tool.types';

@Injectable()
export class SkillToolProvider implements ToolProvider {
  readonly kind = 'skill' as const;

  constructor(
    private readonly skillExecution: SkillExecutionService,
  ) {}

  async collectState(context?: PluginCallContext): Promise<ToolProviderState> {
    const access = await this.skillExecution.getToolAccess(context);
    if (!context?.conversationId || access.availableSkillIds.length === 0) {
      return {
        sources: [],
        tools: [],
      };
    }

    const source = {
      kind: 'skill' as const,
      id: 'active-packages',
      label: 'Active Skill Packages',
      enabled: true,
      health: 'healthy' as const,
      lastError: null,
      lastCheckedAt: null,
    };
    const tools: ToolProviderTool[] = [];

    if (access.canReadAssets) {
      tools.push({
        source,
        name: 'asset.list',
        description: '列出当前会话 skill package 资产',
        parameters: {
          skillId: {
            type: 'string',
            required: false,
            description: '可选 skill ID；不传则列出全部 active skills 的可读资产',
          },
        },
      });
      tools.push({
        source,
        name: 'asset.read',
        description: '读取当前会话某个 skill package 资产',
        parameters: {
          skillId: {
            type: 'string',
            required: true,
            description: '已激活 skill 的 ID',
          },
          path: {
            type: 'string',
            required: true,
            description: '相对 skill 根目录的资产路径',
          },
          maxChars: {
            type: 'number',
            required: false,
            description: '最多返回的字符数',
          },
        },
      });
    }

    if (access.canRunScripts) {
      tools.push({
        source,
        name: 'script.run',
        description: '执行当前会话 skill package 脚本',
        parameters: {
          skillId: {
            type: 'string',
            required: true,
            description: '已激活 skill 的 ID',
          },
          path: {
            type: 'string',
            required: true,
            description: '相对 skill 根目录的脚本路径',
          },
          args: {
            type: 'array',
            required: false,
            description: '要传给脚本的参数数组',
          },
          timeoutMs: {
            type: 'number',
            required: false,
            description: '脚本超时时间，单位毫秒',
          },
        },
      });
    }

    return {
      sources: [source],
      tools,
    };
  }

  async listSources(context?: PluginCallContext) {
    return (await this.collectState(context)).sources;
  }

  async listTools(context?: PluginCallContext): Promise<ToolProviderTool[]> {
    return (await this.collectState(context)).tools;
  }

  async executeTool(input: {
    tool: ToolProviderTool;
    params: JsonObject;
    context: PluginCallContext;
    skipLifecycleHooks?: boolean;
  }): Promise<JsonValue> {
    const conversationId = input.context.conversationId;
    if (!conversationId) {
      throw new BadRequestException('skill tools require conversationId context');
    }

    switch (input.tool.name) {
      case 'asset.list':
        return await this.skillExecution.listAssetsForConversation(
          conversationId,
          this.readOptionalString(input.params, 'skillId') ?? undefined,
        );
      case 'asset.read':
        return await this.skillExecution.readAssetForConversation({
          conversationId,
          skillId: this.requireString(input.params, 'skillId'),
          assetPath: this.requireString(input.params, 'path'),
          ...(typeof input.params.maxChars === 'number'
            ? { maxChars: input.params.maxChars }
            : {}),
        });
      case 'script.run':
        return await this.skillExecution.runScriptForConversation({
          conversationId,
          skillId: this.requireString(input.params, 'skillId'),
          assetPath: this.requireString(input.params, 'path'),
          ...(Array.isArray(input.params.args)
            ? {
                args: input.params.args.filter((item): item is string => typeof item === 'string'),
              }
            : {}),
          ...(typeof input.params.timeoutMs === 'number'
            ? { timeoutMs: input.params.timeoutMs }
            : {}),
        });
      default:
        throw new BadRequestException(`Unsupported skill tool: ${input.tool.name}`);
    }
  }

  private readOptionalString(params: JsonObject, key: string): string | null {
    const value = params[key];
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(`${key} must be a string`);
    }

    return value;
  }

  private requireString(params: JsonObject, key: string): string {
    const value = this.readOptionalString(params, key);
    if (!value) {
      throw new BadRequestException(`${key} is required`);
    }

    return value;
  }
}
