import type {
  PluginMessageTargetRef,
  PluginSubagentRequest,
} from '@garlic-claw/shared';
import { normalizePositiveInteger } from '@garlic-claw/shared';
import type { JsonObject } from '../common/types/json-value';
import {
  readOptionalRuntimeNumber,
  readOptionalRuntimeObject,
  readOptionalRuntimeString,
  readOptionalRuntimeStringArray,
  readOptionalRuntimeStringRecord,
  requireRuntimeJsonObjectValue,
} from './plugin-runtime-params.helpers';
import {
  readOptionalRuntimeMessageTarget,
  readRuntimeLlmMessages,
} from './plugin-runtime-message.helpers';

export function readRuntimeSubagentRequest(
  params: JsonObject,
  method: string,
): PluginSubagentRequest {
  const providerId = readOptionalRuntimeString(params, 'providerId', method);
  const modelId = readOptionalRuntimeString(params, 'modelId', method);
  const system = readOptionalRuntimeString(params, 'system', method);
  const toolNames = readOptionalRuntimeStringArray(params, 'toolNames', method);
  const variant = readOptionalRuntimeString(params, 'variant', method);
  const providerOptions = readOptionalRuntimeObject(
    params,
    'providerOptions',
    method,
  );
  const headers = readOptionalRuntimeStringRecord(params, 'headers', method);
  const maxOutputTokens = readOptionalRuntimeNumber(
    params,
    'maxOutputTokens',
    method,
  );
  const maxSteps = readOptionalRuntimeNumber(params, 'maxSteps', method);

  return {
    ...(providerId ? { providerId } : {}),
    ...(modelId ? { modelId } : {}),
    ...(system ? { system } : {}),
    messages: readRuntimeLlmMessages(params, method),
    ...(toolNames ? { toolNames } : {}),
    ...(variant ? { variant } : {}),
    ...(providerOptions ? { providerOptions } : {}),
    ...(headers ? { headers } : {}),
    ...(typeof maxOutputTokens === 'number' ? { maxOutputTokens } : {}),
    maxSteps: normalizePositiveInteger(maxSteps, 5),
  };
}

export function readRuntimeSubagentTaskStartParams(
  params: JsonObject,
  method: string,
): {
  request: PluginSubagentRequest;
  writeBackTarget?: PluginMessageTargetRef;
} {
  const request = readRuntimeSubagentRequest(params, method);
  const rawWriteBack = params.writeBack;
  if (rawWriteBack === undefined || rawWriteBack === null) {
    return { request };
  }

  const writeBack = requireRuntimeJsonObjectValue(
    rawWriteBack,
    `${method} 的 writeBack`,
  );
  const writeBackTarget = readOptionalRuntimeMessageTarget(
    writeBack,
    'target',
    `${method}.writeBack`,
  );

  return {
    request,
    ...(writeBackTarget ? { writeBackTarget } : {}),
  };
}
