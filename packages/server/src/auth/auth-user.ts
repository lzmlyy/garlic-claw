import type { ApiKeyScope } from '@garlic-claw/shared';

export interface AuthenticatedUser {
  authType: 'jwt' | 'api_key';
  id: string;
  username: string;
  email: string;
  role: string;
  scopes: ApiKeyScope[];
  apiKeyId?: string;
  apiKeyName?: string;
}
