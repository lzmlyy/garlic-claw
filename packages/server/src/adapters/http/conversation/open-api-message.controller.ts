import { Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JsonObject } from '@garlic-claw/shared';
import { ApiKeyAuthGuard, AuthScopeGuard, AuthScopes } from '../../../auth/http-auth';
import { readRequestUserId } from '../http-request.codec';
import { RuntimeHostConversationMessageService } from '../../../runtime/host/runtime-host-conversation-message.service';
import { SendMessageDto } from './conversation.dto';

@Controller('open-api/conversations')
@UseGuards(ApiKeyAuthGuard, AuthScopeGuard)
export class OpenApiMessageController {
  constructor(
    private readonly runtimeHostConversationMessageService: RuntimeHostConversationMessageService,
  ) {}

  @Post(':conversationId/messages/assistant')
  @AuthScopes('conversation.message.write')
  writeAssistantMessage(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: SendMessageDto,
    @Req() req: Request,
  ) {
    const target = { id: conversationId, type: 'conversation' as const };
    return this.runtimeHostConversationMessageService.sendMessage(
      {
        source: 'http-route',
        userId: readRequestUserId(req),
        conversationId,
        ...(dto.provider ? { activeProviderId: dto.provider } : {}),
        ...(dto.model ? { activeModelId: dto.model } : {}),
      },
      {
        target,
        ...(dto.content ? { content: dto.content } : {}),
        ...(dto.parts ? { parts: dto.parts as unknown as JsonObject[] } : {}),
        ...(dto.provider ? { provider: dto.provider } : {}),
        ...(dto.model ? { model: dto.model } : {}),
      },
    );
  }
}
