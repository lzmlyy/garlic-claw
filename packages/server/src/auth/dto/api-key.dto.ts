import type { CreateApiKeyRequest } from '@garlic-claw/shared';
import { API_KEY_SCOPES } from '@garlic-claw/shared';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateApiKeyDto implements CreateApiKeyRequest {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(API_KEY_SCOPES, { each: true })
  scopes!: CreateApiKeyRequest['scopes'];

  @IsOptional()
  @Type(() => String)
  @IsISO8601()
  expiresAt?: string;
}
