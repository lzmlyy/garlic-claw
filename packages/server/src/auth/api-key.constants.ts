import type { ApiKeyScope } from '@garlic-claw/shared';

export const API_KEY_SCOPES = [
  'plugin.route.invoke',
  'conversation.message.write',
] as const satisfies ApiKeyScope[];
