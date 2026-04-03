import {
  createPluginHostFacade,
  type PluginHostFacadeFactoryInput,
} from '@garlic-claw/plugin-sdk';
import type { HostCallPayload } from '@garlic-claw/shared';
import type { JsonObject, JsonValue } from '../../common/types/json-value';
import type { BuiltinPluginHostFacade } from './builtin-plugin.types';

type BuiltinHostCall = (
  method: HostCallPayload['method'],
  params: JsonObject,
) => Promise<JsonValue>;

type BuiltinHostQuery = <T>(
  method: HostCallPayload['method'],
  params?: JsonObject,
) => Promise<T>;

export function createBuiltinPluginHostFacade(input: {
  call: BuiltinHostCall;
  callHost: BuiltinHostQuery;
}): BuiltinPluginHostFacade {
  return createPluginHostFacade(input as PluginHostFacadeFactoryInput);
}
