import { computed, markRaw, ref, shallowRef } from "vue";
import type { ChatMessagePart, Conversation } from "@garlic-claw/shared";
import {
  abortChatStream,
  dispatchRetryMessage,
  dispatchSendMessage,
  scheduleChatRecovery,
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

  const retryableMessageId = computed(() =>
    getRetryableMessageId(messages.value),
  );

  function replaceMessages(nextMessages: ChatMessage[]) {
    messages.value = markRaw(nextMessages);
  }

  async function loadConversations() {
    conversations.value = await loadConversationList();
  }

  async function createConversation(title?: string) {
    const conversation = await createConversationRecord(title);
    conversations.value.unshift(conversation);
    return conversation;
  }

  async function selectConversation(id: string) {
    abortChatStream(streamState);
    stopChatRecovery(streamState);
    currentConversationId.value = id;
    selectedProvider.value = null;
    selectedModel.value = null;
    loading.value = true;
    try {
      await loadConversationDetail(id);
      await ensureModelSelection(messages.value);
      scheduleChatRecovery(streamState);
    } finally {
      loading.value = false;
    }
  }

  async function deleteConversation(id: string) {
    if (currentConversationId.value === id) {
      abortChatStream(streamState);
      stopChatRecovery(streamState);
    }

    await deleteConversationRecord(id);
    conversations.value = conversations.value.filter(
      (conversation) => conversation.id !== id,
    );
    if (currentConversationId.value === id) {
      currentConversationId.value = null;
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
    await dispatchSendMessage(streamState, input);
  }

  async function retryMessage(messageId: string) {
    await dispatchRetryMessage(streamState, messageId);
  }

  async function updateMessage(
    messageId: string,
    payload: { content?: string; parts?: ChatMessagePart[] },
  ) {
    if (!currentConversationId.value) {
      return;
    }

    const updated = await updateConversationMessageRecord(
      currentConversationId.value,
      messageId,
      payload,
    );
    replaceMessages(replaceOrAppendMessage(messages.value, updated, messageId));
    syncChatStreamingState(streamState);
  }

  async function deleteMessage(messageId: string) {
    if (!currentConversationId.value) {
      return;
    }

    await deleteConversationMessageRecord(
      currentConversationId.value,
      messageId,
    );
    replaceMessages(removeMessage(messages.value, messageId));
    syncChatStreamingState(streamState);
  }

  async function stopStreaming() {
    if (!currentConversationId.value || !currentStreamingMessageId.value) {
      return;
    }

    const message = await stopConversationMessageRecord(
      currentConversationId.value,
      currentStreamingMessageId.value,
    );
    replaceMessages(
      replaceOrAppendMessage(
        messages.value,
        message,
        currentStreamingMessageId.value,
      ),
    );
    syncChatStreamingState(streamState);
    scheduleChatRecovery(streamState);
  }

  async function loadConversationDetail(conversationId: string) {
    replaceMessages(await loadConversationMessages(conversationId));
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
