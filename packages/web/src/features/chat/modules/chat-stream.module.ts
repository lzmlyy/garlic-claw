import { markRaw } from "vue";

import type { Ref } from "vue";
import type { ChatSendInput } from "@/features/chat/store/chat-store.types";
import {
  loadConversationMessages,
  retryConversationMessage,
  sendConversationMessage,
} from "@/features/chat/modules/chat-conversation.data";
import {
  startChatRecoveryPolling,
  stopChatRecoveryPolling,
} from "@/features/chat/modules/chat-recovery.polling";
import {
  findActiveAssistantMessageId,
  normalizeSendInput,
} from "@/features/chat/store/chat-store.helpers";
import {
  applyRequestError,
  applySseEvent,
  buildOptimisticAssistantMessage,
  buildOptimisticUserMessage,
  createTemporaryMessageId,
  replaceMessage,
} from "@/features/chat/store/chat-store.runtime";
import type { ChatMessage } from "@/features/chat/store/chat-store.types";

export interface ChatStreamState {
  currentConversationId: Ref<string | null>;
  messages: Ref<ChatMessage[]>;
  selectedProvider: Ref<string | null>;
  selectedModel: Ref<string | null>;
  streamController: Ref<AbortController | null>;
  recoveryTimer: Ref<number | null>;
  currentStreamingMessageId: Ref<string | null>;
  streaming: Ref<boolean>;
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

function syncMessageList(state: ChatStreamState, nextMessages: ChatMessage[]) {
  state.messages.value = markRaw(nextMessages);
  syncChatStreamingState(state);
}

function getLatestMessages(state: ChatStreamState) {
  return getPendingMessageCommit(state).nextMessages ?? state.messages.value;
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

export function abortChatStream(state: ChatStreamState) {
  state.streamController.value?.abort();
  state.streamController.value = null;
}

export function stopChatRecovery(state: ChatStreamState) {
  stopChatRecoveryPolling(state.recoveryTimer);
}

export function scheduleChatRecovery(state: ChatStreamState) {
  startChatRecoveryPolling({
    recoveryTimer: state.recoveryTimer,
    streamController: state.streamController,
    currentConversationId: state.currentConversationId,
    isStreaming: () => state.streaming.value,
    loadConversationDetail: async (conversationId) => {
      flushPendingMessages(state);
      syncMessageList(state, await loadConversationMessages(conversationId));
    },
  });
}

export async function dispatchSendMessage(
  state: ChatStreamState,
  input: ChatSendInput,
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
    ),
    buildOptimisticAssistantMessage(
      optimisticAssistantId,
      payload.provider ?? null,
      payload.model ?? null,
      input.optimisticAssistantMetadata,
    ),
  ]);

  const controller = new AbortController();
  state.streamController.value = controller;
  stopChatRecovery(state);

  try {
    await sendConversationMessage(
      requestConversationId,
      payload,
      (event) => {
        if (state.currentConversationId.value !== requestConversationId) {
          return;
        }

        queueMessageCommit(
          state,
          applySseEvent(getLatestMessages(state), event, {
            requestKind: "send",
            optimisticUserId,
            optimisticAssistantId,
          }),
        );
      },
      controller.signal,
    );
  } catch (error) {
    const requestError =
      error instanceof Error
        ? error
        : new Error(typeof error === "string" ? error : "Unknown error");
    if (
      requestError.name !== "AbortError" &&
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

    if (state.currentConversationId.value === requestConversationId) {
      scheduleChatRecovery(state);
    }
  }
}

export async function dispatchRetryMessage(
  state: ChatStreamState,
  messageId: string,
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

        queueMessageCommit(
          state,
          applySseEvent(getLatestMessages(state), event, {
            requestKind: "retry",
            targetMessageId: messageId,
          }),
        );
      },
      controller.signal,
    );
  } catch (error) {
    const requestError =
      error instanceof Error
        ? error
        : new Error(typeof error === "string" ? error : "Unknown error");
    if (
      requestError.name !== "AbortError" &&
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

    if (state.currentConversationId.value === requestConversationId) {
      scheduleChatRecovery(state);
    }
  }
}
