import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator'
import { PersonaDialogEntryDto } from './persona-dialog-entry.dto'

export class UpdatePersonaDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  prompt?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonaDialogEntryDto)
  beginDialogs?: PersonaDialogEntryDto[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  toolNames?: string[] | null

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skillIds?: string[] | null

  @IsOptional()
  @IsString()
  customErrorMessage?: string | null

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean
}
