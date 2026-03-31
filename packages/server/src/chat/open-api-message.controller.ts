import type { PluginMessageSendInfo } from '@garlic-claw/shared';
import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthScopes } from '../auth/decorators/auth-scopes.decorator';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import { AuthScopeGuard } from '../auth/guards/auth-scope.guard';
import { ChatMessageService } from './chat-message.service';
import { mapDtoParts } from './chat-message.helpers';
import { WriteAssistantMessageDto } from './dto/open-api-message.dto';

@ApiTags('Open API')
@ApiBearerAuth()
@Controller('open-api/conversations')
@UseGuards(ApiKeyAuthGuard, AuthScopeGuard)
export class OpenApiMessageController {
  constructor(private readonly chatMessages: ChatMessageService) {}

  @Post(':conversationId/messages/assistant')
  @AuthScopes('conversation.message.write')
  writeAssistantMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: WriteAssistantMessageDto,
  ): Promise<PluginMessageSendInfo> {
    return this.chatMessages.sendPluginMessage({
      context: {
        source: 'http-route',
        userId: user.id,
        conversationId,
        ...(dto.provider ? { activeProviderId: dto.provider } : {}),
        ...(dto.model ? { activeModelId: dto.model } : {}),
      },
      target: {
        type: 'conversation',
        id: conversationId,
      },
      content: dto.content,
      parts: dto.parts ? mapDtoParts(dto.parts) : undefined,
      provider: dto.provider,
      model: dto.model,
    });
  }
}
