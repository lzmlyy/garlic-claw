import type { PluginAuthorDefinition } from '@garlic-claw/plugin-sdk/authoring';
import type { PluginHostFacadeMethods } from '@garlic-claw/plugin-sdk/host';
import type { PluginGovernanceOverrides } from '../governance/plugin-governance.service';

export interface BuiltinPluginDefinition extends PluginAuthorDefinition<PluginHostFacadeMethods> {
  governance?: PluginGovernanceOverrides;
}
