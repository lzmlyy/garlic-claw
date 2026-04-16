import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ApiKeyController } from '../src/adapters/http/auth/api-key.controller';
import { AuthController } from '../src/adapters/http/auth/auth.controller';
import { ConversationController } from '../src/adapters/http/conversation/conversation.controller';
import { OpenApiMessageController } from '../src/adapters/http/conversation/open-api-message.controller';
import { UserController } from '../src/adapters/http/user/user.controller';

describe('server api contract freeze', () => {
  it('keeps auth, api key and user routes stable', () => {
    expect(listControllerRoutes(AuthController)).toEqual([
      'POST /api/auth/dev-login',
      'POST /api/auth/login',
      'POST /api/auth/refresh',
      'POST /api/auth/register',
    ]);
    expect(listControllerRoutes(ApiKeyController)).toEqual([
      'GET /api/auth/api-keys',
      'POST /api/auth/api-keys',
      'POST /api/auth/api-keys/:id/revoke',
    ]);
    expect(listControllerRoutes(UserController)).toEqual([
      'DELETE /api/users/:id',
      'GET /api/users',
      'GET /api/users/:id',
      'GET /api/users/me',
      'PATCH /api/users/:id',
      'PATCH /api/users/:id/role',
    ]);
  });

  it('keeps chat routes stable', () => {
    expect(listControllerRoutes(ConversationController)).toEqual([
      'DELETE /api/chat/conversations/:id',
      'DELETE /api/chat/conversations/:id/messages/:messageId',
      'GET /api/chat/conversations',
      'GET /api/chat/conversations/:id',
      'GET /api/chat/conversations/:id/services',
      'GET /api/chat/conversations/:id/skills',
      'PATCH /api/chat/conversations/:id/messages/:messageId',
      'POST /api/chat/conversations',
      'POST /api/chat/conversations/:id/messages',
      'POST /api/chat/conversations/:id/messages/:messageId/retry',
      'POST /api/chat/conversations/:id/messages/:messageId/stop',
      'PUT /api/chat/conversations/:id/services',
      'PUT /api/chat/conversations/:id/skills',
    ]);
    expect(listControllerRoutes(OpenApiMessageController)).toEqual([
      'POST /api/open-api/conversations/:conversationId/messages/assistant',
    ]);
  });
});

type ControllerClass = abstract new (...args: never[]) => object;

function listControllerRoutes(controller: ControllerClass): string[] {
  const controllerPaths = readPathMetadata(controller);
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((propertyName) => propertyName !== 'constructor')
    .flatMap((propertyName) => {
      const handler = prototype[propertyName];
      if (typeof handler !== 'function') return [];
      const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (typeof requestMethod === 'undefined') return [];
      return controllerPaths.flatMap((controllerPath) =>
        readPathMetadata(handler).map(
          (handlerPath) => `${toHttpMethodLabel(requestMethod)} /api${joinRoutePath(controllerPath, handlerPath)}`,
        ),
      );
    })
    .sort();
}

function readPathMetadata(target: object): string[] {
  const metadata = Reflect.getMetadata(PATH_METADATA, target) as string | string[] | undefined;
  return Array.isArray(metadata) ? metadata.map(normalizePathSegment) : [normalizePathSegment(metadata ?? '')];
}

function normalizePathSegment(segment: string): string {
  const trimmed = segment.trim();
  return trimmed ? trimmed.replace(/^\/+|\/+$/g, '') : '';
}

function joinRoutePath(controllerPath: string, handlerPath: string): string {
  const parts = [controllerPath, handlerPath].filter((part) => part.length > 0);
  return parts.length > 0 ? `/${parts.join('/')}` : '';
}

function toHttpMethodLabel(method: RequestMethod): string {
  switch (method) {
    case RequestMethod.GET:
      return 'GET';
    case RequestMethod.POST:
      return 'POST';
    case RequestMethod.PUT:
      return 'PUT';
    case RequestMethod.DELETE:
      return 'DELETE';
    case RequestMethod.PATCH:
      return 'PATCH';
    case RequestMethod.ALL:
      return 'ALL';
    default:
      return `UNKNOWN(${method})`;
  }
}
