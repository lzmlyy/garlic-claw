import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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

/**
 * 发送消息 part DTO。
 *
 * 输入:
 * - 文本 part 或图片 part
 *
 * 输出:
 * - 供控制器和服务层消费的结构化 part
 *
 * 预期行为:
 * - text part 只要求 text
 * - image part 只要求 image 和可选 mimeType
 */
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
