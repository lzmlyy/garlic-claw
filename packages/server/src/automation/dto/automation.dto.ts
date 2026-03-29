import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { JsonObject } from '../../common/types/json-value';

/**
 * 自动化触发器 DTO。
 *
 * 输入:
 * - 触发类型与可选的 cron / event 参数
 *
 * 输出:
 * - 供控制器和服务层消费的触发配置
 *
 * 预期行为:
 * - 只允许 manual / cron / event 三种触发类型
 */
export class CreateAutomationTriggerDto {
  @IsIn(['cron', 'event', 'manual'])
  type!: 'cron' | 'event' | 'manual';

  @IsString()
  @IsOptional()
  @MaxLength(120)
  cron?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  event?: string;
}

/**
 * 自动化消息动作目标 DTO。
 */
export class CreateAutomationActionTargetDto {
  @IsIn(['conversation'])
  type!: 'conversation';

  @IsString()
  @MaxLength(120)
  id!: string;
}

/**
 * 自动化动作 DTO。
 *
 * 输入:
 * - 动作类型及其附加参数
 *
 * 输出:
 * - 供自动化服务消费的动作配置
 *
 * 预期行为:
 * - 支持设备指令与 AI 消息两类动作
 * - 允许空动作数组，用于先创建草稿自动化
 */
export class CreateAutomationActionDto {
  @IsIn(['device_command', 'ai_message'])
  type!: 'device_command' | 'ai_message';

  @IsString()
  @IsOptional()
  @MaxLength(120)
  plugin?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  capability?: string;

  @IsObject()
  @IsOptional()
  params?: JsonObject;

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  message?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateAutomationActionTargetDto)
  target?: CreateAutomationActionTargetDto;
}

/**
 * 创建自动化 DTO。
 *
 * 输入:
 * - 自动化名称
 * - 触发器
 * - 动作列表
 *
 * 输出:
 * - 通过全局 ValidationPipe 校验后的创建参数
 *
 * 预期行为:
 * - 白名单校验下仍允许前端正常提交 name / trigger / actions
 * - 未声明字段会被全局校验拒绝
 */
export class CreateAutomationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ValidateNested()
  @Type(() => CreateAutomationTriggerDto)
  trigger!: CreateAutomationTriggerDto;

  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => CreateAutomationActionDto)
  actions!: CreateAutomationActionDto[];
}
