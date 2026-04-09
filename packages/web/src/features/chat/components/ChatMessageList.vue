<template>
  <div ref="messagesEl" class="messages" @scroll.passive="handleScroll">
    <div v-if="loading" class="loading">加载中...</div>

    <div
      class="messages-viewport"
      :class="{ virtualized: shouldVirtualize }"
      :style="messagesViewportStyle"
    >
      <div
        v-for="row in visibleRows"
        :key="row.key"
        :data-index="row.virtual ? row.index : undefined"
        :ref="row.virtual ? measureMessageElement : undefined"
        class="message-shell"
        :class="{ virtualized: row.virtual }"
        :style="messageRowStyle(row)"
      >
        <div
          :data-message-id="row.message.id ?? undefined"
          class="message"
          :class="row.message.role"
        >
          <div class="message-role">{{ getRoleLabel(row.message) }}</div>
          <div class="message-body">
            <div class="message-meta">
              <span class="message-status" :class="row.message.status">
                {{ statusLabelMap[row.message.status] }}
              </span>
              <span
                v-if="row.message.provider && row.message.model"
                class="message-model"
              >
                {{ row.message.provider }}/{{ row.message.model }}
              </span>
              <span
                v-if="visionFallbackChipLabel(row.message)"
                class="message-model-detail"
                :class="row.message.metadata?.visionFallback?.state"
              >
                {{ visionFallbackChipLabel(row.message) }}
              </span>
            </div>

            <div
              v-if="editingMessageId === row.message.id"
              class="message-editor"
            >
              <textarea
                v-model="editingText"
                rows="4"
                placeholder="修改当前消息内容"
              ></textarea>
              <div v-if="hasEditableImages(row.message)" class="editor-note">
                当前消息里的图片会保留，本次只修改文本内容。
              </div>
              <div class="editor-actions">
                <button
                  type="button"
                  class="action-button save-button"
                  @click="saveEdit(row.message)"
                >
                  保存
                </button>
                <button
                  type="button"
                  class="action-button cancel-button"
                  @click="cancelEdit"
                >
                  取消
                </button>
              </div>
            </div>

            <template v-else>
              <div v-if="row.message.parts?.length" class="message-parts">
                <template
                  v-for="(part, partIndex) in row.message.parts"
                  :key="partIndex"
                >
                  <div
                    v-if="part.type === 'text'"
                    class="message-content"
                    v-html="renderMarkdown(part.text)"
                  ></div>
                  <img
                    v-else
                    :src="part.image"
                    alt="用户上传的图片"
                    class="message-image"
                    @load="handleRenderedContentChange"
                  />
                </template>
              </div>
              <div
                v-else
                class="message-content"
                v-html="renderMarkdown(row.message.content)"
              ></div>

              <div v-if="row.message.error" class="message-error">
                错误: {{ row.message.error }}
              </div>

              <details
                v-if="shouldShowVisionFallbackDetails(row.message)"
                class="vision-fallback-details"
                @toggle="handleRenderedContentChange"
              >
                <summary>查看图像转述</summary>
                <div class="vision-fallback-list">
                  <div
                    v-for="(entry, entryIndex) in row.message.metadata
                      ?.visionFallback?.entries ?? []"
                    :key="`${row.key}-vision-${entryIndex}`"
                    class="vision-fallback-entry"
                  >
                    <span class="vision-fallback-source">
                      {{ entry.source === "cache" ? "缓存复用" : "实时转述" }}
                    </span>
                    <div
                      class="vision-fallback-text"
                      v-html="renderMarkdown(entry.text)"
                    ></div>
                  </div>
                </div>
              </details>

              <div v-if="row.message.toolCalls?.length" class="tool-calls">
                <div
                  v-for="(toolCall, toolIndex) in row.message.toolCalls"
                  :key="toolIndex"
                  class="tool-call"
                >
                  工具调用 <strong>{{ toolCall.toolName }}</strong>
                  <code>{{ toolCall.input }}</code>
                </div>
              </div>

              <div v-if="row.message.toolResults?.length" class="tool-results">
                <div
                  v-for="(toolResult, toolIndex) in row.message.toolResults"
                  :key="toolIndex"
                  class="tool-result"
                >
                  工具结果 <strong>{{ toolResult.toolName }}</strong>
                  <code>{{ toolResult.output }}</code>
                </div>
              </div>

              <div v-if="row.message.id" class="message-actions">
                <button
                  type="button"
                  class="action-button edit-button"
                  @click="startEdit(row.message)"
                >
                  修改
                </button>
                <button
                  type="button"
                  class="action-button delete-button"
                  @click="emit('delete-message', row.message.id)"
                >
                  删除
                </button>
              </div>
            </template>

            <span
              v-if="
                row.message.status === 'pending' ||
                row.message.status === 'streaming'
              "
              class="cursor"
            >
              ▋
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useVirtualizer } from "@tanstack/vue-virtual";
import { marked } from "marked";
import {
  computed,
  markRaw,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
} from "vue";

import type { ChatMessagePart } from "@garlic-claw/shared";
import type { ChatMessage } from "@/features/chat/store/chat";

interface VisibleMessageRow {
  index: number;
  key: string;
  start: number;
  message: ChatMessage;
  virtual: boolean;
}

const AUTO_SCROLL_THRESHOLD = 96;
const PLAIN_RENDER_THRESHOLD = 24;
const FALLBACK_VIEWPORT_HEIGHT = 720;

const props = defineProps<{
  loading: boolean;
  messages: ChatMessage[];
}>();

const emit = defineEmits<{
  (
    event: "update-message",
    value: { messageId: string; content?: string; parts?: ChatMessagePart[] },
  ): void;
  (event: "delete-message", messageId: string): void;
}>();

const statusLabelMap = {
  pending: "等待中",
  streaming: "生成中",
  completed: "已完成",
  stopped: "已停止",
  error: "失败",
} as const;

const messagesEl = ref<HTMLElement | null>(null);
const renderedMessages = shallowRef<ChatMessage[]>([]);
const editingMessageId = ref<string | null>(null);
const editingText = ref("");
const shouldStickToBottom = ref(true);
const markdownCache = markRaw(new Map<string, string>());

let scrollFrameId: number | null = null;
let measureFrameId: number | null = null;

const shouldVirtualize = computed(
  () => renderedMessages.value.length > PLAIN_RENDER_THRESHOLD,
);

const virtualizer = useVirtualizer<HTMLElement, HTMLElement>(
  computed(() => ({
    count: renderedMessages.value.length,
    enabled: shouldVirtualize.value,
    gap: 20,
    initialRect: {
      width: 0,
      height: FALLBACK_VIEWPORT_HEIGHT,
    },
    overscan: 8,
    getScrollElement: () => messagesEl.value,
    getItemKey: (index: number) =>
      getMessageKey(renderedMessages.value[index], index),
    estimateSize: (index: number) =>
      estimateMessageSize(renderedMessages.value[index]),
  })),
);

const visibleRows = computed<VisibleMessageRow[]>(() => {
  if (!shouldVirtualize.value) {
    return renderedMessages.value.map((message, index) => ({
      index,
      key: getMessageKey(message, index),
      start: 0,
      message,
      virtual: false,
    }));
  }

  return virtualizer.value.getVirtualItems().flatMap((virtualItem) => {
    const message = renderedMessages.value[virtualItem.index];
    return message
      ? [
          {
            index: virtualItem.index,
            key: String(virtualItem.key),
            start: virtualItem.start,
            message,
            virtual: true,
          },
        ]
      : [];
  });
});

const messagesViewportStyle = computed(() =>
  shouldVirtualize.value
    ? { height: `${virtualizer.value.getTotalSize()}px` }
    : undefined,
);

watch(
  () => props.messages,
  async (messages, previousMessages = []) => {
    renderedMessages.value = messages;
    await nextTick();
    scheduleListMeasurement();

    if (
      shouldForceScroll(previousMessages, messages) ||
      shouldStickToBottom.value
    ) {
      scheduleScrollToBottom();
    }
  },
  {
    immediate: true,
    flush: "post",
  },
);

watch(
  editingMessageId,
  async () => {
    await nextTick();
    handleRenderedContentChange();
  },
  { flush: "post" },
);

onBeforeUnmount(() => {
  cancelScheduledFrame(scrollFrameId);
  cancelScheduledFrame(measureFrameId);
});

function messageRowStyle(row: VisibleMessageRow) {
  return row.virtual
    ? {
        transform: `translateY(${row.start}px)`,
      }
    : undefined;
}

function measureMessageElement(element: unknown) {
  if (!(element instanceof HTMLElement) || !shouldVirtualize.value) {
    return;
  }

  virtualizer.value.measureElement(element);
}

function handleScroll() {
  shouldStickToBottom.value = isNearBottom();
}

function isNearBottom() {
  const element = messagesEl.value;
  if (!element) {
    return true;
  }

  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    AUTO_SCROLL_THRESHOLD
  );
}

function scheduleListMeasurement() {
  if (!shouldVirtualize.value) {
    return;
  }

  cancelScheduledFrame(measureFrameId);
  measureFrameId = scheduleFrame(() => {
    measureFrameId = null;
    virtualizer.value.measure();
  });
}

function scheduleScrollToBottom() {
  cancelScheduledFrame(scrollFrameId);
  scrollFrameId = scheduleFrame(() => {
    scrollFrameId = null;
    const element = messagesEl.value;
    if (!element) {
      return;
    }

    if (renderedMessages.value.length > 0 && shouldVirtualize.value) {
      virtualizer.value.scrollToIndex(renderedMessages.value.length - 1, {
        align: "end",
      });
    }

    element.scrollTop = element.scrollHeight;
    shouldStickToBottom.value = true;
  });
}

function handleRenderedContentChange() {
  scheduleListMeasurement();

  if (shouldStickToBottom.value) {
    scheduleScrollToBottom();
  }
}

function shouldForceScroll(
  previousMessages: ChatMessage[],
  nextMessages: ChatMessage[],
) {
  if (nextMessages.length === 0) {
    return false;
  }

  if (previousMessages.length === 0) {
    return true;
  }

  if (nextMessages.length !== previousMessages.length) {
    return true;
  }

  return (
    getMessageKey(previousMessages[0], 0) !== getMessageKey(nextMessages[0], 0)
  );
}

function scheduleFrame(callback: () => void) {
  return typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(callback)
    : (setTimeout(callback, 16) as unknown as number);
}

function cancelScheduledFrame(frameId: number | null) {
  if (frameId === null) {
    return;
  }

  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(frameId);
  }
  clearTimeout(frameId);
}

function getMessageKey(message: ChatMessage | undefined, index: number) {
  return message?.id ?? `${message?.role ?? "message"}-${index}`;
}

function estimateMessageSize(message: ChatMessage | undefined) {
  if (!message) {
    return 180;
  }

  const textLength =
    extractEditableText(message).length || message.content.length;
  const imageCount =
    message.parts?.filter((part) => part.type === "image").length ?? 0;
  const toolCallCount = message.toolCalls?.length ?? 0;
  const toolResultCount = message.toolResults?.length ?? 0;

  return Math.max(
    148,
    120 +
      Math.ceil(textLength / 48) * 24 +
      imageCount * 220 +
      toolCallCount * 80 +
      toolResultCount * 80 +
      (message.error ? 72 : 0) +
      (shouldShowVisionFallbackDetails(message) ? 120 : 0),
  );
}

function renderMarkdown(text: string): string {
  if (!text) {
    return "";
  }

  const cachedHtml = markdownCache.get(text);
  if (cachedHtml) {
    return cachedHtml;
  }

  const renderedHtml = marked.parse(text, { async: false }) as string;
  if (markdownCache.size >= 400) {
    markdownCache.clear();
  }
  markdownCache.set(text, renderedHtml);
  return renderedHtml;
}

function getRoleLabel(message: ChatMessage): string {
  return message.role === "user" ? "[USER]" : "[AI]";
}

function startEdit(message: ChatMessage) {
  if (!message.id) {
    return;
  }

  editingMessageId.value = message.id;
  editingText.value = extractEditableText(message);
}

function cancelEdit() {
  editingMessageId.value = null;
  editingText.value = "";
}

function saveEdit(message: ChatMessage) {
  if (!message.id) {
    return;
  }

  const trimmedText = editingText.value.trim();
  const payload = hasEditableImages(message)
    ? {
        messageId: message.id,
        content: trimmedText,
        parts: buildUpdatedParts(message, trimmedText),
      }
    : {
        messageId: message.id,
        content: trimmedText,
      };

  emit("update-message", payload);
  cancelEdit();
}

function extractEditableText(message: ChatMessage): string {
  if (!message.parts?.length) {
    return message.content;
  }

  return message.parts
    .filter(
      (part): part is Extract<ChatMessagePart, { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n");
}

function hasEditableImages(message: ChatMessage): boolean {
  return Boolean(message.parts?.some((part) => part.type === "image"));
}

function visionFallbackChipLabel(message: ChatMessage): string | null {
  if (message.role !== "assistant") {
    return null;
  }

  const state = message.metadata?.visionFallback?.state;
  if (state === "transcribing") {
    return "图像转述中";
  }

  return state === "completed" ? "图像转述" : null;
}

function shouldShowVisionFallbackDetails(message: ChatMessage): boolean {
  return (
    message.role === "user" &&
    Boolean(message.metadata?.visionFallback?.entries.length)
  );
}

function buildUpdatedParts(
  message: ChatMessage,
  nextText: string,
): ChatMessagePart[] {
  const imageParts =
    message.parts?.filter(
      (part): part is Extract<ChatMessagePart, { type: "image" }> =>
        part.type === "image",
    ) ?? [];

  return nextText
    ? [
        ...imageParts,
        {
          type: "text",
          text: nextText,
        },
      ]
    : imageParts;
}
</script>

<style scoped src="./ChatMessageList.css"></style>
