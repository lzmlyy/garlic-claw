import type { PluginActionName, PluginInfo } from '@garlic-claw/shared'

/**
 * 判断插件是否声明了面向用户的配置面。
 * 这类 builtin 即使没有工具，也应该默认展示给用户。
 */
function hasConfigurableSurface(plugin: PluginInfo): boolean {
  return (plugin.manifest?.config?.fields?.length ?? 0) > 0
}

/**
 * 判断插件是否具有直接面向用户的扩展面。
 * 工具、路由或显式配置都视为用户可感知能力。
 */
function hasUserFacingSurface(plugin: PluginInfo): boolean {
  return hasConfigurableSurface(plugin)
    || plugin.capabilities.length > 0
    || (plugin.routes?.length ?? 0) > 0
}

/**
 * 判断一个 builtin 是否只是内部治理/记录插件。
 * 这类插件默认隐藏，避免插件页一上来就被系统实现细节淹没。
 */
export function isSystemBuiltinPlugin(plugin: PluginInfo): boolean {
  const builtinRole = plugin.governance?.builtinRole
  if (builtinRole === 'system-optional' || builtinRole === 'system-required') {
    return true
  }

  return (plugin.runtimeKind ?? 'remote') === 'builtin'
    && !!plugin.manifest
    && !hasUserFacingSurface(plugin)
}

/**
 * 计算插件页默认应选中的插件。
 * 优先级：
 * 1. 当前已选中项
 * 2. 业务页深链指定项
 * 3. 第一个非系统 builtin 的用户插件
 * 4. 列表第一项
 */
export function pickDefaultPluginName(input: {
  plugins: PluginInfo[]
  currentPluginName?: string | null
  preferredPluginName?: string | null
}): string | null {
  const { plugins, currentPluginName, preferredPluginName } = input

  if (currentPluginName && plugins.some((plugin) => plugin.name === currentPluginName)) {
    return currentPluginName
  }

  if (preferredPluginName && plugins.some((plugin) => plugin.name === preferredPluginName)) {
    return preferredPluginName
  }

  const firstUserFacingPlugin = plugins.find((plugin) => !isSystemBuiltinPlugin(plugin))
  return firstUserFacingPlugin?.name ?? plugins[0]?.name ?? null
}

/**
 * 判断插件当前是否已经把并发打满。
 * @param plugin 插件摘要
 * @returns 是否繁忙
 */
export function isPluginBusy(plugin: PluginInfo): boolean {
  const pressure = plugin.health?.runtimePressure
  return !!pressure && pressure.activeExecutions >= pressure.maxConcurrentExecutions
}

/**
 * 判断插件是否需要进入“重点关注”区域。
 * @param plugin 插件摘要
 * @returns 是否需要关注
 */
export function hasPluginIssue(plugin: PluginInfo): boolean {
  return !plugin.connected
    || isPluginBusy(plugin)
    || plugin.health?.status === 'error'
    || plugin.health?.status === 'degraded'
    || plugin.health?.status === 'offline'
}

/**
 * 生成插件当前最值得展示的问题摘要。
 * @param plugin 插件摘要
 * @returns 问题摘要；无问题时返回 null
 */
export function pluginIssueSummary(plugin: PluginInfo): string | null {
  const pressure = plugin.health?.runtimePressure
  if (pressure && isPluginBusy(plugin)) {
    return `当前并发已打满（${pressure.activeExecutions} / ${pressure.maxConcurrentExecutions}）`
  }

  const lastError = plugin.health?.lastError?.trim()
  if (lastError && hasPluginIssue(plugin)) {
    return `最近错误：${truncateText(lastError, 72)}`
  }

  if (!plugin.connected || plugin.health?.status === 'offline') {
    return '当前离线，无法接收新的插件调用'
  }

  if (plugin.health?.status === 'degraded') {
    return '当前处于降级态，建议先做健康检查'
  }

  return null
}

/**
 * 为需要关注的插件选择最合适的一键恢复动作。
 * @param plugin 插件摘要
 * @returns 推荐动作；没有时返回 null
 */
export function pickPrimaryPluginAction(plugin: PluginInfo): PluginActionName | null {
  if (!hasPluginIssue(plugin)) {
    return null
  }

  const supportedActions = new Set(plugin.supportedActions ?? ['health-check'])

  if (isPluginBusy(plugin)) {
    return supportedActions.has('health-check') ? 'health-check' : null
  }

  if (!plugin.connected || plugin.health?.status === 'offline') {
    if (supportedActions.has('reconnect')) {
      return 'reconnect'
    }
    if (supportedActions.has('reload')) {
      return 'reload'
    }
    return supportedActions.has('health-check') ? 'health-check' : null
  }

  if (plugin.health?.status === 'error') {
    if (supportedActions.has('reload')) {
      return 'reload'
    }
    if (supportedActions.has('reconnect')) {
      return 'reconnect'
    }
    return supportedActions.has('health-check') ? 'health-check' : null
  }

  if (plugin.health?.status === 'degraded') {
    if (supportedActions.has('health-check')) {
      return 'health-check'
    }
    return supportedActions.has('reload') ? 'reload' : null
  }

  return null
}

/**
 * 计算插件在重点告警面板中的排序优先级。
 * @param plugin 插件摘要
 * @returns 越小越靠前
 */
export function pluginAttentionWeight(plugin: PluginInfo): number {
  if (!plugin.connected || plugin.health?.status === 'error' || plugin.health?.status === 'offline') {
    return 0
  }

  if (plugin.health?.status === 'degraded') {
    return 1
  }

  if (isPluginBusy(plugin)) {
    return 2
  }

  return 3
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(maxLength - 1, 1))}…`
}
