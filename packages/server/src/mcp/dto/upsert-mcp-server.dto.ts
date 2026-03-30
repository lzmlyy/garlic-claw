import { Type } from 'class-transformer';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class McpEnvEntryDto {
  @IsString()
  key!: string;

  @IsString()
  value!: string;
}

export class UpsertMcpServerDto {
  @IsString()
  name!: string;

  @IsString()
  command!: string;

  @IsArray()
  @IsString({ each: true })
  args!: string[];

  @IsOptional()
  @IsObject()
  env?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => McpEnvEntryDto)
  envEntries?: McpEnvEntryDto[];
}
