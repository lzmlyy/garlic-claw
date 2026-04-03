import type {
  PluginActionName,
  PluginActionResult,
  PluginConfigSnapshot,
  PluginConversationSessionInfo,
  PluginEventLevel,
  PluginEventListResult,
  PluginHealthSnapshot,
  PluginInfo,
  RemotePluginBootstrapInfo,
  PluginScopeSettings,
  PluginStorageEntry,
} from '@garlic-claw/shared';
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
  CreateRemotePluginBootstrapDto,
  UpdatePluginConfigDto,
  UpdatePluginScopeDto,
  UpdatePluginStorageDto,
} from './dto/plugin-admin.dto';
import { PluginAdminService } from './plugin-admin.service';
import { PluginCronService } from './plugin-cron.service';
import { buildPluginHealthSnapshot } from './plugin-event.helpers';
import { describePluginGovernance } from './plugin-governance-policy';
import { parsePersistedPluginManifest } from './plugin-manifest.persistence';
import { readNonEmptyString } from './plugin-manifest-normalize-base.helpers';
import { PluginRemoteBootstrapService } from './plugin-remote-bootstrap.service';
import { PluginRuntimeOrchestratorService } from './plugin-runtime-orchestrator.service';
import { PluginRuntimeService } from './plugin-runtime.service';
import { PluginService } from './plugin.service';

const PERSISTED_SUPPORTED_ACTIONS: PluginActionName[] = ['health-check'];

@ApiTags('Plugins')
@ApiBearerAuth()
@Controller('plugins')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class PluginController {
  constructor(
    private pluginService: PluginService,
    private pluginRuntime: PluginRuntimeService,
    private pluginRuntimeOrchestrator: PluginRuntimeOrchestratorService,
    private pluginCronService: PluginCronService,
    private pluginAdmin: PluginAdminService,
    private pluginRemoteBootstrap: PluginRemoteBootstrapService,
  ) {}

  @Get()
  async listPlugins(): Promise<PluginInfo[]> {
    const plugins = await this.pluginService.findAll();
    const runtimePlugins = new Map(
      this.pluginRuntime.listPlugins().map((plugin) => [plugin.pluginId, plugin]),
    );
    return Promise.all(plugins.map(async (p) => {
      const runtimePlugin = runtimePlugins.get(p.name);
      const manifest = runtimePlugin?.manifest ?? parsePersistedPluginManifest(
        typeof p.manifestJson === 'string' ? p.manifestJson : null,
        {
          id: p.name,
          displayName: p.displayName,
          description: p.description,
          version: p.version,
          runtimeKind: p.runtimeKind,
        },
      );
      const health = buildPluginHealthSnapshot({ plugin: p });
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
          ?? PERSISTED_SUPPORTED_ACTIONS,
        crons: await this.pluginCronService.listCronJobs(p.name),
        manifest,
        health: runtimePlugin?.runtimePressure
          ? {
            ...health,
            runtimePressure: runtimePlugin.runtimePressure,
          }
          : health,
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

  @Post('remote/bootstrap')
  createRemoteBootstrap(
    @Body() dto: CreateRemotePluginBootstrapDto,
  ): Promise<RemotePluginBootstrapInfo> {
    return this.pluginRemoteBootstrap.issueBootstrap({
      pluginName: dto.pluginName,
      deviceType: dto.deviceType,
      ...(dto.displayName ? { displayName: dto.displayName } : {}),
      ...(dto.description ? { description: dto.description } : {}),
      ...(dto.version ? { version: dto.version } : {}),
    });
  }

  @Delete(':name')
  deletePlugin(@Param('name') name: string) {
    return this.pluginService.deletePlugin(name);
  }

  @Get(':name/config')
  getPluginConfig(@Param('name') name: string): Promise<PluginConfigSnapshot> {
    return this.pluginService.getPluginConfig(name);
  }

  @Put(':name/config')
  async updatePluginConfig(
    @Param('name') name: string,
    @Body() dto: UpdatePluginConfigDto,
  ): Promise<PluginConfigSnapshot> {
    const result = await this.pluginService.updatePluginConfig(name, dto.values);
    await this.pluginRuntimeOrchestrator.refreshPluginGovernance(name);
    return result;
  }

  @Get(':name/storage')
  listPluginStorage(
    @Param('name') name: string,
    @Query('prefix') prefix?: string,
  ): Promise<PluginStorageEntry[]> {
    return this.pluginService.listPluginStorage(name, prefix?.trim() || undefined);
  }

  @Put(':name/storage')
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
  getPluginScope(@Param('name') name: string): Promise<PluginScopeSettings> {
    return this.pluginService.getPluginScope(name);
  }

  @Get(':name/health')
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
  listPluginCrons(@Param('name') name: string) {
    return this.pluginCronService.listCronJobs(name);
  }

  @Delete(':name/crons/:jobId')
  deletePluginCron(
    @Param('name') name: string,
    @Param('jobId') jobId: string,
  ): Promise<boolean> {
    return this.pluginCronService.deleteCron(name, jobId);
  }

  @Get(':name/sessions')
  async listPluginConversationSessions(
    @Param('name') name: string,
  ): Promise<PluginConversationSessionInfo[]> {
    return this.pluginRuntime.listConversationSessions(name);
  }

  @Delete(':name/sessions/:conversationId')
  async finishPluginConversationSession(
    @Param('name') name: string,
    @Param('conversationId') conversationId: string,
  ): Promise<boolean> {
    return this.pluginRuntime.finishConversationSessionForGovernance(
      name,
      conversationId,
    );
  }

  @Put(':name/scopes')
  async updatePluginScope(
    @Param('name') name: string,
    @Body() dto: UpdatePluginScopeDto,
  ): Promise<PluginScopeSettings> {
    const currentScope = await this.pluginService.getPluginScope(name);
    const result = await this.pluginService.updatePluginScope(name, {
      defaultEnabled: currentScope.defaultEnabled,
      conversations: dto.conversations ?? currentScope.conversations,
    });
    await this.pluginRuntimeOrchestrator.refreshPluginGovernance(name);
    return result;
  }

  @Post(':name/actions/:action')
  runPluginAction(
    @Param('name') name: string,
    @Param('action') action: string,
  ): Promise<PluginActionResult> {
    if (
      action !== 'reload'
      && action !== 'reconnect'
      && action !== 'health-check'
    ) {
      throw new BadRequestException(
        'action 必须是 reload / reconnect / health-check',
      );
    }

    return this.pluginAdmin.runAction(name, action);
  }
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

  const type = readNonEmptyString(raw.type) ?? undefined;
  const keyword = readNonEmptyString(raw.keyword) ?? undefined;
  const cursor = readNonEmptyString(raw.cursor) ?? undefined;

  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(level ? { level } : {}),
    ...(type ? { type } : {}),
    ...(keyword ? { keyword } : {}),
    ...(cursor ? { cursor } : {}),
  };
}
