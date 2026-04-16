import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, JwtAuthGuard } from '../../../auth/http-auth';
import { ConversationMessageLifecycleService } from '../../../conversation/conversation-message-lifecycle.service';
import { ConversationTaskService } from '../../../conversation/conversation-task.service';
import { RuntimeHostConversationMessageService } from '../../../runtime/host/runtime-host-conversation-message.service';
import { RuntimeHostConversationRecordService } from '../../../runtime/host/runtime-host-conversation-record.service';
import { SkillSessionService } from '../../../execution/skill/skill-session.service';
import type { ChatMessagePart } from '@garlic-claw/shared';
import {
  CreateConversationDto,
  RetryMessageDto,
  SendMessageDto,
  UpdateConversationHostServicesDto,
  UpdateConversationSkillsDto,
  UpdateMessageDto,
} from './conversation.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(
    private readonly conversationMessageLifecycleService: ConversationMessageLifecycleService,
    private readonly conversationTaskService: ConversationTaskService,
    private readonly runtimeHostConversationMessageService: RuntimeHostConversationMessageService,
    private readonly skillSessionService: SkillSessionService,
    private readonly runtimeHostConversationRecordService: RuntimeHostConversationRecordService,
  ) {}

  private requireOwnedConversation(userId: string, id: string) {
    return this.runtimeHostConversationRecordService.requireConversation(id, userId);
  }

  @Post('conversations')
  createConversation(@CurrentUser('id') userId: string, @Body() dto: CreateConversationDto) {
    return this.runtimeHostConversationRecordService.createConversation({ ...dto, userId });
  }

  @Get('conversations')
  listConversations(@CurrentUser('id') userId: string) { return this.runtimeHostConversationRecordService.listConversations(userId); }

  @Get('conversations/:id')
  getConversation(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) { return this.runtimeHostConversationRecordService.getConversation(id, userId); }

  @Delete('conversations/:id')
  deleteConversation(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) { return this.runtimeHostConversationRecordService.deleteConversation(id, userId); }

  @Get('conversations/:id/services')
  getConversationHostServices(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) { return this.runtimeHostConversationRecordService.readConversationHostServices(id, userId); }

  @Put('conversations/:id/services')
  updateConversationHostServices(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateConversationHostServicesDto) { return this.runtimeHostConversationRecordService.writeConversationHostServices(id, dto, userId); }

  @Get('conversations/:id/skills')
  getConversationSkillState(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) { return this.skillSessionService.getConversationSkillStateForUser(userId, id); }

  @Put('conversations/:id/skills')
  updateConversationSkills(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateConversationSkillsDto) { return this.skillSessionService.updateConversationSkillStateForUser(userId, id, dto.activeSkillIds); }

  @Post('conversations/:id/messages')
  async sendMessage(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ) {
    this.requireOwnedConversation(userId, id);
    await streamTaskEvents(res, this.conversationTaskService, async () => {
      const result = await this.conversationMessageLifecycleService.startMessageGeneration(id, toSendMessagePayload(dto), userId);
      return {
        assistantMessageId: String(result.assistantMessage.id),
        startPayload: {
          assistantMessage: result.assistantMessage,
          type: 'message-start' as const,
          userMessage: result.userMessage,
        },
      };
    });
  }

  @Post('conversations/:id/messages/:messageId/retry')
  async retryMessage(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string, @Param('messageId', ParseUUIDPipe) messageId: string, @Body() dto: RetryMessageDto, @Res() res: Response) {
    this.requireOwnedConversation(userId, id);
    await streamTaskEvents(res, this.conversationTaskService, async () => {
      const assistantMessage = await this.conversationMessageLifecycleService.retryMessageGeneration(id, messageId, dto, userId);
      return {
        assistantMessageId: String(assistantMessage.id),
        startPayload: { assistantMessage, type: 'message-start' as const },
      };
    });
  }

  @Post('conversations/:id/messages/:messageId/stop')
  stopMessage(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string, @Param('messageId', ParseUUIDPipe) messageId: string) {
    this.requireOwnedConversation(userId, id);
    return this.conversationMessageLifecycleService.stopMessageGeneration(id, messageId, userId);
  }

  @Patch('conversations/:id/messages/:messageId')
  async updateMessage(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string, @Param('messageId', ParseUUIDPipe) messageId: string, @Body() dto: UpdateMessageDto) {
    this.requireOwnedConversation(userId, id);
    await this.conversationTaskService.stopTask(messageId);
    return this.runtimeHostConversationMessageService.updateMessage(id, messageId, toUpdateMessagePatch(dto), userId);
  }

  @Delete('conversations/:id/messages/:messageId')
  async deleteMessage(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string, @Param('messageId', ParseUUIDPipe) messageId: string) {
    this.requireOwnedConversation(userId, id);
    await this.conversationTaskService.stopTask(messageId);
    return this.runtimeHostConversationMessageService.deleteMessage(id, messageId, userId);
  }
}

async function streamTaskEvents(
  res: Response,
  conversationTaskService: ConversationTaskService,
  startTask: () => Promise<{ assistantMessageId: string; startPayload: object }>,
) {
  let unsubscribe: () => void = () => undefined;
  initSse(res);
  res.on('close', () => unsubscribe());
  try {
    const { assistantMessageId, startPayload } = await startTask();
    writeSse(res, startPayload);
    unsubscribe = conversationTaskService.subscribe(assistantMessageId, (event) => writeSse(res, event));
    await conversationTaskService.waitForTask(assistantMessageId);
  } catch (error) {
    writeSse(res, { error: error instanceof Error ? error.message : '未知错误', type: 'error' });
  }
  writeSse(res, '[DONE]', true);
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
