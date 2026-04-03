import type {
  AutomationAfterRunHookMutateResult,
  AutomationAfterRunHookPassResult,
  AutomationBeforeRunHookMutateResult,
  AutomationBeforeRunHookPassResult,
  AutomationBeforeRunHookShortCircuitResult,
  ResponseBeforeSendHookMutateResult,
  ResponseBeforeSendHookPassResult,
  ToolAfterCallHookMutateResult,
  ToolAfterCallHookPassResult,
  ToolBeforeCallHookMutateResult,
  ToolBeforeCallHookPassResult,
  ToolBeforeCallHookShortCircuitResult,
} from '@garlic-claw/shared';
import type { JsonValue } from '../common/types/json-value';
import {
  isActionConfigArray,
  isChatMessagePartArray,
  isJsonObjectValue,
} from '@garlic-claw/shared';
import {
  castValidatedHookResult,
  readHookResultObject,
} from './plugin-runtime-hook-result-base.helpers';

type NormalizedAutomationBeforeRunHookResult =
  | AutomationBeforeRunHookPassResult
  | AutomationBeforeRunHookMutateResult
  | AutomationBeforeRunHookShortCircuitResult;

type NormalizedAutomationAfterRunHookResult =
  | AutomationAfterRunHookPassResult
  | AutomationAfterRunHookMutateResult;

type NormalizedToolBeforeCallHookResult =
  | ToolBeforeCallHookPassResult
  | ToolBeforeCallHookMutateResult
  | ToolBeforeCallHookShortCircuitResult;

type NormalizedToolAfterCallHookResult =
  | ToolAfterCallHookPassResult
  | ToolAfterCallHookMutateResult;

type NormalizedResponseBeforeSendHookResult =
  | ResponseBeforeSendHookPassResult
  | ResponseBeforeSendHookMutateResult;

export function normalizeAutomationBeforeRunHookResult(
  result: JsonValue | null | undefined,
): NormalizedAutomationBeforeRunHookResult | null {
  const objectResult = readHookResultObject(result, 'automation:before-run');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if ('actions' in objectResult && !isActionConfigArray(objectResult.actions)) {
      throw new Error('automation:before-run Hook 的 actions 必须是动作数组');
    }

    return castValidatedHookResult<AutomationBeforeRunHookMutateResult>(objectResult);
  }
  if (objectResult.action === 'short-circuit') {
    if (typeof objectResult.status !== 'string') {
      throw new Error('automation:before-run Hook 的 status 必须是字符串');
    }
    if (!Array.isArray(objectResult.results)) {
      throw new Error('automation:before-run Hook 的 results 必须是数组');
    }

    return castValidatedHookResult<AutomationBeforeRunHookShortCircuitResult>(objectResult);
  }

  throw new Error('automation:before-run Hook 返回了未知 action');
}

export function normalizeAutomationAfterRunHookResult(
  result: JsonValue | null | undefined,
): NormalizedAutomationAfterRunHookResult | null {
  const objectResult = readHookResultObject(result, 'automation:after-run');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if ('status' in objectResult && typeof objectResult.status !== 'string') {
      throw new Error('automation:after-run Hook 的 status 必须是字符串');
    }
    if ('results' in objectResult && !Array.isArray(objectResult.results)) {
      throw new Error('automation:after-run Hook 的 results 必须是数组');
    }

    return castValidatedHookResult<AutomationAfterRunHookMutateResult>(objectResult);
  }

  throw new Error('automation:after-run Hook 返回了未知 action');
}

export function normalizeToolBeforeCallHookResult(
  result: JsonValue | null | undefined,
): NormalizedToolBeforeCallHookResult | null {
  const objectResult = readHookResultObject(result, 'tool:before-call');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if ('params' in objectResult && !isJsonObjectValue(objectResult.params)) {
      throw new Error('tool:before-call Hook 的 params 必须是对象');
    }

    return castValidatedHookResult<ToolBeforeCallHookMutateResult>(objectResult);
  }
  if (objectResult.action === 'short-circuit') {
    if (!('output' in objectResult) || typeof objectResult.output === 'undefined') {
      throw new Error('tool:before-call Hook 的 output 不能为空');
    }

    return castValidatedHookResult<ToolBeforeCallHookShortCircuitResult>(objectResult);
  }

  throw new Error('tool:before-call Hook 返回了未知 action');
}

export function normalizeToolAfterCallHookResult(
  result: JsonValue | null | undefined,
): NormalizedToolAfterCallHookResult | null {
  const objectResult = readHookResultObject(result, 'tool:after-call');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if (!('output' in objectResult) || typeof objectResult.output === 'undefined') {
      throw new Error('tool:after-call Hook 的 output 不能为空');
    }

    return castValidatedHookResult<ToolAfterCallHookMutateResult>(objectResult);
  }

  throw new Error('tool:after-call Hook 返回了未知 action');
}

export function normalizeResponseBeforeSendHookResult(
  result: JsonValue | null | undefined,
): NormalizedResponseBeforeSendHookResult | null {
  const objectResult = readHookResultObject(result, 'response:before-send');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if ('providerId' in objectResult && typeof objectResult.providerId !== 'string') {
      throw new Error('response:before-send Hook 的 providerId 必须是字符串');
    }
    if ('modelId' in objectResult && typeof objectResult.modelId !== 'string') {
      throw new Error('response:before-send Hook 的 modelId 必须是字符串');
    }
    if (
      'assistantContent' in objectResult
      && typeof objectResult.assistantContent !== 'string'
    ) {
      throw new Error('response:before-send Hook 的 assistantContent 必须是字符串');
    }
    if (
      'assistantParts' in objectResult
      && objectResult.assistantParts !== null
      && !isChatMessagePartArray(objectResult.assistantParts)
    ) {
      throw new Error('response:before-send Hook 的 assistantParts 必须是消息 part 数组或 null');
    }
    if ('toolCalls' in objectResult && !Array.isArray(objectResult.toolCalls)) {
      throw new Error('response:before-send Hook 的 toolCalls 必须是数组');
    }
    if ('toolResults' in objectResult && !Array.isArray(objectResult.toolResults)) {
      throw new Error('response:before-send Hook 的 toolResults 必须是数组');
    }

    return castValidatedHookResult<ResponseBeforeSendHookMutateResult>(objectResult);
  }

  throw new Error('response:before-send Hook 返回了未知 action');
}
