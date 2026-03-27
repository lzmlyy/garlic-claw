import type { JsonObject } from '@garlic-claw/shared';
import { IsBoolean, IsObject, IsOptional } from 'class-validator';

/**
 * 更新插件配置 DTO。
 *
 * 输入:
 * - `values`: 待保存的插件配置值对象
 *
 * 输出:
 * - 无；仅作为控制器参数约束
 *
 * 预期行为:
 * - 要求传入 JSON 对象
 */
export class UpdatePluginConfigDto {
  @IsObject()
  values!: JsonObject;
}

/**
 * 更新插件作用域 DTO。
 *
 * 输入:
 * - `defaultEnabled`: 默认是否启用
 * - `conversations`: 会话级启停覆盖
 *
 * 输出:
 * - 无；仅作为控制器参数约束
 *
 * 预期行为:
 * - 强制默认值为布尔
 * - 允许会话级覆盖缺省
 */
export class UpdatePluginScopeDto {
  @IsBoolean()
  defaultEnabled!: boolean;

  @IsOptional()
  @IsObject()
  conversations?: Record<string, boolean>;
}
