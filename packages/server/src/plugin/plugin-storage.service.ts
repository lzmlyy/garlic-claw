import type { JsonValue } from '@garlic-claw/shared';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPluginStorageEntries,
  buildPluginStorageKey,
  buildPluginStorageListWhere,
  buildPluginStorageUpsertData,
  readPluginStorageValue,
} from './plugin-storage.helpers';

@Injectable()
export class PluginStorageService {
  private readonly logger = new Logger(PluginStorageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getPluginStorage(name: string, key: string): Promise<JsonValue | null> {
    const plugin = await this.findByNameOrThrow(name);
    const entry = await this.prisma.pluginStorage.findUnique({
      where: buildPluginStorageKey(plugin.id, key),
    });
    if (!entry) {
      return null;
    }

    return readPluginStorageValue({
      pluginName: name,
      key,
      raw: entry.valueJson,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  async setPluginStorage(
    name: string,
    key: string,
    value: JsonValue,
  ): Promise<JsonValue> {
    const plugin = await this.findByNameOrThrow(name);
    await this.prisma.pluginStorage.upsert(
      buildPluginStorageUpsertData({
        pluginId: plugin.id,
        key,
        value,
      }),
    );

    return value;
  }

  async deletePluginStorage(name: string, key: string): Promise<boolean> {
    const plugin = await this.findByNameOrThrow(name);
    const deleted = await this.prisma.pluginStorage.deleteMany({
      where: {
        pluginId: plugin.id,
        key,
      },
    });

    return deleted.count > 0;
  }

  async listPluginStorage(
    name: string,
    prefix?: string,
  ): Promise<Array<{ key: string; value: JsonValue }>> {
    const plugin = await this.findByNameOrThrow(name);
    const entries = await this.prisma.pluginStorage.findMany({
      where: buildPluginStorageListWhere({
        pluginId: plugin.id,
        prefix,
      }),
      orderBy: {
        key: 'asc',
      },
    });

    return buildPluginStorageEntries({
      pluginName: name,
      entries,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  private async findByNameOrThrow(name: string) {
    const plugin = await this.prisma.plugin.findUnique({ where: { name } });
    if (!plugin) {
      throw new NotFoundException(`Plugin not found: ${name}`);
    }

    return plugin;
  }
}
