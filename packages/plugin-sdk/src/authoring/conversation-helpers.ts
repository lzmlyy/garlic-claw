import type { JsonValue, PluginManifest } from "@garlic-claw/shared";
import builtinManifestData from "./builtin-manifest-data.json";
import { pickOptionalNumberFields, pickOptionalStringFields, readJsonObjectValue, sanitizeOptionalText } from "./common-helpers";

export interface PluginConversationTitleConfig {
  defaultTitle?: string;
  maxMessages?: number;
}
export const CONVERSATION_TITLE_DEFAULT_TITLE = builtinManifestData.defaults.conversationTitleDefaultTitle;
export const CONVERSATION_TITLE_DEFAULT_MAX_MESSAGES = builtinManifestData.defaults.conversationTitleMaxMessages;
export const CONVERSATION_TITLE_CONFIG_FIELDS = builtinManifestData.conversationTitleConfigFields as NonNullable<PluginManifest["config"]>["fields"];
export const CONVERSATION_TITLE_MANIFEST = builtinManifestData.conversationTitleManifest as PluginManifest;
export function readConversationSummary(value: JsonValue): {
  id?: string;
  title?: string;
} {
  return { ...pickOptionalStringFields(readJsonObjectValue(value), ["id", "title"] as const) };
}
export function readConversationMessages(value: JsonValue): Array<{
  role?: string;
  content?: string;
}> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const object = readJsonObjectValue(entry);
    if (!object) {
      return [];
    }
    const message = pickOptionalStringFields(object, ["role", "content"] as const);
    return Object.keys(message).length > 0 ? [message] : [];
  });
}
export function readConversationTitleConfig(value: JsonValue): PluginConversationTitleConfig {
  const object = readJsonObjectValue(value);
  return {
    ...pickOptionalStringFields(object, ["defaultTitle"] as const),
    ...pickOptionalNumberFields(object, ["maxMessages"] as const),
  };
}
export function resolveConversationTitleRuntimeConfig(config: PluginConversationTitleConfig): {
  defaultTitle: string;
  maxMessages: number;
} {
  return {
    defaultTitle: sanitizeOptionalText(config.defaultTitle) || CONVERSATION_TITLE_DEFAULT_TITLE,
    maxMessages: typeof config.maxMessages === "number" ? config.maxMessages : CONVERSATION_TITLE_DEFAULT_MAX_MESSAGES,
  };
}
export function readTextGenerationResult(value: JsonValue): {
  text: string;
} {
  const object = readJsonObjectValue(value);
  if (!object || typeof object.text !== "string") {
    return { text: "" };
  }
  return { text: object.text };
}
export function shouldGenerateConversationTitle(title: string | undefined, defaultTitle: string): boolean {
  return sanitizeOptionalText(title) === defaultTitle;
}
export function buildConversationTitlePrompt(
  messages: Array<{
    role?: string;
    content?: string;
  }>,
  maxMessages: number,
): string {
  const visibleMessages = messages
    .filter((message) => typeof message.content === "string" && sanitizeOptionalText(message.content))
    .slice(-Math.max(1, maxMessages))
    .map((message) => `${mapConversationRoleLabel(message.role)}: ${sanitizeOptionalText(message.content)}`);
  if (visibleMessages.length === 0) {
    return "";
  }
  return ["请为下面这段对话生成一个简洁中文标题。", "要求：", "- 8 到 20 个字", "- 不要使用引号", "- 不要输出序号或解释", "- 只输出标题本身", "", "对话：", ...visibleMessages].join("\n");
}
export function sanitizeConversationTitle(raw?: string): string {
  if (!raw) {
    return "";
  }
  const firstLine = raw.trim().split("\n")[0].trim();
  return firstLine
    .replace(/^["'`「『]+/, "")
    .replace(/["'`」』]+$/, "")
    .trim();
}
export function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}
function mapConversationRoleLabel(role?: string): string {
  switch (role) {
    case "assistant":
      return "助手";
    case "system":
      return "系统";
    case "tool":
      return "工具";
    default:
      return "用户";
  }
}
