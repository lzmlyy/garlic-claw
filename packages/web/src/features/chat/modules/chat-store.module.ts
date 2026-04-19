import { computed, markRaw, ref, shallowRef } from "vue";
import type { ChatMessagePart, Conversation } from "@garlic-claw/shared";
import {
  abortChatStream,
  discardPendingMessageUpdates,
  dispatchRetryMessage,
  dispatchSendMessage,
  scheduleChatRecoveryWithState,
  stopChatRecovery,
  syncChatStreamingState,
  type ChatStreamState,
} from "@/features/chat/modules/chat-stream.module";
import {
  createConversationRecord,
  deleteConversationMessageRecord,
  deleteConversationRecord,
  loadConversationList,
  loadConversationMessages,
  stopConversationMessageRecord,
  updateConversationMessageRecord,
} from "@/features/chat/modules/chat-conversation.data";
import { ensureChatModelSelection } from "@/features/chat/modules/chat-model-selection";
import {
  getRetryableMessageId,
  removeMessage,
  replaceOrAppendMessage,
} from "@/features/chat/store/chat-store.runtime";
import type {
  ChatMessage,
  ChatSendInput,
} from "@/features/chat/store/chat-store.types";

export function createChatStoreModule() {
  const conversations = ref<Conversation[]>([]);
  const currentConversationId = ref<string | null>(null);
  const messages = shallowRef<ChatMessage[]>([]);
  const loading = ref(false);
  const streaming = ref(false);
  const currentStreamingMessageId = ref<string | null>(null);
  const streamController = ref<AbortController | null>(null);
  const recoveryTimer = ref<number | null>(null);
  const selectedProvider = ref<string | null>(null);
  const selectedModel = ref<string | null>(null);
  const streamState: ChatStreamState = {
    currentConversationId,
    messages,
    selectedProvider,
    selectedModel,
    streamController,
    recoveryTimer,
    currentStreamingMessageId,
    streaming,
  };
  let conversationListRequestId = 0;
  let conversationDetailRequestId = 0;

  const retryableMessageId = computed(() =>
    getRetryableMessageId(messages.value),
  );

  function replaceMessages(nextMessages: ChatMessage[]) {
    messages.value = markRaw(nextMessages);
  }

  function invalidateConversationRequests() {
    conversationListRequestId += 1;
    conversationDetailRequestId += 1;
  }

  async function refreshConversationRelatedState(
    conversationId: string | null = currentConversationId.value,
  ) {
    if (!conversationId) {
      return;
    }

    await loadConversations();
    if (currentConversationId.value !== conversationId) {
      return;
    }

    await loadConversationDetail(conversationId);
  }

  async function refreshConversationSummary(
    conversationId: string | null = currentConversationId.value,
  ) {
    if (!conversationId) {
      return;
    }

    await loadConversations();
  }

  async function tryRefreshConversationRelatedState(
    conversationId: string | null = currentConversationId.value,
  ) {
    try {
      await refreshConversationRelatedState(conversationId);
    } catch {
      // 刷新失败不应把已经成功的聊天操作误判成失败。
    }
  }

  async function loadConversations() {
    const requestId = ++conversationListRequestId;
    const nextConversations = await loadConversationList();
    if (requestId !== conversationListRequestId) {
      return;
    }
    conversations.value = nextConversations;

    if (
      currentConversationId.value &&
      !nextConversations.some(
        (conversation) => conversation.id === currentConversationId.value,
      )
    ) {
      abortChatStream(streamState);
      discardPendingMessageUpdates(streamState);
      stopChatRecovery(streamState);
      currentConversationId.value = null;
      selectedProvider.value = null;
      selectedModel.value = null;
      replaceMessages([]);
      syncChatStreamingState(streamState);
    }
  }

  async function createConversation(title?: string) {
    const conversation = await createConversationRecord(title);
    conversations.value.unshift(conversation);
    return conversation;
  }

  async function selectConversation(id: string) {
    abortChatStream(streamState);
    discardPendingMessageUpdates(streamState);
    stopChatRecovery(streamState);
    invalidateConversationRequests();
    currentConversationId.value = id;
    selectedProvider.value = null;
    selectedModel.value = null;
    loading.value = true;
    try {
      await loadConversationDetail(id);
      await ensureModelSelection(messages.value);
      scheduleChatRecoveryWithState(streamState, loadConversationDetail);
    } finally {
      loading.value = false;
    }
  }

  async function deleteConversation(id: string) {
    if (currentConversationId.value === id) {
      abortChatStream(streamState);
      discardPendingMessageUpdates(streamState);
      stopChatRecovery(streamState);
    }

    invalidateConversationRequests();
    await deleteConversationRecord(id);
    conversations.value = conversations.value.filter(
      (conversation) => conversation.id !== id,
    );
    if (currentConversationId.value === id) {
      currentConversationId.value = null;
      selectedProvider.value = null;
      selectedModel.value = null;
      replaceMessages([]);
      syncChatStreamingState(streamState);
    }
  }

  function setModelSelection(selection: {
    provider: string | null;
    model: string | null;
  }) {
    selectedProvider.value = selection.provider;
    selectedModel.value = selection.model;
  }

  async function ensureModelSelection(existingMessages: ChatMessage[] = []) {
    await ensureChatModelSelection({
      selectedProvider,
      selectedModel,
      messages: existingMessages,
    });
  }

  async function sendMessage(input: ChatSendInput) {
    await ensureModelSelection(messages.value);
    const conversationId = currentConversationId.value;
    if (!conversationId) {
      return;
    }

    await dispatchSendMessage(streamState, input, {
      loadConversationDetail,
      refreshConversationSummary: () =>
        refreshConversationSummary(conversationId),
      refreshConversationState: () =>
        tryRefreshConversationRelatedState(conversationId),
    });
  }

  async function retryMessage(messageId: string) {
    const conversationId = currentConversationId.value;
    if (!conversationId) {
      return;
    }

    await dispatchRetryMessage(streamState, messageId, {
      loadConversationDetail,
      refreshConversationSummary: () =>
        refreshConversationSummary(conversationId),
      refreshConversationState: () =>
        tryRefreshConversationRelatedState(conversationId),
    });
  }

  async function updateMessage(
    messageId: string,
    payload: { content?: string; parts?: ChatMessagePart[] },
  ) {
    const conversationId = currentConversationId.value;
    if (!conversationId) {
      return;
    }

    const updated = await updateConversationMessageRecord(
      conversationId,
      messageId,
      payload,
    );
    if (currentConversationId.value === conversationId) {
      replaceMessages(replaceOrAppendMessage(messages.value, updated, messageId));
      syncChatStreamingState(streamState);
    }
    await tryRefreshConversationRelatedState(conversationId);
  }

  async function deleteMessage(messageId: string) {
    const conversationId = currentConversationId.value;
    if (!conversationId) {
      return;
    }

    await deleteConversationMessageRecord(
      conversationId,
      messageId,
    );
    if (currentConversationId.value === conversationId) {
      replaceMessages(removeMessage(messages.value, messageId));
      syncChatStreamingState(streamState);
    }
    await tryRefreshConversationRelatedState(conversationId);
  }

  async function stopStreaming() {
    const conversationId = currentConversationId.value;
    const messageId = currentStreamingMessageId.value;
    if (!conversationId || !messageId) {
      return;
    }

    abortChatStream(streamState);
    discardPendingMessageUpdates(streamState);
    stopChatRecovery(streamState);
    await stopConversationMessageRecord(
      conversationId,
      messageId,
    );
    await tryRefreshConversationRelatedState(conversationId);
    if (currentConversationId.value === conversationId) {
      syncChatStreamingState(streamState);
      scheduleChatRecoveryWithState(streamState, loadConversationDetail);
    }
  }

  async function loadConversationDetail(conversationId: string) {
    const requestId = ++conversationDetailRequestId;
    const nextMessages = await loadConversationMessages(conversationId);
    if (
      requestId !== conversationDetailRequestId ||
      currentConversationId.value !== conversationId
    ) {
      return;
    }

    replaceMessages(nextMessages);
    syncChatStreamingState(streamState);
  }

  return {
    conversations,
    currentConversationId,
    messages,
    loading,
    streaming,
    currentStreamingMessageId,
    retryableMessageId,
    selectedProvider,
    selectedModel,
    loadConversations,
    createConversation,
    selectConversation,
    deleteConversation,
    setModelSelection,
    ensureModelSelection,
    sendMessage,
    retryMessage,
    updateMessage,
    deleteMessage,
    stopStreaming,
  };
}
