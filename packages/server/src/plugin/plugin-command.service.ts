import type { PluginCommandConflict, PluginCommandConflictEntry, PluginCommandDescriptor, PluginCommandInfo, PluginCommandOverview, PluginHookDescriptor } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { describePluginGovernance } from './plugin-governance-policy';
import { parsePersistedPluginManifest } from './plugin-manifest.persistence';
import { PluginRuntimeService } from './plugin-runtime.service';
import { PluginService } from './plugin.service';

type PersistedPluginRecord = Awaited<ReturnType<PluginService['findAll']>>[number];
type RuntimePluginRecord = ReturnType<PluginRuntimeService['listPlugins']>[number];

@Injectable()
export class PluginCommandService {
  constructor(private readonly pluginService: PluginService, private readonly pluginRuntime: PluginRuntimeService) {}

  async listOverview(): Promise<PluginCommandOverview> {
    const [persistedPlugins, runtimePlugins] = await Promise.all([
      this.pluginService.findAll(),
      Promise.resolve(this.pluginRuntime.listPlugins()),
    ]);
    const runtimeByPluginId = new Map(
      runtimePlugins.map((plugin: RuntimePluginRecord) => [plugin.pluginId, plugin]),
    );
    const baseCommands = persistedPlugins.flatMap((plugin: PersistedPluginRecord) =>
      this.buildCommandInfos(plugin, runtimeByPluginId.get(plugin.name) ?? null));
    const conflicts = this.buildConflicts(baseCommands);
    const conflictTriggersByCommandId = new Map<string, string[]>();

    for (const conflict of conflicts) {
      for (const command of conflict.commands) {
        const triggers = conflictTriggersByCommandId.get(command.commandId);
        if (triggers) {
          triggers.push(conflict.trigger);
        } else {
          conflictTriggersByCommandId.set(command.commandId, [conflict.trigger]);
        }
      }
    }

    const commands = baseCommands
      .map((command: PluginCommandInfo) => ({
        ...command,
        conflictTriggers: dedupeStrings(conflictTriggersByCommandId.get(command.commandId) ?? []),
      }))
      .sort((left: PluginCommandInfo, right: PluginCommandInfo) => {
        const conflictDiff = right.conflictTriggers.length - left.conflictTriggers.length;
        if (conflictDiff !== 0) {
          return conflictDiff;
        }

        const priorityDiff = comparePluginCommandPriority(left, right);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        const pluginDiff = (left.pluginDisplayName ?? left.pluginId).localeCompare(
          right.pluginDisplayName ?? right.pluginId,
          'zh-CN',
        );
        if (pluginDiff !== 0) {
          return pluginDiff;
        }

        return left.canonicalCommand.localeCompare(right.canonicalCommand, 'zh-CN');
      });

    return {
      commands,
      conflicts,
    };
  }

  private buildCommandInfos(
    plugin: PersistedPluginRecord,
    runtimePlugin: RuntimePluginRecord | null,
  ): PluginCommandInfo[] {
    const runtimeKind = runtimePlugin?.runtimeKind === 'builtin' || plugin.runtimeKind === 'builtin'
      ? 'builtin'
      : 'remote';
    const governance = describePluginGovernance({
      pluginId: plugin.name,
      runtimeKind,
    });
    const descriptors = this.resolveCommandDescriptors(plugin, runtimePlugin);

    return descriptors.map(({ descriptor, source }) => ({
      ...descriptor,
      commandId: `${plugin.name}:${descriptor.canonicalCommand}:${descriptor.kind}`,
      pluginId: plugin.name,
      pluginDisplayName: runtimePlugin?.manifest.name ?? plugin.displayName ?? plugin.name,
      runtimeKind,
      connected: Boolean(runtimePlugin),
      defaultEnabled: plugin.defaultEnabled,
      source,
      governance,
      conflictTriggers: [],
    }));
  }

  private resolveCommandDescriptors(
    plugin: PersistedPluginRecord,
    runtimePlugin: RuntimePluginRecord | null,
  ): Array<{
    descriptor: PluginCommandDescriptor;
    source: PluginCommandInfo['source'];
  }> {
    const persistedManifest = parsePersistedPluginManifest(plugin.manifestJson, {
      id: plugin.name,
      displayName: plugin.displayName,
      description: plugin.description,
      version: plugin.version,
      runtimeKind: plugin.runtimeKind,
    });
    const manifestCommands = runtimePlugin?.manifest.commands ?? persistedManifest.commands ?? [];
    if (manifestCommands.length > 0) {
      return manifestCommands.map((descriptor: PluginCommandDescriptor) => ({
        descriptor: cloneCommandDescriptor(descriptor),
        source: 'manifest' as const,
      }));
    }

    const hooks = runtimePlugin?.manifest.hooks ?? persistedManifest.hooks ?? [];
    return extractCommandsFromHooks(hooks).map((descriptor: PluginCommandDescriptor) => ({
      descriptor,
      source: 'hook-filter' as const,
    }));
  }

  private buildConflicts(commands: PluginCommandInfo[]): PluginCommandConflict[] {
    const triggerMap = new Map<string, PluginCommandInfo[]>();

    for (const command of commands) {
      for (const trigger of command.variants) {
        const existing = triggerMap.get(trigger);
        if (existing) {
          existing.push(command);
        } else {
          triggerMap.set(trigger, [command]);
        }
      }
    }

    return [...triggerMap.entries()]
      .map(([trigger, relatedCommands]) => ({
        trigger,
        commands: [...new Map(
          relatedCommands.map((command) => [command.commandId, command]),
        ).values()]
          .sort((left, right) => {
            const priorityDiff = comparePluginCommandPriority(left, right);
            if (priorityDiff !== 0) {
              return priorityDiff;
            }

            return left.pluginId.localeCompare(right.pluginId, 'zh-CN');
          })
          .map((command): PluginCommandConflictEntry => ({
            commandId: command.commandId,
            pluginId: command.pluginId,
            pluginDisplayName: command.pluginDisplayName,
            runtimeKind: command.runtimeKind,
            connected: command.connected,
            defaultEnabled: command.defaultEnabled,
            kind: command.kind,
            canonicalCommand: command.canonicalCommand,
            ...(typeof command.priority === 'number' ? { priority: command.priority } : {}),
          })),
      }))
      .filter((conflict) => conflict.commands.length > 1)
      .sort((left, right) => {
        const sizeDiff = right.commands.length - left.commands.length;
        if (sizeDiff !== 0) {
          return sizeDiff;
        }

        return left.trigger.localeCompare(right.trigger, 'zh-CN');
      });
  }
}

function extractCommandsFromHooks(hooks: PluginHookDescriptor[]): PluginCommandDescriptor[] {
  const descriptors = new Map<string, PluginCommandDescriptor>();

  for (const hook of hooks) {
    const triggers = dedupeStrings(
      (hook.name === 'message:received' ? hook.filter?.message?.commands : undefined) ?? [],
    )
      .map(normalizeCommandTrigger)
      .filter((trigger): trigger is string => Boolean(trigger));
    if (triggers.length === 0) {
      continue;
    }

    const canonicalCommand = triggers[0];
    const existing = descriptors.get(canonicalCommand);
    const nextDescriptor: PluginCommandDescriptor = {
      kind: 'hook-filter',
      canonicalCommand,
      path: canonicalCommand.slice(1).split(' '),
      aliases: triggers.filter((trigger) => trigger !== canonicalCommand),
      variants: triggers,
      ...(hook.description ? { description: hook.description } : {}),
      priority: normalizePriority(hook.priority),
    };

    if (existing) {
      existing.aliases = dedupeStrings([...existing.aliases, ...nextDescriptor.aliases]);
      existing.variants = dedupeStrings([...existing.variants, ...nextDescriptor.variants]);
      if (!existing.description && nextDescriptor.description) {
        existing.description = nextDescriptor.description;
      }
      if (typeof existing.priority !== 'number' && typeof nextDescriptor.priority === 'number') {
        existing.priority = nextDescriptor.priority;
      }
      continue;
    }

    descriptors.set(canonicalCommand, nextDescriptor);
  }

  return [...descriptors.values()];
}

function normalizeCommandTrigger(command: string): string | null {
  const normalized = command
    .trim()
    .replace(/^\/+/, '')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
  if (!normalized) {
    return null;
  }

  return `/${normalized}`;
}

function normalizePriority(priority?: number): number {
  if (typeof priority !== 'number' || !Number.isFinite(priority)) {
    return 0;
  }

  return Math.trunc(priority);
}

function comparePluginCommandPriority(left: { priority?: number }, right: { priority?: number }): number {
  return normalizePriority(left.priority) - normalizePriority(right.priority);
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function cloneCommandDescriptor(command: PluginCommandDescriptor): PluginCommandDescriptor {
  return {
    ...command,
    path: [...command.path],
    aliases: [...command.aliases],
    variants: [...command.variants],
  };
}
