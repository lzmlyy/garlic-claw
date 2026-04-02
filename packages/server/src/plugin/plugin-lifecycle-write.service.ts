import type {
  JsonObject,
  PluginConfigSchema,
  PluginManifest,
  PluginScopeSettings,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createPluginEvent } from './plugin-event.helpers';
import { buildPluginGovernanceSnapshot } from './plugin-governance.helpers';
import {
  buildPluginHeartbeatMutation,
  buildPluginLifecycleEvent,
  buildPluginOfflineMutation,
  buildPluginOnlineMutation,
} from './plugin-lifecycle.helpers';
import {
  buildPluginRegistrationEvent,
  buildPluginRegistrationUpsertData,
} from './plugin-register.helpers';

export interface PluginGovernanceSnapshot {
  configSchema: PluginConfigSchema | null;
  resolvedConfig: JsonObject;
  scope: PluginScopeSettings;
}

@Injectable()
export class PluginLifecycleWriteService {
  private readonly logger = new Logger(PluginLifecycleWriteService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registerPlugin(
    name: string,
    deviceType: string,
    manifest: PluginManifest,
  ): Promise<PluginGovernanceSnapshot> {
    const existing = await this.prisma.plugin.findUnique({
      where: { name },
      select: {
        id: true,
      },
    });
    const now = new Date();
    const plugin = await this.prisma.plugin.upsert({
      where: { name },
      ...buildPluginRegistrationUpsertData({
        name,
        deviceType,
        manifest,
        now,
      }),
    });
    const registrationEvent = buildPluginRegistrationEvent({
      existing: Boolean(existing),
    });
    await createPluginEvent({
      prisma: this.prisma,
      pluginId: plugin.id,
      type: registrationEvent.type,
      level: 'info',
      message: registrationEvent.message,
    });
    if (existing) {
      this.logger.log(`插件 "${name}" 已重新接入运行时，包含 ${(manifest.tools ?? []).length} 个能力`);
    } else {
      this.logger.log(`插件 "${name}" 已注册，包含 ${(manifest.tools ?? []).length} 个能力`);
    }
    return buildPluginGovernanceSnapshot({
      plugin,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  async setOnline(name: string) {
    const now = new Date();
    const updated = await this.prisma.plugin.update({
      where: { name },
      data: buildPluginOnlineMutation(now),
    });
    const lifecycleEvent = buildPluginLifecycleEvent({
      status: 'online',
    });
    await createPluginEvent({
      prisma: this.prisma,
      pluginId: updated.id,
      type: lifecycleEvent.type,
      level: lifecycleEvent.level,
      message: lifecycleEvent.message,
    });
    return updated;
  }

  async setOffline(name: string) {
    const updated = await this.prisma.plugin.update({
      where: { name },
      data: buildPluginOfflineMutation(),
    });
    const lifecycleEvent = buildPluginLifecycleEvent({
      status: 'offline',
    });
    await createPluginEvent({
      prisma: this.prisma,
      pluginId: updated.id,
      type: lifecycleEvent.type,
      level: lifecycleEvent.level,
      message: lifecycleEvent.message,
    });
    return updated;
  }

  async heartbeat(name: string) {
    const now = new Date();
    return this.prisma.plugin.update({
      where: { name },
      data: buildPluginHeartbeatMutation(now),
    });
  }

  async deletePlugin(name: string) {
    const plugin = await this.prisma.plugin.findUnique({
      where: { name },
    });
    if (!plugin) {
      return null;
    }
    if (plugin.status === 'online') {
      throw new BadRequestException(`插件 ${name} 当前在线，不能直接删除`);
    }

    return this.prisma.plugin.delete({ where: { name } });
  }
}
