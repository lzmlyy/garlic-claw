import type { ChatBeforeModelHookResult, JsonValue } from "@garlic-claw/shared";
import { createChatBeforeModelHookResult } from "./transport";
import { pickOptionalNumberFields, pickOptionalStringFields, readJsonObjectValue, sanitizeOptionalText } from "./common-helpers";
export interface PluginPromptBlockConfig {
  limit?: number;
  promptPrefix?: string;
}
export function createChatBeforeModelLineBlockResult(currentSystemPrompt: string, promptPrefix: string, lines: string[]): ChatBeforeModelHookResult | null {
  if (lines.length === 0) {
    return null;
  }
  return createChatBeforeModelHookResult(currentSystemPrompt, `${promptPrefix}：\n${lines.join("\n")}`);
}
export function readPromptBlockConfig(value: JsonValue): PluginPromptBlockConfig {
  const object = readJsonObjectValue(value);
  return {
    ...pickOptionalNumberFields(object, ["limit"] as const),
    ...pickOptionalStringFields(object, ["promptPrefix"] as const),
  };
}
export function resolvePromptBlockConfig(
  config: PluginPromptBlockConfig,
  defaults: {
    limit: number;
    promptPrefix: string;
  },
): {
  limit: number;
  promptPrefix: string;
} {
  return {
    limit: typeof config.limit === "number" ? config.limit : defaults.limit,
    promptPrefix: sanitizeOptionalText(config.promptPrefix) || defaults.promptPrefix,
  };
}
export function filterAllowedToolNames(allowedToolNames: string[] | undefined, currentToolNames: string[]): string[] | null {
  if (!allowedToolNames || allowedToolNames.length === 0) {
    return null;
  }
  const allowed = new Set(allowedToolNames);
  return currentToolNames.filter((toolName) => allowed.has(toolName));
}
export function sameToolNames(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((toolName, index) => toolName === right[index]);
}
export function readLatestUserTextFromMessages(
  messages: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string | Array<{ type: string; text?: string }>;
  }>,
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") {
      continue;
    }
    if (typeof message.content === "string") {
      return message.content.trim();
    }
    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("\n")
      .trim();
    if (text) {
      return text;
    }
  }
  return "";
}
export function clipContextText(content: string, maxLength = 240): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}
