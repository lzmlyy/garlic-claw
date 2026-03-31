import type { JsonObject } from './json';

/**
 * skill 来源类型。
 */
export type SkillSourceKind = 'project' | 'user';

export type SkillTrustLevel = 'prompt-only' | 'asset-read' | 'local-script';

export type SkillAssetKind = 'script' | 'template' | 'reference' | 'asset' | 'other';

export interface SkillGovernanceInfo {
  enabled: boolean;
  trustLevel: SkillTrustLevel;
}

export interface SkillAssetSummary {
  path: string;
  kind: SkillAssetKind;
  textReadable: boolean;
  executable: boolean;
}

/**
 * skill 可声明的工具策略。
 */
export interface SkillToolPolicy {
  /** 显式允许的工具名。 */
  allow: string[];
  /** 显式禁止的工具名。 */
  deny: string[];
}

/**
 * skill 摘要。
 */
export interface SkillSummary {
  /** 稳定 skill ID。 */
  id: string;
  /** 展示名称。 */
  name: string;
  /** 简短说明。 */
  description: string;
  /** 标签。 */
  tags: string[];
  /** 来源类型。 */
  sourceKind: SkillSourceKind;
  /** 相对入口路径。 */
  entryPath: string;
  /** 内容预览。 */
  promptPreview: string;
  /** 工具白名单/黑名单策略。 */
  toolPolicy: SkillToolPolicy;
  /** 全局治理信息。 */
  governance: SkillGovernanceInfo;
}

/**
 * skill 详情。
 */
export interface SkillDetail extends SkillSummary {
  /** 完整 markdown 内容。 */
  content: string;
  /** 目录资产列表。 */
  assets: SkillAssetSummary[];
}

/**
 * 会话级已激活 skill 状态。
 */
export interface ConversationSkillState {
  /** 已激活 skill ID。 */
  activeSkillIds: string[];
  /** 已解析到的 skill 摘要。 */
  activeSkills: SkillSummary[];
}

/**
 * 更新会话技能状态时的请求体。
 */
export interface UpdateConversationSkillsPayload {
  /** 要设置的激活 skill ID 列表。 */
  activeSkillIds: string[];
}

export interface UpdateSkillGovernancePayload {
  enabled?: boolean;
  trustLevel?: SkillTrustLevel;
}

export interface SkillAssetRef extends JsonObject {
  skillId: string;
  path: string;
  kind: SkillAssetKind;
  textReadable: boolean;
  executable: boolean;
}

export interface SkillAssetReadResult extends JsonObject {
  skillId: string;
  path: string;
  content: string;
  truncated: boolean;
}

export interface SkillScriptRunResult extends JsonObject {
  skillId: string;
  path: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}
