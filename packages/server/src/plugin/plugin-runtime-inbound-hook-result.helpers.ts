import type {
  ChatBeforeModelHookMutateResult,
  ChatBeforeModelHookPassResult,
  ChatBeforeModelHookShortCircuitResult,
  MessageReceivedHookMutateResult,
  MessageReceivedHookPassResult,
  MessageReceivedHookShortCircuitResult,
} from '@garlic-claw/shared';
import type { JsonValue } from '../common/types/json-value';
import {
  isChatMessagePartArray,
  isJsonObjectValue,
  isPluginLlmMessageArray,
  isStringArray,
  isStringRecord,
} from '@garlic-claw/shared';
import {
  castValidatedHookResult,
  readHookResultObject,
} from './plugin-runtime-hook-result-base.helpers';

type NormalizedChatBeforeModelHookResult =
  | ChatBeforeModelHookPassResult
  | ChatBeforeModelHookMutateResult
  | ChatBeforeModelHookShortCircuitResult;

type NormalizedMessageReceivedHookResult =
  | MessageReceivedHookPassResult
  | MessageReceivedHookMutateResult
  | MessageReceivedHookShortCircuitResult;

export function normalizeChatBeforeModelHookResult(
  result: JsonValue | null | undefined,
): NormalizedChatBeforeModelHookResult | null {
  const objectResult = readHookResultObject(result, 'chat:before-model');
  if (!objectResult) {
    return null;
  }

  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }

  if (objectResult.action === 'mutate') {
    if ('providerId' in objectResult && typeof objectResult.providerId !== 'string') {
      throw new Error('chat:before-model Hook 的 providerId 必须是字符串');
    }
    if ('modelId' in objectResult && typeof objectResult.modelId !== 'string') {
      throw new Error('chat:before-model Hook 的 modelId 必须是字符串');
    }
    if ('systemPrompt' in objectResult && typeof objectResult.systemPrompt !== 'string') {
      throw new Error('chat:before-model Hook 的 systemPrompt 必须是字符串');
    }
    if ('messages' in objectResult && !Array.isArray(objectResult.messages)) {
      throw new Error('chat:before-model Hook 的 messages 必须是数组');
    }
    if ('toolNames' in objectResult && !isStringArray(objectResult.toolNames)) {
      throw new Error('chat:before-model Hook 的 toolNames 必须是字符串数组');
    }
    if (
      'variant' in objectResult
      && objectResult.variant !== null
      && typeof objectResult.variant !== 'string'
    ) {
      throw new Error('chat:before-model Hook 的 variant 必须是字符串或 null');
    }
    if (
      'providerOptions' in objectResult
      && objectResult.providerOptions !== null
      && !isJsonObjectValue(objectResult.providerOptions)
    ) {
      throw new Error('chat:before-model Hook 的 providerOptions 必须是对象或 null');
    }
    if (
      'headers' in objectResult
      && objectResult.headers !== null
      && !isStringRecord(objectResult.headers)
    ) {
      throw new Error('chat:before-model Hook 的 headers 必须是字符串对象或 null');
    }
    if (
      'maxOutputTokens' in objectResult
      && objectResult.maxOutputTokens !== null
      && typeof objectResult.maxOutputTokens !== 'number'
    ) {
      throw new Error('chat:before-model Hook 的 maxOutputTokens 必须是数字或 null');
    }

    return castValidatedHookResult<ChatBeforeModelHookMutateResult>(objectResult);
  }

  if (objectResult.action === 'short-circuit') {
    if (typeof objectResult.assistantContent !== 'string') {
      throw new Error('chat:before-model Hook 的 assistantContent 必须是字符串');
    }
    if (
      'assistantParts' in objectResult
      && objectResult.assistantParts !== null
      && !isChatMessagePartArray(objectResult.assistantParts)
    ) {
      throw new Error('chat:before-model Hook 的 assistantParts 必须是消息 part 数组或 null');
    }
    if ('providerId' in objectResult && typeof objectResult.providerId !== 'string') {
      throw new Error('chat:before-model Hook 的 providerId 必须是字符串');
    }
    if ('modelId' in objectResult && typeof objectResult.modelId !== 'string') {
      throw new Error('chat:before-model Hook 的 modelId 必须是字符串');
    }
    if ('reason' in objectResult && typeof objectResult.reason !== 'string') {
      throw new Error('chat:before-model Hook 的 reason 必须是字符串');
    }

    return castValidatedHookResult<ChatBeforeModelHookShortCircuitResult>(objectResult);
  }

  throw new Error('chat:before-model Hook 返回了未知 action');
}

export function normalizeMessageReceivedHookResult(
  result: JsonValue | null | undefined,
): NormalizedMessageReceivedHookResult | null {
  const objectResult = readHookResultObject(result, 'message:received');
  if (!objectResult) {
    return null;
  }

  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if ('providerId' in objectResult && typeof objectResult.providerId !== 'string') {
      throw new Error('message:received Hook 的 providerId 必须是字符串');
    }
    if ('modelId' in objectResult && typeof objectResult.modelId !== 'string') {
      throw new Error('message:received Hook 的 modelId 必须是字符串');
    }
    if (
      'content' in objectResult
      && objectResult.content !== null
      && typeof objectResult.content !== 'string'
    ) {
      throw new Error('message:received Hook 的 content 必须是字符串或 null');
    }
    if (
      'parts' in objectResult
      && objectResult.parts !== null
      && !isChatMessagePartArray(objectResult.parts)
    ) {
      throw new Error('message:received Hook 的 parts 必须是消息 part 数组或 null');
    }
    if (
      'modelMessages' in objectResult
      && !isPluginLlmMessageArray(objectResult.modelMessages)
    ) {
      throw new Error('message:received Hook 的 modelMessages 必须是统一消息数组');
    }

    return castValidatedHookResult<MessageReceivedHookMutateResult>(objectResult);
  }
  if (objectResult.action === 'short-circuit') {
    if (typeof objectResult.assistantContent !== 'string') {
      throw new Error('message:received Hook 的 assistantContent 必须是字符串');
    }
    if (
      'assistantParts' in objectResult
      && objectResult.assistantParts !== null
      && !isChatMessagePartArray(objectResult.assistantParts)
    ) {
      throw new Error('message:received Hook 的 assistantParts 必须是消息 part 数组或 null');
    }
    if ('providerId' in objectResult && typeof objectResult.providerId !== 'string') {
      throw new Error('message:received Hook 的 providerId 必须是字符串');
    }
    if ('modelId' in objectResult && typeof objectResult.modelId !== 'string') {
      throw new Error('message:received Hook 的 modelId 必须是字符串');
    }
    if ('reason' in objectResult && typeof objectResult.reason !== 'string') {
      throw new Error('message:received Hook 的 reason 必须是字符串');
    }

    return castValidatedHookResult<MessageReceivedHookShortCircuitResult>(objectResult);
  }

  throw new Error('message:received Hook 返回了未知 action');
}
