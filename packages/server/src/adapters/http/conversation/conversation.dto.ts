import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class CreateConversationDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  title?: string;
}

export class SendMessagePartDto {
  @IsIn(['text', 'image'])
  type!: 'text' | 'image';

  @ValidateIf((part: SendMessagePartDto) => part.type === 'text')
  @IsString()
  @MaxLength(10000)
  text?: string;

  @ValidateIf((part: SendMessagePartDto) => part.type === 'image')
  @IsString()
  image?: string;

  @ValidateIf((part: SendMessagePartDto) => part.type === 'image' && part.mimeType !== undefined)
  @IsString()
  mimeType?: string;
}

export class SendMessageDto {
  @IsString()
  @IsOptional()
  @MaxLength(10000)
  content?: string;

  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => SendMessagePartDto)
  @IsOptional()
  parts?: SendMessagePartDto[];

  @IsString()
  @IsOptional()
  provider?: string;

  @IsString()
  @IsOptional()
  model?: string;
}

export class UpdateMessageDto {
  @IsString()
  @IsOptional()
  @MaxLength(10000)
  content?: string;

  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => SendMessagePartDto)
  @IsOptional()
  parts?: SendMessagePartDto[];
}

export class RetryMessageDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  provider?: string;

  @IsString()
  @IsOptional()
  @MinLength(1)
  model?: string;
}

export class UpdateConversationHostServicesDto {
  @IsBoolean()
  @IsOptional()
  sessionEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  llmEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  ttsEnabled?: boolean;
}

export class UpdateConversationSkillsDto {
  @IsArray()
  @ArrayMaxSize(16)
  @ArrayUnique()
  @IsString({ each: true })
  activeSkillIds!: string[];
}
