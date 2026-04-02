import type {
  JsonObject,
  PluginConfigSnapshot,
  PluginHealthSnapshot,
  PluginScopeSettings,
  PluginSelfInfo,
  PluginEventListResult,
} from '@garlic-claw/shared';
import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPluginEventFindManyInput,
  buildPluginEventListResult,
  buildPluginHealthSnapshot,
  normalizePluginEventOptions,
  resolvePluginEventCursor,
  type ListPluginEventOptions,
} from './plugin-event.helpers';
import { buildPluginGovernanceSnapshot } from './plugin-governance.helpers';
import { parsePluginScope } from './plugin-persistence.helpers';
import {
  buildPluginConfigSnapshot,
  buildPluginSelfInfo,
  buildResolvedPluginConfig,
} from './plugin-record-view.helpers';
import type { PluginGovernanceSnapshot } from './plugin-lifecycle-write.service';

@Injectable()
export class PluginReadService {
  private readonly logger = new Logger(PluginReadService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getGovernanceSnapshot(name: string): Promise<PluginGovernanceSnapshot> {
    const plugin = await this.findByNameOrThrow(name);
    return buildPluginGovernanceSnapshot({
      plugin,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  async findAll() {
    return this.prisma.plugin.findMany({ orderBy: { name: 'asc' } });
  }

  async findOnline() {
    return this.prisma.plugin.findMany({
      where: { status: 'online' },
      orderBy: { name: 'asc' },
    });
  }

  async findByName(name: string) {
    return this.prisma.plugin.findUnique({ where: { name } });
  }

  async findByNameOrThrow(name: string) {
    const plugin = await this.findByName(name);
    if (!plugin) {
      throw new NotFoundException(`Plugin not found: ${name}`);
    }

    return plugin;
  }

  async getPluginConfig(name: string): Promise<PluginConfigSnapshot> {
    const plugin = await this.findByNameOrThrow(name);
    return buildPluginConfigSnapshot({
      plugin,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  async getResolvedConfig(name: string): Promise<JsonObject> {
    const plugin = await this.findByNameOrThrow(name);
    return buildResolvedPluginConfig({
      plugin,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  async getPluginSelfInfo(name: string): Promise<PluginSelfInfo> {
    const plugin = await this.findByNameOrThrow(name);
    return buildPluginSelfInfo({
      plugin,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  async getPluginScope(name: string): Promise<PluginScopeSettings> {
    const plugin = await this.findByNameOrThrow(name);
    return parsePluginScope({
      plugin,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  async getPluginHealth(name: string): Promise<PluginHealthSnapshot> {
    const plugin = await this.findByNameOrThrow(name);
    return buildPluginHealthSnapshot({
      plugin,
    });
  }

  async listPluginEvents(
    name: string,
    options: ListPluginEventOptions = {},
  ): Promise<PluginEventListResult> {
    const plugin = await this.findByNameOrThrow(name);
    const normalized = normalizePluginEventOptions(options);
    const cursorEvent = normalized.cursor
      ? await resolvePluginEventCursor({
        prisma: this.prisma,
        pluginId: plugin.id,
        cursor: normalized.cursor,
      })
      : null;
    const events = await this.prisma.pluginEvent.findMany({
      ...buildPluginEventFindManyInput({
        pluginId: plugin.id,
        options: normalized,
        cursorEvent,
      }),
    });
    return buildPluginEventListResult({
      events,
      limit: normalized.limit,
      onWarn: (message) => this.logger.warn(message),
    });
  }
}
