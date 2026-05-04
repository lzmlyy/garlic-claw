import { delete as del, get, patch, post, requestRaw } from "@/shared/api/http";
import { toAppError } from "@/shared/utils/error";

import type {
  Conversation,
  ConversationContextWindowPreview,
  ConversationDetail,
  RuntimePermissionDecision,
  RuntimePermissionReplyResult,
  RuntimePermissionRequest,
  ConversationTodoItem,
  Message,
  RetryMessagePayload,
  SSEEvent,
  SendMessagePayload,
  UpdateMessagePayload,
} from "@garlic-claw/shared";

export function listConversations() {
  return get<Conversation[]>("/chat/conversations");
}

export function createConversation(title?: string) {
  return post<Conversation>("/chat/conversations", { title });
}

export function getConversation(id: string) {
  return get<ConversationDetail>(`/chat/conversations/${id}`);
}

export function getConversationContextWindow(
  conversationId: string,
  payload: {
    providerId?: string;
    modelId?: string;
  } = {},
) {
  const search = new URLSearchParams();
  if (payload.providerId) {
    search.set("providerId", payload.providerId);
  }
  if (payload.modelId) {
    search.set("modelId", payload.modelId);
  }
  const query = search.toString();
  const querySuffix = query ? `?${query}` : "";
  return get<ConversationContextWindowPreview>(
    `/chat/conversations/${conversationId}/context-window${querySuffix}`,
  );
}

export function getConversationTodo(conversationId: string) {
  return get<ConversationTodoItem[]>(`/chat/sessions/${conversationId}/todo`);
}

export function listPendingRuntimePermissions(conversationId: string) {
  return get<RuntimePermissionRequest[]>(
    `/chat/conversations/${conversationId}/runtime-permissions/pending`,
  );
}

export function replyRuntimePermission(
  conversationId: string,
  requestId: string,
  decision: RuntimePermissionDecision,
) {
  return post<RuntimePermissionReplyResult>(
    `/chat/conversations/${conversationId}/runtime-permissions/${requestId}/reply`,
    { decision },
  );
}

export function deleteConversation(id: string) {
  return del<{ message: string }>(`/chat/conversations/${id}`);
}

export function updateConversationMessage(
  conversationId: string,
  messageId: string,
  payload: UpdateMessagePayload,
) {
  return patch<Message>(
    `/chat/conversations/${conversationId}/messages/${messageId}`,
    payload,
  );
}

export function deleteConversationMessage(
  conversationId: string,
  messageId: string,
) {
  return del<{ success: boolean }>(
    `/chat/conversations/${conversationId}/messages/${messageId}`,
  );
}

export function stopConversationMessage(
  conversationId: string,
  messageId: string,
) {
  return post<{ message: string }>(
    `/chat/conversations/${conversationId}/messages/${messageId}/stop`,
  );
}

export async function sendMessageSSE(
  conversationId: string,
  payload: SendMessagePayload,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal,
) {
  try {
    const response = await createSseRequest(
      `/chat/conversations/${conversationId}/messages`,
      payload,
      signal,
    );
    await consumeSseResponse(response, onEvent);
  } catch (error) {
    throw toAppError(error, "Send message failed");
  }
}

export async function retryMessageSSE(
  conversationId: string,
  messageId: string,
  payload: RetryMessagePayload,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal,
) {
  try {
    const response = await createSseRequest(
      `/chat/conversations/${conversationId}/messages/${messageId}/retry`,
      payload,
      signal,
    );
    await consumeSseResponse(response, onEvent);
  } catch (error) {
    throw toAppError(error, "Retry message failed");
  }
}

export async function streamConversationEventsSSE(
  conversationId: string,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal,
) {
  try {
    const response = await requestRaw(`/chat/conversations/${conversationId}/events`, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
      },
      signal,
      timeout: 0,
    });
    await consumeSseResponse(response, onEvent);
  } catch (error) {
    throw toAppError(error, "Attach conversation stream failed");
  }
}

async function createSseRequest(
  path: string,
  payload: SendMessagePayload | RetryMessagePayload,
  signal?: AbortSignal,
) {
  try {
    return await requestRaw(path, {
      method: "POST",
      body: payload,
      headers: {
        Accept: "text/event-stream",
      },
      signal,
      timeout: 0,
    });
  } catch (error) {
    throw toAppError(error, "Failed to establish stream");
  }
}

async function consumeSseResponse(
  response: Response,
  onEvent: (event: SSEEvent) => void,
) {
  try {
    const reader = response.body?.getReader();
    if (!reader) {
      throw toAppError({
        status: 500,
        body: "SSE response body is empty",
        code: "SSE_EMPTY_BODY",
      });
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) {
          continue;
        }

        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          return;
        }

        try {
          onEvent(JSON.parse(data) as SSEEvent);
        } catch {
          // Ignore invalid JSON lines in stream payload.
        }
      }
    }
  } catch (error) {
    throw toAppError(error, "Read stream failed");
  }
}
