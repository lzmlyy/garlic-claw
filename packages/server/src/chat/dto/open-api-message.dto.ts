import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SendMessagePartDto } from './chat.dto';

export class WriteAssistantMessageDto {
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
