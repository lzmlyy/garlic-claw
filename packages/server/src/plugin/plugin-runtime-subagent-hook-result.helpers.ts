import type {
  SubagentAfterRunHookMutateResult,
  SubagentAfterRunHookPassResult,
  SubagentBeforeRunHookMutateResult,
  SubagentBeforeRunHookPassResult,
  SubagentBeforeRunHookShortCircuitResult,
} from '@garlic-claw/shared';
import type { JsonValue } from '../common/types/json-value';
import {
  isJsonObjectValue,
  isPluginLlmMessageArray,
  isPluginSubagentToolCallArray,
  isPluginSubagentToolResultArray,
  isStringArray,
  isStringRecord,
} from '@garlic-claw/shared';
import {
  castValidatedHookResult,
  readHookResultObject,
} from './plugin-runtime-hook-result-base.helpers';

type NormalizedSubagentBeforeRunHookResult =
  | SubagentBeforeRunHookPassResult
  | SubagentBeforeRunHookMutateResult
  | SubagentBeforeRunHookShortCircuitResult;

type NormalizedSubagentAfterRunHookResult =
  | SubagentAfterRunHookPassResult
  | SubagentAfterRunHookMutateResult;

export function normalizeSubagentBeforeRunHookResult(
  result: JsonValue | null | undefined,
): NormalizedSubagentBeforeRunHookResult | null {
  const objectResult = readHookResultObject(result, 'subagent:before-run');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if (
      'providerId' in objectResult
      && objectResult.providerId !== null
      && typeof objectResult.providerId !== 'string'
    ) {
      throw new Error('subagent:before-run Hook 的 providerId 必须是字符串或 null');
    }
    if (
      'modelId' in objectResult
      && objectResult.modelId !== null
      && typeof objectResult.modelId !== 'string'
    ) {
      throw new Error('subagent:before-run Hook 的 modelId 必须是字符串或 null');
    }
    if (
      'system' in objectResult
      && objectResult.system !== null
      && typeof objectResult.system !== 'string'
    ) {
      throw new Error('subagent:before-run Hook 的 system 必须是字符串或 null');
    }
    if (
      'messages' in objectResult
      && !isPluginLlmMessageArray(objectResult.messages)
    ) {
      throw new Error('subagent:before-run Hook 的 messages 必须是统一消息数组');
    }
    if (
      'toolNames' in objectResult
      && objectResult.toolNames !== null
      && !isStringArray(objectResult.toolNames)
    ) {
      throw new Error('subagent:before-run Hook 的 toolNames 必须是字符串数组或 null');
    }
    if (
      'variant' in objectResult
      && objectResult.variant !== null
      && typeof objectResult.variant !== 'string'
    ) {
      throw new Error('subagent:before-run Hook 的 variant 必须是字符串或 null');
    }
    if (
      'providerOptions' in objectResult
      && objectResult.providerOptions !== null
      && !isJsonObjectValue(objectResult.providerOptions)
    ) {
      throw new Error('subagent:before-run Hook 的 providerOptions 必须是对象或 null');
    }
    if (
      'headers' in objectResult
      && objectResult.headers !== null
      && !isStringRecord(objectResult.headers)
    ) {
      throw new Error('subagent:before-run Hook 的 headers 必须是字符串字典或 null');
    }
    if (
      'maxOutputTokens' in objectResult
      && objectResult.maxOutputTokens !== null
      && typeof objectResult.maxOutputTokens !== 'number'
    ) {
      throw new Error('subagent:before-run Hook 的 maxOutputTokens 必须是数字或 null');
    }
    if (
      'maxSteps' in objectResult
      && objectResult.maxSteps !== null
      && typeof objectResult.maxSteps !== 'number'
    ) {
      throw new Error('subagent:before-run Hook 的 maxSteps 必须是数字或 null');
    }

    return castValidatedHookResult<SubagentBeforeRunHookMutateResult>(objectResult);
  }
  if (objectResult.action === 'short-circuit') {
    if (typeof objectResult.text !== 'string') {
      throw new Error('subagent:before-run Hook 的 text 必须是字符串');
    }
    if (
      'providerId' in objectResult
      && objectResult.providerId !== null
      && typeof objectResult.providerId !== 'string'
    ) {
      throw new Error('subagent:before-run Hook 的 providerId 必须是字符串或 null');
    }
    if (
      'modelId' in objectResult
      && objectResult.modelId !== null
      && typeof objectResult.modelId !== 'string'
    ) {
      throw new Error('subagent:before-run Hook 的 modelId 必须是字符串或 null');
    }
    if (
      'finishReason' in objectResult
      && objectResult.finishReason !== null
      && typeof objectResult.finishReason !== 'string'
    ) {
      throw new Error('subagent:before-run Hook 的 finishReason 必须是字符串或 null');
    }
    if (
      'toolCalls' in objectResult
      && !isPluginSubagentToolCallArray(objectResult.toolCalls)
    ) {
      throw new Error('subagent:before-run Hook 的 toolCalls 必须是工具调用数组');
    }
    if (
      'toolResults' in objectResult
      && !isPluginSubagentToolResultArray(objectResult.toolResults)
    ) {
      throw new Error('subagent:before-run Hook 的 toolResults 必须是工具结果数组');
    }

    return castValidatedHookResult<SubagentBeforeRunHookShortCircuitResult>(objectResult);
  }

  throw new Error('subagent:before-run Hook 返回了未知 action');
}

export function normalizeSubagentAfterRunHookResult(
  result: JsonValue | null | undefined,
): NormalizedSubagentAfterRunHookResult | null {
  const objectResult = readHookResultObject(result, 'subagent:after-run');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if ('text' in objectResult && typeof objectResult.text !== 'string') {
      throw new Error('subagent:after-run Hook 的 text 必须是字符串');
    }
    if (
      'providerId' in objectResult
      && objectResult.providerId !== null
      && typeof objectResult.providerId !== 'string'
    ) {
      throw new Error('subagent:after-run Hook 的 providerId 必须是字符串或 null');
    }
    if (
      'modelId' in objectResult
      && objectResult.modelId !== null
      && typeof objectResult.modelId !== 'string'
    ) {
      throw new Error('subagent:after-run Hook 的 modelId 必须是字符串或 null');
    }
    if (
      'finishReason' in objectResult
      && objectResult.finishReason !== null
      && typeof objectResult.finishReason !== 'string'
    ) {
      throw new Error('subagent:after-run Hook 的 finishReason 必须是字符串或 null');
    }
    if (
      'toolCalls' in objectResult
      && !isPluginSubagentToolCallArray(objectResult.toolCalls)
    ) {
      throw new Error('subagent:after-run Hook 的 toolCalls 必须是工具调用数组');
    }
    if (
      'toolResults' in objectResult
      && !isPluginSubagentToolResultArray(objectResult.toolResults)
    ) {
      throw new Error('subagent:after-run Hook 的 toolResults 必须是工具结果数组');
    }

    return castValidatedHookResult<SubagentAfterRunHookMutateResult>(objectResult);
  }

  throw new Error('subagent:after-run Hook 返回了未知 action');
}
