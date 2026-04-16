import { type HostCallPayload, type JsonObject, type JsonValue, type MessageReceivedHookPayload, type MessageReceivedHookResult, type PluginCallContext, type PluginHookDescriptor, type PluginHookMessageFilter, type PluginConversationSessionInfo, type PluginConversationSessionKeepParams, type PluginConversationSessionStartParams, type PluginCommandDescriptor, type PluginHookName, type PluginManifest, type PluginRouteRequest, type PluginRouteResponse, type RemotePluginBootstrapInfo, type WsMessage } from "@garlic-claw/shared";
import WebSocket from "ws";
import type { PluginClientOptions, PluginManifestInput } from "./index";
import { buildCanonicalCommandPath, buildCommandVariants, normalizeCommandAliases, normalizeCommandSegment, renderCommandGroupHelp, type CommandSegmentDescriptor, type CommandTreeGroupNode } from "../utils/command-match";
import { applyMessageReceivedMutation, buildMessageReceivedMutationResult, normalizeMessageListenerResult, normalizeRawMessageHookResult, type PluginMessageContentResult } from "./plugin-client-message.helpers";
import { cloneJsonValue, type PluginClientPayload, readExecutePayload, readHookInvokePayload, readHostResultPayload, readMessageReceivedHookPayload, readRouteInvokePayload } from "./plugin-client-payload.helpers";
import { WS_ACTION, WS_TYPE } from "./plugin-client.constants";
import { createPluginHostFacade, toHostJsonValue, type PluginConversationSessionController, type PluginHostFacade } from "../host";
import { dedupeStrings } from "../utils/json-value";
import { computeFilterSpecificity, getMessageReceivedText, matchesMessageCommand, matchesMessageFilter, mergeExclusiveMessageFilters, normalizePriority } from "../utils/message-filter";
import { normalizeRoutePath, normalizeRouteResponse } from "../utils/route";
export type { PluginAuthorDefinition, PluginAuthorExecutionContext, PluginAuthorTransportExecutor, PluginAuthorTransportExecutorInput, PluginAuthorTransportGovernanceHandlers, PluginHookHandler, PluginRouteHandler, PluginToolHandler } from "../authoring";
export type { PluginMessageContentResult } from "./plugin-client-message.helpers";
export type PluginExecutionContext = import("../authoring").PluginAuthorExecutionContext<PluginHostFacade>;
export interface PluginSessionWaiterHandle { start(context: PluginExecutionContext, input: PluginConversationSessionStartParams): Promise<PluginConversationSessionInfo>; }
export interface PluginMessageHandlerOptions { priority?: number; filter?: PluginHookMessageFilter; description?: string; }
export interface PluginCommandOptions { alias?: Iterable<string>; priority?: number; description?: string; }
export interface PluginCommandGroupOptions extends PluginCommandOptions {}
export interface PluginCommandInvocation { matchedCommand: string; canonicalCommand: string; path: string[]; args: string[]; rawArgs: string; payload: MessageReceivedHookPayload; }
export interface PluginCommandGroupRegistration { command(name: string, handler: MessageCommandHandler, options?: PluginCommandOptions): PluginCommandGroupRegistration; group(name: string, options?: PluginCommandGroupOptions): PluginCommandGroupRegistration; }
type CommandHandler = (params: JsonObject, context: PluginExecutionContext) => Promise<JsonValue> | JsonValue;
type PluginMessageHandlerResult = MessageReceivedHookResult | PluginMessageContentResult | string | null | undefined;
type MessageHandler = (payload: MessageReceivedHookPayload, context: PluginExecutionContext) => Promise<PluginMessageHandlerResult> | PluginMessageHandlerResult;
type MessageCommandHandler = (input: PluginCommandInvocation, context: PluginExecutionContext) => Promise<PluginMessageHandlerResult> | PluginMessageHandlerResult;
type SessionWaiterHandler = (controller: PluginConversationSessionController, payload: MessageReceivedHookPayload, context: PluginExecutionContext) => Promise<PluginMessageHandlerResult> | PluginMessageHandlerResult;
type HookHandler = (payload: JsonValue, context: PluginExecutionContext) => Promise<JsonValue | null | undefined> | JsonValue | null | undefined;
type RouteHandler = (request: PluginRouteRequest, context: PluginExecutionContext) => Promise<PluginRouteResponse> | PluginRouteResponse;
interface InternalMessageListener { kind: "listener"; order: number; priority: number; filter?: PluginHookMessageFilter; description?: string; handler: MessageHandler; }
interface InternalCommandRegistration { kind: "command" | "group-help"; order: number; priority: number; canonicalCommand: string; path: string[]; variants: string[]; description?: string; exactMatchOnly?: boolean; handler: MessageCommandHandler; }
interface InternalCommandGroupNode extends CommandTreeGroupNode { priority: number; parent: InternalCommandGroupNode | null; }
interface InternalConversationSessionController extends PluginConversationSessionController { setSession(session: PluginConversationSessionInfo | null): void; }
interface InternalSessionWaiterRegistration { handler: SessionWaiterHandler; }
function writePluginSdkLog(message: string): void { process.stdout.write(`${message}\n`); }
function writePluginSdkError(message: string): void { process.stderr.write(`${message}\n`); }
export class PluginClient {
  private ws: WebSocket | null = null;
  private readonly handlers = new Map<string, CommandHandler>();
  private readonly hookHandlers = new Map<PluginHookName, HookHandler>();
  private readonly routeHandlers = new Map<string, RouteHandler>();
  private readonly messageHandlers: InternalMessageListener[] = [];
  private readonly commandHandlers: InternalCommandRegistration[] = [];
  private readonly commandPaths = new Set<string>();
  private readonly commandGroupPaths = new Set<string>();
  private readonly sessionWaiters = new Map<string, InternalSessionWaiterRegistration>();
  private readonly pendingHostCalls = new Map<string, { resolve: (value: JsonValue) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly options: Required<PluginClientOptions> & { manifest: PluginManifestInput };
  constructor(options: PluginClientOptions) {
    this.options = {
      autoReconnect: true,
      reconnectInterval: 5000,
      heartbeatInterval: 20000,
      manifest: {},
      ...options,
    };
  }
  static fromBootstrap(bootstrap: RemotePluginBootstrapInfo, options: Omit<PluginClientOptions, "serverUrl" | "token" | "pluginName" | "deviceType"> = {}): PluginClient {
    return new PluginClient({
      ...options,
      serverUrl: bootstrap.serverUrl,
      token: bootstrap.token,
      pluginName: bootstrap.pluginName,
      deviceType: bootstrap.deviceType,
    });
  }
  onCommand(capabilityName: string, handler: CommandHandler) {
    this.handlers.set(capabilityName, handler);
    return this;
  }
  onHook(hookName: PluginHookName, handler: HookHandler) {
    this.hookHandlers.set(hookName, handler);
    return this;
  }
  onMessage(handler: MessageHandler, options: PluginMessageHandlerOptions = {}) {
    this.messageHandlers.push({
      kind: "listener",
      order: this.messageHandlers.length + this.commandHandlers.length,
      priority: normalizePriority(options.priority),
      filter: options.filter ? cloneJsonValue(options.filter) : undefined,
      description: options.description,
      handler,
    });
    return this;
  }
  command(name: string, handler: MessageCommandHandler, options: PluginCommandOptions = {}) {
    this.registerCommand(null, name, handler, options);
    return this;
  }
  commandGroup(name: string, options: PluginCommandGroupOptions = {}): PluginCommandGroupRegistration {
    const group = this.createCommandGroup(null, name, options);
    return this.createCommandGroupRegistration(group);
  }
  onRoute(path: string, handler: RouteHandler) {
    this.routeHandlers.set(normalizeRoutePath(path), handler);
    return this;
  }
  sessionWaiter(handler: SessionWaiterHandler): PluginSessionWaiterHandle {
    return {
      start: async (context, input) => {
        const controller = context.host.conversationSession;
        const session = await controller.start(input);
        this.sessionWaiters.set(session.conversationId, { handler });
        return session;
      },
    };
  }
  private createCommandGroupRegistration(group: InternalCommandGroupNode): PluginCommandGroupRegistration {
    return {
      command: (name, handler, options = {}) => {
        this.registerCommand(group, name, handler, options);
        return this.createCommandGroupRegistration(group);
      },
      group: (name, options = {}) => {
        const child = this.createCommandGroup(group, name, options);
        group.children.push(child);
        return this.createCommandGroupRegistration(child);
      },
    };
  }
  private createCommandGroup(parentGroup: InternalCommandGroupNode | null, name: string, options: PluginCommandGroupOptions): InternalCommandGroupNode {
    const segment = normalizeCommandSegment(name);
    const aliases = normalizeCommandAliases(options.alias);
    const canonicalPath = this.buildCommandPathSegments(parentGroup, segment);
    const canonicalCommand = buildCanonicalCommandPath(canonicalPath);
    this.assertCommandPathAvailable(canonicalCommand, "命令组");
    this.commandGroupPaths.add(canonicalCommand);
    const group: InternalCommandGroupNode = {
      segment,
      aliases,
      canonicalCommand,
      priority: normalizePriority(options.priority),
      description: options.description,
      parent: parentGroup,
      children: [],
      commands: [],
    };
    this.commandHandlers.push({
      kind: "group-help",
      order: this.messageHandlers.length + this.commandHandlers.length,
      priority: group.priority,
      canonicalCommand,
      path: canonicalPath,
      variants: this.buildCommandVariants(parentGroup, segment, aliases),
      description: options.description,
      exactMatchOnly: true,
      handler: async () => ({
        content: renderCommandGroupHelp(group),
      }),
    });
    return group;
  }
  private registerCommand(parentGroup: InternalCommandGroupNode | null, name: string, handler: MessageCommandHandler, options: PluginCommandOptions) {
    const segment = normalizeCommandSegment(name);
    const aliases = normalizeCommandAliases(options.alias);
    const path = this.buildCommandPathSegments(parentGroup, segment);
    const canonicalCommand = buildCanonicalCommandPath(path);
    this.assertCommandPathAvailable(canonicalCommand, "命令");
    this.commandPaths.add(canonicalCommand);
    const entry: InternalCommandRegistration = {
      kind: "command",
      order: this.messageHandlers.length + this.commandHandlers.length,
      priority: normalizePriority(options.priority),
      canonicalCommand,
      path,
      variants: this.buildCommandVariants(parentGroup, segment, aliases),
      description: options.description,
      handler,
    };
    this.commandHandlers.push(entry);
    parentGroup?.commands.push(entry);
  }
  private assertCommandPathAvailable(canonicalCommand: string, label: "命令" | "命令组") { if (this.commandPaths.has(canonicalCommand) || this.commandGroupPaths.has(canonicalCommand)) { throw new Error(`${label} ${canonicalCommand} 已注册，不能重复声明`); } }
  private buildCommandPathSegments(parentGroup: InternalCommandGroupNode | null, segment: string): string[] { return parentGroup ? [...parentGroup.canonicalCommand.replace(/^\//, "").split(" "), segment] : [segment]; }
  private buildCommandVariants(parentGroup: InternalCommandGroupNode | null, segment: string, aliases: string[]): string[] { return buildCommandVariants([...this.getCommandSegmentDescriptors(parentGroup), { segment, aliases }]); }
  private getCommandSegmentDescriptors(group: InternalCommandGroupNode | null): CommandSegmentDescriptor[] { return group ? [...this.getCommandSegmentDescriptors(group.parent), { segment: group.segment, aliases: group.aliases }] : []; }
  connect() {
    if (this.ws) {
      return;
    }
    this.ws = new WebSocket(this.options.serverUrl);
    this.ws.on("open", () => {
      writePluginSdkLog(`[plugin-sdk] 已连接到 ${this.options.serverUrl}`);
      this.authenticate();
    });
    this.ws.on("message", (raw: Buffer) => {
      try {
        const msg: WsMessage<PluginClientPayload> = JSON.parse(raw.toString());
        void this.handleMessage(msg);
      } catch (error) {
        writePluginSdkError(`[plugin-sdk] 消息解析失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    this.ws.on("close", () => {
      writePluginSdkLog("[plugin-sdk] 已断开连接");
      this.stopHeartbeat();
      this.rejectPendingHostCalls(new Error("连接已关闭"));
      if (this.options.autoReconnect) {
        this.scheduleReconnect();
      }
    });
    this.ws.on("error", (error) => {
      writePluginSdkError(`[plugin-sdk] WebSocket 错误: ${error.message}`);
    });
  }
  disconnect() {
    this.options.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.rejectPendingHostCalls(new Error("插件主动断开连接"));
    this.ws?.close();
    this.ws = null;
  }
  private authenticate() {
    this.send(WS_TYPE.AUTH, WS_ACTION.AUTHENTICATE, {
      token: this.options.token,
      pluginName: this.options.pluginName,
      deviceType: this.options.deviceType,
    });
  }
  private registerManifest() {
    this.send(WS_TYPE.PLUGIN, WS_ACTION.REGISTER, {
      manifest: this.resolveManifest(),
    });
  }
  private async handleMessage(msg: WsMessage<PluginClientPayload>) {
    switch (msg.type) {
      case WS_TYPE.AUTH:
        if (msg.action === WS_ACTION.AUTH_OK) {
          writePluginSdkLog("[plugin-sdk] 认证通过");
          this.registerManifest();
          this.startHeartbeat();
        } else if (msg.action === WS_ACTION.AUTH_FAIL) {
          writePluginSdkError(`[plugin-sdk] 认证失败: ${this.readErrorMessage(msg.payload)}`);
          this.options.autoReconnect = false;
          this.ws?.close();
        }
        return;
      case WS_TYPE.PLUGIN:
        await this.handlePluginMessage(msg);
        return;
      case WS_TYPE.COMMAND:
        if (msg.action === WS_ACTION.EXECUTE) {
          await this.handleExecute(msg);
        }
        return;
      case WS_TYPE.HEARTBEAT:
        return;
      default:
        return;
    }
  }
  private async handlePluginMessage(msg: WsMessage<PluginClientPayload>) {
    switch (msg.action) {
      case WS_ACTION.REGISTER_OK:
        writePluginSdkLog("[plugin-sdk] Manifest 已注册");
        return;
      case WS_ACTION.HOOK_INVOKE:
        await this.handleHookInvoke(msg);
        return;
      case WS_ACTION.ROUTE_INVOKE:
        await this.handleRouteInvoke(msg);
        return;
      case WS_ACTION.HOST_RESULT:
        try {
          this.resolveHostCall(msg.requestId, readHostResultPayload(msg.payload).data);
        } catch (error) {
          this.rejectHostCall(msg.requestId, error instanceof Error ? error.message : String(error));
        }
        return;
      case WS_ACTION.HOST_ERROR:
        this.rejectHostCall(msg.requestId, this.readErrorMessage(msg.payload));
        return;
      default:
        return;
    }
  }
  private async handleExecute(msg: WsMessage<PluginClientPayload>) {
    await this.replyWithParsedPayload({
      msg,
      type: WS_TYPE.COMMAND,
      successAction: WS_ACTION.EXECUTE_RESULT,
      errorAction: WS_ACTION.EXECUTE_ERROR,
      parse: readExecutePayload,
      handle: async (payload) => {
        const toolName = payload.toolName ?? payload.capability ?? "";
        const handler = this.handlers.get(toolName);
        if (!handler) {
          throw new Error(`未知工具：${toolName}`);
        }
        return {
          data: await handler(payload.params, this.createExecutionContext(payload.context)),
        };
      },
    });
  }
  private async handleHookInvoke(msg: WsMessage<PluginClientPayload>) {
    await this.replyWithParsedPayload({
      msg,
      type: WS_TYPE.PLUGIN,
      successAction: WS_ACTION.HOOK_RESULT,
      errorAction: WS_ACTION.HOOK_ERROR,
      parse: readHookInvokePayload,
      handle: async (payload) => {
        const executionContext = this.createExecutionContext(payload.context);
        const hasInternalMessagePipeline = payload.hookName === "message:received" && (this.messageHandlers.length > 0 || this.commandHandlers.length > 0);
        const handler = this.hookHandlers.get(payload.hookName);
        if (!handler && !hasInternalMessagePipeline) {
          throw new Error(`未知 Hook：${payload.hookName}`);
        }
        const result = payload.hookName === "message:received" ? await this.handleMessageReceivedHook(readMessageReceivedHookPayload(payload.payload), executionContext) : await handler?.(payload.payload, executionContext);
        return { data: result ?? null };
      },
    });
  }
  private async handleRouteInvoke(msg: WsMessage<PluginClientPayload>) {
    await this.replyWithParsedPayload({
      msg,
      type: WS_TYPE.PLUGIN,
      successAction: WS_ACTION.ROUTE_RESULT,
      errorAction: WS_ACTION.ROUTE_ERROR,
      parse: readRouteInvokePayload,
      handle: async (payload) => {
        const handler = this.routeHandlers.get(normalizeRoutePath(payload.request.path));
        if (!handler) {
          throw new Error(`未知 Route：${payload.request.path}`);
        }
        return {
          data: normalizeRouteResponse(await handler(payload.request, this.createExecutionContext(payload.context))),
        };
      },
    });
  }
  private createExecutionContext(callContext?: PluginCallContext): PluginExecutionContext {
    const context = callContext ?? { source: "plugin" as const };
    const conversationSession = this.createConversationSessionController(context);
    const call: PluginHostFacade["call"] = (method, params) => this.sendHostCall(method, params, context);
    const callHost = <T>(method: HostCallPayload["method"], params: JsonObject = {}): Promise<T> => this.callHost<T>(method, params, context);
    return {
      callContext: context,
      host: {
        ...createPluginHostFacade({
          call,
          callHost,
          conversationSessionController: conversationSession,
        }),
        conversationSession,
      },
    };
  }
  private resolveHookDescriptors(): PluginHookDescriptor[] {
    const hooks = (this.options.manifest.hooks ?? []).map((hook: PluginHookDescriptor) => cloneJsonValue(hook));
    for (const hookName of this.hookHandlers.keys()) {
      if (hookName === "message:received") {
        continue;
      }
      this.ensureHookDescriptor(hooks, {
        name: hookName,
      });
    }
    const messageHook = this.buildSyntheticMessageReceivedHook();
    if (messageHook) {
      this.ensureHookDescriptor(hooks, messageHook);
    }
    return hooks;
  }
  private resolveCommandDescriptors(): PluginCommandDescriptor[] {
    const commands = (this.options.manifest.commands ?? []).map((command: PluginCommandDescriptor) => cloneJsonValue(command));
    for (const entry of this.commandHandlers) {
      this.ensureCommandDescriptor(commands, {
        kind: entry.kind,
        canonicalCommand: entry.canonicalCommand,
        path: [...entry.path],
        aliases: entry.variants.filter((variant) => variant !== entry.canonicalCommand),
        variants: [...entry.variants],
        ...(entry.description ? { description: entry.description } : {}),
        priority: normalizePriority(entry.priority),
      });
    }
    return commands;
  }
  private ensureHookDescriptor(hooks: PluginHookDescriptor[], descriptor: PluginHookDescriptor) {
    const existing = hooks.find((hook) => hook.name === descriptor.name);
    if (existing) {
      if (typeof existing.priority !== "number" && typeof descriptor.priority === "number") {
        existing.priority = descriptor.priority;
      }
      if (!existing.description && descriptor.description) {
        existing.description = descriptor.description;
      }
      if (!existing.filter && descriptor.filter) {
        existing.filter = cloneJsonValue(descriptor.filter);
      }
      return;
    }
    hooks.push(cloneJsonValue(descriptor));
  }
  private ensureCommandDescriptor(commands: PluginCommandDescriptor[], descriptor: PluginCommandDescriptor) {
    const existing = commands.find((command) => command.kind === descriptor.kind && command.canonicalCommand === descriptor.canonicalCommand);
    if (existing) {
      existing.path = descriptor.path.length > 0 ? [...descriptor.path] : [...existing.path];
      existing.aliases = dedupeStrings([...existing.aliases, ...descriptor.aliases]).filter((alias) => alias !== existing.canonicalCommand);
      existing.variants = dedupeStrings([...existing.variants, ...descriptor.variants]);
      if (!existing.description && descriptor.description) {
        existing.description = descriptor.description;
      }
      if (typeof existing.priority !== "number" && typeof descriptor.priority === "number") {
        existing.priority = descriptor.priority;
      }
      return;
    }
    commands.push(cloneJsonValue(descriptor));
  }
  private buildSyntheticMessageReceivedHook(): PluginHookDescriptor | null {
    if (this.messageHandlers.length === 0 && this.commandHandlers.length === 0 && !this.hookHandlers.has("message:received")) {
      return null;
    }
    const priorities = [...this.messageHandlers.map((listener) => listener.priority), ...this.commandHandlers.map((command) => command.priority)];
    const filter = this.buildSyntheticMessageFilter();
    return {
      name: "message:received",
      ...(priorities.length > 0 ? { priority: Math.min(...priorities) } : {}),
      ...(filter ? { filter: { message: filter } } : {}),
    };
  }
  private buildSyntheticMessageFilter(): PluginHookMessageFilter | undefined {
    return mergeExclusiveMessageFilters([
      ...this.messageHandlers.map((listener) => listener.filter).filter((filter): filter is PluginHookMessageFilter => Boolean(filter)),
      ...this.commandHandlers.map((command) => ({
        commands: [...command.variants],
      })),
    ]);
  }
  private async handleMessageReceivedHook(payload: MessageReceivedHookPayload, context: PluginExecutionContext): Promise<JsonValue | null> {
    const originalPayload = cloneJsonValue(payload);
    let currentPayload = cloneJsonValue(payload);
    let hasMutation = false;
    const sessionWaiterResult = await this.runSessionWaiter(currentPayload, context);
    if (sessionWaiterResult) {
      if (sessionWaiterResult.action === "short-circuit") {
        return toHostJsonValue(sessionWaiterResult);
      }
      if (sessionWaiterResult.action === "mutate") {
        currentPayload = applyMessageReceivedMutation(currentPayload, sessionWaiterResult);
        hasMutation = true;
      }
    }
    for (const listener of this.listMessagePipelineEntries()) {
      const normalizedResult = await this.runMessagePipelineEntry(listener, currentPayload, context);
      if (!normalizedResult || normalizedResult.action === "pass") {
        continue;
      }
      if (normalizedResult.action === "short-circuit") {
        return toHostJsonValue(normalizedResult);
      }
      currentPayload = applyMessageReceivedMutation(currentPayload, normalizedResult);
      hasMutation = true;
    }
    if (hasMutation) {
      return toHostJsonValue(buildMessageReceivedMutationResult(originalPayload, currentPayload));
    }
    const fallbackHandler = this.hookHandlers.get("message:received");
    if (!fallbackHandler) {
      return {
        action: "pass",
      };
    }
    const rawResult = await fallbackHandler(toHostJsonValue(cloneJsonValue(payload)), context);
    return normalizeRawMessageHookResult(rawResult);
  }
  private async runSessionWaiter(payload: MessageReceivedHookPayload, context: PluginExecutionContext): Promise<MessageReceivedHookResult | null> {
    const conversationId = payload.conversationId;
    const registration = this.sessionWaiters.get(conversationId);
    if (!registration) {
      return null;
    }
    if (!payload.session || payload.session.pluginId !== this.options.pluginName) {
      this.sessionWaiters.delete(conversationId);
      return null;
    }
    const controller = this.createConversationSessionController(context.callContext);
    controller.setSession(payload.session);
    return normalizeMessageListenerResult(await registration.handler(controller, cloneJsonValue(payload), context));
  }
  private createConversationSessionController(context: PluginCallContext): InternalConversationSessionController {
    let currentSession: PluginConversationSessionInfo | null = null;
    const callHost = <T>(method: HostCallPayload["method"], params: JsonObject = {}): Promise<T> => this.callHost<T>(method, params, context);
    const setSession = (session: PluginConversationSessionInfo | null) => {
      currentSession = session ? cloneJsonValue(session) : null;
    };
    const getConversationId = () => currentSession?.conversationId ?? context.conversationId;
    const clearLocalWaiter = (conversationId?: string | null) => {
      const targetConversationId = conversationId ?? getConversationId() ?? null;
      if (targetConversationId) {
        this.sessionWaiters.delete(targetConversationId);
      }
    };
    const syncSession = (session: PluginConversationSessionInfo | null, previousConversationId = getConversationId()) => {
      setSession(session);
      if (!session) {
        clearLocalWaiter(previousConversationId);
      }
      return session ? cloneJsonValue(session) : null;
    };
    const startSession = async (input: PluginConversationSessionStartParams): Promise<PluginConversationSessionInfo> => {
      const session = await callHost<PluginConversationSessionInfo>("conversation.session.start", {
        timeoutMs: input.timeoutMs,
        ...(typeof input.captureHistory === "boolean" ? { captureHistory: input.captureHistory } : {}),
        ...(typeof input.metadata !== "undefined" ? { metadata: input.metadata } : {}),
      });
      return syncSession(session) as PluginConversationSessionInfo;
    };
    const getSession = async (): Promise<PluginConversationSessionInfo | null> => {
      const session = await callHost<PluginConversationSessionInfo | null>("conversation.session.get");
      return syncSession(session);
    };
    const keepSession = async (input: PluginConversationSessionKeepParams): Promise<PluginConversationSessionInfo | null> => {
      const session = await callHost<PluginConversationSessionInfo | null>("conversation.session.keep", {
        timeoutMs: input.timeoutMs,
        ...(typeof input.resetTimeout === "boolean" ? { resetTimeout: input.resetTimeout } : {}),
      });
      return syncSession(session);
    };
    const finishSession = async (): Promise<boolean> => {
      const finished = await callHost<boolean>("conversation.session.finish");
      syncSession(null);
      return finished;
    };
    return {
      get conversationId() {
        return getConversationId() ?? null;
      },
      get session() {
        return currentSession ? cloneJsonValue(currentSession) : null;
      },
      get timeoutMs() {
        return currentSession?.timeoutMs ?? null;
      },
      get startedAt() {
        return currentSession?.startedAt ?? null;
      },
      get expiresAt() {
        return currentSession?.expiresAt ?? null;
      },
      get lastMatchedAt() {
        return currentSession?.lastMatchedAt ?? null;
      },
      get captureHistory() {
        return currentSession?.captureHistory ?? false;
      },
      get historyMessages() {
        return currentSession ? currentSession.historyMessages.map((message) => cloneJsonValue(message)) : [];
      },
      get metadata() {
        return typeof currentSession?.metadata !== "undefined" ? cloneJsonValue(currentSession.metadata) : undefined;
      },
      start: startSession,
      get: getSession,
      async sync() {
        return getSession();
      },
      keep: keepSession,
      finish: finishSession,
      setSession,
    };
  }
  private listMessagePipelineEntries(): Array<InternalMessageListener | InternalCommandRegistration> {
    return [...this.messageHandlers, ...this.commandHandlers].sort((left, right) => {
      const priorityDiff = left.priority - right.priority;
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      const specificityDiff = getMessagePipelineSpecificity(right) - getMessagePipelineSpecificity(left);
      if (specificityDiff !== 0) {
        return specificityDiff;
      }
      if (left.kind !== right.kind) {
        if (left.kind === "command") {
          return -1;
        }
        if (right.kind === "command") {
          return 1;
        }
      }
      return left.order - right.order;
    });
  }
  private async runMessagePipelineEntry(entry: InternalMessageListener | InternalCommandRegistration, payload: MessageReceivedHookPayload, context: PluginExecutionContext): Promise<MessageReceivedHookResult | null> {
    if (entry.kind === "listener") {
      if (!matchesMessageFilter(payload, entry.filter)) {
        return null;
      }
      return normalizeMessageListenerResult(await entry.handler(cloneJsonValue(payload), context));
    }
    const matchedCommand = matchRegisteredCommand(payload, entry);
    if (!matchedCommand) {
      return null;
    }
    return normalizeMessageListenerResult(
      await entry.handler(
        {
          matchedCommand: matchedCommand.command,
          canonicalCommand: entry.canonicalCommand,
          path: [...entry.path],
          args: matchedCommand.args,
          rawArgs: matchedCommand.rawArgs,
          payload: cloneJsonValue(payload),
        },
        context,
      ),
    );
  }
  private async replyWithParsedPayload<T>(input: { msg: WsMessage<PluginClientPayload>; type: string; successAction: string; errorAction: string; parse(payload: PluginClientPayload): T; handle(payload: T): Promise<PluginClientPayload> }) {
    try {
      this.send(input.type, input.successAction, await input.handle(input.parse(input.msg.payload)), input.msg.requestId);
    } catch (error) {
      this.send(input.type, input.errorAction, this.toErrorPayload(error), input.msg.requestId);
    }
  }
  private sendHostCall(method: HostCallPayload["method"], params: JsonObject, context: PluginCallContext): Promise<JsonValue> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("插件尚未连接到服务器"));
    }
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingHostCalls.delete(requestId);
        reject(new Error(`Host API 调用超时: ${method}`));
      }, 30000);
      this.pendingHostCalls.set(requestId, { resolve, reject, timer });
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.HOST_CALL,
        {
          method,
          params,
          context,
        },
        requestId,
      );
    });
  }
  private callHost<T>(method: HostCallPayload["method"], params: JsonObject = {}, context: PluginCallContext): Promise<T> {
    return this.sendHostCall(method, params, context) as Promise<T>;
  }
  private resolveManifest(): PluginManifest {
    const hooks = this.resolveHookDescriptors();
    const commands = this.resolveCommandDescriptors();
    return {
      id: this.options.pluginName,
      name: this.options.manifest.name ?? this.options.pluginName,
      version: this.options.manifest.version ?? "0.0.0",
      runtime: "remote",
      description: this.options.manifest.description,
      permissions: this.options.manifest.permissions ?? [],
      tools: this.options.manifest.tools ?? [],
      ...(commands.length > 0 ? { commands } : {}),
      hooks,
      config: this.options.manifest.config,
      routes: this.options.manifest.routes ?? [],
    };
  }
  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send(WS_TYPE.HEARTBEAT, WS_ACTION.PING, {});
    }, this.options.heartbeatInterval);
  }
  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  private scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }
    writePluginSdkLog(`[plugin-sdk] 将在 ${this.options.reconnectInterval}ms 后重连...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ws = null;
      this.connect();
    }, this.options.reconnectInterval);
  }
  private send(type: string, action: string, payload: PluginClientPayload, requestId?: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg: WsMessage<PluginClientPayload> = { type, action, payload, requestId };
      this.ws.send(JSON.stringify(msg));
    }
  }
  private resolveHostCall(requestId: string | undefined, value: JsonValue) {
    if (!requestId) {
      return;
    }
    const pending = this.pendingHostCalls.get(requestId);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pendingHostCalls.delete(requestId);
    pending.resolve(value);
  }
  private rejectHostCall(requestId: string | undefined, message: string) {
    if (!requestId) {
      return;
    }
    const pending = this.pendingHostCalls.get(requestId);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pendingHostCalls.delete(requestId);
    pending.reject(new Error(message));
  }
  private rejectPendingHostCalls(error: Error) {
    for (const [requestId, pending] of this.pendingHostCalls) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingHostCalls.delete(requestId);
    }
  }
  private readErrorMessage(payload: PluginClientPayload): string {
    if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
      return payload.error;
    }
    return String(payload);
  }
  private toErrorPayload(error: unknown): { error: string } {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
export { type PluginCapability, type PluginCronDescriptor, type PluginCronJobSummary, type PluginHookName, type PluginHookMessageFilter, type PluginRouteDescriptor, type PluginRouteRequest, type PluginRouteResponse } from "@garlic-claw/shared";
export { DEVICE_TYPE } from "./plugin-client.constants";
function getMessagePipelineSpecificity(entry: InternalMessageListener | InternalCommandRegistration): number {
  return entry.kind === "listener" ? computeFilterSpecificity(entry.filter) : entry.path.length;
}
function matchRegisteredCommand(payload: MessageReceivedHookPayload, command: InternalCommandRegistration): { command: string; rawArgs: string; args: string[] } | null {
  const messageText = getMessageReceivedText(payload).trimStart();
  for (const variant of command.variants) {
    if (command.exactMatchOnly) {
      if (messageText.trim() !== variant) {
        continue;
      }
      return { command: variant, rawArgs: "", args: [] };
    }
    if (!matchesMessageCommand(messageText, variant)) {
      continue;
    }
    const rawArgs = messageText.slice(variant.length).trim();
    return { command: variant, rawArgs, args: rawArgs ? rawArgs.split(/\s+/).filter(Boolean) : [] };
  }
  return null;
}
