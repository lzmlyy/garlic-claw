import type {
  JsonObject,
  PluginEventLevel,
} from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createPluginEvent } from './plugin-event.helpers';
import {
  buildPluginHealthCheckRecordInput,
  preparePluginFailurePersistence,
  preparePluginSuccessPersistence,
} from './plugin-health.helpers';

interface PluginEventInput {
  type: string;
  message: string;
  metadata?: JsonObject;
}

@Injectable()
export class PluginEventWriteService {
  constructor(private readonly prisma: PrismaService) {}

  async recordPluginEvent(
    name: string,
    input: PluginEventInput & {
      level: PluginEventLevel;
    },
  ): Promise<void> {
    const plugin = await this.findByNameOrThrow(name);
    await createPluginEvent({
      prisma: this.prisma,
      pluginId: plugin.id,
      type: input.type,
      level: input.level,
      message: input.message,
      metadata: input.metadata,
    });
  }

  async recordPluginSuccess(
    name: string,
    input: PluginEventInput & {
      checked?: boolean;
      persistEvent?: boolean;
    },
  ): Promise<void> {
    const plugin = await this.findByNameOrThrow(name);
    const now = new Date();
    const prepared = preparePluginSuccessPersistence({
      plugin,
      event: input,
      checked: input.checked,
      persistEvent: input.persistEvent,
      now,
    });
    await this.prisma.plugin.update({
      where: {
        name,
      },
      data: prepared.updateData,
    });
    if (prepared.event) {
      await createPluginEvent({
        prisma: this.prisma,
        pluginId: plugin.id,
        ...prepared.event,
      });
    }
  }

  async recordPluginFailure(
    name: string,
    input: PluginEventInput & {
      checked?: boolean;
    },
  ): Promise<void> {
    const plugin = await this.findByNameOrThrow(name);
    const now = new Date();
    const prepared = preparePluginFailurePersistence({
      plugin,
      event: input,
      checked: input.checked,
      now,
    });
    await this.prisma.plugin.update({
      where: {
        name,
      },
      data: prepared.updateData,
    });
    await createPluginEvent({
      prisma: this.prisma,
      pluginId: plugin.id,
      ...prepared.event,
    });
  }

  async recordHealthCheck(
    name: string,
    input: {
      ok: boolean;
      message: string;
      metadata?: JsonObject;
    },
  ): Promise<void> {
    const healthCheckInput = buildPluginHealthCheckRecordInput(input);
    if (input.ok) {
      await this.recordPluginSuccess(name, healthCheckInput);
      return;
    }

    await this.recordPluginFailure(name, healthCheckInput);
  }

  private async findByNameOrThrow(name: string) {
    const plugin = await this.prisma.plugin.findUnique({ where: { name } });
    if (!plugin) {
      throw new NotFoundException(`Plugin not found: ${name}`);
    }

    return plugin;
  }
}
