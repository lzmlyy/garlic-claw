import type { ApiKeyScope } from '@garlic-claw/shared';
import { SetMetadata } from '@nestjs/common';

export const AUTH_SCOPES_KEY = 'auth_scopes';

export const AuthScopes = (...scopes: ApiKeyScope[]) =>
  SetMetadata(AUTH_SCOPES_KEY, scopes);
