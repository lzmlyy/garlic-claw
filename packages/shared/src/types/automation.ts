import type { JsonObject } from './json';

/**
 * 自动化触发配置。
 */
export interface TriggerConfig {
  /** 触发类型。 */
  type: 'cron' | 'event' | 'manual';
  /** cron 表达式。 */
  cron?: string;
  /** 事件名。 */
  event?: string;
}

/**
 * 自动化动作配置。
 */
export interface ActionConfig {
  /** 动作类型。 */
  type: 'device_command' | 'ai_message';
  /** 插件 ID。 */
  plugin?: string;
  /** 能力 ID。 */
  capability?: string;
  /** 设备命令参数。 */
  params?: JsonObject;
  /** AI 消息内容。 */
  message?: string;
}

/**
 * 自动化日志。
 */
export interface AutomationLogInfo {
  /** 日志 ID。 */
  id: string;
  /** 状态。 */
  status: string;
  /** 结果 JSON 字符串。 */
  result: string | null;
  /** 创建时间。 */
  createdAt: string;
}

/**
 * 自动化信息。
 */
export interface AutomationInfo {
  /** 自动化 ID。 */
  id: string;
  /** 自动化名称。 */
  name: string;
  /** 触发配置。 */
  trigger: TriggerConfig;
  /** 动作列表。 */
  actions: ActionConfig[];
  /** 是否启用。 */
  enabled: boolean;
  /** 上次执行时间。 */
  lastRunAt: string | null;
  /** 创建时间。 */
  createdAt: string;
  /** 更新时间。 */
  updatedAt: string;
  /** 最近日志。 */
  logs?: AutomationLogInfo[];
}
