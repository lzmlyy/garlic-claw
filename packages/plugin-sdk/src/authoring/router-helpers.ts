import type { PluginManifest } from "@garlic-claw/shared";
import builtinManifestData from "./builtin-manifest-data.json";
import { pickOptionalStringFields, readJsonObjectValue } from "./common-helpers";
export interface PluginProviderRouterConfig {
  targetProviderId?: string;
  targetModelId?: string;
  allowedToolNames?: string;
  shortCircuitKeyword?: string;
  shortCircuitReply?: string;
}
export interface PluginCurrentProviderInfo {
  providerId?: string;
  modelId?: string;
}
export interface PluginPersonaRouterConfig {
  targetPersonaId?: string;
  switchKeyword?: string;
}
export interface PluginCurrentPersonaInfo {
  personaId?: string;
}
export interface PluginPersonaSummaryInfo {
  id?: string;
  prompt?: string;
}
export const PROVIDER_ROUTER_DEFAULT_SHORT_CIRCUIT_REPLY = builtinManifestData.defaults.providerRouterDefaultShortCircuitReply;
export const PROVIDER_ROUTER_CONFIG_FIELDS = builtinManifestData.providerRouterConfigFields as NonNullable<PluginManifest["config"]>["fields"];
export const PERSONA_ROUTER_CONFIG_FIELDS = builtinManifestData.personaRouterConfigFields as NonNullable<PluginManifest["config"]>["fields"];
export function readProviderRouterConfig(value: unknown): PluginProviderRouterConfig {
  const object = readJsonObjectValue(value);
  return {
    ...pickOptionalStringFields(object, ["targetProviderId", "targetModelId", "allowedToolNames", "shortCircuitKeyword", "shortCircuitReply"] as const),
  };
}
export function readCurrentProviderInfo(value: unknown): PluginCurrentProviderInfo {
  return {
    ...pickOptionalStringFields(readJsonObjectValue(value), ["providerId", "modelId"] as const),
  };
}
export function readPersonaRouterConfig(value: unknown): PluginPersonaRouterConfig {
  return {
    ...pickOptionalStringFields(readJsonObjectValue(value), ["targetPersonaId", "switchKeyword"] as const),
  };
}
export function readCurrentPersonaInfo(value: unknown): PluginCurrentPersonaInfo {
  return { ...pickOptionalStringFields(readJsonObjectValue(value), ["personaId"] as const) };
}
export function readPersonaSummaryInfo(value: unknown): PluginPersonaSummaryInfo {
  return { ...pickOptionalStringFields(readJsonObjectValue(value), ["id", "prompt"] as const) };
}
