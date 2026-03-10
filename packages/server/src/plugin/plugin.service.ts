import type { PluginCapability } from '@garlic-claw/shared';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PluginService {
  private readonly logger = new Logger(PluginService.name);

  constructor(private prisma: PrismaService) {}

  async registerPlugin(
    name: string,
    deviceType: string,
    capabilities: PluginCapability[],
  ) {
    const plugin = await this.prisma.plugin.upsert({
      where: { name },
      create: {
        name,
        deviceType,
        status: 'online',
        capabilities: JSON.stringify(capabilities),
        lastSeenAt: new Date(),
      },
      update: {
        deviceType,
        status: 'online',
        capabilities: JSON.stringify(capabilities),
        lastSeenAt: new Date(),
      },
    });
    this.logger.log(`插件 "${name}" 已注册，包含 ${capabilities.length} 个能力`);
    return plugin;
  }

  async setOnline(name: string) {
    return this.prisma.plugin.update({
      where: { name },
      data: { status: 'online', lastSeenAt: new Date() },
    });
  }

  async setOffline(name: string) {
    return this.prisma.plugin.update({
      where: { name },
      data: { status: 'offline' },
    });
  }

  async heartbeat(name: string) {
    return this.prisma.plugin.update({
      where: { name },
      data: { lastSeenAt: new Date() },
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

  async deletePlugin(name: string) {
    return this.prisma.plugin.delete({ where: { name } });
  }

  /**
   * 获取所有在线插件的能力。
   * 返回一个映射：pluginName → capabilities[]
   */
  async getOnlineCapabilities(): Promise<
    Map<string, PluginCapability[]>
  > {
    const plugins = await this.findOnline();
    const map = new Map<string, PluginCapability[]>();
    for (const p of plugins) {
      if (p.capabilities) {
        try {
          map.set(p.name, JSON.parse(p.capabilities));
        } catch {
          this.logger.warn(`插件 "${p.name}" 的能力 JSON 无效`);
        }
      }
    }
    return map;
  }
}
