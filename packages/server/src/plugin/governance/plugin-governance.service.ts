import type {
  PluginBuiltinRole,
  PluginGovernanceInfo,
  PluginManifest,
} from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';

export interface PluginGovernanceOverrides {
  builtinRole?: PluginBuiltinRole;
  canDisable?: boolean;
  defaultEnabled?: boolean;
  disableReason?: string;
}

@Injectable()
export class PluginGovernanceService {
  createState(input: {
    manifest: PluginManifest;
    overrides?: PluginGovernanceOverrides;
  }) {
    const builtinRole = input.overrides?.builtinRole
      ?? (input.manifest.runtime === 'local' ? 'system-optional' : undefined);
    const canDisable = input.overrides?.canDisable
      ?? builtinRole !== 'system-required';
    const governance: PluginGovernanceInfo = {
      canDisable,
      ...(input.overrides?.disableReason
        ? { disableReason: input.overrides.disableReason }
        : {}),
      ...(builtinRole ? { builtinRole } : {}),
    };

    return {
      defaultEnabled: input.overrides?.defaultEnabled ?? input.manifest.runtime === 'local',
      governance,
    };
  }
}
