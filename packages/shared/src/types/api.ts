import type { JsonValue } from './json';
import type { ChatMessagePart } from './chat';

export interface ApiResponse<T = JsonValue> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserInfo {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export type ApiKeyScope =
  | 'plugin.route.invoke'
  | 'conversation.message.write';

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApiKeyRequest {
  name: string;
  scopes: ApiKeyScope[];
  expiresAt?: string;
}

export interface CreateApiKeyResponse extends ApiKeySummary {
  token: string;
}

export interface WriteAssistantMessageRequest {
  content?: string;
  parts?: ChatMessagePart[];
  provider?: string;
  model?: string;
}
