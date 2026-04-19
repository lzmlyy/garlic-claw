import { IsIn, IsString } from 'class-validator'

export class PersonaDialogEntryDto {
  @IsString()
  content!: string

  @IsIn(['assistant', 'user'])
  role!: 'assistant' | 'user'
}
