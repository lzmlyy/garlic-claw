import type { PluginManifest } from "@garlic-claw/shared";
import builtinManifestData from "./builtin-manifest-data.json";

export interface PluginSubagentDelegateConfig {
  targetProviderId?: string;
  targetModelId?: string;
  allowedToolNames?: string;
  maxSteps?: number;
}
const BUILTIN_MANIFEST_DATA = builtinManifestData;

type PluginConfigFields = NonNullable<PluginManifest["config"]>["fields"];

export const MEMORY_CONTEXT_DEFAULT_LIMIT = BUILTIN_MANIFEST_DATA.defaults.memoryContextLimit;
export const MEMORY_CONTEXT_DEFAULT_PROMPT_PREFIX = BUILTIN_MANIFEST_DATA.defaults.memoryContextPromptPrefix;
export const KB_CONTEXT_DEFAULT_LIMIT = BUILTIN_MANIFEST_DATA.defaults.kbContextLimit;
export const KB_CONTEXT_DEFAULT_PROMPT_PREFIX = BUILTIN_MANIFEST_DATA.defaults.kbContextPromptPrefix;
export const SUBAGENT_DELEGATE_DEFAULT_MAX_STEPS = BUILTIN_MANIFEST_DATA.defaults.subagentDelegateMaxSteps;
export const MEMORY_CONTEXT_CONFIG_FIELDS = BUILTIN_MANIFEST_DATA.memoryContextConfigFields as PluginConfigFields;
export const KB_CONTEXT_CONFIG_FIELDS = BUILTIN_MANIFEST_DATA.kbContextConfigFields as PluginConfigFields;
export const SUBAGENT_DELEGATE_CONFIG_FIELDS = BUILTIN_MANIFEST_DATA.subagentDelegateConfigFields as PluginConfigFields;
export const MEMORY_TOOLS_MANIFEST_TOOLS = BUILTIN_MANIFEST_DATA.memoryToolsManifestTools as unknown as NonNullable<PluginManifest["tools"]>;
export const CORE_TOOLS_MANIFEST_TOOLS = BUILTIN_MANIFEST_DATA.coreToolsManifestTools as unknown as NonNullable<PluginManifest["tools"]>;
export const AUTOMATION_TOOLS_MANIFEST_TOOLS = BUILTIN_MANIFEST_DATA.automationToolsManifestTools as unknown as NonNullable<PluginManifest["tools"]>;
export const SUBAGENT_DELEGATE_MANIFEST_TOOLS = BUILTIN_MANIFEST_DATA.subagentDelegateManifestTools as unknown as NonNullable<PluginManifest["tools"]>;
export const ROUTE_INSPECTOR_MANIFEST_ROUTES = BUILTIN_MANIFEST_DATA.routeInspectorManifestRoutes as NonNullable<PluginManifest["routes"]>;
export const MEMORY_CONTEXT_MANIFEST = BUILTIN_MANIFEST_DATA.memoryContextManifest as unknown as PluginManifest;
export const KB_CONTEXT_MANIFEST = BUILTIN_MANIFEST_DATA.kbContextManifest as unknown as PluginManifest;
export const PROVIDER_ROUTER_MANIFEST = BUILTIN_MANIFEST_DATA.providerRouterManifest as unknown as PluginManifest;
export const PERSONA_ROUTER_MANIFEST = BUILTIN_MANIFEST_DATA.personaRouterManifest as unknown as PluginManifest;
export const CRON_HEARTBEAT_MANIFEST = BUILTIN_MANIFEST_DATA.cronHeartbeatManifest as unknown as PluginManifest;
export const CORE_TOOLS_MANIFEST = BUILTIN_MANIFEST_DATA.coreToolsManifest as unknown as PluginManifest;
export const MEMORY_TOOLS_MANIFEST = BUILTIN_MANIFEST_DATA.memoryToolsManifest as unknown as PluginManifest;
export const AUTOMATION_TOOLS_MANIFEST = BUILTIN_MANIFEST_DATA.automationToolsManifest as unknown as PluginManifest;
export const SUBAGENT_DELEGATE_MANIFEST = BUILTIN_MANIFEST_DATA.subagentDelegateManifest as unknown as PluginManifest;
export const ROUTE_INSPECTOR_MANIFEST = BUILTIN_MANIFEST_DATA.routeInspectorManifest as unknown as PluginManifest;
