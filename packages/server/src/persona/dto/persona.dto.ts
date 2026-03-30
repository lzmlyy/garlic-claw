import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class GetCurrentPersonaQueryDto {
  @IsUUID()
  @IsOptional()
  conversationId?: string;
}

export class ActivateConversationPersonaDto {
  @IsUUID()
  conversationId!: string;

  @IsString()
  @MinLength(1)
  personaId!: string;
}
