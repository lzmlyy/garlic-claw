import type {
  PluginSubagentRequest,
  PluginSubagentRunParams,
  PluginSubagentRunResult,
  PluginSubagentTaskStatus,
  PluginSubagentTaskWriteBackStatus,
} from './plugin-ai';
import type { PluginMessageTargetInfo, PluginMessageTargetRef } from './plugin-chat';
import type { PluginCallContext, PluginRuntimeKind } from './plugin-core';

export interface PluginSubagentTaskWriteBack {
  target?: PluginMessageTargetRef | null;
}

export interface PluginSubagentTaskStartParams extends PluginSubagentRunParams {
  writeBack?: PluginSubagentTaskWriteBack | null;
}

export interface PluginSubagentTaskSummary {
  id: string;
  pluginId: string;
  pluginDisplayName?: string;
  runtimeKind: PluginRuntimeKind;
  status: PluginSubagentTaskStatus;
  requestPreview: string;
  resultPreview?: string;
  providerId?: string;
  modelId?: string;
  error?: string;
  writeBackStatus: PluginSubagentTaskWriteBackStatus;
  writeBackTarget?: PluginMessageTargetInfo | null;
  writeBackError?: string;
  writeBackMessageId?: string;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  conversationId?: string;
  userId?: string;
}

export interface PluginSubagentTaskDetail extends PluginSubagentTaskSummary {
  request: PluginSubagentRequest;
  context: PluginCallContext;
  result?: PluginSubagentRunResult | null;
}

export interface PluginSubagentTaskOverview {
  tasks: PluginSubagentTaskSummary[];
}
