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
 * 模型路由目标 DTO。
 */
export class AiModelRouteTargetDto {
  /** provider ID。 */
  @IsString()
  providerId!: string;

  /** model ID。 */
  @IsString()
  modelId!: string;
}

/**
 * utility model role 配置 DTO。
 */
export class UpdateUtilityModelRolesDto {
  /** 会话标题生成模型。 */
  @ValidateNested()
  @Type(() => AiModelRouteTargetDto)
  @IsOptional()
  conversationTitle?: AiModelRouteTargetDto;

  /** 插件文本生成默认模型。 */
  @ValidateNested()
  @Type(() => AiModelRouteTargetDto)
  @IsOptional()
  pluginGenerateText?: AiModelRouteTargetDto;
}

/**
 * 宿主模型路由配置 DTO。
 */
export class UpdateHostModelRoutingDto {
  /** 聊天回退模型链。 */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiModelRouteTargetDto)
  @IsOptional()
  fallbackChatModels?: AiModelRouteTargetDto[];

  /** 上下文压缩模型。 */
  @ValidateNested()
  @Type(() => AiModelRouteTargetDto)
  @IsOptional()
  compressionModel?: AiModelRouteTargetDto;

  /** utility model role 配置。 */
  @ValidateNested()
  @Type(() => UpdateUtilityModelRolesDto)
  @IsOptional()
  utilityModelRoles?: UpdateUtilityModelRolesDto;
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
