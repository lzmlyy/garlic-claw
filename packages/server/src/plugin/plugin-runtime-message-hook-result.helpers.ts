import type {
  ChatAfterModelHookMutateResult,
  ChatAfterModelHookPassResult,
  MessageCreatedHookMutateResult,
  MessageCreatedHookResult,
  MessageUpdatedHookMutateResult,
  MessageUpdatedHookResult,
} from '@garlic-claw/shared';
import type { JsonValue } from '../common/types/json-value';
import {
  isChatMessagePartArray,
  isChatMessageStatus,
  isPluginLlmMessageArray,
} from '@garlic-claw/shared';
import {
  castValidatedHookResult,
  readHookResultObject,
} from './plugin-runtime-hook-result-base.helpers';

type NormalizedChatAfterModelHookResult =
  | ChatAfterModelHookPassResult
  | ChatAfterModelHookMutateResult;

type NormalizedMessageCreatedHookResult =
  | MessageCreatedHookResult
  | MessageCreatedHookMutateResult;

type NormalizedMessageUpdatedHookResult =
  | MessageUpdatedHookResult
  | MessageUpdatedHookMutateResult;

export function normalizeChatAfterModelHookResult(
  result: JsonValue | null | undefined,
): NormalizedChatAfterModelHookResult | null {
  const objectResult = readHookResultObject(result, 'chat:after-model');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if (
      'assistantContent' in objectResult
      && objectResult.assistantContent !== null
      && typeof objectResult.assistantContent !== 'string'
    ) {
      throw new Error('chat:after-model Hook 的 assistantContent 必须是字符串或 null');
    }
    if (
      'assistantParts' in objectResult
      && objectResult.assistantParts !== null
      && !isChatMessagePartArray(objectResult.assistantParts)
    ) {
      throw new Error('chat:after-model Hook 的 assistantParts 必须是消息 part 数组或 null');
    }

    return castValidatedHookResult<ChatAfterModelHookMutateResult>(objectResult);
  }

  throw new Error('chat:after-model Hook 返回了未知 action');
}

export function normalizeMessageCreatedHookResult(
  result: JsonValue | null | undefined,
): NormalizedMessageCreatedHookResult | null {
  const objectResult = readHookResultObject(result, 'message:created');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if (
      'content' in objectResult
      && objectResult.content !== null
      && typeof objectResult.content !== 'string'
    ) {
      throw new Error('message:created Hook 的 content 必须是字符串或 null');
    }
    if (
      'parts' in objectResult
      && objectResult.parts !== null
      && !isChatMessagePartArray(objectResult.parts)
    ) {
      throw new Error('message:created Hook 的 parts 必须是消息 part 数组或 null');
    }
    if (
      'modelMessages' in objectResult
      && !isPluginLlmMessageArray(objectResult.modelMessages)
    ) {
      throw new Error('message:created Hook 的 modelMessages 必须是统一消息数组');
    }
    if (
      'provider' in objectResult
      && objectResult.provider !== null
      && typeof objectResult.provider !== 'string'
    ) {
      throw new Error('message:created Hook 的 provider 必须是字符串或 null');
    }
    if (
      'model' in objectResult
      && objectResult.model !== null
      && typeof objectResult.model !== 'string'
    ) {
      throw new Error('message:created Hook 的 model 必须是字符串或 null');
    }
    if (
      'status' in objectResult
      && objectResult.status !== null
      && !isChatMessageStatus(objectResult.status)
    ) {
      throw new Error('message:created Hook 的 status 必须是合法消息状态或 null');
    }

    return castValidatedHookResult<MessageCreatedHookMutateResult>(objectResult);
  }

  throw new Error('message:created Hook 返回了未知 action');
}

export function normalizeMessageUpdatedHookResult(
  result: JsonValue | null | undefined,
): NormalizedMessageUpdatedHookResult | null {
  const objectResult = readHookResultObject(result, 'message:updated');
  if (!objectResult) {
    return null;
  }
  if (objectResult.action === 'pass') {
    return { action: 'pass' };
  }
  if (objectResult.action === 'mutate') {
    if (
      'content' in objectResult
      && objectResult.content !== null
      && typeof objectResult.content !== 'string'
    ) {
      throw new Error('message:updated Hook 的 content 必须是字符串或 null');
    }
    if (
      'parts' in objectResult
      && objectResult.parts !== null
      && !isChatMessagePartArray(objectResult.parts)
    ) {
      throw new Error('message:updated Hook 的 parts 必须是消息 part 数组或 null');
    }
    if (
      'provider' in objectResult
      && objectResult.provider !== null
      && typeof objectResult.provider !== 'string'
    ) {
      throw new Error('message:updated Hook 的 provider 必须是字符串或 null');
    }
    if (
      'model' in objectResult
      && objectResult.model !== null
      && typeof objectResult.model !== 'string'
    ) {
      throw new Error('message:updated Hook 的 model 必须是字符串或 null');
    }
    if (
      'status' in objectResult
      && objectResult.status !== null
      && !isChatMessageStatus(objectResult.status)
    ) {
      throw new Error('message:updated Hook 的 status 必须是合法消息状态或 null');
    }

    return castValidatedHookResult<MessageUpdatedHookMutateResult>(objectResult);
  }

  throw new Error('message:updated Hook 返回了未知 action');
}
