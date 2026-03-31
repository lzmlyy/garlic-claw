import type {
  PluginActionName,
  PluginActionResult,
  PluginConfigSnapshot,
  PluginConversationSessionInfo,
  PluginEventLevel,
  PluginEventListResult,
  PluginHealthSnapshot,
  PluginInfo,
  PluginScopeSettings,
  PluginStorageEntry,
} from '@garlic-claw/shared';
import type { Plugin as PersistedPluginRecord } from '@prisma/client';
import {
  BadRequestException,
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
import { toJsonValue } from '../common/utils/json-value';
import {
  UpdatePluginConfigDto,
  UpdatePluginScopeDto,
  UpdatePluginStorageDto,
} from './dto/plugin-admin.dto';
import { PluginAdminService } from './plugin-admin.service';
import { PluginCronService } from './plugin-cron.service';
import { describePluginGovernance } from './plugin-governance-policy';
import { parsePersistedPluginManifest } from './plugin-manifest.persistence';
import { PluginRuntimeService } from './plugin-runtime.service';
import { PluginService } from './plugin.service';

@ApiTags('Plugins')
@ApiBearerAuth()
@Controller('plugins')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
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
    return Promise.all(plugins.map(async (p) => {
      const runtimePlugin = runtimePlugins.get(p.name);
      const manifest = runtimePlugin?.manifest ?? buildPersistedManifest(p);
      const governance = describePluginGovernance({
        pluginId: p.name,
        runtimeKind: runtimePlugin?.runtimeKind ?? p.runtimeKind,
      });
      return {
        id: p.id,
        name: p.name,
        displayName: manifest.name,
        description: manifest.description,
        deviceType: p.deviceType,
        status: p.status,
        connected: runtimePlugins.has(p.name),
        runtimeKind: runtimePlugin?.runtimeKind
          ?? (p.runtimeKind === 'builtin' ? 'builtin' : 'remote'),
        version: manifest.version,
        supportedActions: runtimePlugin?.supportedActions
          ?? resolvePersistedSupportedActions(),
        crons: await this.pluginCronService.listCronJobs(p.name),
        manifest,
        health: serializePluginHealth(p, runtimePlugin?.runtimePressure ?? null),
        governance,
        lastSeenAt: p.lastSeenAt ? p.lastSeenAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };
    }));
  }

  @Get('connected')
  getConnectedPlugins() {
    return this.pluginRuntime.listPlugins().map((plugin) => ({
      name: plugin.pluginId,
      runtimeKind: plugin.runtimeKind,
      manifest: plugin.manifest,
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

  @Get(':name/storage')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  listPluginStorage(
    @Param('name') name: string,
    @Query('prefix') prefix?: string,
  ): Promise<PluginStorageEntry[]> {
    return this.pluginService.listPluginStorage(name, prefix?.trim() || undefined);
  }

  @Put(':name/storage')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  async setPluginStorage(
    @Param('name') name: string,
    @Body() dto: UpdatePluginStorageDto,
  ): Promise<PluginStorageEntry> {
    return {
      key: dto.key,
      value: await this.pluginService.setPluginStorage(
        name,
        dto.key,
        toJsonValue(dto.value),
      ),
    };
  }

  @Delete(':name/storage')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  deletePluginStorage(
    @Param('name') name: string,
    @Query('key') key?: string,
  ): Promise<boolean> {
    const normalizedKey = key?.trim();
    if (!normalizedKey) {
      throw new BadRequestException('key 必填');
    }

    return this.pluginService.deletePluginStorage(name, normalizedKey);
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
  async getPluginHealth(@Param('name') name: string): Promise<PluginHealthSnapshot> {
    const health = await this.pluginService.getPluginHealth(name);
    const runtimePressure = this.pluginRuntime.getRuntimePressure(name);
    return runtimePressure
      ? {
        ...health,
        runtimePressure,
      }
      : health;
  }

  @Get(':name/events')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  listPluginEvents(
    @Param('name') name: string,
    @Query('limit') limit?: string,
    @Query('level') level?: string,
    @Query('type') type?: string,
    @Query('keyword') keyword?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PluginEventListResult> {
    return this.pluginService.listPluginEvents(
      name,
      parsePluginEventQuery({
        limit,
        level,
        type,
        keyword,
        cursor,
      }),
    );
  }

  @Get(':name/crons')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  listPluginCrons(@Param('name') name: string) {
    return this.pluginCronService.listCronJobs(name);
  }

  @Delete(':name/crons/:jobId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  deletePluginCron(
    @Param('name') name: string,
    @Param('jobId') jobId: string,
  ): Promise<boolean> {
    return this.pluginCronService.deleteCron(name, jobId);
  }

  @Get(':name/sessions')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  listPluginConversationSessions(
    @Param('name') name: string,
  ): Promise<PluginConversationSessionInfo[]> {
    return Promise.resolve(this.pluginRuntime.listConversationSessions(name));
  }

  @Delete(':name/sessions/:conversationId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  finishPluginConversationSession(
    @Param('name') name: string,
    @Param('conversationId') conversationId: string,
  ): Promise<boolean> {
    return Promise.resolve(
      this.pluginRuntime.finishConversationSessionForGovernance(name, conversationId),
    );
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
    if (!isPluginActionName(action)) {
      throw new BadRequestException(
        'action 必须是 reload / reconnect / health-check',
      );
    }

    return this.pluginAdmin.runAction(name, action);
  }
}

/**
 * 为离线或未接入运行时的插件合成统一 manifest。
 * @param plugin Prisma 插件记录
 * @returns 统一插件清单
 */
function buildPersistedManifest(plugin: PersistedPluginRecord): PluginInfo['manifest'] {
  return parsePersistedPluginManifest(
    typeof plugin.manifestJson === 'string' ? plugin.manifestJson : null,
    {
      id: plugin.name,
      displayName: plugin.displayName,
      description: plugin.description,
      version: plugin.version,
      runtimeKind: plugin.runtimeKind,
    },
  );
}

/**
 * 序列化插件健康摘要。
 * @param plugin 原始 Prisma 插件记录
 * @returns API 侧健康快照
 */
function serializePluginHealth(
  plugin: PersistedPluginRecord,
  runtimePressure: PluginHealthSnapshot['runtimePressure'] | null = null,
): PluginHealthSnapshot {
  const status = plugin.status === 'offline'
    ? 'offline'
    : readPersistedHealthStatus(plugin.healthStatus);
  return {
    status,
    failureCount: plugin.failureCount,
    consecutiveFailures: plugin.consecutiveFailures,
    lastError: plugin.lastError,
    lastErrorAt: plugin.lastErrorAt instanceof Date
      ? plugin.lastErrorAt.toISOString()
      : null,
    lastSuccessAt: plugin.lastSuccessAt instanceof Date
      ? plugin.lastSuccessAt.toISOString()
      : null,
    lastCheckedAt: plugin.lastCheckedAt instanceof Date
      ? plugin.lastCheckedAt.toISOString()
      : null,
    ...(runtimePressure ? { runtimePressure } : {}),
  };
}

function readPersistedHealthStatus(
  value: string | null,
): PluginHealthSnapshot['status'] {
  switch (value) {
    case 'healthy':
    case 'degraded':
    case 'error':
    case 'offline':
    case 'unknown':
      return value;
    default:
      return 'unknown';
  }
}

/**
 * 为未接入当前 runtime 的插件记录提供保守治理动作回退。
 * @returns 最小治理动作列表
 */
function resolvePersistedSupportedActions(): PluginActionName[] {
  return ['health-check'];
}

function isPluginActionName(action: string): action is PluginActionName {
  return action === 'reload' || action === 'reconnect' || action === 'health-check';
}

/**
 * 解析插件事件日志查询参数。
 * @param raw 原始查询参数
 * @returns 归一化后的查询对象
 */
function parsePluginEventQuery(raw: {
  limit?: string;
  level?: string;
  type?: string;
  keyword?: string;
  cursor?: string;
}): {
  limit?: number;
  level?: PluginEventLevel;
  type?: string;
  keyword?: string;
  cursor?: string;
} {
  const limit = raw.limit ? Number(raw.limit) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
    throw new BadRequestException('limit 必须是正整数');
  }

  let level: PluginEventLevel | undefined;
  if (raw.level) {
    if (raw.level !== 'info' && raw.level !== 'warn' && raw.level !== 'error') {
      throw new BadRequestException('level 必须是 info / warn / error');
    }
    level = raw.level;
  }

  const type = raw.type?.trim() || undefined;
  const keyword = raw.keyword?.trim() || undefined;
  const cursor = raw.cursor?.trim() || undefined;

  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(level ? { level } : {}),
    ...(type ? { type } : {}),
    ...(keyword ? { keyword } : {}),
    ...(cursor ? { cursor } : {}),
  };
}
