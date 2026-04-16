import {
  type DeviceType,
  type JsonObject,
  type JsonValue,
  type PluginActionName,
  type PluginCommandOverview,
  type PluginSubagentTaskDetail,
  type PluginSubagentTaskOverview,
} from '@garlic-claw/shared';
import {
  All,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  Inject,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../../auth/http-auth';
import {
  buildPluginCommandConflicts,
  buildPluginInfo,
  listPluginCommands,
} from '../../../plugin/persistence/plugin-read-model';
import { PluginPersistenceService } from '../../../plugin/persistence/plugin-persistence.service';
import { PluginBootstrapService } from '../../../plugin/bootstrap/plugin-bootstrap.service';
import { RuntimeHostConversationRecordService } from '../../../runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostPluginDispatchService } from '../../../runtime/host/runtime-host-plugin-dispatch.service';
import { RuntimeHostPluginRuntimeService } from '../../../runtime/host/runtime-host-plugin-runtime.service';
import { RuntimeHostSubagentRunnerService } from '../../../runtime/host/runtime-host-subagent-runner.service';
import { RuntimePluginGovernanceService } from '../../../runtime/kernel/runtime-plugin-governance.service';
import { readPluginEventQuery, readPluginRouteInvocation, writePluginRouteResponse } from '../http-request.codec';

interface CreateRemotePluginBootstrapDto {
  description?: string;
  deviceType: DeviceType;
  displayName?: string;
  pluginName: string;
  version?: string;
}

interface UpdatePluginConfigDto { values: JsonObject; }
interface UpdatePluginScopeDto { defaultEnabled?: boolean; conversations?: Record<string, boolean>; }
interface UpdatePluginStorageDto { key: string; value: JsonValue; }
interface PluginEventQueryInput { limit?: string; level?: string; type?: string; keyword?: string; cursor?: string; }

@Controller()
export class PluginController {
  constructor(
    private readonly pluginBootstrapService: PluginBootstrapService,
    private readonly pluginPersistenceService: PluginPersistenceService,
    private readonly runtimeHostConversationRecordService: RuntimeHostConversationRecordService,
    @Inject(RuntimeHostPluginDispatchService)
    private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService,
    private readonly runtimeHostPluginRuntimeService: RuntimeHostPluginRuntimeService,
    private readonly runtimeHostSubagentRunnerService: RuntimeHostSubagentRunnerService,
    private readonly runtimePluginGovernanceService: RuntimePluginGovernanceService,
  ) {}

  @Get('plugins')
  listPlugins() {
    return this.runtimePluginGovernanceService.listPlugins().map((plugin) =>
      buildPluginInfo(plugin, this.runtimePluginGovernanceService.listSupportedActions(plugin.pluginId)));
  }

  @Get('plugins/connected')
  getConnectedPlugins() {
    return this.runtimePluginGovernanceService.listConnectedPlugins().map((plugin) => ({
      manifest: plugin.manifest,
      name: plugin.pluginId,
      runtimeKind: plugin.manifest.runtime,
    }));
  }

  @Get('plugins/:pluginId/health')
  getPluginHealth(@Param('pluginId') pluginId: string) {
    return this.runtimePluginGovernanceService.checkPluginHealth(pluginId);
  }

  @Post('plugins/remote/bootstrap')
  createRemoteBootstrap(@Body() dto: CreateRemotePluginBootstrapDto) {
    return this.pluginBootstrapService.issueRemoteBootstrap(dto);
  }

  @Delete('plugins/:pluginId')
  deletePlugin(@Param('pluginId') pluginId: string) {
    const deleted = this.pluginPersistenceService.deletePlugin(pluginId);
    this.recordPluginEvent(pluginId, { level: 'warn', message: `Deleted plugin ${pluginId}`, type: 'plugin:deleted' });
    return deleted;
  }

  @Get('plugins/:pluginId/config')
  getPluginConfig(@Param('pluginId') pluginId: string) {
    return this.pluginPersistenceService.getPluginConfig(pluginId);
  }

  @Put('plugins/:pluginId/config')
  updatePluginConfig(
    @Param('pluginId') pluginId: string,
    @Body() dto: UpdatePluginConfigDto,
  ) {
    const snapshot = this.pluginPersistenceService.updatePluginConfig(pluginId, dto.values);
    this.recordPluginEvent(pluginId, { message: `Updated plugin config for ${pluginId}`, metadata: { keys: Object.keys(dto.values) }, type: 'plugin:config.updated' });
    return snapshot;
  }

  @Get('plugins/:pluginId/scopes')
  getPluginScope(@Param('pluginId') pluginId: string) {
    return this.pluginPersistenceService.getPluginScope(pluginId);
  }

  @Get('plugins/:pluginId/events')
  listPluginEvents(@Param('pluginId') pluginId: string, @Query() query?: PluginEventQueryInput) {
    return this.pluginPersistenceService.listPluginEvents(pluginId, readPluginEventQuery(query ?? {}));
  }

  @Put('plugins/:pluginId/scopes')
  updatePluginScope(
    @Param('pluginId') pluginId: string,
    @Body() dto: UpdatePluginScopeDto,
  ) {
    const scope = this.pluginPersistenceService.updatePluginScope(pluginId, dto);
    this.recordPluginEvent(pluginId, { message: `Updated plugin scope for ${pluginId}`, metadata: { conversationCount: Object.keys(scope.conversations).length }, type: 'plugin:scope.updated' });
    return scope;
  }

  @Post('plugins/:pluginId/actions/:action')
  async runPluginAction(
    @Param('pluginId') pluginId: string,
    @Param('action') action: string,
  ) {
    const result = await this.runtimePluginGovernanceService.runPluginAction({
      action: readPluginActionName(action),
      pluginId,
    });
    this.recordPluginEvent(pluginId, { level: result.action === 'health-check' && result.message.includes('失败') ? 'warn' : 'info', message: result.message, type: `governance:${result.action}` });
    return result;
  }

  @Get('plugins/:pluginId/storage')
  listPluginStorage(@Param('pluginId') pluginId: string, @Query('prefix') prefix?: string) {
    return this.runtimeHostPluginRuntimeService.listPluginStorage(pluginId, prefix?.trim() || undefined);
  }

  @Put('plugins/:pluginId/storage')
  setPluginStorage(
    @Param('pluginId') pluginId: string,
    @Body() dto: UpdatePluginStorageDto,
  ) {
    const entry = { key: dto.key, value: this.runtimeHostPluginRuntimeService.setPluginStorage(pluginId, dto.key, dto.value) };
    this.recordPluginEvent(pluginId, { message: `Updated plugin storage key ${dto.key}`, metadata: { key: dto.key }, type: 'plugin:storage.updated' });
    return entry;
  }

  @Delete('plugins/:pluginId/storage')
  deletePluginStorage(@Param('pluginId') pluginId: string, @Query('key') key?: string) {
    if (!key?.trim()) {throw new BadRequestException('key 必填');}
    const normalizedKey = key.trim();
    const deleted = this.runtimeHostPluginRuntimeService.deletePluginStorage(pluginId, normalizedKey);
    if (deleted) {
      this.recordPluginEvent(pluginId, { message: `Deleted plugin storage key ${normalizedKey}`, metadata: { key: normalizedKey }, type: 'plugin:storage.deleted' });
    }
    return deleted;
  }

  @Get('plugins/:pluginId/crons')
  listPluginCrons(@Param('pluginId') pluginId: string) {
    return this.runtimeHostPluginRuntimeService.listCronJobs(pluginId);
  }

  @Delete('plugins/:pluginId/crons/:jobId')
  deletePluginCron(@Param('pluginId') pluginId: string, @Param('jobId') jobId: string) {
    return this.runtimeHostPluginRuntimeService.deleteCronJob(pluginId, { jobId }) as boolean;
  }

  @Get('plugins/:pluginId/sessions')
  listPluginConversationSessions(@Param('pluginId') pluginId: string) {
    return this.runtimeHostConversationRecordService.listPluginConversationSessions(pluginId);
  }

  @Delete('plugins/:pluginId/sessions/:conversationId')
  finishPluginConversationSession(
    @Param('pluginId') pluginId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.runtimeHostConversationRecordService.finishPluginConversationSession(pluginId, conversationId);
  }

  @Get('plugin-commands/overview')
  async listCommandOverview(): Promise<PluginCommandOverview> {
    const commands = this.runtimePluginGovernanceService.listPlugins().flatMap((plugin) => listPluginCommands(plugin, plugin.connected));
    return { commands, conflicts: buildPluginCommandConflicts(commands) };
  }

  @Get('plugin-subagent-tasks/overview')
  listSubagentTaskOverview(): PluginSubagentTaskOverview {
    return this.runtimeHostSubagentRunnerService.listOverview();
  }

  @Get('plugin-subagent-tasks/:taskId')
  getSubagentTask(@Param('taskId') taskId: string): PluginSubagentTaskDetail {
    return this.runtimeHostSubagentRunnerService.getTaskOrThrow(taskId);
  }

  private recordPluginEvent(inputPluginId: string, input: {
    level?: 'error' | 'info' | 'warn';
    message: string;
    metadata?: JsonObject;
    type: string;
  }): void {
    this.pluginPersistenceService.recordPluginEvent(inputPluginId, {
      level: input.level ?? 'info',
      message: input.message,
      ...(input.metadata ? { metadata: input.metadata } : {}),
      type: input.type,
    });
  }

  @All('plugin-routes/:pluginId/*path')
  @UseGuards(JwtAuthGuard)
  async handleRoute(
    @Param('pluginId') pluginId: string,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<JsonValue> {
    const route = readPluginRouteInvocation(req, query);
    const result = await this.runtimeHostPluginDispatchService.invokeRoute({
      pluginId,
      request: route.request,
      context: route.context,
    });
    return writePluginRouteResponse(res, result);
  }

}

function readPluginActionName(action: string): PluginActionName {
  if (action === 'health-check' || action === 'reload' || action === 'reconnect') {return action;}
  throw new BadRequestException('action 必须是 reload / reconnect / health-check');
}
