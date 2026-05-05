import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, JwtAuthGuard } from '../auth/http-auth';
import { ConversationMessagePlanningService } from './conversation-message-planning.service';
import { ConversationMessageLifecycleService } from './conversation-message-lifecycle.service';
import { ConversationTaskService } from './conversation-task.service';
import { RuntimeToolPermissionService } from '../execution/runtime/runtime-tool-permission.service';
import { ConversationMessageService } from '../runtime/host/conversation-message.service';
import { ConversationStoreService, serializeConversationMessage, type RuntimeConversationRecord } from '../runtime/host/conversation-store.service';
import { ConversationTodoService } from '../runtime/host/conversation-todo.service';
import { SubagentRunnerService } from '../runtime/host/subagent-runner.service';
import type { ChatMessagePart, JsonObject } from '@garlic-claw/shared';
import {
  ConversationTodoItemDto,
  CreateConversationDto,
  ReplyRuntimePermissionDto,
  RetryMessageDto,
  SendMessageDto,
  UpdateConversationTodoDto,
  UpdateMessageDto,
} from './dto/conversation.dto';

const routeUuidPipe = new ParseUUIDPipe({ version: '7' });

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(
    private readonly conversationMessagePlanningService: ConversationMessagePlanningService,
    private readonly conversationMessageLifecycleService: ConversationMessageLifecycleService,
    private readonly conversationTaskService: ConversationTaskService,
    private readonly runtimeToolPermissionService: RuntimeToolPermissionService,
    private readonly conversationMessages: ConversationMessageService,
    private readonly conversationStore: ConversationStoreService,
    private readonly conversationTodos: ConversationTodoService,
    private readonly subagentRunner: SubagentRunnerService,
  ) {}

  private requireOwnedConversation(userId: string, id: string) {
    return this.conversationStore.requireConversation(id, userId);
  }

  @Post('conversations')
  createConversation(@CurrentUser('id') userId: string, @Body() dto: CreateConversationDto) {
    return this.conversationStore.createConversation({ ...dto, userId });
  }

  @Get('conversations')
  listConversations(@CurrentUser('id') userId: string) { return this.conversationStore.listConversations(userId); }

  @Get('conversations/:id')
  getConversation(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string) {
    return decorateConversationRuntimeState(
      this.conversationStore.getConversation(id, userId) as unknown as RuntimeConversationRecord,
      (messageId) => this.conversationTaskService.hasTask(messageId),
    );
  }

  @Get('conversations/:id/events')
  async streamConversationEvents(
    @CurrentUser('id') userId: string,
    @Param('id', routeUuidPipe) id: string,
    @Res() res: Response,
  ) {
    const conversation = this.requireOwnedConversation(userId, id);
    if (conversation.kind === 'subagent' && conversation.subagent) {
      const pluginId = conversation.subagent.pluginId;
      await streamAttachedSubagentEvents(
        res,
        {
          subscribe: (listener) => this.subagentRunner.subscribe(id, listener),
          wait: async () => {
            await this.subagentRunner.waitSubagent(pluginId, { conversationId: id });
          },
        },
        () => readCurrentSubagentStreamStart(this.conversationStore.requireConversation(id, userId)),
        conversation.subagent.status === 'queued' || conversation.subagent.status === 'running',
      );
      return;
    }
    await streamAttachedConversationTaskEvents(
      res,
      this.conversationTaskService,
      () => readCurrentConversationTaskStart(
        this.conversationStore.requireConversation(id, userId),
        (messageId) => this.conversationTaskService.hasTask(messageId),
      ),
      (signal, previousAssistantMessageId) => waitForAttachedConversationTaskStart(
        this.conversationTaskService,
        id,
        () => readCurrentConversationTaskStart(
          this.conversationStore.requireConversation(id, userId),
          (messageId) => this.conversationTaskService.hasTask(messageId),
        ),
        signal,
        previousAssistantMessageId,
      ),
      async (assistantMessageId) => readConversationTaskContinuationStart(
        this.conversationStore.requireConversation(id, userId),
        assistantMessageId,
      ),
    );
  }

  @Get('conversations/:id/context-window')
  getConversationContextWindow(
    @CurrentUser('id') userId: string,
    @Param('id', routeUuidPipe) id: string,
    @Query('providerId') providerId?: string,
    @Query('modelId') modelId?: string,
  ) {
    this.requireOwnedConversation(userId, id);
    return this.conversationMessagePlanningService.getContextWindowPreview({ conversationId: id, ...(typeof modelId === 'string' && modelId.trim() ? { modelId: modelId.trim() } : {}), ...(typeof providerId === 'string' && providerId.trim() ? { providerId: providerId.trim() } : {}), userId });
  }

  @Get('sessions/:id/todo')
  getSessionTodo(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string) { return this.conversationTodos.readSessionTodo(id, userId); }

  @Delete('conversations/:id')
  async deleteConversation(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string) {
    this.requireOwnedConversation(userId, id);
    const conversationTree = this.conversationStore.listConversationTreeRecords(id, userId) as RuntimeConversationRecord[];
    await stopActiveConversationTreeWork(
      conversationTree,
      userId,
      this.conversationTaskService,
      this.subagentRunner,
    );
    return await this.conversationStore.deleteConversation(id, userId);
  }

  @Put('sessions/:id/todo')
  updateSessionTodo(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string, @Body() dto: UpdateConversationTodoDto) { return this.conversationTodos.replaceSessionTodo(id, dto.todos as ConversationTodoItemDto[], userId); }

  @Get('conversations/:id/runtime-permissions/pending')
  listPendingRuntimePermissions(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string) {
    this.requireOwnedConversation(userId, id);
    return this.runtimeToolPermissionService.listPendingRequests(id);
  }

  @Post('conversations/:id/runtime-permissions/:requestId/reply')
  replyRuntimePermission(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string, @Param('requestId') requestId: string, @Body() dto: ReplyRuntimePermissionDto) {
    this.requireOwnedConversation(userId, id);
    return this.runtimeToolPermissionService.reply(id, requestId, dto.decision);
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @CurrentUser('id') userId: string,
    @Param('id', routeUuidPipe) id: string,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ) {
    const conversation = this.requireOwnedConversation(userId, id);
    if (conversation.kind === 'subagent' && conversation.subagent) {
      const pluginId = conversation.subagent.pluginId;
      await streamSubagentEvents(
        res,
        this.subagentRunner,
        id,
        async () => {
          await this.subagentRunner.sendInputSubagent(pluginId, {
            ...(conversation.activePersonaId ? { activePersonaId: conversation.activePersonaId } : {}),
            ...(dto.model ? { activeModelId: dto.model } : {}),
            ...(dto.provider ? { activeProviderId: dto.provider } : {}),
            conversationId: id,
            source: 'http-route',
            userId,
          }, {
            conversationId: id,
            ...(typeof dto.model === 'string' ? { modelId: dto.model } : {}),
            ...(typeof dto.provider === 'string' ? { providerId: dto.provider } : {}),
            messages: [toPluginLlmMessage(dto)],
          });
          const nextConversation = this.conversationStore.requireConversation(id, userId);
          const assistantMessageId = nextConversation.subagent?.activeAssistantMessageId;
          const assistantMessage = assistantMessageId ? nextConversation.messages.find((message) => message.id === assistantMessageId) : null;
          const userMessage = findLastConversationMessage(nextConversation, (message) => message.role === 'user');
          if (!assistantMessage || !userMessage) {
            throw new Error('子代理会话缺少起始消息');
          }
          return {
            startPayload: {
              assistantMessage: serializeConversationMessage(assistantMessage),
              type: 'message-start' as const,
              userMessage: serializeConversationMessage(userMessage),
            },
          };
        },
        async () => {
          await this.subagentRunner.waitSubagent(pluginId, { conversationId: id });
        },
      );
      return;
    }
    await streamTaskEvents(
      res,
      this.conversationTaskService,
      async () => {
        const result = await this.conversationMessageLifecycleService.startMessageGeneration(id, toSendMessagePayload(dto), userId);
        return {
          assistantMessageId: String(result.assistantMessage.id),
          startPayload: {
            assistantMessage: result.assistantMessage,
            type: 'message-start' as const,
            userMessage: result.userMessage,
          },
        };
      },
      async (assistantMessageId) => readConversationTaskContinuationStart(
        this.conversationStore.requireConversation(id, userId),
        assistantMessageId,
      ),
    );
  }

  @Post('conversations/:id/messages/:messageId/retry')
  async retryMessage(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string, @Param('messageId', routeUuidPipe) messageId: string, @Body() dto: RetryMessageDto, @Res() res: Response) {
    const conversation = this.requireOwnedConversation(userId, id);
    if (conversation.kind === 'subagent' && conversation.subagent) {
      const pluginId = conversation.subagent.pluginId;
      await streamSubagentEvents(
        res,
        this.subagentRunner,
        id,
        async () => {
          const retriedInput = readRetrySubagentInput(requireConversationMessage(conversation, messageId), conversation, messageId);
          await this.subagentRunner.sendInputSubagent(pluginId, {
            ...(conversation.activePersonaId ? { activePersonaId: conversation.activePersonaId } : {}),
            ...(dto.model ? { activeModelId: dto.model } : {}),
            ...(dto.provider ? { activeProviderId: dto.provider } : {}),
            conversationId: id,
            source: 'http-route',
            userId,
          }, {
            conversationId: id,
            ...(typeof dto.model === 'string' ? { modelId: dto.model } : {}),
            ...(typeof dto.provider === 'string' ? { providerId: dto.provider } : {}),
            messages: [retriedInput],
          });
          const nextConversation = this.conversationStore.requireConversation(id, userId);
          const assistantMessageId = nextConversation.subagent?.activeAssistantMessageId;
          const assistantMessage = assistantMessageId ? nextConversation.messages.find((message) => message.id === assistantMessageId) : null;
          const userMessage = findLastConversationMessage(nextConversation, (message) => message.role === 'user');
          if (!assistantMessage || !userMessage) {
            throw new Error('子代理会话缺少重试消息');
          }
          return {
            startPayload: {
              assistantMessage: serializeConversationMessage(assistantMessage),
              type: 'message-start' as const,
              userMessage: serializeConversationMessage(userMessage),
            },
          };
        },
        async () => {
          await this.subagentRunner.waitSubagent(pluginId, { conversationId: id });
        },
      );
      return;
    }
    await streamTaskEvents(
      res,
      this.conversationTaskService,
      async () => {
        const assistantMessage = await this.conversationMessageLifecycleService.retryMessageGeneration(id, messageId, dto, userId);
        return {
          assistantMessageId: String(assistantMessage.id),
          startPayload: { assistantMessage, type: 'message-start' as const },
        };
      },
      async (assistantMessageId) => readConversationTaskContinuationStart(
        this.conversationStore.requireConversation(id, userId),
        assistantMessageId,
      ),
    );
  }

  @Post('conversations/:id/messages/:messageId/stop')
  stopMessage(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string, @Param('messageId', routeUuidPipe) messageId: string) {
    const conversation = this.requireOwnedConversation(userId, id);
    if (conversation.kind === 'subagent' && conversation.subagent) {
      const message = requireConversationMessage(conversation, messageId);
      if (message.role !== 'assistant') {
        throw new BadRequestException('Only assistant messages can be stopped');
      }
      if (
        isSubagentStopTargetInActiveContinuationChain(conversation, messageId)
        && (conversation.subagent.status === 'queued' || conversation.subagent.status === 'running')
      ) {
        return this.subagentRunner.interruptSubagent(conversation.subagent.pluginId, id, userId);
      }
      return { message: 'Generation stopped' };
    }
    return this.conversationMessageLifecycleService.stopMessageGeneration(id, messageId, userId);
  }

  @Patch('conversations/:id/messages/:messageId')
  async updateMessage(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string, @Param('messageId', routeUuidPipe) messageId: string, @Body() dto: UpdateMessageDto) {
    this.requireOwnedConversation(userId, id);
    await this.conversationTaskService.stopTask(messageId);
    return this.conversationMessages.updateMessage(id, messageId, toUpdateMessagePatch(dto), userId);
  }

  @Get('conversations/:id/subagents')
  listConversationSubagents(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string) {
    this.requireOwnedConversation(userId, id);
    return this.conversationStore.listChildSubagentConversations(id, userId);
  }

  @Delete('conversations/:id/messages/:messageId')
  async deleteMessage(@CurrentUser('id') userId: string, @Param('id', routeUuidPipe) id: string, @Param('messageId', routeUuidPipe) messageId: string) {
    this.requireOwnedConversation(userId, id);
    await this.conversationTaskService.stopTask(messageId);
    return this.conversationMessages.deleteMessage(id, messageId, userId);
  }
}

async function waitForAttachedConversationTaskStart(
  conversationTaskService: Pick<ConversationTaskService, 'subscribeConversationStart'>,
  conversationId: string,
  readCurrentTaskStart: () => { assistantMessageId: string; startPayload: object | null } | null,
  signal: AbortSignal,
  previousAssistantMessageId: string | null,
): Promise<{ assistantMessageId: string; startPayload: object | null } | null> {
  if (signal.aborted) {
    return null;
  }
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (value: { assistantMessageId: string; startPayload: object | null } | null) => {
      if (settled) {
        return;
      }
      settled = true;
      unsubscribe();
      signal.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const onAbort = () => finish(null);
    const unsubscribe = conversationTaskService.subscribeConversationStart(conversationId, () => {
      const startedTask = readCurrentTaskStart();
      if (startedTask && startedTask.assistantMessageId !== previousAssistantMessageId) {
        finish(startedTask);
      }
    });
    signal.addEventListener('abort', onAbort, { once: true });
    const currentTask = readCurrentTaskStart();
    if (currentTask && currentTask.assistantMessageId !== previousAssistantMessageId) {
      finish(currentTask);
    }
  });
}

async function streamTaskEvents(
  res: Response,
  conversationTaskService: ConversationTaskService,
  startTask: () => Promise<{ assistantMessageId: string; startPayload: object }>,
  readNextTaskStart?: (assistantMessageId: string) => Promise<{ assistantMessageId: string; startPayload: object } | null> | { assistantMessageId: string; startPayload: object } | null,
) {
  let unsubscribe: () => void = () => undefined;
  const stopHeartbeat = startSseHeartbeat(res);
  initSse(res);
  res.on('close', () => {
    unsubscribe();
    stopHeartbeat();
  });
  try {
    let nextTask: { assistantMessageId: string; startPayload: object } | null = await startTask();
    while (nextTask) {
      writeSse(res, nextTask.startPayload);
      unsubscribe = conversationTaskService.subscribe(nextTask.assistantMessageId, (event) => writeSse(res, event));
      await conversationTaskService.waitForTask(nextTask.assistantMessageId);
      unsubscribe();
      unsubscribe = () => undefined;
      nextTask = readNextTaskStart ? await readNextTaskStart(nextTask.assistantMessageId) : null;
    }
  } catch (error) {
    writeSse(res, { error: error instanceof Error ? error.message : '未知错误', type: 'error' });
  }
  stopHeartbeat();
  writeSse(res, '[DONE]', true);
}

async function streamSubagentEvents(
  res: Response,
  subagentRunner: Pick<SubagentRunnerService, 'subscribe'>,
  conversationId: string,
  startTask: () => Promise<{ startPayload: object }>,
  finishTask: () => Promise<void>,
) {
  let unsubscribe: () => void = () => undefined;
  const stopHeartbeat = startSseHeartbeat(res);
  initSse(res);
  res.on('close', () => {
    unsubscribe();
    stopHeartbeat();
  });
  try {
    const { startPayload } = await startTask();
    writeSse(res, startPayload);
    unsubscribe = subagentRunner.subscribe(conversationId, (event) => writeSse(res, event));
    await finishTask();
    unsubscribe();
    unsubscribe = () => undefined;
  } catch (error) {
    writeSse(res, { error: error instanceof Error ? error.message : '未知错误', type: 'error' });
  }
  stopHeartbeat();
  writeSse(res, '[DONE]', true);
}

async function streamAttachedConversationTaskEvents(
  res: Response,
  conversationTaskService: Pick<ConversationTaskService, 'subscribe' | 'subscribeConversationStart' | 'waitForTask'>,
  readCurrentTaskStart: () => { assistantMessageId: string; startPayload: object | null } | null,
  waitForFutureTaskStart: (signal: AbortSignal, previousAssistantMessageId: string | null) => Promise<{ assistantMessageId: string; startPayload: object | null } | null>,
  readNextTaskStart?: (assistantMessageId: string) => Promise<{ assistantMessageId: string; startPayload: object } | null> | { assistantMessageId: string; startPayload: object } | null,
) {
  const stopHeartbeat = startSseHeartbeat(res);
  const closeController = new AbortController();
  initSse(res);
  let unsubscribe: () => void = () => undefined;
  let previousAssistantMessageId: string | null = null;
  res.on('close', () => {
    closeController.abort();
    unsubscribe();
    stopHeartbeat();
  });
  try {
    let nextTask = readCurrentTaskStart();
    let allowFutureTaskStartWait = nextTask === null;
    while (!closeController.signal.aborted) {
      if (!nextTask) {
        if (!allowFutureTaskStartWait) {
          break;
        }
        nextTask = await waitForFutureTaskStart(closeController.signal, previousAssistantMessageId);
        if (!nextTask) {
          break;
        }
        allowFutureTaskStartWait = false;
      }
      const gate = createBufferedEventGate();
      unsubscribe = conversationTaskService.subscribe(nextTask.assistantMessageId, (event) => {
        if (gate.shouldBuffer()) {
          gate.buffer(event);
          return;
        }
        writeSse(res, event);
      });
      if (!nextTask.startPayload) {
        activateBufferedEventGateLive(res, gate);
        await conversationTaskService.waitForTask(nextTask.assistantMessageId);
        unsubscribe();
        unsubscribe = () => undefined;
        nextTask = readNextTaskStart ? await readNextTaskStart(nextTask.assistantMessageId) : null;
        continue;
      }
      const synchronized = synchronizeBufferedTaskStart(res, gate, readCurrentTaskStart);
      flushBufferedAttachEvents(
        res,
        synchronized.consumedBufferedEvents,
        synchronized.nextTask?.assistantMessageId ?? null,
      );
      if (!synchronized.nextTask) {
        unsubscribe();
        unsubscribe = () => undefined;
        break;
      }
      const synchronizedTask = synchronized.nextTask;
      if (!synchronizedTask.startPayload) {
        unsubscribe();
        unsubscribe = () => undefined;
        nextTask = synchronizedTask;
        continue;
      }
      if (synchronizedTask.assistantMessageId !== nextTask.assistantMessageId) {
        unsubscribe();
        unsubscribe = () => undefined;
        nextTask = synchronizedTask;
        continue;
      }
      activateBufferedEventGateLive(res, gate);
      await conversationTaskService.waitForTask(nextTask.assistantMessageId);
      previousAssistantMessageId = nextTask.assistantMessageId;
      unsubscribe();
      unsubscribe = () => undefined;
      nextTask = readNextTaskStart ? await readNextTaskStart(nextTask.assistantMessageId) : null;
    }
  } catch (error) {
    writeSse(res, { error: error instanceof Error ? error.message : '未知错误', type: 'error' });
  }
  stopHeartbeat();
  if (!closeController.signal.aborted) {
    writeSse(res, '[DONE]', true);
  }
}

async function streamAttachedSubagentEvents(
  res: Response,
  runtime: {
    subscribe: (listener: (event: object) => void) => () => void;
    wait: () => Promise<void>;
  },
  readCurrentTaskStart: () => { assistantMessageId: string; startPayload: object } | null,
  keepAliveWithoutStart = false,
) {
  const stopHeartbeat = startSseHeartbeat(res);
  initSse(res);
  const gate = createBufferedEventGate();
  let unsubscribe: () => void = runtime.subscribe((event) => {
    if (gate.shouldBuffer()) {
      gate.buffer(event);
      return;
    }
    writeSse(res, event);
  });
  res.on('close', () => {
    unsubscribe();
    stopHeartbeat();
  });
  try {
    const synchronized = synchronizeBufferedTaskStart(res, gate, readCurrentTaskStart);
    flushBufferedAttachEvents(
      res,
      synchronized.consumedBufferedEvents,
      synchronized.nextTask?.assistantMessageId ?? null,
    );
    if (synchronized.nextTask) {
      activateBufferedEventGateLive(res, gate);
      await runtime.wait();
    } else if (keepAliveWithoutStart) {
      activateBufferedEventGateLive(res, gate);
      await runtime.wait();
    } else {
      unsubscribe();
      unsubscribe = () => undefined;
    }
  } catch (error) {
    writeSse(res, { error: error instanceof Error ? error.message : '未知错误', type: 'error' });
  }
  stopHeartbeat();
  writeSse(res, '[DONE]', true);
}

export function createBufferedEventGate() {
  const bufferedEvents: object[] = [];
  let live = false;
  return {
    activateLive() {
      live = true;
      const pendingEvents = [...bufferedEvents];
      bufferedEvents.length = 0;
      return pendingEvents;
    },
    buffer(event: object) {
      bufferedEvents.push(event);
    },
    shouldBuffer() {
      return !live;
    },
    takeBufferedEvents() {
      const pendingEvents = [...bufferedEvents];
      bufferedEvents.length = 0;
      return pendingEvents;
    },
  };
}

export function synchronizeBufferedTaskStart(
  res: Response,
  gate: ReturnType<typeof createBufferedEventGate>,
  readCurrentTaskStart: () => { assistantMessageId: string; startPayload: object | null } | null,
) {
  const consumedBufferedEvents: object[] = [];
  while (true) {
    const nextTask = readCurrentTaskStart();
    if (!nextTask) {
      return { consumedBufferedEvents, nextTask: null };
    }
    if (!nextTask.startPayload) {
      return { consumedBufferedEvents, nextTask };
    }
    writeSse(res, nextTask.startPayload);
    const bufferedEvents = gate.takeBufferedEvents();
    consumedBufferedEvents.push(...bufferedEvents);
    if (bufferedEvents.length === 0) {
      return { consumedBufferedEvents, nextTask };
    }
  }
}

export function activateBufferedEventGateLive(
  res: Response,
  gate: ReturnType<typeof createBufferedEventGate>,
) {
  for (const bufferedEvent of gate.activateLive()) {
    writeSse(res, bufferedEvent);
  }
}

function flushBufferedAttachEvents(
  res: Response,
  bufferedEvents: object[],
  activeAssistantMessageId: string | null,
) {
  for (const event of bufferedEvents) {
    if (
      activeAssistantMessageId
      && isAssistantSnapshotCoveredAttachEvent(event, activeAssistantMessageId)
    ) {
      continue;
    }
    writeSse(res, event);
  }
}

function isAssistantSnapshotCoveredAttachEvent(
  event: object,
  activeAssistantMessageId: string,
) {
  const eventType = readBufferedAttachEventType(event);
  if (!eventType) {
    return false;
  }
  if (![
    'error',
    'finish',
    'message-metadata',
    'message-patch',
    'message-start',
    'retry',
    'status',
    'text-delta',
    'tool-call',
    'tool-result',
  ].includes(eventType)) {
    return false;
  }
  return readBufferedAttachEventMessageId(event) === activeAssistantMessageId;
}

function readBufferedAttachEventMessageId(event: object): string | null {
  if (!isRecord(event)) {
    return null;
  }
  if (typeof event.messageId === 'string' && event.messageId.trim()) {
    return event.messageId;
  }
  if (
    isRecord(event.assistantMessage)
    && typeof event.assistantMessage.id === 'string'
    && event.assistantMessage.id.trim()
  ) {
    return event.assistantMessage.id;
  }
  return null;
}

function readBufferedAttachEventType(event: object): string | null {
  if (!isRecord(event) || typeof event.type !== 'string' || !event.type.trim()) {
    return null;
  }
  return event.type;
}

function initSse(res: Response) {
  for (const [name, value] of [['Content-Type', 'text/event-stream'], ['Cache-Control', 'no-cache'], ['Connection', 'keep-alive'], ['Access-Control-Allow-Origin', '*']] as const) {res.setHeader(name, value);}
  res.flushHeaders();
}

function writeSse(res: Response, payload: object | '[DONE]', end = false) {
  if (!res.writableEnded && !res.destroyed) {
    res.write(`data: ${payload === '[DONE]' ? payload : JSON.stringify(payload)}\n\n`);
    if (end) {res.end();}
  }
}

function startSseHeartbeat(res: Response) {
  const timer = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      clearInterval(timer);
      return;
    }
    res.write(':\n\n');
  }, 15000);
  return () => clearInterval(timer);
}

function toSendMessagePayload(dto: SendMessageDto) {
  return {
    ...(typeof dto.content === 'string' ? { content: dto.content } : {}),
    ...(typeof dto.model === 'string' ? { model: dto.model } : {}),
    ...(dto.parts ? { parts: dto.parts as ChatMessagePart[] } : {}),
    ...(typeof dto.provider === 'string' ? { provider: dto.provider } : {}),
  };
}

function toUpdateMessagePatch(dto: UpdateMessageDto) {
  return {
    ...(typeof dto.content === 'string' ? { content: dto.content } : {}),
    ...(dto.parts ? { parts: dto.parts as ChatMessagePart[] } : {}),
  };
}

function toPluginLlmMessage(dto: SendMessageDto) {
  const parts = dto.parts as ChatMessagePart[] | undefined;
  if (parts?.length) {
    return { content: parts, role: 'user' as const };
  }
  return { content: dto.content ?? '', role: 'user' as const };
}

function readRetrySubagentInput(
  message: RuntimeConversationRecord['messages'][number],
  conversation: RuntimeConversationRecord,
  assistantMessageId: string,
) {
  if (message.role !== 'assistant') {
    throw new BadRequestException('Only assistant messages can be retried');
  }
  const assistantIndex = conversation.messages.findIndex((message) => message.id === assistantMessageId);
  if (assistantIndex < 0) {
    throw new Error(`Message not found: ${assistantMessageId}`);
  }
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index];
    if (message.role !== 'user') {
      continue;
    }
    const parts = Array.isArray(message.parts) ? message.parts as unknown as ChatMessagePart[] : [];
    return parts.length > 0
      ? { content: parts, role: 'user' as const }
      : { content: typeof message.content === 'string' ? message.content : '', role: 'user' as const };
  }
  throw new Error('没有可重试的用户输入');
}

function findLastConversationMessage(
  conversation: RuntimeConversationRecord,
  predicate: (message: RuntimeConversationRecord['messages'][number]) => boolean,
) {
  for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index];
    if (predicate(message)) {
      return message;
    }
  }
  return null;
}

function readConversationTaskContinuationStart(
  conversation: RuntimeConversationRecord,
  completedAssistantMessageId: string,
): { assistantMessageId: string; startPayload: object } | null {
  const completedAssistantIndex = conversation.messages.findIndex((message) => message.id === completedAssistantMessageId);
  if (completedAssistantIndex < 0) {
    return null;
  }
  const continuation = readNextAutoCompactionContinuation(conversation, completedAssistantIndex + 1);
  if (!continuation) {
    return null;
  }
  return {
    assistantMessageId: continuation.nextAssistant.id,
    startPayload: {
      assistantMessage: serializeConversationMessage(continuation.nextAssistant as unknown as JsonObject),
      type: 'message-start' as const,
      userMessage: serializeConversationMessage(continuation.syntheticContinueUser as unknown as JsonObject),
    },
  };
}

function readCurrentConversationTaskStart(
  conversation: RuntimeConversationRecord,
  hasTask: (messageId: string) => boolean,
): { assistantMessageId: string; startPayload: object | null } | null {
  const activeMessage = readLastActiveConversationTaskMessage(conversation);
  if (!activeMessage?.id) {
    const runningAssistantMessageId = readLastConversationTaskMessageId(conversation, hasTask);
    if (!runningAssistantMessageId) {
      return null;
    }
    return {
      assistantMessageId: runningAssistantMessageId,
      startPayload: null,
    };
  }
  return {
    assistantMessageId: activeMessage.id,
    startPayload: {
      assistantMessage: serializeConversationMessage(activeMessage as unknown as JsonObject),
      type: 'message-start' as const,
    },
  };
}

function decorateConversationRuntimeState(
  conversation: RuntimeConversationRecord,
  hasTask: (messageId: string) => boolean,
) {
  return {
    ...conversation,
    isRunning: readConversationRunningState(conversation, hasTask),
  };
}

function readConversationRunningState(
  conversation: RuntimeConversationRecord,
  hasTask: (messageId: string) => boolean,
): boolean {
  if (
    conversation.subagent
    && (conversation.subagent.status === 'queued' || conversation.subagent.status === 'running')
  ) {
    return true;
  }
  if (readLastActiveConversationTaskMessage(conversation)?.id) {
    return true;
  }
  return Boolean(readLastConversationTaskMessageId(conversation, hasTask));
}

function readCurrentSubagentStreamStart(
  conversation: RuntimeConversationRecord,
): { assistantMessageId: string; startPayload: object } | null {
  const activeAssistantMessageId = readActiveSubagentAssistantMessageId(conversation);
  if (!activeAssistantMessageId) {
    return null;
  }
  const assistantMessage = requireConversationMessage(conversation, activeAssistantMessageId);
  return {
    assistantMessageId: activeAssistantMessageId,
    startPayload: {
      assistantMessage: serializeConversationMessage(assistantMessage as unknown as JsonObject),
      type: 'message-start' as const,
    },
  };
}

function isSubagentStopTargetInActiveContinuationChain(
  conversation: RuntimeConversationRecord,
  messageId: string,
): boolean {
  const activeAssistantMessageId = readActiveSubagentAssistantMessageId(conversation);
  if (!activeAssistantMessageId) {
    return false;
  }
  if (activeAssistantMessageId === messageId) {
    return true;
  }
  const activeAssistantIndex = conversation.messages.findIndex((message) => message.id === activeAssistantMessageId);
  if (activeAssistantIndex < 0) {
    return false;
  }
  let cursor = activeAssistantIndex;
  while (cursor > 0) {
    const previousAssistant = readPreviousAutoCompactionAssistant(conversation, cursor);
    if (!previousAssistant) {
      return false;
    }
    if (previousAssistant.message.id === messageId) {
      return true;
    }
    cursor = previousAssistant.index;
  }
  return false;
}

function readNextAutoCompactionContinuation(
  conversation: RuntimeConversationRecord,
  startIndex: number,
): {
  nextAssistant: RuntimeConversationRecord['messages'][number] & { id: string; role: 'assistant' };
  syntheticContinueUser: RuntimeConversationRecord['messages'][number] & { role: 'user' };
} | null {
  let syntheticContinueUser: (RuntimeConversationRecord['messages'][number] & { role: 'user' }) | null = null;
  for (let index = startIndex; index < conversation.messages.length; index += 1) {
    const message = conversation.messages[index];
    if (message.role === 'display') {
      continue;
    }
    if (!syntheticContinueUser) {
      if (message.role !== 'user' || !isAutoCompactionContinueMessage(message)) {
        return null;
      }
      syntheticContinueUser = message as RuntimeConversationRecord['messages'][number] & { role: 'user' };
      continue;
    }
    if (message.role !== 'assistant' || typeof message.id !== 'string') {
      return null;
    }
    return {
      nextAssistant: message as RuntimeConversationRecord['messages'][number] & { id: string; role: 'assistant' },
      syntheticContinueUser,
    };
  }
  return null;
}

function readPreviousAutoCompactionAssistant(
  conversation: RuntimeConversationRecord,
  assistantIndex: number,
): {
  index: number;
  message: RuntimeConversationRecord['messages'][number] & { id: string; role: 'assistant' };
} | null {
  let foundSyntheticContinue = false;
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index];
    if (message.role === 'display') {
      continue;
    }
    if (!foundSyntheticContinue) {
      if (message.role !== 'user' || !isAutoCompactionContinueMessage(message)) {
        return null;
      }
      foundSyntheticContinue = true;
      continue;
    }
    if (message.role !== 'assistant' || typeof message.id !== 'string') {
      return null;
    }
    return {
      index,
      message: message as RuntimeConversationRecord['messages'][number] & { id: string; role: 'assistant' },
    };
  }
  return null;
}

async function stopActiveConversationTreeWork(
  conversations: RuntimeConversationRecord[],
  userId: string,
  conversationTaskService: ConversationTaskService,
  subagentRunner: SubagentRunnerService,
) {
  for (const conversation of conversations) {
    for (const messageId of readActiveConversationTaskMessageIds(conversation)) {
      await conversationTaskService.stopTask(messageId);
    }
    if (
      conversation.kind === 'subagent'
      && conversation.subagent
      && (conversation.subagent.status === 'queued' || conversation.subagent.status === 'running')
    ) {
      await subagentRunner.interruptSubagent(conversation.subagent.pluginId, conversation.id, userId);
    }
  }
}

function readActiveConversationTaskMessageIds(conversation: RuntimeConversationRecord): string[] {
  return conversation.messages.flatMap((message) => (
    (message.role === 'assistant' || message.role === 'display')
      && typeof message.id === 'string'
      && (message.status === 'pending' || message.status === 'streaming')
      ? [message.id]
      : []
  ));
}

function readLastActiveConversationTaskMessage(
  conversation: RuntimeConversationRecord,
): (RuntimeConversationRecord['messages'][number] & { id: string }) | null {
  for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index];
    if (
      (message.role === 'assistant' || message.role === 'display')
      && typeof message.id === 'string'
      && (message.status === 'pending' || message.status === 'streaming')
    ) {
      return message as RuntimeConversationRecord['messages'][number] & { id: string };
    }
  }
  return null;
}

function readLastConversationTaskMessageId(
  conversation: RuntimeConversationRecord,
  hasTask: (messageId: string) => boolean,
): string | null {
  for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index];
    if (
      message.role === 'assistant'
      && typeof message.id === 'string'
      && hasTask(message.id)
    ) {
      return message.id;
    }
  }
  return null;
}

function requireConversationMessage(
  conversation: RuntimeConversationRecord,
  messageId: string,
): RuntimeConversationRecord['messages'][number] {
  const message = conversation.messages.find((entry) => entry.id === messageId);
  if (!message) {
    throw new NotFoundException(`Message not found: ${messageId}`);
  }
  return message;
}

function readActiveSubagentAssistantMessageId(conversation: RuntimeConversationRecord): string | null {
  const activeAssistantMessageId = conversation.subagent?.activeAssistantMessageId;
  if (typeof activeAssistantMessageId === 'string' && activeAssistantMessageId.trim()) {
    return activeAssistantMessageId;
  }
  for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index];
    if (
      message.role === 'assistant'
      && typeof message.id === 'string'
      && (message.status === 'pending' || message.status === 'streaming')
    ) {
      return message.id;
    }
  }
  return null;
}

function isAutoCompactionContinueMessage(message: RuntimeConversationRecord['messages'][number]): boolean {
  return readMessageAnnotations(message).some((annotation) => (
    annotation.owner === 'conversation.context-governance'
    && annotation.type === 'context-compaction'
    && isRecord(annotation.data)
    && annotation.data.role === 'continue'
    && annotation.data.synthetic === true
    && annotation.data.trigger === 'after-response'
  ));
}

function readMessageAnnotations(message: Record<string, unknown>): Array<Record<string, unknown>> {
  if (isRecord(message.metadata) && Array.isArray(message.metadata.annotations)) {
    return message.metadata.annotations.filter(isRecord);
  }
  if (typeof message.metadataJson !== 'string' || !message.metadataJson.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(message.metadataJson) as unknown;
    return isRecord(parsed) && Array.isArray(parsed.annotations)
      ? parsed.annotations.filter(isRecord)
      : [];
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
