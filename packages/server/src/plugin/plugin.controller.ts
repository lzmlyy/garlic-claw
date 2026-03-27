import type {
  PluginActionResult,
  PluginCapability,
  PluginConfigSnapshot,
  PluginEventRecord,
  PluginHookDescriptor,
  PluginHealthSnapshot,
  PluginInfo,
  PluginPermission,
  PluginRouteDescriptor,
  PluginScopeSettings,
} from '@garlic-claw/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  UpdatePluginConfigDto,
  UpdatePluginScopeDto,
} from './dto/plugin-admin.dto';
import { PluginAdminService } from './plugin-admin.service';
import { PluginCronService } from './plugin-cron.service';
import { PluginRuntimeService } from './plugin-runtime.service';
import { PluginService } from './plugin.service';

@ApiTags('Plugins')
@ApiBearerAuth()
@Controller('plugins')
@UseGuards(JwtAuthGuard)
export class PluginController {
  constructor(
    private pluginService: PluginService,
    private pluginRuntime: PluginRuntimeService,
    private pluginCronService: PluginCronService,
    private pluginAdmin: PluginAdminService,
  ) {}

  @Get()
  async listPlugins(): Promise<PluginInfo[]> {
    const plugins = await this.pluginService.findAll();
    const runtimePlugins = new Map(
      this.pluginRuntime.listPlugins().map((plugin) => [plugin.pluginId, plugin]),
    );
    return Promise.all(plugins.map(async (p) => ({
      id: p.id,
      name: p.name,
      displayName: runtimePlugins.get(p.name)?.manifest.name ?? p.displayName ?? undefined,
      description: runtimePlugins.get(p.name)?.manifest.description ?? p.description ?? undefined,
      deviceType: p.deviceType,
      status: p.status,
      capabilities: runtimePlugins.get(p.name)?.manifest.tools
        ?? parsePluginCapabilities(p.capabilities),
      connected: runtimePlugins.has(p.name),
      runtimeKind: runtimePlugins.get(p.name)?.runtimeKind
        ?? (p.runtimeKind === 'builtin' ? 'builtin' : 'remote'),
      version: runtimePlugins.get(p.name)?.manifest.version ?? p.version ?? undefined,
      permissions: runtimePlugins.get(p.name)?.manifest.permissions
        ?? parsePluginPermissions(p.permissions),
      crons: await this.pluginCronService.listCronJobs(p.name),
      hooks: runtimePlugins.get(p.name)?.manifest.hooks ?? parsePluginHooks(p.hooks),
      routes: runtimePlugins.get(p.name)?.manifest.routes ?? parsePluginRoutes(p.routes),
      manifest: runtimePlugins.get(p.name)?.manifest,
      health: serializePluginHealth(p),
      lastSeenAt: p.lastSeenAt ? p.lastSeenAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })));
  }

  @Get('connected')
  getConnectedPlugins() {
    return this.pluginRuntime.listPlugins().map((plugin) => ({
      name: plugin.pluginId,
      runtimeKind: plugin.runtimeKind,
      capabilities: plugin.manifest.tools,
    }));
  }

  @Delete(':name')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  deletePlugin(@Param('name') name: string) {
    return this.pluginService.deletePlugin(name);
  }

  @Get(':name/config')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  getPluginConfig(@Param('name') name: string): Promise<PluginConfigSnapshot> {
    return this.pluginService.getPluginConfig(name);
  }

  @Put(':name/config')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  async updatePluginConfig(
    @Param('name') name: string,
    @Body() dto: UpdatePluginConfigDto,
  ): Promise<PluginConfigSnapshot> {
    const result = await this.pluginService.updatePluginConfig(name, dto.values);
    await this.pluginRuntime.refreshPluginGovernance(name);
    return result;
  }

  @Get(':name/scopes')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  getPluginScope(@Param('name') name: string): Promise<PluginScopeSettings> {
    return this.pluginService.getPluginScope(name);
  }

  @Get(':name/health')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  getPluginHealth(@Param('name') name: string): Promise<PluginHealthSnapshot> {
    return this.pluginService.getPluginHealth(name);
  }

  @Get(':name/events')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  listPluginEvents(
    @Param('name') name: string,
    @Query('limit') limit?: string,
  ): Promise<PluginEventRecord[]> {
    return this.pluginService.listPluginEvents(
      name,
      limit ? Number(limit) : undefined,
    );
  }

  @Get(':name/crons')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  listPluginCrons(@Param('name') name: string) {
    return this.pluginCronService.listCronJobs(name);
  }

  @Put(':name/scopes')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  async updatePluginScope(
    @Param('name') name: string,
    @Body() dto: UpdatePluginScopeDto,
  ): Promise<PluginScopeSettings> {
    const result = await this.pluginService.updatePluginScope(name, {
      defaultEnabled: dto.defaultEnabled,
      conversations: dto.conversations ?? {},
    });
    await this.pluginRuntime.refreshPluginGovernance(name);
    return result;
  }

  @Post(':name/actions/:action')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  runPluginAction(
    @Param('name') name: string,
    @Param('action') action: string,
  ): Promise<PluginActionResult> {
    return this.pluginAdmin.runAction(name, action as never);
  }
}

/**
 * 解析能力 JSON 字符串。
 * @param raw 原始 JSON 字符串
 * @returns 能力数组；解析失败时回退为空数组
 */
function parsePluginCapabilities(raw: string | null): PluginCapability[] {
  if (!raw) {
    return [];
  }

  return JSON.parse(raw) as PluginCapability[];
}

/**
 * 解析权限 JSON 字符串。
 * @param raw 原始 JSON 字符串
 * @returns 权限数组；缺失时返回 undefined
 */
function parsePluginPermissions(raw: string | null): PluginPermission[] | undefined {
  if (!raw) {
    return undefined;
  }

  return JSON.parse(raw) as PluginPermission[];
}

/**
 * 解析 Hook JSON 字符串。
 * @param raw 原始 JSON 字符串
 * @returns Hook 数组；缺失时返回 undefined
 */
function parsePluginHooks(raw: string | null): PluginHookDescriptor[] | undefined {
  if (!raw) {
    return undefined;
  }

  return JSON.parse(raw) as PluginHookDescriptor[];
}

/**
 * 解析 Route JSON 字符串。
 * @param raw 原始 JSON 字符串
 * @returns Route 数组；缺失时返回 undefined
 */
function parsePluginRoutes(raw: string | null): PluginRouteDescriptor[] | undefined {
  if (!raw) {
    return undefined;
  }

  return JSON.parse(raw) as PluginRouteDescriptor[];
}

/**
 * 序列化插件健康摘要。
 * @param plugin 原始 Prisma 插件记录
 * @returns API 侧健康快照
 */
function serializePluginHealth(
  plugin: Record<string, unknown>,
): PluginHealthSnapshot {
  const status = plugin.status === 'offline'
    ? 'offline'
    : (plugin.healthStatus as PluginHealthSnapshot['status'] | undefined) ?? 'unknown';
  return {
    status,
    failureCount: (plugin.failureCount as number | undefined) ?? 0,
    consecutiveFailures: (plugin.consecutiveFailures as number | undefined) ?? 0,
    lastError: (plugin.lastError as string | null | undefined) ?? null,
    lastErrorAt: plugin.lastErrorAt instanceof Date
      ? plugin.lastErrorAt.toISOString()
      : null,
    lastSuccessAt: plugin.lastSuccessAt instanceof Date
      ? plugin.lastSuccessAt.toISOString()
      : null,
    lastCheckedAt: plugin.lastCheckedAt instanceof Date
      ? plugin.lastCheckedAt.toISOString()
      : null,
  };
}
