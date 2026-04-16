import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard } from '../../../auth/http-auth';
import { RuntimeHostConversationRecordService } from '../../../runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostUserContextService } from '../../../runtime/host/runtime-host-user-context.service';

interface ActivateConversationPersonaDto {
  conversationId: string;
  personaId: string;
}

@Controller('personas')
export class PersonaController {
  constructor(
    private readonly runtimeHostConversationRecordService: RuntimeHostConversationRecordService,
    private readonly runtimeHostUserContextService: RuntimeHostUserContextService,
  ) {}

  @Get()
  async listPersonas() {
    return this.runtimeHostUserContextService.listPersonas();
  }

  @Get('current')
  @UseGuards(JwtAuthGuard)
  async getCurrentPersona(@CurrentUser('id') userId: string, @Query('conversationId') conversationId?: string) {
    const normalizedConversationId = typeof conversationId === 'string' && conversationId.trim() ? conversationId.trim() : null;
    return this.runtimeHostUserContextService.readCurrentPersona({
      context: {
        source: 'plugin',
        userId,
      },
      ...(normalizedConversationId
        ? {
            conversationActivePersonaId: this.runtimeHostConversationRecordService
              .requireConversation(normalizedConversationId)
              .activePersonaId,
          }
        : {}),
    });
  }

  @Put('current')
  @UseGuards(JwtAuthGuard)
  async activateCurrentPersona(@CurrentUser('id') _userId: string, @Body() dto: ActivateConversationPersonaDto) {
    const conversation = this.runtimeHostConversationRecordService.requireConversation(dto.conversationId);
    return this.runtimeHostUserContextService.activatePersona({
      conversation,
      personaId: dto.personaId,
    });
  }
}
