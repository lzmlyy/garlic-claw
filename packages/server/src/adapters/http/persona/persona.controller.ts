import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, JwtAuthGuard } from '../../../auth/http-auth';
import { PersonaService } from '../../../persona/persona.service';
import { ActivateConversationPersonaDto } from './dto/activate-conversation-persona.dto';
import { CreatePersonaDto } from './dto/create-persona.dto';
import { UpdatePersonaDto } from './dto/update-persona.dto';

@Controller('personas')
export class PersonaController {
  constructor(
    private readonly personaService: PersonaService,
  ) {}

  @Get()
  async listPersonas() {
    return this.personaService.listPersonas();
  }

  @Get('current')
  @UseGuards(JwtAuthGuard)
  async getCurrentPersona(@CurrentUser('id') userId: string, @Query('conversationId') conversationId?: string) {
    const normalizedConversationId = typeof conversationId === 'string' && conversationId.trim() ? conversationId.trim() : null;
    return this.personaService.readCurrentPersona({
      context: {
        ...(normalizedConversationId ? { conversationId: normalizedConversationId } : {}),
        source: 'plugin',
        userId,
      },
      ...(normalizedConversationId ? { conversationId: normalizedConversationId } : {}),
    });
  }

  @Put('current')
  @UseGuards(JwtAuthGuard)
  async activateCurrentPersona(@CurrentUser('id') userId: string, @Body() dto: ActivateConversationPersonaDto) {
    return this.personaService.activatePersona({
      conversationId: dto.conversationId,
      personaId: dto.personaId,
      userId,
    });
  }

  @Get(':personaId/avatar')
  async getPersonaAvatar(@Param('personaId') personaId: string, @Res() response: Response) {
    const avatarPath = this.personaService.readPersonaAvatarPath(personaId);
    response.sendFile(avatarPath);
  }

  @Get(':personaId')
  async getPersona(@Param('personaId') personaId: string) {
    return this.personaService.readPersona(personaId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createPersona(@Body() dto: CreatePersonaDto) {
    return this.personaService.createPersona(dto);
  }

  @Put(':personaId')
  @UseGuards(JwtAuthGuard)
  async updatePersona(@Param('personaId') personaId: string, @Body() dto: UpdatePersonaDto) {
    return this.personaService.updatePersona(personaId, dto);
  }

  @Delete(':personaId')
  @UseGuards(JwtAuthGuard)
  async deletePersona(@Param('personaId') personaId: string) {
    return this.personaService.deletePersona(personaId);
  }
}
