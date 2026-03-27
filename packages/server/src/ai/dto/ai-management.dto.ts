import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * 模型模态能力 DTO。
 */
export class ModelModalityCapabilitiesDto {
  /** 是否支持文本输入/输出。 */
  @IsBoolean()
  @IsOptional()
  text?: boolean;

  /** 是否支持图片输入/输出。 */
  @IsBoolean()
  @IsOptional()
  image?: boolean;
}

/**
 * provider 写入 DTO。
 */
export class UpsertAiProviderDto {
  /** provider 模式。 */
  @IsIn(['official', 'compatible'])
  mode!: 'official' | 'compatible';

  /** 官方 driver 或兼容格式。 */
  @IsString()
  @MaxLength(64)
  driver!: string;

  /** provider 显示名称。 */
  @IsString()
  @MaxLength(120)
  name!: string;

  /** API Key。 */
  @IsString()
  @IsOptional()
  apiKey?: string;

  /** Base URL。 */
  @IsString()
  @IsOptional()
  baseUrl?: string;

  /** 默认模型。 */
  @IsString()
  @IsOptional()
  defaultModel?: string;

  /** 预设模型列表。 */
  @IsArray()
  @ArrayMaxSize(128)
  @IsString({ each: true })
  models!: string[];
}

/**
 * 模型写入 DTO。
 */
export class UpsertAiModelDto {
  /** 模型显示名称。 */
  @IsString()
  @IsOptional()
  name?: string;
}

/**
 * 默认模型 DTO。
 */
export class SetDefaultModelDto {
  /** 模型 ID。 */
  @IsString()
  modelId!: string;
}

/**
 * 模型能力更新 DTO。
 */
export class UpdateModelCapabilitiesDto {
  /** 是否支持 reasoning。 */
  @IsBoolean()
  @IsOptional()
  reasoning?: boolean;

  /** 是否支持 tool call。 */
  @IsBoolean()
  @IsOptional()
  toolCall?: boolean;

  /** 输入模态能力。 */
  @ValidateNested()
  @Type(() => ModelModalityCapabilitiesDto)
  @IsOptional()
  input?: ModelModalityCapabilitiesDto;

  /** 输出模态能力。 */
  @ValidateNested()
  @Type(() => ModelModalityCapabilitiesDto)
  @IsOptional()
  output?: ModelModalityCapabilitiesDto;
}

/**
 * 视觉转述配置 DTO。
 */
export class UpdateVisionFallbackDto {
  /** 是否启用视觉转述。 */
  @IsBoolean()
  enabled!: boolean;

  /** 视觉转述 provider。 */
  @IsString()
  @IsOptional()
  providerId?: string;

  /** 视觉转述模型。 */
  @IsString()
  @IsOptional()
  modelId?: string;

  /** 转述提示词。 */
  @IsString()
  @IsOptional()
  prompt?: string;

  /** 最大描述长度。 */
  @IsInt()
  @Min(0)
  @Max(4000)
  @IsOptional()
  maxDescriptionLength?: number;
}

/**
 * provider 测试连接 DTO。
 */
export class TestAiProviderConnectionDto {
  /** 可选测试模型。 */
  @IsString()
  @IsOptional()
  modelId?: string;
}
