import { CONVERSATION_TITLE_MANIFEST, MEMORY_CONTEXT_MANIFEST } from '@garlic-claw/plugin-sdk/authoring';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { BuiltinPluginDefinition } from './builtin-plugin-definition';
import { BUILTIN_SUBAGENT_DELEGATE_PLUGIN } from './tools/builtin-subagent-delegate.plugin';

@Injectable()
export class BuiltinPluginRegistryService {
  private readonly definitions: BuiltinPluginDefinition[] = [
    {
      governance: {
        builtinRole: 'system-optional',
        canDisable: true,
        defaultEnabled: true,
      },
      manifest: CONVERSATION_TITLE_MANIFEST,
    },
    {
      governance: {
        builtinRole: 'system-optional',
        canDisable: true,
        defaultEnabled: true,
      },
      manifest: MEMORY_CONTEXT_MANIFEST,
    },
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
