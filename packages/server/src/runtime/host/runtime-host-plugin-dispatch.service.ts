import type {
  JsonObject,
  JsonValue,
  PluginCallContext,
  PluginHookName,
  PluginRouteRequest,
  PluginRouteResponse,
} from '@garlic-claw/shared';
import { createPluginAuthorTransportExecutor } from '@garlic-claw/plugin-sdk/authoring';
import { createPluginHostFacade } from '@garlic-claw/plugin-sdk/host';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BuiltinPluginRegistryService } from '../../plugin/builtin/builtin-plugin-registry.service';
import { PluginBootstrapService } from '../../plugin/bootstrap/plugin-bootstrap.service';
import type { RegisteredPluginRecord } from '../../plugin/persistence/plugin-persistence.service';
import { RuntimeGatewayRemoteTransportService } from '../gateway/runtime-gateway-remote-transport.service';
import type { RuntimeHostService } from './runtime-host.service';

type RuntimeHostCaller = (input: Parameters<RuntimeHostService['call']>[0]) => Promise<JsonValue>;

@Injectable()
export class RuntimeHostPluginDispatchService {
  private runtimeHostCaller?: RuntimeHostCaller;

  constructor(
    private readonly builtinPluginRegistryService: BuiltinPluginRegistryService,
    private readonly pluginBootstrapService: PluginBootstrapService,
    private readonly runtimeGatewayRemoteTransportService: RuntimeGatewayRemoteTransportService,
  ) {}

  registerHostCaller(runtimeHostCaller: RuntimeHostCaller): void {
    this.runtimeHostCaller = runtimeHostCaller;
  }

  async executeTool(input: {
    context: PluginCallContext;
    params: JsonObject;
    pluginId: string;
    toolName: string;
  }): Promise<JsonValue> {
    const plugin = this.requirePluginCapability(input.pluginId, 'tools', input.toolName, 'Tool');
    return this.createPluginTransport(plugin, input.context).executeTool({
      context: input.context,
      params: input.params,
      toolName: input.toolName,
    });
  }

  async invokeHook(input: {
    context: PluginCallContext;
    hookName: PluginHookName;
    payload: JsonValue;
    pluginId: string;
  }): Promise<JsonValue> {
    const plugin = this.requirePluginCapability(input.pluginId, 'hooks', input.hookName, 'Hook');
    const result = await this.createPluginTransport(plugin, input.context).invokeHook({
      context: input.context,
      hookName: input.hookName,
      payload: input.payload,
    });
    return result ?? null;
  }

  async invokeRoute(input: {
    context: PluginCallContext;
    pluginId: string;
    request: PluginRouteRequest;
  }): Promise<PluginRouteResponse> {
    const plugin = this.pluginBootstrapService.getPlugin(input.pluginId);
    const route = plugin.manifest.routes?.find((entry) => routeMatches(entry, input.request));
    if (!route) {throw new NotFoundException(`Route not declared by plugin: ${input.pluginId}/${input.request.method} ${normalizeRoutePath(input.request.path)}`);}
    return this.createPluginTransport(plugin, input.context).invokeRoute({ context: input.context, request: { ...input.request, path: normalizeRoutePath(route.path) } });
  }

  listPlugins(): RegisteredPluginRecord[] { return this.pluginBootstrapService.listPlugins().sort((left, right) => left.pluginId.localeCompare(right.pluginId)); }

  private requirePluginCapability(
    pluginId: string,
    surface: 'hooks' | 'tools',
    name: string,
    label: 'Hook' | 'Tool',
  ): RegisteredPluginRecord {
    const plugin = this.pluginBootstrapService.getPlugin(pluginId);
    if (plugin.manifest[surface]?.some((entry) => entry.name === name)) {
      return plugin;
    }
    throw new NotFoundException(`${label} not declared by plugin: ${pluginId}/${name}`);
  }

  private createPluginTransport(plugin: RegisteredPluginRecord, context: PluginCallContext) {
    return plugin.manifest.runtime === 'local'
      ? createPluginAuthorTransportExecutor({
          createExecutionContext: () => ({ callContext: context, host: this.createBuiltinHostFacade(plugin.pluginId, context) }),
          definition: this.builtinPluginRegistryService.getDefinition(plugin.pluginId),
        })
      : this.runtimeGatewayRemoteTransportService.createRemoteTransport(plugin.pluginId);
  }

  private createBuiltinHostFacade(pluginId: string, context: PluginCallContext) {
    const runtimeHostCaller = this.runtimeHostCaller;
    if (!runtimeHostCaller) {throw new Error('RuntimeHostPluginDispatchService host caller not registered');}
    const callHost = <T>(method: Parameters<RuntimeHostService['call']>[0]['method'], params: JsonObject = {}) => runtimeHostCaller({ context, method, params, pluginId }) as Promise<T>;
    return createPluginHostFacade({ call: (method, params) => callHost(method, params), callHost });
  }
}

function routeMatches(entry: { methods: string[]; path: string }, request: PluginRouteRequest): boolean {
  return normalizeRoutePath(entry.path) === normalizeRoutePath(request.path) && entry.methods.includes(request.method);
}

function normalizeRoutePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {throw new BadRequestException('Route path cannot be empty');}
  return trimmed.replace(/^\/+/, '').replace(/\/+$/, '');
}
