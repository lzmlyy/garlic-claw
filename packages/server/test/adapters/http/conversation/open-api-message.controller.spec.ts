import * as fs from 'node:fs';
import * as path from 'node:path';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AUTH_SCOPES_KEY } from '../../../../src/auth/http-auth';
import { OpenApiMessageController } from '../../../../src/adapters/http/conversation/open-api-message.controller';
import { SendMessageDto } from '../../../../src/adapters/http/conversation/conversation.dto';

describe('OpenApiMessageController', () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const messageId = '22222222-2222-4222-8222-222222222222';
  const runtimeHostConversationMessageService = {
    sendMessage: jest.fn(),
  };

  let controller: OpenApiMessageController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new OpenApiMessageController(
      runtimeHostConversationMessageService as never,
    );
  });

  it('requires api-key auth and conversation.message.write scope', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, OpenApiMessageController) as Array<{ name?: string }> | undefined;
    const reflector = new Reflector();
    const source = fs.readFileSync(
      path.join(__dirname, '../../../../src/adapters/http/conversation/open-api-message.controller.ts'),
      'utf8',
    );
    const paramTypes = Reflect.getMetadata('design:paramtypes', OpenApiMessageController.prototype, 'writeAssistantMessage') as Array<unknown> | undefined;

    expect(guards?.map((guard) => guard?.name)).toEqual(expect.arrayContaining(['ApiKeyAuthGuard', 'AuthScopeGuard']));
    expect(reflector.get(AUTH_SCOPES_KEY, OpenApiMessageController.prototype.writeAssistantMessage)).toEqual(['conversation.message.write']);
    expect(source).toContain("@Param('conversationId', ParseUUIDPipe)");
    expect(paramTypes?.[1]).toBe(SendMessageDto);
  });

  it('writes assistant messages into a conversation through message.send', async () => {
    runtimeHostConversationMessageService.sendMessage.mockResolvedValue({
      id: messageId,
      target: {
        type: 'conversation',
        id: conversationId,
        label: 'Roadmap',
      },
      role: 'assistant',
      content: '后台任务已经完成。',
      parts: [],
      provider: 'openai',
      model: 'gpt-5.2',
      status: 'completed',
      createdAt: '2026-03-31T08:00:00.000Z',
      updatedAt: '2026-03-31T08:00:00.000Z',
    });

    await expect(
      controller.writeAssistantMessage(
        conversationId,
        {
          content: '后台任务已经完成。',
          provider: 'openai',
          model: 'gpt-5.2',
        } as never,
        {
          user: {
            id: 'user-1',
          },
        } as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: messageId,
        content: '后台任务已经完成。',
      }),
    );
    expect(runtimeHostConversationMessageService.sendMessage).toHaveBeenCalledWith(
      {
        source: 'http-route',
        userId: 'user-1',
        conversationId,
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      {
        content: '后台任务已经完成。',
        model: 'gpt-5.2',
        provider: 'openai',
        target: {
          type: 'conversation',
          id: conversationId,
        },
      },
    );
  });
});
