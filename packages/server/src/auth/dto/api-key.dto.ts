import type { CreateApiKeyRequest } from '@garlic-claw/shared';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { API_KEY_SCOPES } from '../api-key.constants';

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
