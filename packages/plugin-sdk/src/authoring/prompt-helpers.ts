import type { ChatBeforeModelHookResult } from "@garlic-claw/shared";
import type { PluginManifest } from "@garlic-claw/shared";
import authoringConfigData from "./authoring-config-data.json";
import { createChatBeforeModelHookResult } from "./transport";
export const KB_CONTEXT_DEFAULT_LIMIT = authoringConfigData.defaults.kbContextLimit;
export const KB_CONTEXT_DEFAULT_PROMPT_PREFIX = authoringConfigData.defaults.kbContextPromptPrefix;
export const KB_CONTEXT_CONFIG_SCHEMA = authoringConfigData.kbContextConfigSchema as unknown as NonNullable<PluginManifest["config"]>;
export function createChatBeforeModelLineBlockResult(currentSystemPrompt: string, promptPrefix: string, lines: string[]): ChatBeforeModelHookResult | null {
  if (lines.length === 0) {
    return null;
  }
  return createChatBeforeModelHookResult(currentSystemPrompt, `${promptPrefix}：\n${lines.join("\n")}`);
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
