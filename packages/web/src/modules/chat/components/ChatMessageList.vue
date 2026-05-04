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
          :class="[
            row.message.role,
            displayVariantClass(row.message),
            contextVisibilityClass(row.message),
          ]"
        >
          <div class="message-role" :title="readRoleTitle(row.message)">
            <img
              v-if="shouldRenderAssistantAvatar(row.message) && assistantPersona?.avatar"
              :src="assistantPersona.avatar"
              :alt="readAssistantPersonaAlt()"
              class="message-role-avatar-image"
            />
            <span v-else>{{ getRoleLabel(row.message) }}</span>
          </div>
          <div class="message-main">
            <div class="message-body">
              <div class="message-meta">
                <span
                  v-if="readContextVisibilityLabel(row.message)"
                  class="message-context-visibility excluded"
                  :title="readContextVisibilityTitle(row.message)"
                >
                  {{ readContextVisibilityLabel(row.message) }}
                </span>
                <span
                  class="message-status"
                  :class="messageStatusClass(row.message)"
                >
                  {{ readStatusLabel(row.message) }}
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
                  <ElButton
                    native-type="button"
                    class="action-button save-button"
                    @click="saveEdit(row.message)"
                  >
                    保存
                  </ElButton>
                  <ElButton
                    native-type="button"
                    class="action-button cancel-button"
                    @click="cancelEdit"
                  >
                    取消
                  </ElButton>
                </div>
              </div>

              <template v-else>
                <div
                  v-if="contextCompactionSummary(row.message)"
                  class="message-compaction-divider"
                >
                  <span class="message-compaction-line"></span>
                  <span class="message-compaction-label">会话已压缩</span>
                  <span class="message-compaction-line"></span>
                </div>
                <div
                  v-if="assistantCustomBlocks(row.message).length"
                  class="message-custom-blocks"
                >
                  <details
                    v-for="block in assistantCustomBlocks(row.message)"
                    :key="`${row.key}-custom-${block.id}`"
                    class="message-custom-block"
                    :data-kind="block.kind"
                    @toggle="handleRenderedContentChange"
                  >
                    <summary class="message-custom-block-summary">
                      <span class="message-custom-block-title">
                        {{ block.title }}
                      </span>
                      <span class="message-custom-block-kind">
                        {{ customBlockKindLabel(block) }}
                      </span>
                    </summary>
                    <div class="message-custom-block-body">
                      <div
                        v-if="block.kind === 'text'"
                        class="message-custom-block-text gc-markdown"
                        v-html="renderMarkdown(block.text)"
                      ></div>
                      <pre v-else class="message-custom-block-json">{{
                        formatJsonBlock(block)
                      }}</pre>
                    </div>
                  </details>
                </div>
                <template
                  v-if="shouldRenderMessageContentBeforeTools(row.message)"
                >
                  <div v-if="row.message.parts?.length" class="message-parts">
                    <template
                      v-for="(part, partIndex) in row.message.parts"
                      :key="partIndex"
                    >
                      <div
                        v-if="part.type === 'text'"
                        class="message-content gc-markdown"
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
                    class="message-content gc-markdown"
                    v-html="renderMarkdown(row.message.content)"
                  ></div>
                </template>

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
                        class="vision-fallback-text gc-markdown"
                        v-html="renderMarkdown(entry.text)"
                      ></div>
                    </div>
                  </div>
                </details>

                <div
                  v-if="messageToolTimeline(row.message).length"
                  class="tool-timeline"
                >
                  <details
                    v-for="entry in messageToolTimeline(row.message)"
                    :key="entry.key"
                    class="tool-entry"
                    :class="entry.kind"
                    @toggle="handleRenderedContentChange"
                  >
                    <summary class="tool-entry-summary">
                      <span class="tool-entry-badge">
                        {{ entry.kind === "call" ? "调用" : "结果" }}
                      </span>
                      <strong class="tool-entry-name">{{ entry.toolName }}</strong>
                      <span class="tool-entry-preview">{{ entry.preview }}</span>
                    </summary>
                    <div class="tool-entry-body">
                      <div class="tool-entry-meta">
                        <span
                          v-if="entry.toolCallId"
                          class="tool-entry-chip"
                        >
                          {{ shortToolCallId(entry.toolCallId) }}
                        </span>
                        <span class="tool-entry-chip">
                          {{ readJsonValueKindLabel(entry.value) }}
                        </span>
                      </div>
                      <pre class="tool-entry-payload">{{
                        formatStructuredToolValue(entry.value)
                      }}</pre>
                    </div>
                  </details>
                </div>

                <template
                  v-if="shouldRenderMessageContentAfterTools(row.message)"
                >
                  <div v-if="row.message.parts?.length" class="message-parts">
                    <template
                      v-for="(part, partIndex) in row.message.parts"
                      :key="partIndex"
                    >
                      <div
                        v-if="part.type === 'text'"
                        class="message-content gc-markdown"
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
                    class="message-content gc-markdown"
                    v-html="renderMarkdown(row.message.content)"
                  ></div>
                </template>

                <div v-if="row.message.error" class="message-error">
                  错误: {{ row.message.error }}
                </div>

                <div
                  v-if="row.message.retryState"
                  class="message-retry-card"
                >
                  <div class="message-retry-title">自动重试</div>
                  <div class="message-retry-message">
                    {{ row.message.retryState.message }}
                  </div>
                  <div class="message-retry-meta">
                    <span>{{ readRetryDelayLabel(row.message) }}</span>
                    <span>{{ `第 ${row.message.retryState.attempt} 次` }}</span>
                  </div>
                </div>
              </template>

              <span
                v-if="
                  !row.message.retryState && (
                    row.message.status === 'pending' ||
                    row.message.status === 'streaming'
                  )
                "
                class="cursor"
              >
                ▋
              </span>
            </div>

            <div
              v-if="row.message.id && editingMessageId !== row.message.id"
              class="message-actions"
            >
              <ElButton
                v-if="row.message.id && shouldShowUsageInfoToggle(row.message)"
                native-type="button"
                class="action-text usage-info-toggle"
                :aria-expanded="isUsageDetailsExpanded(row.message)"
                @click="toggleUsageDetails(row.message.id)"
              >
                [i]
              </ElButton>
              <ElButton
                v-if="row.message.role === 'user'"
                native-type="button"
                class="action-text edit-text"
                @click="startEdit(row.message)"
              >
                修改
              </ElButton>
              <ElButton
                v-else-if="shouldShowRetryAction(row.message)"
                native-type="button"
                class="action-text retry-text"
                @click="emit('retry-message', row.message.id)"
              >
                重试
              </ElButton>
              <ElButton
                native-type="button"
                class="action-text delete-text"
                @click="emit('delete-message', row.message.id)"
              >
                删除
              </ElButton>
            </div>
            <div
              v-if="isUsageDetailsExpanded(row.message) && readAssistantUsage(row.message)"
              class="message-usage-panel"
            >
              <div class="message-usage-title">本次响应用量</div>
              <div class="message-usage-grid">
                <span class="message-usage-label">输入 token</span>
                <strong class="message-usage-value">
                  {{ formatUsageTokenCount(readAssistantUsage(row.message), readAssistantUsage(row.message)?.inputTokens) }}
                </strong>
                <span class="message-usage-label">总 token</span>
                <strong class="message-usage-value">
                  {{ formatUsageTokenCount(readAssistantUsage(row.message), readAssistantUsage(row.message)?.totalTokens) }}
                </strong>
                <template v-if="readAssistantUsage(row.message)?.cachedInputTokens !== undefined">
                  <span class="message-usage-label">缓存 token</span>
                  <strong class="message-usage-value">
                    {{ formatUsageTokenCount(readAssistantUsage(row.message), readAssistantUsage(row.message)?.cachedInputTokens) }}
                  </strong>
                </template>
                <span class="message-usage-label">输出 token</span>
                <strong class="message-usage-value">
                  {{ formatUsageTokenCount(readAssistantUsage(row.message), readAssistantUsage(row.message)?.outputTokens) }}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElButton } from 'element-plus'
import { useVirtualizer } from "@tanstack/vue-virtual";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
} from "vue";

import type {
  AiModelUsage,
  ChatMessageAnnotation,
  ChatMessageCustomBlock,
  ChatMessagePart,
  ConversationContextWindowPreview,
  JsonValue,
} from "@garlic-claw/shared";
import type {
  ChatMessage,
  ChatToolCallEntry,
  ChatToolResultEntry,
} from "@/modules/chat/store/chat";
import { isTemporaryChatMessageId } from "@/modules/chat/store/chat-store.helpers";
import { renderMarkdown } from '@/shared/utils/markdown'

interface VisibleMessageRow {
  index: number;
  key: string;
  start: number;
  message: ChatMessage;
  virtual: boolean;
}

interface ToolTimelineEntry {
  key: string;
  kind: "call" | "result";
  preview: string;
  toolCallId?: string;
  toolName: string;
  value: JsonValue;
}

interface MessageModelUsageSummary extends AiModelUsage {
  cachedInputTokens?: number;
  modelId: string;
  providerId: string;
}

const AUTO_SCROLL_THRESHOLD = 96;
const PLAIN_RENDER_THRESHOLD = 24;
const FALLBACK_VIEWPORT_HEIGHT = 720;

const props = defineProps<{
  assistantPersona?: {
    avatar: string | null;
    name: string;
  } | null;
  contextWindowPreview?: ConversationContextWindowPreview | null;
  loading: boolean;
  messages: ChatMessage[];
}>();

const emit = defineEmits<{
  (
    event: "update-message",
    value: { messageId: string; content?: string; parts?: ChatMessagePart[] },
  ): void;
  (event: "delete-message", messageId: string): void;
  (event: "retry-message", messageId: string): void;
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
const expandedUsageMessageId = ref<string | null>(null);
const shouldStickToBottom = ref(true);
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
      assistantCustomBlocks(message).length * 96 +
      (contextCompactionSummary(message) ? 44 : 0) +
      (message.error ? 72 : 0) +
      (shouldShowVisionFallbackDetails(message) ? 120 : 0),
  );
}

function shouldRenderMessageContentBeforeTools(message: ChatMessage): boolean {
  return !shouldRenderMessageContentAfterTools(message);
}

function shouldRenderMessageContentAfterTools(message: ChatMessage): boolean {
  return message.role === "assistant" && messageToolTimeline(message).length > 0;
}

function getRoleLabel(message: ChatMessage): string {
  if (message.role === "user") {
    return "用户";
  }
  if (message.role === "display") {
    if (readDisplayMessageVariant(message) === "command") {
      return "命令";
    }
    return "展示";
  }

  const assistantName = props.assistantPersona?.name?.trim();
  return assistantName ? assistantName.slice(0, 1) : "AI";
}

function readRoleTitle(message: ChatMessage): string {
  if (message.role === "user") {
    return "用户";
  }
  if (message.role === "display") {
    return readDisplayMessageVariant(message) === "command" ? "命令消息" : "仅展示消息";
  }

  return props.assistantPersona?.name?.trim() || "AI";
}

function readStatusLabel(message: ChatMessage): string {
  return message.retryState ? "自动重试" : statusLabelMap[message.status];
}

function messageStatusClass(message: ChatMessage): string {
  return message.retryState ? "retrying" : message.status;
}

function readRetryDelayLabel(message: ChatMessage): string {
  const next = message.retryState?.next;
  if (typeof next !== "number") {
    return "即将重试";
  }
  const remainingSeconds = Math.max(0, Math.ceil((next - Date.now()) / 1000));
  return remainingSeconds <= 0 ? "立即重试" : `${remainingSeconds} 秒后`;
}

function shouldRenderAssistantAvatar(message: ChatMessage): boolean {
  return message.role === "assistant";
}

function shouldShowRetryAction(message: ChatMessage): boolean {
  return message.role === "assistant" && !isTemporaryChatMessageId(message.id);
}

function isNonContextMessage(message: ChatMessage): boolean {
  return message.role === "display";
}

function isExcludedFromCurrentContext(message: ChatMessage): boolean {
  return Boolean(
    message.id &&
      props.contextWindowPreview?.excludedMessageIds.includes(message.id),
  );
}

function isSlidingWindowExcluded(message: ChatMessage): boolean {
  return props.contextWindowPreview?.strategy === "sliding" && isExcludedFromCurrentContext(message);
}

function contextVisibilityClass(message: ChatMessage): string | null {
  return isSlidingWindowExcluded(message) ? "excluded-from-context" : null;
}

function readContextVisibilityLabel(message: ChatMessage): string | null {
  if (contextCompactionSummary(message)) {
    return null;
  }
  if (isNonContextMessage(message)) {
    return "仅展示，不进入 LLM 上下文";
  }
  return isSlidingWindowExcluded(message)
    ? "已脱离当前 LLM 上下文"
    : null;
}

function readContextVisibilityTitle(message: ChatMessage): string {
  if (contextCompactionSummary(message)) {
    return "";
  }
  return isNonContextMessage(message)
    ? "这条消息仅用于前端展示，不会进入默认 LLM 上下文"
    : "这条消息仍保留在聊天记录中，但当前不会进入模型上下文";
}

function displayVariantClass(message: ChatMessage): string | null {
  if (message.role !== "display") {
    return null;
  }

  const variant = readDisplayMessageVariant(message);
  return variant ? `display-${variant}` : null;
}

function readAssistantPersonaAlt(): string {
  return `${props.assistantPersona?.name?.trim() || "AI"} 头像`;
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

function toggleUsageDetails(messageId: string) {
  expandedUsageMessageId.value = expandedUsageMessageId.value === messageId
    ? null
    : messageId;
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

function assistantCustomBlocks(message: ChatMessage): ChatMessageCustomBlock[] {
  return message.role === "assistant" ? message.metadata?.customBlocks ?? [] : [];
}

function readAssistantUsage(message: ChatMessage): MessageModelUsageSummary | null {
  if (message.role !== "assistant") {
    return null;
  }
  const usageAnnotations = [...(message.metadata?.annotations ?? [])]
    .reverse()
    .flatMap((entry) => (
      entry.owner === "conversation.model-usage" &&
        entry.type === "model-usage" &&
        entry.version === "1" &&
        isMessageModelUsageSummary(entry.data)
        ? [entry.data]
        : []
    ));
  if (usageAnnotations.length === 0) {
    return null;
  }
  if (message.provider && message.model) {
    const exactMatch = usageAnnotations.find((entry) => (
      entry.providerId === message.provider &&
      entry.modelId === message.model
    ));
    if (exactMatch) {
      return exactMatch;
    }
  }
  return usageAnnotations[0] ?? null;
}

function shouldShowUsageInfoToggle(message: ChatMessage): boolean {
  return Boolean(message.id && readAssistantUsage(message));
}

function isUsageDetailsExpanded(message: ChatMessage): boolean {
  return Boolean(message.id && expandedUsageMessageId.value === message.id);
}

function customBlockKindLabel(block: ChatMessageCustomBlock): string {
  return block.kind === "json" ? "JSON" : "文本";
}

function formatJsonBlock(
  block: Extract<ChatMessageCustomBlock, { kind: "json" }>,
): string {
  return JSON.stringify(block.data, null, 2);
}

function messageToolTimeline(message: ChatMessage): ToolTimelineEntry[] {
  const toolCalls = message.toolCalls ?? [];
  const toolResults = [...(message.toolResults ?? [])];
  if (toolCalls.length === 0 && toolResults.length === 0) {
    return [];
  }

  const timeline: ToolTimelineEntry[] = [];
  const usedResults = new Set<number>();
  toolCalls.forEach((toolCall, callIndex) => {
    timeline.push(createToolTimelineEntry("call", toolCall, callIndex));
    toolResults.forEach((toolResult, resultIndex) => {
      if (usedResults.has(resultIndex)) {
        return;
      }
      if (isMatchingToolResult(toolCall, toolResult, callIndex, resultIndex)) {
        timeline.push(createToolTimelineEntry("result", toolResult, resultIndex));
        usedResults.add(resultIndex);
      }
    });
  });

  toolResults.forEach((toolResult, resultIndex) => {
    if (!usedResults.has(resultIndex)) {
      timeline.push(createToolTimelineEntry("result", toolResult, resultIndex));
    }
  });

  return timeline;
}

function createToolTimelineEntry(
  kind: "call",
  entry: ChatToolCallEntry,
  index: number,
): ToolTimelineEntry;
function createToolTimelineEntry(
  kind: "result",
  entry: ChatToolResultEntry,
  index: number,
): ToolTimelineEntry;
function createToolTimelineEntry(
  kind: "call" | "result",
  entry: ChatToolCallEntry | ChatToolResultEntry,
  index: number,
): ToolTimelineEntry {
  const value = kind === "call"
    ? (entry as ChatToolCallEntry).input
    : (entry as ChatToolResultEntry).output;
  return {
    key: `${kind}-${entry.toolCallId ?? entry.toolName}-${index}`,
    kind,
    preview: summarizeToolPayload(value),
    ...(entry.toolCallId ? { toolCallId: entry.toolCallId } : {}),
    toolName: entry.toolName,
    value,
  };
}

function isMatchingToolResult(
  toolCall: ChatToolCallEntry,
  toolResult: ChatToolResultEntry,
  callIndex: number,
  resultIndex: number,
): boolean {
  if (toolCall.toolCallId && toolResult.toolCallId) {
    return toolCall.toolCallId === toolResult.toolCallId;
  }
  return callIndex === resultIndex && toolCall.toolName === toolResult.toolName;
}

function summarizeToolPayload(value: JsonValue): string {
  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length > 80
      ? `${normalized.slice(0, 80)}…`
      : normalized || "(空字符串)";
  }
  if (Array.isArray(value)) {
    const serialized = JSON.stringify(value);
    return serialized.length > 80
      ? `数组(${value.length}) ${serialized.slice(0, 80)}…`
      : `数组(${value.length}) ${serialized}`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    return keys.length > 0
      ? `对象(${keys.length}) ${keys.slice(0, 4).join(", ")}${keys.length > 4 ? "…" : ""}`
      : "空对象";
  }
  if (value === null) {
    return "null";
  }
  return String(value);
}

function readJsonValueKindLabel(value: JsonValue): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "数组";
  }
  if (typeof value === "object") {
    return "对象";
  }
  if (typeof value === "string") {
    return "字符串";
  }
  if (typeof value === "number") {
    return "数字";
  }
  if (typeof value === "boolean") {
    return "布尔值";
  }
  return "值";
}

function formatStructuredToolValue(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function shortToolCallId(toolCallId: string): string {
  return `调用 ${toolCallId.slice(-8)}`;
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

function contextCompactionSummary(message: ChatMessage) {
  const annotation = readContextCompactionAnnotations(message).find((entry) =>
    isContextCompactionSummaryData(entry.data),
  );
  return annotation && isContextCompactionSummaryData(annotation.data)
    ? annotation.data
    : null;
}

function readContextCompactionAnnotations(
  message: ChatMessage,
): ChatMessageAnnotation[] {
  return (message.metadata?.annotations ?? []).filter(
    (annotation) =>
      annotation.type === "context-compaction" &&
      annotation.owner === "conversation.context-governance",
  );
}

function readDisplayMessageVariant(
  message: ChatMessage,
): "command" | "result" | null {
  const annotation = message.metadata?.annotations?.find(
    (entry) =>
      entry.type === "display-message" &&
      entry.owner === "conversation.display-message" &&
      entry.version === "1",
  );
  const variant = isRecord(annotation?.data) ? annotation.data.variant : null;
  return variant === "command" || variant === "result" ? variant : null;
}

function isContextCompactionSummaryData(
  value: unknown,
): value is {
  role: "summary";
  trigger?: "after-response" | "manual" | "prepare-model";
  coveredCount?: number;
  providerId?: string;
  modelId?: string;
  beforePreview?: { estimatedTokens: number };
  afterPreview?: { estimatedTokens: number };
} {
  return isRecord(value) &&
    value.role === "summary";
}

function isMessageModelUsageSummary(
  value: unknown,
): value is MessageModelUsageSummary {
  return isRecord(value) &&
    typeof value.modelId === "string" &&
    typeof value.providerId === "string" &&
    isTokenCount(value.inputTokens) &&
    (value.cachedInputTokens === undefined || isTokenCount(value.cachedInputTokens)) &&
    isTokenCount(value.outputTokens) &&
    isTokenCount(value.totalTokens) &&
    (value.source === "provider" || value.source === "estimated");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function formatUsageTokenCount(
  usage: MessageModelUsageSummary | null,
  value: number | undefined,
): string {
  if (!isTokenCount(value)) {
    return "-";
  }
  return `${usage?.source === "estimated" ? "*" : ""}${value}`;
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

<style src="../../../shared/styles/markdown.css"></style>
<style scoped src="../styles/message-list.css"></style>
