import type {
  PluginBuiltinRole,
  PluginGovernanceInfo,
  PluginRuntimeKind,
  PluginScopeSettings,
} from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';

/**
 * 必要系统内建插件。
 * 这些插件是当前宿主的基础能力，不能被治理面关闭。
 */
const REQUIRED_SYSTEM_BUILTINS = new Set<string>([
  'builtin.core-tools',
]);

/**
 * 面向用户的内建插件。
 * 这些插件仍是插件系统的一部分，但应该允许用户实时启停。
 */
const USER_FACING_BUILTINS = new Set<string>([
  'builtin.automation-tools',
  'builtin.conversation-title',
  'builtin.kb-context',
  'builtin.memory-context',
  'builtin.memory-tools',
  'builtin.persona-router',
  'builtin.provider-router',
  'builtin.route-inspector',
  'builtin.subagent-delegate',
]);

/**
 * 仅用于治理/审计的系统内建插件。
 * 它们默认可隐藏，但不必强制保护。
 */
const OPTIONAL_SYSTEM_BUILTINS = new Set<string>([
  'builtin.automation-recorder',
  'builtin.cron-heartbeat',
  'builtin.message-entry-recorder',
  'builtin.message-lifecycle-recorder',
  'builtin.plugin-governance-recorder',
  'builtin.response-recorder',
  'builtin.tool-audit',
]);

/**
 * 描述一个插件在治理面中的保护策略。
 * @param input 插件标识与运行时类型
 * @returns 前后端共用的治理摘要
 */
export function describePluginGovernance(input: {
  pluginId: string;
  runtimeKind?: PluginRuntimeKind | string | null;
}): PluginGovernanceInfo {
  if (input.runtimeKind !== 'builtin') {
    return {
      canDisable: true,
    };
  }

  const builtinRole = resolveBuiltinRole(input.pluginId);
  if (builtinRole === 'system-required') {
    return {
      canDisable: false,
      disableReason: '基础内建工具属于宿主必需插件，不能禁用。',
      builtinRole,
    };
  }

  return {
    canDisable: true,
    ...(builtinRole ? { builtinRole } : {}),
  };
}

/**
 * 归一化插件作用域，使受保护插件不会携带旧的禁用状态。
 * @param input 插件标识与原始作用域
 * @returns 可直接进入 runtime 的作用域快照
 */
export function normalizePluginScopeForGovernance(input: {
  pluginId: string;
  runtimeKind?: PluginRuntimeKind | string | null;
  scope: PluginScopeSettings;
}): PluginScopeSettings {
  const governance = describePluginGovernance(input);
  if (governance.canDisable) {
    return input.scope;
  }

  return {
    defaultEnabled: true,
    conversations: {},
  };
}

/**
 * 断言本次作用域更新不会把受保护插件禁用掉。
 * @param input 插件标识与待保存作用域
 * @returns 无返回值；校验失败时抛错
 */
export function assertPluginScopeCanBeUpdated(input: {
  pluginId: string;
  runtimeKind?: PluginRuntimeKind | string | null;
  scope: PluginScopeSettings;
}): void {
  const governance = describePluginGovernance(input);
  if (governance.canDisable) {
    return;
  }

  if (!input.scope.defaultEnabled) {
    throw new BadRequestException(
      governance.disableReason ?? `插件 ${input.pluginId} 不能禁用`,
    );
  }

  if (Object.values(input.scope.conversations).some((enabled) => enabled === false)) {
    throw new BadRequestException(
      governance.disableReason ?? `插件 ${input.pluginId} 不能禁用`,
    );
  }
}

/**
 * 判断一个内建插件在治理面中的角色。
 * @param pluginId 插件 ID
 * @returns 角色；未知时返回 undefined
 */
function resolveBuiltinRole(pluginId: string): PluginBuiltinRole | undefined {
  if (REQUIRED_SYSTEM_BUILTINS.has(pluginId)) {
    return 'system-required';
  }
  if (USER_FACING_BUILTINS.has(pluginId)) {
    return 'user-facing';
  }
  if (OPTIONAL_SYSTEM_BUILTINS.has(pluginId)) {
    return 'system-optional';
  }

  return undefined;
}
