import {
  asChatBeforeModelPayload,
  PERSONA_ROUTER_CONFIG_FIELDS,
  readCurrentPersonaInfo,
  readLatestUserTextFromMessages,
  readPersonaRouterConfig,
  readPersonaSummaryInfo,
  sanitizeOptionalText,
  textIncludesKeyword,
  toHostJsonValue,
} from '@garlic-claw/plugin-sdk';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

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
        fields: PERSONA_ROUTER_CONFIG_FIELDS,
      },
    },
    hooks: {
      /**
       * 在模型调用前按配置切换 persona。
       * @param payload Hook 输入负载
       * @param context 插件执行上下文
       * @returns `pass` 或 `mutate`
       */
      'chat:before-model': async (payload, context) => {
        const hookPayload = asChatBeforeModelPayload(payload);
        const config = readPersonaRouterConfig(await context.host.getConfig());
        const latestUserText = readLatestUserTextFromMessages(hookPayload.request.messages);
        const targetPersonaId = sanitizeOptionalText(config.targetPersonaId);
        if (!targetPersonaId || !textIncludesKeyword(latestUserText, config.switchKeyword)) {
          return toHostJsonValue({
            action: 'pass',
          });
        }

        const currentPersona = readCurrentPersonaInfo(
          await context.host.getCurrentPersona(),
        );
        if (currentPersona.personaId === targetPersonaId) {
          return toHostJsonValue({
            action: 'pass',
          });
        }

        const targetPersona = readPersonaSummaryInfo(
          await context.host.getPersona(targetPersonaId),
        );
        const activatedPersona = readPersonaSummaryInfo(
          await context.host.activatePersona(targetPersonaId),
        );
        const prompt = sanitizeOptionalText(activatedPersona.prompt)
          || sanitizeOptionalText(targetPersona.prompt);
        if (!prompt) {
          return toHostJsonValue({
            action: 'pass',
          });
        }

        return toHostJsonValue({
          action: 'mutate',
          systemPrompt: prompt,
        });
      },
    },
  };
}
