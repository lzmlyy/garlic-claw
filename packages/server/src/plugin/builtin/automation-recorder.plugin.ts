import type { AutomationAfterRunHookPayload } from '@garlic-claw/shared';
import type { JsonObject } from '../../common/types/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';
import { readBuiltinHookPayload } from './builtin-hook-payload.helpers';

/**
 * 自动化执行摘要。
 */
interface AutomationRunSummary extends JsonObject {
  /** 自动化 ID。 */
  automationId: string;
  /** 自动化名称。 */
  automationName: string;
  /** 最终执行状态。 */
  status: string;
  /** 触发器类型。 */
  triggerType: string;
  /** 结果条数。 */
  resultCount: number;
}

/**
 * 创建自动化执行记录插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `automation:after-run` Hook 的内建插件定义
 *
 * 预期行为:
 * - 在自动化完成后写入最近一次执行摘要
 * - 同时向宿主事件日志追加一条审计记录
 * - 全程只通过统一 Host API 写 storage 与 log
 */
export function createAutomationRecorderPlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.automation-recorder',
      name: '自动化记录器',
      version: '1.0.0',
      runtime: 'builtin',
      description: '用于验证自动化生命周期 Hook 链路的内建插件',
      permissions: ['log:write', 'storage:write'],
      tools: [],
      hooks: [
        {
          name: 'automation:after-run',
          description: '在自动化执行完成后记录执行摘要',
        },
      ],
    },
    hooks: {
      'automation:after-run': async (payload, { host }) => {
        const afterRun = readBuiltinHookPayload<AutomationAfterRunHookPayload>(payload);
        const summary = buildAutomationRunSummary(afterRun);

        await host.setStorage(
          `automation.${afterRun.automation.id}.last-run`,
          summary,
        );
        await host.writeLog({
          level: summary.status === 'success' ? 'info' : 'warn',
          type: 'automation:observed',
          message: `自动化 ${summary.automationName} 执行完成：${summary.status}`,
          metadata: summary,
        });

        return {
          action: 'pass',
        };
      },
    },
  };
}

/**
 * 从 Hook 负载中抽取稳定的执行摘要。
 * @param payload 自动化执行后的 Hook 负载
 * @returns 可持久化、可写日志的摘要对象
 */
function buildAutomationRunSummary(
  payload: AutomationAfterRunHookPayload,
): AutomationRunSummary {
  return {
    automationId: payload.automation.id,
    automationName: payload.automation.name,
    status: payload.status,
    triggerType: payload.automation.trigger.type,
    resultCount: payload.results.length,
  };
}
