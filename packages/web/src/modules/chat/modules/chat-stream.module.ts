import { markRaw } from "vue";

import type { Ref } from "vue";
import type {
  ConversationContextWindowPreview,
  ConversationTodoItem,
  SSEEvent,
} from "@garlic-claw/shared";
import type { ChatSendInput } from "@/modules/chat/store/chat-store.types";
import type {
  ChatPendingRuntimePermission,
} from "@/modules/chat/store/chat-store.types";
import {
  retryConversationMessage,
  sendConversationMessage,
  streamConversationEvents,
} from "@/modules/chat/modules/chat-conversation.data";
import {
  startChatRecoveryPolling,
  stopChatRecoveryPolling,
} from "@/modules/chat/modules/chat-recovery.polling";
import {
  dbMessageToChat,
  findActiveAssistantMessageId,
  isAutoCompactionContinueMessage,
  normalizeSendInput,
} from "@/modules/chat/store/chat-store.helpers";
import {
  applyRequestError,
  applySseEvent,
  buildOptimisticAssistantMessage,
  buildOptimisticUserMessage,
  createTemporaryMessageId,
  replaceMessage,
} from "@/modules/chat/store/chat-store.runtime";
import type { ChatMessage } from "@/modules/chat/store/chat-store.types";
import { isAbortedAppError } from "@/shared/utils/error";

export interface ChatStreamState {
  currentConversationId: Ref<string | null>;
  contextWindowPreview: Ref<ConversationContextWindowPreview | null>;
  messages: Ref<ChatMessage[]>;
  selectedProvider: Ref<string | null>;
  selectedModel: Ref<string | null>;
  streamController: Ref<AbortController | null>;
  recoveryTimer: Ref<number | null>;
  currentStreamingMessageId: Ref<string | null>;
  todoItems: Ref<ConversationTodoItem[]>;
  pendingRuntimePermissions: Ref<ChatPendingRuntimePermission[]>;
  streaming: Ref<boolean>;
}

const DEFAULT_FRONTEND_MESSAGE_WINDOW_SIZE = 200;

interface ConversationRefreshParams {
  loadConversationDetail?: ((conversationId: string) => Promise<void>) | undefined;
  refreshConversationSnapshot?: (() => Promise<void>) | undefined;
  refreshConversationSummary?: (() => Promise<void>) | undefined;
  refreshConversationState?: ((input: {
    summaryRefreshed: boolean;
    permissionStateChanged: boolean;
  }) => Promise<void>) | undefined;
}

interface PendingMessageCommit {
  nextMessages: ChatMessage[] | null;
  timeoutId: number | null;
  frameId: number | null;
}

const STREAM_BATCH_INTERVAL = 50;
const pendingMessageCommits = new WeakMap<object, PendingMessageCommit>();

function getPendingMessageCommit(state: ChatStreamState) {
  const refKey = state.messages as object;
  const existing = pendingMessageCommits.get(refKey);
  if (existing) {
    return existing;
  }

  const initialState: PendingMessageCommit = {
    nextMessages: null,
    timeoutId: null,
    frameId: null,
  };
  pendingMessageCommits.set(refKey, initialState);
  return initialState;
}

function clearPendingCommit(pendingCommit: PendingMessageCommit) {
  if (pendingCommit.timeoutId !== null) {
    clearTimeout(pendingCommit.timeoutId);
    pendingCommit.timeoutId = null;
  }

  if (
    pendingCommit.frameId !== null &&
    typeof cancelAnimationFrame === "function"
  ) {
    cancelAnimationFrame(pendingCommit.frameId);
    pendingCommit.frameId = null;
  }
}

export function discardPendingMessageUpdates(state: ChatStreamState) {
  const pendingCommit = getPendingMessageCommit(state);
  clearPendingCommit(pendingCommit);
  pendingCommit.nextMessages = null;
}

function syncMessageList(state: ChatStreamState, nextMessages: ChatMessage[]) {
  state.messages.value = markRaw(trimConversationMessages(state, nextMessages));
  syncChatStreamingState(state);
}

function getLatestMessages(state: ChatStreamState) {
  return getPendingMessageCommit(state).nextMessages ?? state.messages.value;
}

function trimConversationMessages(
  state: ChatStreamState,
  nextMessages: ChatMessage[],
) {
  const windowSize = Math.max(
    1,
    state.contextWindowPreview.value?.frontendMessageWindowSize ??
      DEFAULT_FRONTEND_MESSAGE_WINDOW_SIZE,
  );
  return nextMessages.length > windowSize
    ? nextMessages.slice(-windowSize)
    : nextMessages;
}

function flushPendingMessages(state: ChatStreamState) {
  const pendingCommit = getPendingMessageCommit(state);
  clearPendingCommit(pendingCommit);

  if (!pendingCommit.nextMessages) {
    return;
  }

  const nextMessages = pendingCommit.nextMessages;
  pendingCommit.nextMessages = null;
  syncMessageList(state, nextMessages);
}

function commitMessagesImmediately(
  state: ChatStreamState,
  nextMessages: ChatMessage[],
) {
  const pendingCommit = getPendingMessageCommit(state);
  clearPendingCommit(pendingCommit);
  pendingCommit.nextMessages = null;
  syncMessageList(state, nextMessages);
}

function queueMessageCommit(
  state: ChatStreamState,
  nextMessages: ChatMessage[],
) {
  const pendingCommit = getPendingMessageCommit(state);
  pendingCommit.nextMessages = markRaw(nextMessages);

  if (pendingCommit.timeoutId !== null || pendingCommit.frameId !== null) {
    return;
  }

  const flush = () => {
    pendingCommit.frameId = null;
    flushPendingMessages(state);
  };

  pendingCommit.timeoutId = setTimeout(() => {
    pendingCommit.timeoutId = null;

    if (typeof requestAnimationFrame === "function") {
      pendingCommit.frameId = requestAnimationFrame(flush);
      return;
    }

    flush();
  }, STREAM_BATCH_INTERVAL) as unknown as number;
}

export function syncChatStreamingState(state: ChatStreamState) {
  state.currentStreamingMessageId.value = findActiveAssistantMessageId(
    state.messages.value,
  );
  state.streaming.value = Boolean(state.currentStreamingMessageId.value);
}

function applyRuntimePermissionEvent(
  state: ChatStreamState,
  event: Extract<SSEEvent, { type: "permission-request" | "permission-resolved" }>,
) {
  if (event.type === "permission-request") {
    state.pendingRuntimePermissions.value = [
      ...state.pendingRuntimePermissions.value.filter(
        (entry) => entry.id !== event.request.id,
      ),
      {
        ...event.request,
        resolving: false,
      },
    ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    return;
  }
  state.pendingRuntimePermissions.value = state.pendingRuntimePermissions.value
    .filter((entry) => entry.id !== event.result.requestId);
}

function applyTodoUpdatedEvent(
  state: ChatStreamState,
  event: Extract<SSEEvent, { type: "todo-updated" }>,
) {
  state.todoItems.value = event.todos;
}

function isAutoCompactionContinuationStart(
  event: SSEEvent,
): event is Extract<SSEEvent, { type: "message-start" }> {
  if (event.type !== "message-start" || !event.userMessage) {
    return false;
  }

  return isAutoCompactionContinueMessage(dbMessageToChat(event.userMessage));
}

export function abortChatStream(state: ChatStreamState) {
  state.streamController.value?.abort();
  state.streamController.value = null;
}

export function stopChatRecovery(state: ChatStreamState) {
  stopChatRecoveryPolling(state.recoveryTimer);
}

export function scheduleChatRecoveryWithState(
  state: ChatStreamState,
  loadConversationDetail: (conversationId: string) => Promise<void>,
) {
  startChatRecoveryPolling({
    currentConversationId: state.currentConversationId,
    isStreaming: () => state.streaming.value,
    recoveryTimer: state.recoveryTimer,
    shouldPollWhenIdle: () => Boolean(state.currentConversationId.value),
    streamController: state.streamController,
    loadConversationDetail: async (conversationId) => {
      flushPendingMessages(state);
      await loadConversationDetail(conversationId);
    },
  });
}

function recoverAttachedConversationImmediately(
  state: ChatStreamState,
  conversationId: string,
  loadConversationDetail: (conversationId: string) => Promise<void>,
) {
  if (state.currentConversationId.value !== conversationId) {
    return;
  }

  void loadConversationDetail(conversationId)
    .catch(() => undefined)
    .finally(() => {
      if (
        state.currentConversationId.value === conversationId
        && !state.streamController.value
      ) {
        scheduleChatRecoveryWithState(state, loadConversationDetail);
      }
    });
}

function recoverStreamingConversationImmediately(
  state: ChatStreamState,
  conversationId: string,
  loadConversationDetail: (conversationId: string) => Promise<void>,
) {
  if (state.currentConversationId.value !== conversationId) {
    return;
  }

  if (!state.streaming.value) {
    scheduleChatRecoveryWithState(state, loadConversationDetail);
    return;
  }

  void loadConversationDetail(conversationId)
    .catch(() => undefined)
    .finally(() => {
      if (state.currentConversationId.value === conversationId) {
        scheduleChatRecoveryWithState(state, loadConversationDetail);
      }
    });
}

export async function dispatchSendMessage(
  state: ChatStreamState,
  input: ChatSendInput,
  params?: ConversationRefreshParams,
) {
  if (!state.currentConversationId.value || state.streaming.value) {
    return;
  }

  const payload = normalizeSendInput({
    ...input,
    provider: input.provider ?? state.selectedProvider.value,
    model: input.model ?? state.selectedModel.value,
  });
  if (!payload.content && !payload.parts?.length) {
    return;
  }

  state.selectedProvider.value =
    payload.provider ?? state.selectedProvider.value;
  state.selectedModel.value = payload.model ?? state.selectedModel.value;

  const requestConversationId = state.currentConversationId.value;
  const optimisticUserId = createTemporaryMessageId("user");
  const optimisticAssistantId = createTemporaryMessageId("assistant");
  syncMessageList(state, [
    ...getLatestMessages(state),
    buildOptimisticUserMessage(
      optimisticUserId,
      payload.content,
      payload.parts,
      input.optimisticUserMetadata,
      input.optimisticUserRole,
    ),
    buildOptimisticAssistantMessage(
      optimisticAssistantId,
      payload.provider ?? null,
      payload.model ?? null,
      input.optimisticAssistantMetadata,
      input.optimisticAssistantRole,
    ),
  ]);

  const controller = new AbortController();
  state.streamController.value = controller;
  stopChatRecovery(state);
  let didRefreshConversationStateDuringStream = false;
  let didChangeRuntimePermissionsDuringStream = false;

  try {
    await sendConversationMessage(
      requestConversationId,
      payload,
      (event) => {
        if (state.currentConversationId.value !== requestConversationId) {
          return;
        }

        if (
          event.type === "permission-request" ||
          event.type === "permission-resolved"
        ) {
          didChangeRuntimePermissionsDuringStream = true;
          applyRuntimePermissionEvent(state, event);
          return;
        }
        if (event.type === "todo-updated") {
          applyTodoUpdatedEvent(state, event);
          return;
        }

        if (!didRefreshConversationStateDuringStream) {
          didRefreshConversationStateDuringStream = true;
          void params?.refreshConversationSummary?.().catch(() => undefined);
        }
        const nextMessages = applySseEvent(getLatestMessages(state), event, {
          requestKind: "send",
          optimisticUserId,
          optimisticAssistantId,
        });
        if (event.type === "message-start") {
          commitMessagesImmediately(state, nextMessages);
          if (isAutoCompactionContinuationStart(event)) {
            void params?.refreshConversationSnapshot?.().catch(() => undefined);
          }
          return;
        }
        if (event.type === "text-delta") {
          queueMessageCommit(state, nextMessages);
          return;
        }
        commitMessagesImmediately(state, nextMessages);
      },
      controller.signal,
    );
  } catch (error) {
    const requestError =
      error instanceof Error
        ? error
        : new Error(typeof error === "string" ? error : "Unknown error");
    if (
      !isAbortedAppError(requestError) &&
      state.currentConversationId.value === requestConversationId
    ) {
      syncMessageList(
        state,
        applyRequestError(
          getLatestMessages(state),
          optimisticAssistantId,
          requestError,
        ),
      );
    }
  } finally {
    flushPendingMessages(state);
    if (state.streamController.value === controller) {
      state.streamController.value = null;
    }

    void params?.refreshConversationState?.({
      permissionStateChanged: didChangeRuntimePermissionsDuringStream,
      summaryRefreshed: didRefreshConversationStateDuringStream,
    }).catch(() => undefined);
    if (state.currentConversationId.value === requestConversationId) {
      recoverStreamingConversationImmediately(
        state,
        requestConversationId,
        params?.loadConversationDetail ?? (async () => undefined),
      );
    }
  }
}

export async function dispatchRetryMessage(
  state: ChatStreamState,
  messageId: string,
  params?: ConversationRefreshParams,
) {
  if (!state.currentConversationId.value || state.streaming.value) {
    return;
  }

  const requestConversationId = state.currentConversationId.value;
  const currentMessages = getLatestMessages(state);
  const targetIndex = currentMessages.findIndex(
    (message) => message.id === messageId,
  );
  if (targetIndex < 0) {
    return;
  }

  const previousMessage = currentMessages[targetIndex];
  syncMessageList(
    state,
    replaceMessage(currentMessages, messageId, {
      ...previousMessage,
      content: "",
      toolCalls: [],
      toolResults: [],
      provider: state.selectedProvider.value,
      model: state.selectedModel.value,
      status: "pending",
      error: null,
    }),
  );

  const controller = new AbortController();
  state.streamController.value = controller;
  stopChatRecovery(state);
  let didRefreshConversationStateDuringStream = false;
  let didChangeRuntimePermissionsDuringStream = false;

  try {
    await retryConversationMessage(
      requestConversationId,
      messageId,
      {
        provider: state.selectedProvider.value ?? undefined,
        model: state.selectedModel.value ?? undefined,
      },
      (event) => {
        if (state.currentConversationId.value !== requestConversationId) {
          return;
        }

        if (
          event.type === "permission-request" ||
          event.type === "permission-resolved"
        ) {
          didChangeRuntimePermissionsDuringStream = true;
          applyRuntimePermissionEvent(state, event);
          return;
        }
        if (event.type === "todo-updated") {
          applyTodoUpdatedEvent(state, event);
          return;
        }

        if (!didRefreshConversationStateDuringStream) {
          didRefreshConversationStateDuringStream = true;
          void params?.refreshConversationSummary?.().catch(() => undefined);
        }
        const nextMessages = applySseEvent(getLatestMessages(state), event, {
          requestKind: "retry",
          targetMessageId: messageId,
        });
        if (event.type === "message-start") {
          commitMessagesImmediately(state, nextMessages);
          if (isAutoCompactionContinuationStart(event)) {
            void params?.refreshConversationSnapshot?.().catch(() => undefined);
          }
          return;
        }
        if (event.type === "text-delta") {
          queueMessageCommit(state, nextMessages);
          return;
        }
        commitMessagesImmediately(state, nextMessages);
      },
      controller.signal,
    );
  } catch (error) {
    const requestError =
      error instanceof Error
        ? error
        : new Error(typeof error === "string" ? error : "Unknown error");
    if (
      !isAbortedAppError(requestError) &&
      state.currentConversationId.value === requestConversationId
    ) {
      syncMessageList(
        state,
        applyRequestError(getLatestMessages(state), messageId, requestError),
      );
    }
  } finally {
    flushPendingMessages(state);
    if (state.streamController.value === controller) {
      state.streamController.value = null;
    }

    void params?.refreshConversationState?.({
      permissionStateChanged: didChangeRuntimePermissionsDuringStream,
      summaryRefreshed: didRefreshConversationStateDuringStream,
    }).catch(() => undefined);
    if (state.currentConversationId.value === requestConversationId) {
      recoverStreamingConversationImmediately(
        state,
        requestConversationId,
        params?.loadConversationDetail ?? (async () => undefined),
      );
    }
  }
}

export async function attachConversationStream(
  state: ChatStreamState,
  conversationId: string,
  params?: ConversationRefreshParams,
) {
  if (
    state.currentConversationId.value !== conversationId
    || state.streamController.value
  ) {
    return;
  }

  const controller = new AbortController();
  state.streamController.value = controller;
  stopChatRecovery(state);
  let didRefreshConversationStateDuringStream = false;
  let didChangeRuntimePermissionsDuringStream = false;

  try {
    await streamConversationEvents(
      conversationId,
      (event) => {
        if (state.currentConversationId.value !== conversationId) {
          return;
        }

        if (
          event.type === "permission-request"
          || event.type === "permission-resolved"
        ) {
          didChangeRuntimePermissionsDuringStream = true;
          applyRuntimePermissionEvent(state, event);
          return;
        }
        if (event.type === "todo-updated") {
          applyTodoUpdatedEvent(state, event);
          return;
        }

        if (!didRefreshConversationStateDuringStream) {
          didRefreshConversationStateDuringStream = true;
          void params?.refreshConversationSummary?.().catch(() => undefined);
        }
        const nextMessages = applySseEvent(getLatestMessages(state), event, {
          requestKind: "attach",
          targetMessageId: state.currentStreamingMessageId.value ?? undefined,
        });
        if (event.type === "message-start") {
          commitMessagesImmediately(state, nextMessages);
          if (isAutoCompactionContinuationStart(event)) {
            void params?.refreshConversationSnapshot?.().catch(() => undefined);
          }
          return;
        }
        if (event.type === "text-delta") {
          queueMessageCommit(state, nextMessages);
          return;
        }
        commitMessagesImmediately(state, nextMessages);
      },
      controller.signal,
    );
  } catch (error) {
    const requestError =
      error instanceof Error
        ? error
        : new Error(typeof error === "string" ? error : "Unknown error");
    if (!isAbortedAppError(requestError)) {
      throw requestError;
    }
  } finally {
    flushPendingMessages(state);
    if (state.streamController.value === controller) {
      state.streamController.value = null;
    }

    void params?.refreshConversationState?.({
      permissionStateChanged: didChangeRuntimePermissionsDuringStream,
      summaryRefreshed: didRefreshConversationStateDuringStream,
    }).catch(() => undefined);
    if (state.currentConversationId.value === conversationId) {
      recoverAttachedConversationImmediately(
        state,
        conversationId,
        params?.loadConversationDetail ?? (async () => undefined),
      );
    }
  }
}
