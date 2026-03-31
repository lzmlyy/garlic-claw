import type { PluginCronTickPayload } from '@garlic-claw/shared';
import type { BuiltinPluginDefinition } from './builtin-plugin.transport';
import { readBuiltinHookPayload } from './builtin-hook-payload.helpers';

/**
 * 创建默认 cron 心跳插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 可注册到统一 runtime 的内建插件定义
 *
 * 预期行为:
 * - 声明一个默认 cron job
 * - 在每次 tick 时通过统一 Host API 记录计数与最近执行时间
 */
export function createCronHeartbeatPlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.cron-heartbeat',
      name: '定时心跳',
      version: '1.0.0',
      runtime: 'builtin',
      description: '用于验证统一 cron 插件协议链路的内建插件',
      permissions: ['cron:read', 'cron:write', 'storage:read', 'storage:write'],
      tools: [],
      hooks: [
        {
          name: 'cron:tick',
          description: '处理插件定时任务 tick',
        },
      ],
      crons: [
        {
          name: 'heartbeat',
          cron: '10s',
          description: '定时写入插件心跳计数',
        },
      ],
    },
    hooks: {
      'cron:tick': async (payload, { host }) => {
        const tick = readBuiltinHookPayload<PluginCronTickPayload>(payload);
        const current = await host.getStorage(`cron.${tick.job.name}.count`);
        const nextCount = typeof current === 'number' ? current + 1 : 1;

        await host.setStorage(`cron.${tick.job.name}.count`, nextCount);
        await host.setStorage(`cron.${tick.job.name}.lastTickAt`, tick.tickedAt);

        return {
          ok: true,
          count: nextCount,
          jobId: tick.job.id,
        };
      },
    },
  };
}
