import { Injectable, NotFoundException } from '@nestjs/common';
import type { BuiltinPluginDefinition } from './builtin-plugin-definition';
import { BUILTIN_CONVERSATION_TITLE_PLUGIN } from './hooks/builtin-conversation-title.plugin';
import { BUILTIN_MEMORY_CONTEXT_PLUGIN } from './hooks/builtin-memory-context.plugin';
import { BUILTIN_SUBAGENT_DELEGATE_PLUGIN } from './tools/builtin-subagent-delegate.plugin';

@Injectable()
export class BuiltinPluginRegistryService {
  private readonly definitions: BuiltinPluginDefinition[] = [
    BUILTIN_CONVERSATION_TITLE_PLUGIN,
    BUILTIN_MEMORY_CONTEXT_PLUGIN,
    BUILTIN_SUBAGENT_DELEGATE_PLUGIN,
  ];

  getDefinition(pluginId: string): BuiltinPluginDefinition {
    const definition = this.definitions.find((entry) => entry.manifest.id === pluginId);
    if (!definition) {
      throw new NotFoundException(`Builtin plugin definition not found: ${pluginId}`);
    }
    return cloneBuiltinDefinition(definition);
  }

  listDefinitions(): BuiltinPluginDefinition[] {
    return this.definitions.map(cloneBuiltinDefinition);
  }
}

function cloneBuiltinDefinition(definition: BuiltinPluginDefinition): BuiltinPluginDefinition {
  return {
    ...structuredClone({
      ...(definition.governance ? { governance: definition.governance } : {}),
      manifest: definition.manifest,
    }),
    ...(definition.tools ? { tools: { ...definition.tools } } : {}),
    ...(definition.hooks ? { hooks: { ...definition.hooks } } : {}),
    ...(definition.routes ? { routes: { ...definition.routes } } : {}),
  };
}
