import { IsString } from 'class-validator'

export class ActivateConversationPersonaDto {
  @IsString()
  conversationId!: string

  @IsString()
  personaId!: string
}
