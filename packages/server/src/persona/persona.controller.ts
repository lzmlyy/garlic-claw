import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { PluginPersonaCurrentInfo, PluginPersonaSummary } from '@garlic-claw/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ActivateConversationPersonaDto,
  GetCurrentPersonaQueryDto,
} from './dto/persona.dto';
import { PersonaService } from './persona.service';

@ApiTags('Personas')
@ApiBearerAuth()
@Controller('personas')
@UseGuards(JwtAuthGuard)
export class PersonaController {
  constructor(private readonly personaService: PersonaService) {}

  @Get()
  listPersonas(): Promise<PluginPersonaSummary[]> {
    return this.personaService.listPersonas();
  }

  @Get('current')
  getCurrentPersona(
    @CurrentUser('id') userId: string,
    @Query() query: GetCurrentPersonaQueryDto,
  ): Promise<PluginPersonaCurrentInfo> {
    return this.personaService.getCurrentPersonaForUser(userId, {
      conversationId: query.conversationId,
    });
  }

  @Put('current')
  activateConversationPersona(
    @CurrentUser('id') userId: string,
    @Body() dto: ActivateConversationPersonaDto,
  ): Promise<PluginPersonaCurrentInfo> {
    return this.personaService.activateConversationPersonaForUser(
      userId,
      dto.conversationId,
      dto.personaId,
    );
  }
}
