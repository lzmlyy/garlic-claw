import {
  asChatBeforeModelPayload,
  readLatestUserTextFromMessages,
  sanitizeOptionalText,
} from '@garlic-claw/plugin-sdk';
import type { JsonValue } from '../../common/types/json-value';
import { toJsonValue } from '../../common/utils/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

/**
 * Persona Router 插件配置。
 */
interface PersonaRouterPluginConfig {
  /** 命中后切换到的 persona ID。 */
  targetPersonaId?: string;
  /** 命中切换规则时使用的关键字。 */
  switchKeyword?: string;
}

/**
 * 当前 persona 摘要。
 */
interface CurrentPersonaInfo {
  /** 当前 persona ID。 */
  personaId?: string;
}

/**
 * 目标 persona 摘要。
 */
interface PersonaSummary {
  /** persona ID。 */
  id?: string;
  /** persona 提示词。 */
  prompt?: string;
}

/**
 * 创建 persona 上下文路由插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `chat:before-model` Hook 的内建插件定义
 *
 * 预期行为:
 * - 只通过统一 Host API 读取当前 persona
 * - 在命中规则时切换当前会话 persona
 * - 让本轮模型调用立即使用新 persona 的 prompt
 */
export function createPersonaRouterPlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.persona-router',
      name: '人设路由',
      version: '1.0.0',
      runtime: 'builtin',
      description: '按规则切换当前会话人设并同步改写系统提示词的内建插件。',
      permissions: ['config:read', 'persona:read', 'persona:write'],
      tools: [],
      hooks: [
        {
          name: 'chat:before-model',
          description: '按规则切换当前会话 persona，并同步改写本轮系统提示词',
        },
      ],
      config: {
        fields: [
          {
            key: 'targetPersonaId',
            type: 'string',
            description: '命中路由后要切换到的 persona ID',
          },
          {
            key: 'switchKeyword',
            type: 'string',
            description: '当最近一条用户消息包含该关键字时，切换到目标 persona',
          },
        ],
      },
    },
    hooks: {
      /**
       * 在模型调用前按配置切换 persona。
       * @param payload Hook 输入负载
       * @param context 插件执行上下文
       * @returns `pass` 或 `mutate`
       */
      'chat:before-model': async (payload: JsonValue, context) => {
        const hookPayload = asChatBeforeModelPayload(payload);
        const config = (await context.host.getConfig()) as PersonaRouterPluginConfig;
        const latestUserText = readLatestUserTextFromMessages(hookPayload.request.messages);
        const targetPersonaId = sanitizeOptionalText(config.targetPersonaId);
        const switchKeyword = sanitizeOptionalText(config.switchKeyword);
        if (!targetPersonaId || !switchKeyword || !latestUserText.includes(switchKeyword)) {
          return toJsonValue({
            action: 'pass',
          });
        }

        const currentPersona = (await context.host.getCurrentPersona()) as CurrentPersonaInfo;
        if (currentPersona.personaId === targetPersonaId) {
          return toJsonValue({
            action: 'pass',
          });
        }

        const targetPersona = (await context.host.getPersona(targetPersonaId)) as PersonaSummary;
        const activatedPersona = (await context.host.activatePersona(targetPersonaId)) as PersonaSummary;
        const prompt = sanitizeOptionalText(activatedPersona.prompt)
          || sanitizeOptionalText(targetPersona.prompt);
        if (!prompt) {
          return toJsonValue({
            action: 'pass',
          });
        }

        return toJsonValue({
          action: 'mutate',
          systemPrompt: prompt,
        });
      },
    },
  };
}
