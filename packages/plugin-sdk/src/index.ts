import {
  type ActionConfig,
  type AutomationEventDispatchInfo,
  type AuthPayload,
  type AutomationInfo,
  type ChatAfterModelHookPayload,
  type ChatBeforeModelHookPayload,
  type ChatBeforeModelHookResult,
  type ChatMessagePart,
    type ExecuteErrorPayload,
    type ExecutePayload,
    type ExecuteResultPayload,
    type HostCallPayload,
    type HostResultPayload,
    type HookInvokePayload,
  type JsonObject,
  type JsonValue,
  type MessageReceivedHookPayload,
  type MessageReceivedHookResult,
  type PluginCallContext,
  type PluginHookDescriptor,
  type PluginHookMessageFilter,
  PLUGIN_HOOK_NAME_VALUES,
  PLUGIN_INVOCATION_SOURCE_VALUES,
  type PluginCapability,
  type PluginConversationSessionInfo,
  type PluginConversationSessionKeepParams,
  type PluginConversationSessionStartParams,
  type PluginCommandDescriptor,
  type PluginHookName,
  type PluginMessageKind,
  type PluginMessageHookInfo,
  type PluginManifest,
  type PluginRouteDescriptor,
  type PluginRouteRequest,
  type PluginRouteResponse,
  PLUGIN_ROUTE_METHOD_VALUES,
  type PluginSubagentRunParams,
  type PluginSubagentRunResult,
  type PluginSubagentTaskStartParams,
  type PluginSubagentTaskSummary,
  type RemotePluginBootstrapInfo,
    type RegisterPayload,
    type RouteInvokePayload,
    type RouteResultPayload,
  type TriggerConfig,
  WS_ACTION,
  WS_TYPE,
  isChatMessageStatus,
  type WsMessage,
} from '@garlic-claw/shared';
import WebSocket from 'ws';

export * from './authoring';
import {
  CONVERSATION_TITLE_DEFAULT_MAX_MESSAGES,
  CONVERSATION_TITLE_DEFAULT_TITLE,
  createChatBeforeModelHookResult,
  type PluginConversationTitleConfig,
  type PluginCurrentPersonaInfo,
  type PluginCurrentProviderInfo,
  type PluginPersonaRouterConfig,
  type PluginPersonaSummaryInfo,
  type PluginProviderRouterConfig,
} from './authoring';
export {
  type PluginClientOptions,
  type PluginManifestInput,
} from './client';
import type {
  PluginClientOptions,
  PluginManifestInput,
} from './client';
export * from './host';
import {
  createPluginHostFacade,
  toHostJsonValue,
  type PluginConversationSessionController,
  type PluginHostFacade,
} from './host';
import {
  buildCanonicalCommandPath,
  buildCommandVariants,
  normalizeCommandAliases,
  normalizeCommandSegment,
} from './utils/command-match';
import {
  cloneJsonValue,
  dedupeStrings,
  isJsonEqual,
  isJsonObjectValue,
  isJsonValue,
  isOneOf,
  isStringRecord,
} from './utils/json-value';
import {
  computeFilterSpecificity,
  detectMessageKind,
  getMessageReceivedText,
  hasOnlyMessageFilterKey,
  isEmptyMessageFilter,
  matchesMessageCommand,
  matchesMessageFilter,
  normalizePriority,
} from './utils/message-filter';
import {
  normalizeRoutePath,
  normalizeRouteResponse,
} from './utils/route';

/**
 * 插件执行上下文。
 */
export type {
  PluginAuthorDefinition,
  PluginAuthorExecutionContext,
  PluginAuthorTransportExecutor,
  PluginAuthorTransportExecutorInput,
  PluginAuthorTransportGovernanceHandlers,
  PluginHookHandler,
  PluginRouteHandler,
  PluginToolHandler,
} from './authoring';

/**
 * 插件执行上下文。
 */
export type PluginExecutionContext =
  import('./authoring').PluginAuthorExecutionContext<PluginHostFacade>;

/** `client.sessionWaiter(...)` 返回的 waiter 句柄。 */
export interface PluginSessionWaiterHandle {
  /**
   * 在当前执行上下文里启动等待态，并把后续命中的会话消息
   * 优先交给对应 handler。
   */
  start(
    context: PluginExecutionContext,
    input: PluginConversationSessionStartParams,
  ): Promise<PluginConversationSessionInfo>;
}

/** SDK 级消息监听配置。 */
export interface PluginMessageHandlerOptions {
  /** 当前监听器在插件内的优先级；数字越小越先执行。 */
  priority?: number;
  /** 当前监听器的声明式过滤条件。 */
  filter?: PluginHookMessageFilter;
  /** 可选描述文本，用于文档或自动帮助。 */
  description?: string;
}

/** SDK 级命令注册配置。 */
export interface PluginCommandOptions {
  /** 命令别名。 */
  alias?: Iterable<string>;
  /** 当前命令在插件内的优先级；数字越小越先执行。 */
  priority?: number;
  /** 命令描述，会出现在自动帮助里。 */
  description?: string;
}

/** SDK 级命令组注册配置。 */
export interface PluginCommandGroupOptions extends PluginCommandOptions {}

/** 命令命中后的上下文。 */
export interface PluginCommandInvocation {
  /** 实际命中的命令路径，可能是别名。 */
  matchedCommand: string;
  /** 归一化后的规范命令路径。 */
  canonicalCommand: string;
  /** 命令路径分段。 */
  path: string[];
  /** 已按空白拆分的参数。 */
  args: string[];
  /** 未进一步拆分的原始参数串。 */
  rawArgs: string;
  /** 当前消息 Hook 载荷。 */
  payload: MessageReceivedHookPayload;
}

/** SDK 返回短路消息的便捷结构。 */
export interface PluginMessageContentResult {
  content: string;
  parts?: ChatMessagePart[] | null;
}

/** SDK 级命令组注册器。 */
export interface PluginCommandGroupRegistration {
  /** 在当前组下注册一个子命令。 */
  command(
    name: string,
    handler: MessageCommandHandler,
    options?: PluginCommandOptions,
  ): PluginCommandGroupRegistration;

  /** 在当前组下注册一个子命令组。 */
  group(
    name: string,
    options?: PluginCommandGroupOptions,
  ): PluginCommandGroupRegistration;
}

/**
 * 将插件 Hook 负载收口为目标类型。
 * @param payload 原始 Hook 负载
 * @returns 收口后的 Hook 负载
 */
export interface PluginPromptBlockConfig {
  limit?: number;
  promptPrefix?: string;
}

export function createChatBeforeModelLineBlockResult(
  currentSystemPrompt: string,
  promptPrefix: string,
  lines: string[],
): ChatBeforeModelHookResult | null {
  if (lines.length === 0) {
    return null;
  }

  return createChatBeforeModelHookResult(
    currentSystemPrompt,
    `${promptPrefix}：\n${lines.join('\n')}`,
  );
}

export function sanitizeOptionalText(value?: string): string {
  return (value ?? '').trim();
}

export function readPromptBlockConfig(value: JsonValue): PluginPromptBlockConfig {
  const object = readJsonObjectValue(value);
  if (!object) {
    return {};
  }

  return {
    ...(typeof object.limit === 'number' ? { limit: object.limit } : {}),
    ...(typeof object.promptPrefix === 'string' ? { promptPrefix: object.promptPrefix } : {}),
  };
}

export function textIncludesKeyword(text: string, keyword?: string): boolean {
  const normalizedKeyword = sanitizeOptionalText(keyword);
  return Boolean(normalizedKeyword) && text.includes(normalizedKeyword);
}

export function resolvePromptBlockConfig(
  config: PluginPromptBlockConfig,
  defaults: {
    limit: number;
    promptPrefix: string;
  },
): {
  limit: number;
  promptPrefix: string;
} {
  return {
    limit: typeof config.limit === 'number' ? config.limit : defaults.limit,
    promptPrefix: sanitizeOptionalText(config.promptPrefix) || defaults.promptPrefix,
  };
}

export function parseCommaSeparatedNames(raw?: string): string[] | undefined {
  const normalized = sanitizeOptionalText(raw);
  if (!normalized) {
    return undefined;
  }

  const names = normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return names.length > 0 ? names : undefined;
}

export function filterAllowedToolNames(
  allowedToolNames: string[] | undefined,
  currentToolNames: string[],
): string[] | null {
  if (!allowedToolNames || allowedToolNames.length === 0) {
    return null;
  }

  const allowed = new Set(allowedToolNames);
  return currentToolNames.filter((toolName) => allowed.has(toolName));
}

export function sameToolNames(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((toolName, index) => toolName === right[index]);
}

export function readLatestUserTextFromMessages(
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | Array<{ type: string; text?: string }>;
  }>,
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') {
      continue;
    }

    if (typeof message.content === 'string') {
      return message.content.trim();
    }

    const text = message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('\n')
      .trim();
    if (text) {
      return text;
    }
  }

  return '';
}

export function clipContextText(content: string, maxLength = 240): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function readConversationSummary(
  value: JsonValue,
): {
  id?: string;
  title?: string;
} {
  const object = readJsonObjectValue(value);
  if (!object) {
    return {};
  }

  return {
    ...(typeof object.id === 'string' ? { id: object.id } : {}),
    ...(typeof object.title === 'string' ? { title: object.title } : {}),
  };
}

export function readConversationTitleConfig(
  value: JsonValue,
): PluginConversationTitleConfig {
  const object = readJsonObjectValue(value);
  if (!object) {
    return {};
  }

  return {
    ...(typeof object.defaultTitle === 'string'
      ? { defaultTitle: object.defaultTitle }
      : {}),
    ...(typeof object.maxMessages === 'number'
      ? { maxMessages: object.maxMessages }
      : {}),
  };
}

export function resolveConversationTitleRuntimeConfig(
  config: PluginConversationTitleConfig,
): {
  defaultTitle: string;
  maxMessages: number;
} {
  return {
    defaultTitle: sanitizeOptionalText(config.defaultTitle) || CONVERSATION_TITLE_DEFAULT_TITLE,
    maxMessages: typeof config.maxMessages === 'number'
      ? config.maxMessages
      : CONVERSATION_TITLE_DEFAULT_MAX_MESSAGES,
  };
}

export function readProviderRouterConfig(
  value: unknown,
): PluginProviderRouterConfig {
  const object = readJsonObjectValue(value);
  if (!object) {
    return {};
  }

  return {
    ...(typeof object.targetProviderId === 'string'
      ? { targetProviderId: object.targetProviderId }
      : {}),
    ...(typeof object.targetModelId === 'string'
      ? { targetModelId: object.targetModelId }
      : {}),
    ...(typeof object.allowedToolNames === 'string'
      ? { allowedToolNames: object.allowedToolNames }
      : {}),
    ...(typeof object.shortCircuitKeyword === 'string'
      ? { shortCircuitKeyword: object.shortCircuitKeyword }
      : {}),
    ...(typeof object.shortCircuitReply === 'string'
      ? { shortCircuitReply: object.shortCircuitReply }
      : {}),
  };
}

export function readCurrentProviderInfo(
  value: unknown,
): PluginCurrentProviderInfo {
  const object = readJsonObjectValue(value);
  if (!object) {
    return {};
  }

  return {
    ...(typeof object.providerId === 'string' ? { providerId: object.providerId } : {}),
    ...(typeof object.modelId === 'string' ? { modelId: object.modelId } : {}),
  };
}

export function readPersonaRouterConfig(
  value: unknown,
): PluginPersonaRouterConfig {
  const object = readJsonObjectValue(value);
  if (!object) {
    return {};
  }

  return {
    ...(typeof object.targetPersonaId === 'string'
      ? { targetPersonaId: object.targetPersonaId }
      : {}),
    ...(typeof object.switchKeyword === 'string'
      ? { switchKeyword: object.switchKeyword }
      : {}),
  };
}

export function readCurrentPersonaInfo(
  value: unknown,
): PluginCurrentPersonaInfo {
  const object = readJsonObjectValue(value);
  if (!object) {
    return {};
  }

  return {
    ...(typeof object.personaId === 'string' ? { personaId: object.personaId } : {}),
  };
}

export function readPersonaSummaryInfo(
  value: unknown,
): PluginPersonaSummaryInfo {
  const object = readJsonObjectValue(value);
  if (!object) {
    return {};
  }

  return {
    ...(typeof object.id === 'string' ? { id: object.id } : {}),
    ...(typeof object.prompt === 'string' ? { prompt: object.prompt } : {}),
  };
}

export function readConversationMessages(
  value: JsonValue,
): Array<{
  role?: string;
  content?: string;
}> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const object = readJsonObjectValue(entry);
    if (!object) {
      return [];
    }

    const message = {
      ...(typeof object.role === 'string' ? { role: object.role } : {}),
      ...(typeof object.content === 'string' ? { content: object.content } : {}),
    };

    return Object.keys(message).length > 0 ? [message] : [];
  });
}

export function readTextGenerationResult(
  value: JsonValue,
): {
  text?: string;
} {
  const object = readJsonObjectValue(value);
  if (!object || typeof object.text !== 'string') {
    return {};
  }

  return {
    text: object.text,
  };
}

export function shouldGenerateConversationTitle(
  title: string | undefined,
  defaultTitle: string,
): boolean {
  return sanitizeOptionalText(title) === defaultTitle;
}

export function buildConversationTitlePrompt(
  messages: Array<{
    role?: string;
    content?: string;
  }>,
  maxMessages: number,
): string {
  const visibleMessages = messages
    .filter((message) => typeof message.content === 'string' && sanitizeOptionalText(message.content))
    .slice(0, Math.max(1, maxMessages))
    .map((message) => `${mapConversationRoleLabel(message.role)}: ${sanitizeOptionalText(message.content)}`);

  if (visibleMessages.length === 0) {
    return '';
  }

  return [
    '请为下面这段对话生成一个简洁中文标题。',
    '要求：',
    '- 8 到 20 个字',
    '- 不要使用引号',
    '- 不要输出序号或解释',
    '- 只输出标题本身',
    '',
    '对话：',
    ...visibleMessages,
  ].join('\n');
}

export function sanitizeConversationTitle(raw?: string): string {
  if (!raw) {
    return '';
  }

  const firstLine = raw
    .trim()
    .split('\n')[0]
    .trim();

  return firstLine
    .replace(/^["'`「『]+/, '')
    .replace(/["'`」』]+$/, '')
    .trim();
}

function mapConversationRoleLabel(role?: string): string {
  switch (role) {
    case 'assistant':
      return '助手';
    case 'system':
      return '系统';
    case 'tool':
      return '工具';
    default:
      return '用户';
  }
}

export function readJsonObjectValue(
  value: unknown,
): Record<string, JsonValue> | null {
  return isJsonObjectValue(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

type CommandHandler = (
  params: JsonObject,
  context: PluginExecutionContext,
) => Promise<JsonValue> | JsonValue;

type PluginMessageHandlerResult =
  | MessageReceivedHookResult
  | PluginMessageContentResult
  | string
  | null
  | undefined;

type MessageHandler = (
  payload: MessageReceivedHookPayload,
  context: PluginExecutionContext,
) => Promise<PluginMessageHandlerResult> | PluginMessageHandlerResult;

type MessageCommandHandler = (
  input: PluginCommandInvocation,
  context: PluginExecutionContext,
) => Promise<PluginMessageHandlerResult> | PluginMessageHandlerResult;

type SessionWaiterHandler = (
  controller: PluginConversationSessionController,
  payload: MessageReceivedHookPayload,
  context: PluginExecutionContext,
) => Promise<PluginMessageHandlerResult> | PluginMessageHandlerResult;

type HookHandler = (
  payload: JsonValue,
  context: PluginExecutionContext,
) => Promise<JsonValue | null | undefined> | JsonValue | null | undefined;

type RouteHandler = (
  request: PluginRouteRequest,
  context: PluginExecutionContext,
) => Promise<PluginRouteResponse> | PluginRouteResponse;

type PluginClientPayload =
  | AuthPayload
  | RegisterPayload
  | ExecutePayload
  | ExecuteResultPayload
  | ExecuteErrorPayload
  | HostCallPayload
  | HostResultPayload
  | RouteResultPayload
  | JsonValue;

interface InternalMessageListener {
  kind: 'listener';
  order: number;
  priority: number;
  specificity: number;
  filter?: PluginHookMessageFilter;
  description?: string;
  handler: MessageHandler;
}

interface InternalCommandRegistration {
  kind: 'command' | 'group-help';
  order: number;
  priority: number;
  specificity: number;
  canonicalCommand: string;
  path: string[];
  variants: string[];
  description?: string;
  exactMatchOnly?: boolean;
  handler: MessageCommandHandler;
}

interface InternalCommandGroupNode {
  segment: string;
  aliases: string[];
  canonicalCommand: string;
  priority: number;
  description?: string;
  parent: InternalCommandGroupNode | null;
  children: InternalCommandGroupNode[];
  commands: InternalCommandRegistration[];
}

interface CommandSegmentDescriptor {
  segment: string;
  aliases: string[];
}

interface InternalConversationSessionController
  extends PluginConversationSessionController {
  setSession(session: PluginConversationSessionInfo | null): void;
}

interface InternalSessionWaiterRegistration {
  conversationId: string;
  handler: SessionWaiterHandler;
}

/**
 * 输出插件 SDK 的普通运行日志。
 * @param message 完整日志文本
 * @returns 无返回值
 */
function writePluginSdkLog(message: string): void {
  process.stdout.write(`${message}\n`);
}

/**
 * 输出插件 SDK 的错误日志。
 * @param message 完整日志文本
 * @returns 无返回值
 */
function writePluginSdkError(message: string): void {
  process.stderr.write(`${message}\n`);
}

export class PluginClient {
  private ws: WebSocket | null = null;
  private readonly handlers = new Map<string, CommandHandler>();
  private readonly hookHandlers = new Map<PluginHookName, HookHandler>();
  private readonly routeHandlers = new Map<string, RouteHandler>();
  private readonly messageHandlers: InternalMessageListener[] = [];
  private readonly commandHandlers: InternalCommandRegistration[] = [];
  private readonly commandGroups: InternalCommandGroupNode[] = [];
  private readonly commandPaths = new Set<string>();
  private readonly commandGroupPaths = new Set<string>();
  private readonly sessionWaiters = new Map<string, InternalSessionWaiterRegistration>();
  private readonly pendingHostCalls = new Map<string, {
    resolve: (value: JsonValue) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private connected = false;
  private messageHandlerOrder = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly options: Required<PluginClientOptions> & {
    manifest: PluginManifestInput;
  };

  constructor(options: PluginClientOptions) {
    this.options = {
      autoReconnect: true,
      reconnectInterval: 5000,
      heartbeatInterval: 20000,
      manifest: {},
      ...options,
    };
  }

  /**
   * 直接使用宿主返回的 remote bootstrap 信息创建一个插件客户端。
   * @param bootstrap 宿主 bootstrap 接口返回的连接信息
   * @param options 其余插件选项，例如 manifest 与重连参数
   * @returns 已准备好的插件客户端
   */
  static fromBootstrap(
    bootstrap: RemotePluginBootstrapInfo,
    options: Omit<PluginClientOptions, 'serverUrl' | 'token' | 'pluginName' | 'deviceType'> = {},
  ): PluginClient {
    return new PluginClient({
      ...options,
      serverUrl: bootstrap.serverUrl,
      token: bootstrap.token,
      pluginName: bootstrap.pluginName,
      deviceType: bootstrap.deviceType,
    });
  }

  /** 注册工具处理器。 */
  onCommand(capabilityName: string, handler: CommandHandler) {
    this.handlers.set(capabilityName, handler);
    return this;
  }

  /** 注册 Hook 处理器。 */
  onHook(hookName: PluginHookName, handler: HookHandler) {
    this.hookHandlers.set(hookName, handler);
    return this;
  }

  /** 注册 SDK 级消息监听器。 */
  onMessage(handler: MessageHandler, options: PluginMessageHandlerOptions = {}) {
    this.messageHandlers.push({
      kind: 'listener',
      order: this.nextMessageHandlerOrder(),
      priority: normalizePriority(options.priority),
      specificity: computeFilterSpecificity(options.filter),
      filter: cloneMessageFilter(options.filter),
      description: options.description,
      handler,
    });
    return this;
  }

  /** 注册一个消息命令。 */
  command(
    name: string,
    handler: MessageCommandHandler,
    options: PluginCommandOptions = {},
  ) {
    this.registerCommand(null, name, handler, options);
    return this;
  }

  /** 创建一个命令组。 */
  commandGroup(
    name: string,
    options: PluginCommandGroupOptions = {},
  ): PluginCommandGroupRegistration {
    const group = this.createCommandGroup(null, name, options);
    this.commandGroups.push(group);
    return this.createCommandGroupRegistration(group);
  }

  /** 注册 Route 处理器。 */
  onRoute(path: string, handler: RouteHandler) {
    this.routeHandlers.set(normalizeRoutePath(path), handler);
    return this;
  }

  /** 注册一个本地会话 waiter。 */
  sessionWaiter(handler: SessionWaiterHandler): PluginSessionWaiterHandle {
    return {
      start: async (context, input) => {
        const controller = context.host.conversationSession;
        const session = await controller.start(input);
        this.sessionWaiters.set(session.conversationId, {
          conversationId: session.conversationId,
          handler,
        });
        return session;
      },
    };
  }

  /**
   * 创建命令组注册器。
   * @param group 当前命令组节点
   * @returns 可继续挂子命令与子命令组的注册器
   */
  private createCommandGroupRegistration(
    group: InternalCommandGroupNode,
  ): PluginCommandGroupRegistration {
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

  /**
   * 注册一个命令组并顺手生成“精确命中时自动帮助”的内部处理器。
   * @param parentGroup 父命令组；根组时传 null
   * @param name 命令组名
   * @param options 别名、优先级与描述
   * @returns 已注册的命令组节点
   */
  private createCommandGroup(
    parentGroup: InternalCommandGroupNode | null,
    name: string,
    options: PluginCommandGroupOptions,
  ): InternalCommandGroupNode {
    const segment = normalizeCommandSegment(name);
    const aliases = normalizeCommandAliases(options.alias);
    const canonicalPath = this.buildCommandPathSegments(parentGroup, segment);
    const canonicalCommand = buildCanonicalCommandPath(canonicalPath);

    this.assertCommandPathAvailable(canonicalCommand, '命令组');
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
      kind: 'group-help',
      order: this.nextMessageHandlerOrder(),
      priority: group.priority,
      specificity: canonicalPath.length,
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

  /**
   * 注册一个命令处理器。
   * @param parentGroup 父命令组；根命令时传 null
   * @param name 命令名
   * @param handler 命令处理器
   * @param options 别名、优先级与描述
   * @returns 无返回值
   */
  private registerCommand(
    parentGroup: InternalCommandGroupNode | null,
    name: string,
    handler: MessageCommandHandler,
    options: PluginCommandOptions,
  ) {
    const segment = normalizeCommandSegment(name);
    const aliases = normalizeCommandAliases(options.alias);
    const path = this.buildCommandPathSegments(parentGroup, segment);
    const canonicalCommand = buildCanonicalCommandPath(path);

    this.assertCommandPathAvailable(canonicalCommand, '命令');
    this.commandPaths.add(canonicalCommand);

    const entry: InternalCommandRegistration = {
      kind: 'command',
      order: this.nextMessageHandlerOrder(),
      priority: normalizePriority(options.priority),
      specificity: path.length,
      canonicalCommand,
      path,
      variants: this.buildCommandVariants(parentGroup, segment, aliases),
      description: options.description,
      handler,
    };
    this.commandHandlers.push(entry);
    parentGroup?.commands.push(entry);
  }

  /**
   * 校验命令或命令组路径没有和既有声明冲突。
   * @param canonicalCommand 规范命令路径
   * @param label 当前注册对象名称
   * @returns 无返回值
   */
  private assertCommandPathAvailable(
    canonicalCommand: string,
    label: '命令' | '命令组',
  ) {
    if (this.commandPaths.has(canonicalCommand) || this.commandGroupPaths.has(canonicalCommand)) {
      throw new Error(`${label} ${canonicalCommand} 已注册，不能重复声明`);
    }
  }

  /**
   * 构建当前命令的规范路径分段。
   * @param parentGroup 父命令组
   * @param segment 当前段名
   * @returns 规范路径分段
   */
  private buildCommandPathSegments(
    parentGroup: InternalCommandGroupNode | null,
    segment: string,
  ): string[] {
    if (!parentGroup) {
      return [segment];
    }

    return [...parentGroup.canonicalCommand.replace(/^\//, '').split(' '), segment];
  }

  /**
   * 构建命令或命令组的所有完整命令路径。
   * @param parentGroup 父命令组
   * @param segment 当前段名
   * @param aliases 当前段别名
   * @returns 完整命令路径列表
   */
  private buildCommandVariants(
    parentGroup: InternalCommandGroupNode | null,
    segment: string,
    aliases: string[],
  ): string[] {
    return buildCommandVariants([
      ...this.getCommandSegmentDescriptors(parentGroup),
      {
        segment,
        aliases,
      },
    ]);
  }

  /**
   * 读取某个命令组自根向下的路径描述。
   * @param group 当前命令组
   * @returns 路径描述数组
   */
  private getCommandSegmentDescriptors(
    group: InternalCommandGroupNode | null,
  ): CommandSegmentDescriptor[] {
    if (!group) {
      return [];
    }

    return [
      ...this.getCommandSegmentDescriptors(group.parent),
      {
        segment: group.segment,
        aliases: group.aliases,
      },
    ];
  }

  /**
   * 为内部消息监听器生成稳定顺序。
   * @returns 自增序号
   */
  private nextMessageHandlerOrder(): number {
    const next = this.messageHandlerOrder;
    this.messageHandlerOrder += 1;
    return next;
  }

  /** 连接到服务器。 */
  connect() {
    if (this.ws) {
      return;
    }

    this.ws = new WebSocket(this.options.serverUrl);

    this.ws.on('open', () => {
      writePluginSdkLog(`[plugin-sdk] 已连接到 ${this.options.serverUrl}`);
      this.authenticate();
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg: WsMessage<PluginClientPayload> = JSON.parse(raw.toString());
        void this.handleMessage(msg);
      } catch (error) {
        writePluginSdkError(
          `[plugin-sdk] 消息解析失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });

    this.ws.on('close', () => {
      writePluginSdkLog('[plugin-sdk] 已断开连接');
      this.connected = false;
      this.stopHeartbeat();
      this.rejectPendingHostCalls(new Error('连接已关闭'));
      if (this.options.autoReconnect) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (error) => {
      writePluginSdkError(`[plugin-sdk] WebSocket 错误: ${error.message}`);
    });
  }

  /** 断开连接。 */
  disconnect() {
    this.options.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.rejectPendingHostCalls(new Error('插件主动断开连接'));
    this.ws?.close();
    this.ws = null;
  }

  /**
   * 发送认证请求。
   * @returns 无返回值
   */
  private authenticate() {
    this.send(WS_TYPE.AUTH, WS_ACTION.AUTHENTICATE, {
      token: this.options.token,
      pluginName: this.options.pluginName,
      deviceType: this.options.deviceType,
    });
  }

  /**
   * 发送 manifest 注册请求。
   * @returns 无返回值
   */
  private registerManifest() {
    this.send(WS_TYPE.PLUGIN, WS_ACTION.REGISTER, {
      manifest: this.resolveManifest(),
    });
  }

  /**
   * 处理服务器消息。
   * @param msg 服务器消息
   * @returns 无返回值
   */
  private async handleMessage(msg: WsMessage<PluginClientPayload>) {
    switch (msg.type) {
      case WS_TYPE.AUTH:
        if (msg.action === WS_ACTION.AUTH_OK) {
          writePluginSdkLog('[plugin-sdk] 认证通过');
          this.connected = true;
          this.registerManifest();
          this.startHeartbeat();
        } else if (msg.action === WS_ACTION.AUTH_FAIL) {
          writePluginSdkError(
            `[plugin-sdk] 认证失败: ${this.readErrorMessage(msg.payload)}`,
          );
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

  /**
   * 处理插件相关消息。
   * @param msg 插件消息
   * @returns 无返回值
   */
  private async handlePluginMessage(msg: WsMessage<PluginClientPayload>) {
    switch (msg.action) {
      case WS_ACTION.REGISTER_OK:
        writePluginSdkLog('[plugin-sdk] Manifest 已注册');
        return;
      case WS_ACTION.HOOK_INVOKE:
        await this.handleHookInvoke(msg);
        return;
      case WS_ACTION.ROUTE_INVOKE:
        await this.handleRouteInvoke(msg);
        return;
      case WS_ACTION.HOST_RESULT:
        try {
          this.resolveHostCall(
            msg.requestId,
            readHostResultPayload(msg.payload).data,
          );
        } catch (error) {
          this.rejectHostCall(
            msg.requestId,
            error instanceof Error ? error.message : String(error),
          );
        }
        return;
      case WS_ACTION.HOST_ERROR:
        this.rejectHostCall(
          msg.requestId,
          this.readErrorMessage(msg.payload),
        );
        return;
      default:
        return;
    }
  }

  /**
   * 处理工具执行请求。
   * @param msg 命令消息
   * @returns 无返回值
   */
  private async handleExecute(msg: WsMessage<PluginClientPayload>) {
    let payload: ExecutePayload;
    try {
      payload = readExecutePayload(msg.payload);
    } catch (error) {
      this.send(
        WS_TYPE.COMMAND,
        WS_ACTION.EXECUTE_ERROR,
        { error: error instanceof Error ? error.message : String(error) },
        msg.requestId,
      );
      return;
    }

    const toolName = payload.toolName ?? payload.capability ?? '';
    const handler = this.handlers.get(toolName);

    if (!handler) {
      this.send(
        WS_TYPE.COMMAND,
        WS_ACTION.EXECUTE_ERROR,
        { error: `未知工具：${toolName}` },
        msg.requestId,
      );
      return;
    }

    try {
      const result = await handler(
        payload.params,
        this.createExecutionContext(payload.context),
      );
      this.send(
        WS_TYPE.COMMAND,
        WS_ACTION.EXECUTE_RESULT,
        { data: result },
        msg.requestId,
      );
    } catch (error) {
      this.send(
        WS_TYPE.COMMAND,
        WS_ACTION.EXECUTE_ERROR,
        { error: error instanceof Error ? error.message : String(error) },
        msg.requestId,
      );
    }
  }

  /**
   * 处理 Hook 调用请求。
   * @param msg Hook 消息
   * @returns 无返回值
   */
  private async handleHookInvoke(msg: WsMessage<PluginClientPayload>) {
    let payload: HookInvokePayload;
    try {
      payload = readHookInvokePayload(msg.payload);
    } catch (error) {
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.HOOK_ERROR,
        { error: error instanceof Error ? error.message : String(error) },
        msg.requestId,
      );
      return;
    }

    const executionContext = this.createExecutionContext(payload.context);
    const hasInternalMessagePipeline = payload.hookName === 'message:received'
      && (this.messageHandlers.length > 0 || this.commandHandlers.length > 0);
    const handler = this.hookHandlers.get(payload.hookName);

    if (!handler && !hasInternalMessagePipeline) {
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.HOOK_ERROR,
        { error: `未知 Hook：${payload.hookName}` },
        msg.requestId,
      );
      return;
    }

    try {
      let result: JsonValue | null | undefined;
      if (payload.hookName === 'message:received') {
        result = await this.handleMessageReceivedHook(
          readMessageReceivedHookPayload(payload.payload),
          executionContext,
        );
      } else if (handler) {
        result = await handler(
          payload.payload,
          executionContext,
        );
      } else {
        throw new Error(`未知 Hook：${payload.hookName}`);
      }
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.HOOK_RESULT,
        { data: result ?? null },
        msg.requestId,
      );
    } catch (error) {
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.HOOK_ERROR,
        { error: error instanceof Error ? error.message : String(error) },
        msg.requestId,
      );
    }
  }

  /**
   * 处理 Route 调用请求。
   * @param msg Route 消息
   * @returns 无返回值
   */
  private async handleRouteInvoke(msg: WsMessage<PluginClientPayload>) {
    let payload: RouteInvokePayload;
    try {
      payload = readRouteInvokePayload(msg.payload);
    } catch (error) {
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.ROUTE_ERROR,
        { error: error instanceof Error ? error.message : String(error) },
        msg.requestId,
      );
      return;
    }

    const handler = this.routeHandlers.get(normalizeRoutePath(payload.request.path));

    if (!handler) {
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.ROUTE_ERROR,
        { error: `未知 Route：${payload.request.path}` },
        msg.requestId,
      );
      return;
    }

    try {
      const result = await handler(
        payload.request,
        this.createExecutionContext(payload.context),
      );
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.ROUTE_RESULT,
        { data: normalizeRouteResponse(result) },
        msg.requestId,
      );
    } catch (error) {
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.ROUTE_ERROR,
        { error: error instanceof Error ? error.message : String(error) },
        msg.requestId,
      );
    }
  }

  /**
   * 创建插件执行上下文。
   * @param callContext 当前调用上下文
   * @returns 带 Host API 门面的执行上下文
   */
  private createExecutionContext(
    callContext?: PluginCallContext,
  ): PluginExecutionContext {
    const context = callContext ?? { source: 'plugin' as const };
    const conversationSession = this.createConversationSessionController(context);
    const call: PluginHostFacade['call'] = (method, params) =>
      this.sendHostCall(method, params, context);
    const callHost = <T>(
      method: HostCallPayload['method'],
      params: JsonObject = {},
    ): Promise<T> => this.callHost<T>(method, params, context);

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

  /**
   * 解析当前插件最终应声明的 Hook 描述。
   * @returns 去重后的 Hook 描述列表
   */
  private resolveHookDescriptors(): PluginHookDescriptor[] {
    const hooks = (this.options.manifest.hooks ?? []).map(
      (hook: PluginHookDescriptor) => cloneHookDescriptor(hook),
    );

    for (const hookName of this.hookHandlers.keys()) {
      if (hookName === 'message:received') {
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

  /**
   * 解析当前插件最终应声明的命令描述。
   * @returns 去重后的命令描述列表
   */
  private resolveCommandDescriptors(): PluginCommandDescriptor[] {
    const commands = (this.options.manifest.commands ?? []).map(
      (command: PluginCommandDescriptor) => cloneCommandDescriptor(command),
    );

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

  /**
   * 把一个 Hook 描述合并到最终 manifest 中。
   * @param hooks 当前 Hook 列表
   * @param descriptor 待合并的 Hook 描述
   * @returns 无返回值
   */
  private ensureHookDescriptor(
    hooks: PluginHookDescriptor[],
    descriptor: PluginHookDescriptor,
  ) {
    const existing = hooks.find((hook) => hook.name === descriptor.name);
    if (existing) {
      if (typeof existing.priority !== 'number' && typeof descriptor.priority === 'number') {
        existing.priority = descriptor.priority;
      }
      if (!existing.description && descriptor.description) {
        existing.description = descriptor.description;
      }
      if (!existing.filter && descriptor.filter) {
        existing.filter = cloneHookFilterDescriptor(descriptor.filter);
      }
      return;
    }

    hooks.push(cloneHookDescriptor(descriptor));
  }

  /**
   * 把一个命令描述合并到最终 manifest 中。
   * @param commands 当前命令列表
   * @param descriptor 待合并的命令描述
   * @returns 无返回值
   */
  private ensureCommandDescriptor(
    commands: PluginCommandDescriptor[],
    descriptor: PluginCommandDescriptor,
  ) {
    const existing = commands.find((command) =>
      command.kind === descriptor.kind
      && command.canonicalCommand === descriptor.canonicalCommand);
    if (existing) {
      existing.path = descriptor.path.length > 0 ? [...descriptor.path] : [...existing.path];
      existing.aliases = dedupeStrings([...existing.aliases, ...descriptor.aliases])
        .filter((alias) => alias !== existing.canonicalCommand);
      existing.variants = dedupeStrings([...existing.variants, ...descriptor.variants]);
      if (!existing.description && descriptor.description) {
        existing.description = descriptor.description;
      }
      if (typeof existing.priority !== 'number' && typeof descriptor.priority === 'number') {
        existing.priority = descriptor.priority;
      }
      return;
    }

    commands.push(cloneCommandDescriptor(descriptor));
  }

  /**
   * 当 SDK 内部注册了消息监听器或命令 DSL 时，自动合成一个 `message:received` Hook 描述。
   * @returns 合成后的 Hook 描述；没有消息管线时返回 null
   */
  private buildSyntheticMessageReceivedHook(): PluginHookDescriptor | null {
    if (
      this.messageHandlers.length === 0
      && this.commandHandlers.length === 0
      && !this.hookHandlers.has('message:received')
    ) {
      return null;
    }

    const priorities = [
      ...this.messageHandlers.map((listener) => listener.priority),
      ...this.commandHandlers.map((command) => command.priority),
    ];
    const filter = this.buildSyntheticMessageFilter();

    return {
      name: 'message:received',
      ...(priorities.length > 0 ? { priority: Math.min(...priorities) } : {}),
      ...(filter ? { filter: { message: filter } } : {}),
    };
  }

  /**
   * 尝试从 SDK 内部消息监听器里收敛一个安全可合成的 message filter。
   * @returns 可声明的统一过滤器；无法安全收敛时返回 undefined
   */
  private buildSyntheticMessageFilter(): PluginHookMessageFilter | undefined {
    const filters: PluginHookMessageFilter[] = [
      ...this.messageHandlers
        .map((listener) => listener.filter)
        .filter((filter): filter is PluginHookMessageFilter => Boolean(filter)),
      ...this.commandHandlers.map((command) => ({
        commands: [...command.variants],
      })),
    ];

    if (filters.length === 0 || filters.some((filter) => isEmptyMessageFilter(filter))) {
      return undefined;
    }

    if (filters.every((filter) => hasOnlyMessageFilterKey(filter, 'commands'))) {
      return {
        commands: dedupeStrings(filters.flatMap((filter) => filter.commands ?? [])),
      };
    }

    if (filters.every((filter) => hasOnlyMessageFilterKey(filter, 'messageKinds'))) {
      return {
        messageKinds: dedupeStrings(filters.flatMap((filter) => filter.messageKinds ?? [])) as
          PluginHookMessageFilter['messageKinds'],
      };
    }

    if (filters.every((filter) => hasOnlyMessageFilterKey(filter, 'regex'))) {
      const regexes = filters
        .map((filter) => filter.regex)
        .filter((regex): regex is NonNullable<PluginHookMessageFilter['regex']> => Boolean(regex));
      const flags = dedupeStrings(
        regexes
          .map((regex) => typeof regex === 'string' ? '' : regex.flags ?? '')
          .join('')
          .split(''),
      ).join('');

      return {
        regex: {
          pattern: regexes
            .map((regex) => `(?:${typeof regex === 'string' ? regex : regex.pattern})`)
            .join('|'),
          ...(flags ? { flags } : {}),
        },
      };
    }

    return undefined;
  }

  /**
   * 在 SDK 内部执行 `message:received` 二次分发。
   * @param payload 当前消息 Hook 载荷
   * @param context 插件执行上下文
   * @returns 最终要回给宿主的 Hook 结果
   */
  private async handleMessageReceivedHook(
    payload: MessageReceivedHookPayload,
    context: PluginExecutionContext,
  ): Promise<JsonValue | null> {
    const originalPayload = cloneJsonValue(payload);
    let currentPayload = cloneJsonValue(payload);
    let hasMutation = false;

    const sessionWaiterResult = await this.runSessionWaiter(currentPayload, context);
    if (sessionWaiterResult) {
      if (sessionWaiterResult.action === 'short-circuit') {
        return toHostJsonValue(sessionWaiterResult);
      }
      if (sessionWaiterResult.action === 'mutate') {
        currentPayload = applyMessageReceivedMutation(currentPayload, sessionWaiterResult);
        hasMutation = true;
      }
    }

    for (const listener of this.listMessagePipelineEntries()) {
      const normalizedResult = await this.runMessagePipelineEntry(listener, currentPayload, context);
      if (!normalizedResult || normalizedResult.action === 'pass') {
        continue;
      }
      if (normalizedResult.action === 'short-circuit') {
        return toHostJsonValue(normalizedResult);
      }

      currentPayload = applyMessageReceivedMutation(currentPayload, normalizedResult);
      hasMutation = true;
    }

    if (hasMutation) {
      return toHostJsonValue(buildMessageReceivedMutationResult(
        originalPayload,
        currentPayload,
      ));
    }

    const fallbackHandler = this.hookHandlers.get('message:received');
    if (!fallbackHandler) {
      return {
        action: 'pass',
      };
    }

    const rawResult = await fallbackHandler(
      toHostJsonValue(cloneJsonValue(payload)),
      context,
    );

    return normalizeRawMessageHookResult(rawResult);
  }

  /**
   * 当当前会话命中了本地 waiter 时，优先执行 waiter handler。
   * @param payload 当前消息载荷
   * @param context 当前执行上下文
   * @returns 归一化后的 Hook 结果；没有 waiter 时返回 null
   */
  private async runSessionWaiter(
    payload: MessageReceivedHookPayload,
    context: PluginExecutionContext,
  ): Promise<MessageReceivedHookResult | null> {
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

    return normalizeMessageListenerResult(await registration.handler(
      controller,
      cloneJsonValue(payload),
      context,
    ));
  }

  /**
   * 为当前执行上下文创建一个本地会话控制器。
   * @param context 插件调用上下文
   * @returns 绑定当前上下文的会话控制器
   */
  private createConversationSessionController(
    context: PluginCallContext,
  ): InternalConversationSessionController {
    let currentSession: PluginConversationSessionInfo | null = null;
    const callHost = <T>(
      method: HostCallPayload['method'],
      params: JsonObject = {},
    ): Promise<T> => this.callHost<T>(method, params, context);

    const setSession = (session: PluginConversationSessionInfo | null) => {
      currentSession = session ? cloneConversationSessionInfo(session) : null;
    };
    const clearLocalWaiter = (conversationId?: string | null) => {
      const targetConversationId = conversationId
        ?? currentSession?.conversationId
        ?? context.conversationId
        ?? null;
      if (targetConversationId) {
        this.sessionWaiters.delete(targetConversationId);
      }
    };
    const startSession = async (
      input: PluginConversationSessionStartParams,
    ): Promise<PluginConversationSessionInfo> => {
      const params: JsonObject = {
        timeoutMs: input.timeoutMs,
      };
      if (typeof input.captureHistory === 'boolean') {
        params.captureHistory = input.captureHistory;
      }
      if (typeof input.metadata !== 'undefined') {
        params.metadata = input.metadata;
      }

      const session = await callHost<PluginConversationSessionInfo>(
        'conversation.session.start',
        params,
      );
      setSession(session);
      return cloneConversationSessionInfo(session);
    };
    const getSession = async (): Promise<PluginConversationSessionInfo | null> => {
      const previousConversationId = currentSession?.conversationId ?? context.conversationId;
      const session = await callHost<PluginConversationSessionInfo | null>(
        'conversation.session.get',
      );
      setSession(session);
      if (!session) {
        clearLocalWaiter(previousConversationId);
      }
      return session ? cloneConversationSessionInfo(session) : null;
    };
    const keepSession = async (
      input: PluginConversationSessionKeepParams,
    ): Promise<PluginConversationSessionInfo | null> => {
      const previousConversationId = currentSession?.conversationId ?? context.conversationId;
      const params: JsonObject = {
        timeoutMs: input.timeoutMs,
      };
      if (typeof input.resetTimeout === 'boolean') {
        params.resetTimeout = input.resetTimeout;
      }

      const session = await callHost<PluginConversationSessionInfo | null>(
        'conversation.session.keep',
        params,
      );
      setSession(session);
      if (!session) {
        clearLocalWaiter(previousConversationId);
      }
      return session ? cloneConversationSessionInfo(session) : null;
    };
    const finishSession = async (): Promise<boolean> => {
      const previousConversationId = currentSession?.conversationId ?? context.conversationId;
      const finished = await callHost<boolean>('conversation.session.finish');
      clearLocalWaiter(previousConversationId);
      setSession(null);
      return finished;
    };

    return {
      get conversationId() {
        return currentSession?.conversationId ?? context.conversationId ?? null;
      },
      get session() {
        return currentSession ? cloneConversationSessionInfo(currentSession) : null;
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
        return currentSession
          ? currentSession.historyMessages.map((message) => cloneMessageHookInfo(message))
          : [];
      },
      get metadata() {
        return typeof currentSession?.metadata !== 'undefined'
          ? cloneJsonValue(currentSession.metadata)
          : undefined;
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

  /**
   * 读取当前插件内部消息管线的稳定执行顺序。
   * @returns 已排序的消息监听与命令列表
   */
  private listMessagePipelineEntries(): Array<InternalMessageListener | InternalCommandRegistration> {
    return [...this.messageHandlers, ...this.commandHandlers].sort((left, right) => {
      const priorityDiff = left.priority - right.priority;
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      const specificityDiff = right.specificity - left.specificity;
      if (specificityDiff !== 0) {
        return specificityDiff;
      }

      if (left.kind !== right.kind) {
        if (left.kind === 'command') {
          return -1;
        }
        if (right.kind === 'command') {
          return 1;
        }
      }

      return left.order - right.order;
    });
  }

  /**
   * 执行单个 SDK 内部消息管线节点。
   * @param entry 当前监听器或命令
   * @param payload 当前消息载荷
   * @param context 插件执行上下文
   * @returns 归一化后的 Hook 结果；未命中时返回 null
   */
  private async runMessagePipelineEntry(
    entry: InternalMessageListener | InternalCommandRegistration,
    payload: MessageReceivedHookPayload,
    context: PluginExecutionContext,
  ): Promise<MessageReceivedHookResult | null> {
    if (entry.kind === 'listener') {
      if (!matchesMessageFilter(payload, entry.filter)) {
        return null;
      }

      return normalizeMessageListenerResult(await entry.handler(
        cloneJsonValue(payload),
        context,
      ));
    }

    const matchedCommand = matchRegisteredCommand(payload, entry);
    if (!matchedCommand) {
      return null;
    }

    return normalizeMessageListenerResult(await entry.handler(
      {
        matchedCommand: matchedCommand.command,
        canonicalCommand: entry.canonicalCommand,
        path: [...entry.path],
        args: matchedCommand.args,
        rawArgs: matchedCommand.rawArgs,
        payload: cloneJsonValue(payload),
      },
      context,
    ));
  }

  /**
   * 通过 WebSocket 发起一次 Host API 调用。
   * @param method Host API 方法名
   * @param params JSON 参数
   * @param context 调用上下文
   * @returns Host API 返回值
   */
  private sendHostCall(
    method: HostCallPayload['method'],
    params: JsonObject,
    context: PluginCallContext,
  ): Promise<JsonValue> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('插件尚未连接到服务器'));
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

  /**
   * 发起一次带类型收口的 Host API 调用。
   * @param method Host API 方法名
   * @param params JSON 参数
   * @param context 调用上下文
   * @returns 收口后的结构化结果
   */
  private callHost<T>(
    method: HostCallPayload['method'],
    params: JsonObject = {},
    context: PluginCallContext,
  ): Promise<T> {
    return this.sendHostCall(method, params, context) as Promise<T>;
  }

  /**
   * 解析当前插件应发送的 manifest。
   * @returns 完整 manifest
   */
  private resolveManifest(): PluginManifest {
    const hooks = this.resolveHookDescriptors();
    const commands = this.resolveCommandDescriptors();

    return {
      id: this.options.pluginName,
      name: this.options.manifest.name ?? this.options.pluginName,
      version: this.options.manifest.version ?? '0.0.0',
      runtime: 'remote',
      description: this.options.manifest.description,
      permissions: this.options.manifest.permissions ?? [],
      tools: this.options.manifest.tools ?? [],
      ...(commands.length > 0 ? { commands } : {}),
      hooks,
      config: this.options.manifest.config,
      routes: this.options.manifest.routes ?? [],
    };
  }

  /**
   * 启动心跳。
   * @returns 无返回值
   */
  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send(WS_TYPE.HEARTBEAT, WS_ACTION.PING, {});
    }, this.options.heartbeatInterval);
  }

  /**
   * 停止心跳。
   * @returns 无返回值
   */
  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 安排重连。
   * @returns 无返回值
   */
  private scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }
    writePluginSdkLog(
      `[plugin-sdk] 将在 ${this.options.reconnectInterval}ms 后重连...`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ws = null;
      this.connect();
    }, this.options.reconnectInterval);
  }

  /**
   * 发送一条 WebSocket 消息。
   * @param type 消息 type
   * @param action 消息 action
   * @param payload JSON 负载
   * @param requestId 可选 requestId
   * @returns 无返回值
   */
  private send(
    type: string,
    action: string,
    payload: PluginClientPayload,
    requestId?: string,
  ) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg: WsMessage<PluginClientPayload> = { type, action, payload, requestId };
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * 成功解析一个等待中的 Host API 调用。
   * @param requestId 请求 ID
   * @param value Host API 返回值
   * @returns 无返回值
   */
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

  /**
   * 失败终止一个等待中的 Host API 调用。
   * @param requestId 请求 ID
   * @param message 错误信息
   * @returns 无返回值
   */
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

  /**
   * 统一失败所有等待中的 Host API 调用。
   * @param error 要抛出的错误
   * @returns 无返回值
   */
  private rejectPendingHostCalls(error: Error) {
    for (const [requestId, pending] of this.pendingHostCalls) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingHostCalls.delete(requestId);
    }
  }

  /**
   * 从 payload 中读取错误文本。
   * @param payload JSON 负载
   * @returns 错误文本
   */
  private readErrorMessage(payload: PluginClientPayload): string {
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'string'
    ) {
      return payload.error;
    }

    return String(payload);
  }
}

export {
  DeviceType,
  type PluginCapability,
  type PluginCronDescriptor,
  type PluginCronJobSummary,
  type PluginHookName,
  type PluginHookMessageFilter,
  type PluginRouteDescriptor,
  type PluginRouteRequest,
  type PluginRouteResponse,
} from '@garlic-claw/shared';

/**
 * 渲染命令组帮助树。
 * @param group 命令组节点
 * @returns 可直接短路发回宿主的帮助文本
 */
function renderCommandGroupHelp(group: InternalCommandGroupNode): string {
  const lines = [group.canonicalCommand];
  const treeLines = renderCommandGroupTree(group, '');

  if (treeLines.length === 0) {
    if (group.description) {
      lines.push(group.description);
    }
    return lines.join('\n');
  }

  lines.push(...treeLines);
  return lines.join('\n');
}

/**
 * 递归渲染命令组树。
 * @param group 命令组节点
 * @param prefix 当前层级前缀
 * @returns 树形文本行
 */
function renderCommandGroupTree(
  group: InternalCommandGroupNode,
  prefix: string,
): string[] {
  const lines: string[] = [];
  const commands = group.commands
    .filter((command) => command.kind === 'command')
    .sort((left, right) => left.path[left.path.length - 1].localeCompare(right.path[right.path.length - 1]));
  const children = [...group.children].sort((left, right) =>
    left.segment.localeCompare(right.segment),
  );

  for (const command of commands) {
    lines.push(
      formatCommandTreeLine(
        prefix,
        command.path[command.path.length - 1],
        command.variants
          .map((variant) => variant.replace(/^\//, '').split(' ').pop() ?? '')
          .filter((alias) => alias !== command.path[command.path.length - 1]),
        command.description,
      ),
    );
  }

  for (const child of children) {
    lines.push(formatCommandTreeLine(prefix, child.segment, child.aliases, child.description));
    lines.push(...renderCommandGroupTree(child, `${prefix}│   `));
  }

  return lines;
}

/**
 * 格式化一条命令帮助行。
 * @param prefix 当前树前缀
 * @param segment 命令段名
 * @param aliases 命令别名
 * @param description 可选描述
 * @returns 单行帮助文本
 */
function formatCommandTreeLine(
  prefix: string,
  segment: string,
  aliases: string[],
  description?: string,
): string {
  const aliasText = aliases.length > 0 ? ` [${aliases.join(', ')}]` : '';
  const descriptionText = description ? `: ${description}` : '';
  return `${prefix}├── ${segment}${aliasText}${descriptionText}`;
}

function isChatMessagePartArray(
  value: unknown,
): value is NonNullable<PluginMessageHookInfo['parts']> {
  return Array.isArray(value)
    && value.every((part) => {
      if (!isJsonObjectValue(part) || typeof part.type !== 'string') {
        return false;
      }
      if (part.type === 'text') {
        return typeof part.text === 'string';
      }
      if (part.type === 'image') {
        return typeof part.image === 'string'
          && (!('mimeType' in part) || typeof part.mimeType === 'string');
      }
      return false;
    });
}

function isPluginLlmMessageArray(
  value: unknown,
): value is MessageReceivedHookPayload['modelMessages'] {
  return Array.isArray(value)
    && value.every((message) => {
      if (
        !isJsonObjectValue(message)
        || !isOneOf(message.role, ['user', 'assistant', 'system', 'tool'])
      ) {
        return false;
      }

      return typeof message.content === 'string'
        || isChatMessagePartArray(message.content);
    });
}

function isPluginCallContext(value: unknown): value is PluginCallContext {
  if (!isJsonObjectValue(value) || !isOneOf(value.source, PLUGIN_INVOCATION_SOURCE_VALUES)) {
    return false;
  }

  return (!('userId' in value) || typeof value.userId === 'string')
    && (!('conversationId' in value) || typeof value.conversationId === 'string')
    && (!('automationId' in value) || typeof value.automationId === 'string')
    && (!('cronJobId' in value) || typeof value.cronJobId === 'string')
    && (!('activeProviderId' in value) || typeof value.activeProviderId === 'string')
    && (!('activeModelId' in value) || typeof value.activeModelId === 'string')
    && (!('activePersonaId' in value) || typeof value.activePersonaId === 'string')
    && (!('metadata' in value) || isJsonObjectValue(value.metadata));
}

function isPluginMessageHookInfo(value: unknown): value is PluginMessageHookInfo {
  if (
    !isJsonObjectValue(value)
    || typeof value.role !== 'string'
    || (value.content !== null && typeof value.content !== 'string')
    || !isChatMessagePartArray(value.parts)
  ) {
    return false;
  }

  return (!('id' in value) || typeof value.id === 'string')
    && (!('provider' in value) || value.provider === null || typeof value.provider === 'string')
    && (!('model' in value) || value.model === null || typeof value.model === 'string')
    && (!('status' in value) || typeof value.status === 'undefined' || isChatMessageStatus(value.status));
}

function isPluginConversationSessionInfo(
  value: unknown,
): value is PluginConversationSessionInfo {
  if (
    !isJsonObjectValue(value)
    || typeof value.pluginId !== 'string'
    || typeof value.conversationId !== 'string'
    || typeof value.timeoutMs !== 'number'
    || typeof value.startedAt !== 'string'
    || typeof value.expiresAt !== 'string'
    || (value.lastMatchedAt !== null && typeof value.lastMatchedAt !== 'string')
    || typeof value.captureHistory !== 'boolean'
    || !Array.isArray(value.historyMessages)
    || !value.historyMessages.every((message) => isPluginMessageHookInfo(message))
  ) {
    return false;
  }

  return !('metadata' in value) || isJsonValue(value.metadata);
}

function isPluginRouteMethod(value: unknown): value is PluginRouteRequest['method'] {
  return isOneOf(value, PLUGIN_ROUTE_METHOD_VALUES);
}

function isPluginRouteRequest(value: unknown): value is PluginRouteRequest {
  return isJsonObjectValue(value)
    && typeof value.path === 'string'
    && isPluginRouteMethod(value.method)
    && isStringRecord(value.headers)
    && isJsonObjectValue(value.query)
    && Object.prototype.hasOwnProperty.call(value, 'body')
    && (value.body === null || isJsonValue(value.body));
}

function isPluginHookName(value: unknown): value is PluginHookName {
  return isOneOf(value, PLUGIN_HOOK_NAME_VALUES);
}

function readJsonObjectPayload(payload: PluginClientPayload | JsonValue, label: string): JsonObject {
  if (!isJsonObjectValue(payload)) {
    throw new Error(`Invalid ${label} payload: expected JSON object`);
  }

  return payload;
}

/**
 * 读取 Hook 调用负载。
 * @param payload 原始消息负载
 * @returns 结构化 Hook 调用负载
 */
function readHookInvokePayload(payload: PluginClientPayload): HookInvokePayload {
  const jsonPayload = readJsonObjectPayload(payload, 'hook invoke');

  if (!isPluginHookName(jsonPayload.hookName)) {
    throw new Error('Invalid hook invoke payload: hookName');
  }
  if (!isPluginCallContext(jsonPayload.context)) {
    throw new Error('Invalid hook invoke payload: context');
  }
  if (
    !Object.prototype.hasOwnProperty.call(jsonPayload, 'payload')
    || !isJsonValue(jsonPayload.payload)
  ) {
    throw new Error('Invalid hook invoke payload: payload');
  }

  return {
    hookName: jsonPayload.hookName,
    context: jsonPayload.context,
    payload: jsonPayload.payload,
  };
}

/**
 * 读取工具执行负载。
 * @param payload 原始消息负载
 * @returns 结构化执行负载
 */
function readExecutePayload(payload: PluginClientPayload): ExecutePayload {
  const jsonPayload = readJsonObjectPayload(payload, 'execute');

  if (
    'toolName' in jsonPayload
    && typeof jsonPayload.toolName !== 'undefined'
    && typeof jsonPayload.toolName !== 'string'
  ) {
    throw new Error('Invalid execute payload: toolName');
  }
  if (
    'capability' in jsonPayload
    && typeof jsonPayload.capability !== 'undefined'
    && typeof jsonPayload.capability !== 'string'
  ) {
    throw new Error('Invalid execute payload: capability');
  }
  if (!isJsonObjectValue(jsonPayload.params)) {
    throw new Error('Invalid execute payload: params');
  }
  if (
    'context' in jsonPayload
    && typeof jsonPayload.context !== 'undefined'
    && !isPluginCallContext(jsonPayload.context)
  ) {
    throw new Error('Invalid execute payload: context');
  }

  return {
    ...(typeof jsonPayload.toolName === 'string' ? { toolName: jsonPayload.toolName } : {}),
    ...(typeof jsonPayload.capability === 'string' ? { capability: jsonPayload.capability } : {}),
    params: jsonPayload.params,
    ...(isPluginCallContext(jsonPayload.context) ? { context: jsonPayload.context } : {}),
  };
}

/**
 * 读取 Host API 返回负载。
 * @param payload 原始消息负载
 * @returns 结构化 Host 返回负载
 */
function readHostResultPayload(payload: PluginClientPayload): HostResultPayload {
  const jsonPayload = readJsonObjectPayload(payload, 'host result');

  if (
    !Object.prototype.hasOwnProperty.call(jsonPayload, 'data')
    || !isJsonValue(jsonPayload.data)
  ) {
    throw new Error('Invalid host result payload: data');
  }

  return {
    data: jsonPayload.data,
  };
}

/**
 * 读取 Route 调用负载。
 * @param payload 原始消息负载
 * @returns 结构化 Route 调用负载
 */
function readRouteInvokePayload(payload: PluginClientPayload): RouteInvokePayload {
  const jsonPayload = readJsonObjectPayload(payload, 'route invoke');

  if (!isPluginRouteRequest(jsonPayload.request)) {
    throw new Error('Invalid route invoke payload: request');
  }
  if (!isPluginCallContext(jsonPayload.context)) {
    throw new Error('Invalid route invoke payload: context');
  }

  return {
    request: jsonPayload.request,
    context: jsonPayload.context,
  };
}

/**
 * 读取收到消息 Hook 负载。
 * @param payload 原始 Hook 负载
 * @returns 结构化收到消息 Hook 负载
 */
function readMessageReceivedHookPayload(
  payload: JsonValue,
): MessageReceivedHookPayload {
  const jsonPayload = readJsonObjectPayload(payload, 'message:received');

  if (!isPluginCallContext(jsonPayload.context)) {
    throw new Error('Invalid message:received payload: context');
  }
  if (typeof jsonPayload.conversationId !== 'string') {
    throw new Error('Invalid message:received payload: conversationId');
  }
  if (typeof jsonPayload.providerId !== 'string') {
    throw new Error('Invalid message:received payload: providerId');
  }
  if (typeof jsonPayload.modelId !== 'string') {
    throw new Error('Invalid message:received payload: modelId');
  }
  if (!isPluginMessageHookInfo(jsonPayload.message)) {
    throw new Error('Invalid message:received payload: message');
  }
  if (!isPluginLlmMessageArray(jsonPayload.modelMessages)) {
    throw new Error('Invalid message:received payload: modelMessages');
  }
  if (
    typeof jsonPayload.session !== 'undefined'
    && jsonPayload.session !== null
    && !isPluginConversationSessionInfo(jsonPayload.session)
  ) {
    throw new Error('Invalid message:received payload: session');
  }

  return {
    context: jsonPayload.context,
    conversationId: jsonPayload.conversationId,
    providerId: jsonPayload.providerId,
    modelId: jsonPayload.modelId,
    ...(typeof jsonPayload.session !== 'undefined' ? { session: jsonPayload.session } : {}),
    message: jsonPayload.message,
    modelMessages: jsonPayload.modelMessages,
  };
}

/**
 * 复制一条消息快照。
 * @param message 原始消息快照
 * @returns 深拷贝后的消息快照
 */
function cloneMessageHookInfo(message: PluginMessageHookInfo): PluginMessageHookInfo {
  return cloneJsonValue(message);
}

/**
 * 复制一条会话等待态快照。
 * @param session 原始会话等待态
 * @returns 深拷贝后的会话等待态
 */
function cloneConversationSessionInfo(
  session: PluginConversationSessionInfo,
): PluginConversationSessionInfo {
  return cloneJsonValue(session);
}

/**
 * 复制一条 Hook 描述。
 * @param hook 原始 Hook 描述
 * @returns 深拷贝后的 Hook 描述
 */
function cloneHookDescriptor(hook: PluginHookDescriptor): PluginHookDescriptor {
  return {
    name: hook.name,
    ...(hook.description ? { description: hook.description } : {}),
    ...(typeof hook.priority === 'number' ? { priority: hook.priority } : {}),
    ...(hook.filter ? { filter: cloneHookFilterDescriptor(hook.filter) } : {}),
  };
}

/**
 * 复制一条命令描述。
 * @param command 原始命令描述
 * @returns 深拷贝后的命令描述
 */
function cloneCommandDescriptor(command: PluginCommandDescriptor): PluginCommandDescriptor {
  return {
    kind: command.kind,
    canonicalCommand: command.canonicalCommand,
    path: [...command.path],
    aliases: [...command.aliases],
    variants: [...command.variants],
    ...(command.description ? { description: command.description } : {}),
    ...(typeof command.priority === 'number' ? { priority: command.priority } : {}),
  };
}

/**
 * 复制 Hook 过滤描述。
 * @param filter 原始过滤描述
 * @returns 深拷贝后的过滤描述
 */
function cloneHookFilterDescriptor(
  filter: NonNullable<PluginHookDescriptor['filter']>,
): NonNullable<PluginHookDescriptor['filter']> {
  return {
    ...(filter.message ? { message: cloneMessageFilter(filter.message) } : {}),
  };
}

/**
 * 复制消息过滤描述。
 * @param filter 原始消息过滤
 * @returns 深拷贝后的消息过滤
 */
function cloneMessageFilter(
  filter?: PluginHookMessageFilter,
): PluginHookMessageFilter | undefined {
  if (!filter) {
    return undefined;
  }

  return {
    ...(filter.commands ? { commands: [...filter.commands] } : {}),
    ...(filter.regex
      ? {
          regex: typeof filter.regex === 'string'
            ? filter.regex
            : {
                pattern: filter.regex.pattern,
                ...(filter.regex.flags ? { flags: filter.regex.flags } : {}),
              },
        }
      : {}),
    ...(filter.messageKinds ? { messageKinds: [...filter.messageKinds] } : {}),
  };
}

/**
 * 匹配某个已注册命令在当前消息中的具体命中信息。
 * @param payload 当前消息载荷
 * @param command 已注册命令
 * @returns 命中信息；未命中时返回 null
 */
function matchRegisteredCommand(
  payload: MessageReceivedHookPayload,
  command: InternalCommandRegistration,
): { command: string; rawArgs: string; args: string[] } | null {
  const messageText = getMessageReceivedText(payload).trimStart();

  for (const variant of command.variants) {
    if (command.exactMatchOnly) {
      if (messageText.trim() !== variant) {
        continue;
      }
      return {
        command: variant,
        rawArgs: '',
        args: [],
      };
    }

    if (!matchesMessageCommand(messageText, variant)) {
      continue;
    }

    const rawArgs = messageText.slice(variant.length).trim();
    return {
      command: variant,
      rawArgs,
      args: rawArgs ? rawArgs.split(/\s+/).filter(Boolean) : [],
    };
  }

  return null;
}

/**
 * 归一化 SDK 级消息监听器的返回值。
 * @param result 原始返回值
 * @returns 统一 Hook 结果；未返回时为 null
 */
function normalizeMessageListenerResult(
  result: PluginMessageHandlerResult,
): MessageReceivedHookResult | null {
  if (result === null || result === undefined) {
    return null;
  }
  if (
    isJsonObjectValue(result)
    && 'action' in result
    && typeof result.action === 'string'
  ) {
    return readMessageListenerHookResult(result);
  }
  if (typeof result === 'string') {
    return {
      action: 'short-circuit',
      assistantContent: result,
    };
  }
  if (typeof result === 'object' && result !== null && 'content' in result) {
    return {
      action: 'short-circuit',
      assistantContent: typeof result.content === 'string' ? result.content : '',
      ...(Array.isArray(result.parts) ? { assistantParts: result.parts } : {}),
    };
  }

  throw new Error('SDK message handler 必须返回 string、{ content } 或标准 Hook 结果');
}

function readMessageListenerHookResult(
  value: Record<string, unknown>,
): MessageReceivedHookResult {
  switch (value.action) {
    case 'pass':
      return {
        action: 'pass',
      };
    case 'mutate': {
      const result: MessageReceivedHookResult = {
        action: 'mutate',
      };

      if ('providerId' in value) {
        if (value.providerId !== undefined && typeof value.providerId !== 'string') {
          throw new Error('Invalid hook action "mutate": providerId');
        }
        if (typeof value.providerId === 'string') {
          result.providerId = value.providerId;
        }
      }
      if ('modelId' in value) {
        if (value.modelId !== undefined && typeof value.modelId !== 'string') {
          throw new Error('Invalid hook action "mutate": modelId');
        }
        if (typeof value.modelId === 'string') {
          result.modelId = value.modelId;
        }
      }
      if ('content' in value) {
        if (value.content !== null && value.content !== undefined && typeof value.content !== 'string') {
          throw new Error('Invalid hook action "mutate": content');
        }
        result.content = value.content ?? null;
      }
      if ('parts' in value) {
        if (value.parts !== null && value.parts !== undefined && !isChatMessagePartArray(value.parts)) {
          throw new Error('Invalid hook action "mutate": parts');
        }
        result.parts = value.parts ?? null;
      }
      if ('modelMessages' in value) {
        if (
          value.modelMessages !== undefined
          && !isPluginLlmMessageArray(value.modelMessages)
        ) {
          throw new Error('Invalid hook action "mutate": modelMessages');
        }
        if (value.modelMessages !== undefined) {
          result.modelMessages = value.modelMessages;
        }
      }
      return result;
    }
    case 'short-circuit': {
      if (typeof value.assistantContent !== 'string') {
        throw new Error('Invalid hook action "short-circuit": assistantContent');
      }

      const result: MessageReceivedHookResult = {
        action: 'short-circuit',
        assistantContent: value.assistantContent,
      };

      if ('assistantParts' in value) {
        if (
          value.assistantParts !== null
          && value.assistantParts !== undefined
          && !isChatMessagePartArray(value.assistantParts)
        ) {
          throw new Error('Invalid hook action "short-circuit": assistantParts');
        }
        result.assistantParts = value.assistantParts ?? null;
      }
      if ('providerId' in value) {
        if (value.providerId !== undefined && typeof value.providerId !== 'string') {
          throw new Error('Invalid hook action "short-circuit": providerId');
        }
        if (typeof value.providerId === 'string') {
          result.providerId = value.providerId;
        }
      }
      if ('modelId' in value) {
        if (value.modelId !== undefined && typeof value.modelId !== 'string') {
          throw new Error('Invalid hook action "short-circuit": modelId');
        }
        if (typeof value.modelId === 'string') {
          result.modelId = value.modelId;
        }
      }
      if ('reason' in value) {
        if (value.reason !== undefined && typeof value.reason !== 'string') {
          throw new Error('Invalid hook action "short-circuit": reason');
        }
        if (typeof value.reason === 'string') {
          result.reason = value.reason;
        }
      }

      return result;
    }
    default:
      throw new Error(`Invalid hook action: ${value.action}`);
  }
}

/**
 * 归一化裸 `onHook("message:received")` 的返回值。
 * @param result 原始 Hook 返回值
 * @returns 宿主可接受的 JSON 值
 */
function normalizeRawMessageHookResult(
  result: JsonValue | null | undefined,
): JsonValue | null {
  if (result === null || result === undefined) {
    return {
      action: 'pass',
    };
  }
  if (
    typeof result === 'object'
    && result !== null
    && 'action' in result
    && typeof result.action === 'string'
  ) {
    return result;
  }
  if (typeof result === 'string') {
    return {
      action: 'short-circuit',
      assistantContent: result,
    };
  }
  if (typeof result === 'object' && result !== null && 'content' in result) {
    return {
      action: 'short-circuit',
      assistantContent: typeof result.content === 'string' ? result.content : '',
      ...(Array.isArray(result.parts) ? { assistantParts: result.parts } : {}),
    };
  }

  return result;
}

/**
 * 将一条 mutate 结果应用到当前消息载荷。
 * @param payload 当前消息载荷
 * @param mutation mutate 结果
 * @returns 新的消息载荷
 */
function applyMessageReceivedMutation(
  payload: MessageReceivedHookPayload,
  mutation: Extract<MessageReceivedHookResult, { action: 'mutate' }>,
): MessageReceivedHookPayload {
  const nextPayload = cloneJsonValue(payload);

  if ('providerId' in mutation && typeof mutation.providerId === 'string') {
    nextPayload.providerId = mutation.providerId;
  }
  if ('modelId' in mutation && typeof mutation.modelId === 'string') {
    nextPayload.modelId = mutation.modelId;
  }
  if ('content' in mutation) {
    nextPayload.message.content = mutation.content ?? null;
  }
  if ('parts' in mutation) {
    nextPayload.message.parts = mutation.parts ?? [];
  }
  if ('modelMessages' in mutation && Array.isArray(mutation.modelMessages)) {
    nextPayload.modelMessages = cloneJsonValue(mutation.modelMessages);
  }

  return nextPayload;
}

/**
 * 把当前载荷相对原始载荷的差异收敛成一个 mutate 结果。
 * @param original 原始载荷
 * @param current 当前载荷
 * @returns mutate 或 pass 结果
 */
function buildMessageReceivedMutationResult(
  original: MessageReceivedHookPayload,
  current: MessageReceivedHookPayload,
): MessageReceivedHookResult {
  const mutation: Extract<MessageReceivedHookResult, { action: 'mutate' }> = {
    action: 'mutate',
  };
  let changed = false;

  if (current.providerId !== original.providerId) {
    mutation.providerId = current.providerId;
    changed = true;
  }
  if (current.modelId !== original.modelId) {
    mutation.modelId = current.modelId;
    changed = true;
  }
  if (current.message.content !== original.message.content) {
    mutation.content = current.message.content;
    changed = true;
  }
  if (!isJsonEqual(current.message.parts, original.message.parts)) {
    mutation.parts = cloneJsonValue(current.message.parts);
    changed = true;
  }
  if (!isJsonEqual(current.modelMessages, original.modelMessages)) {
    mutation.modelMessages = cloneJsonValue(current.modelMessages);
    changed = true;
  }

  return changed ? mutation : { action: 'pass' };
}
