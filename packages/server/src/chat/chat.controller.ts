import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatMessageService } from './chat-message.service';
import { ChatService } from './chat.service';
import { ChatTaskService } from './chat-task.service';
import { type ChatTaskEvent } from './chat.types';
import {
  CreateConversationDto,
  RetryMessageDto,
  SendMessageDto,
  UpdateMessageDto,
} from './dto/chat.dto';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatMessageService: ChatMessageService,
    private readonly chatTaskService: ChatTaskService,
  ) {}

  @Post('conversations')
  createConversation(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateConversationDto,
  ) {
    return this.chatService.createConversation(userId, dto);
  }

  @Get('conversations')
  listConversations(@CurrentUser('id') userId: string) {
    return this.chatService.listConversations(userId);
  }

  @Get('conversations/:id')
  getConversation(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chatService.getConversation(userId, id);
  }

  @Delete('conversations/:id')
  deleteConversation(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chatService.deleteConversation(userId, id);
  }

  /**
   * 创建一轮新的聊天生成任务，并通过 SSE 转发后台事件。
   * @param userId 当前用户 ID
   * @param id 对话 ID
   * @param dto 发送消息 DTO
   * @param res SSE 响应对象
   */
  @Post('conversations/:id/messages')
  async sendMessage(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ) {
    prepareSseResponse(res);

    let unsubscribe: () => void = () => undefined;
    res.on('close', () => {
      unsubscribe();
    });

    try {
      const { userMessage, assistantMessage } =
        await this.chatMessageService.startMessageGeneration(userId, id, dto);
      writeSse(res, {
        type: 'message-start',
        userMessage,
        assistantMessage,
      });

      unsubscribe = this.chatTaskService.subscribe(
        assistantMessage.id,
        (event: ChatTaskEvent) => {
          writeSse(res, event);
        },
      );

      await this.chatTaskService.waitForTask(assistantMessage.id);
    } catch (error) {
      writeSse(res, {
        type: 'error',
        error: error instanceof Error ? error.message : '未知错误',
      });
    }

    finalizeSse(res);
  }

  /**
   * 直接修改一条消息，不会自动重跑。
   * @param userId 当前用户 ID
   * @param id 对话 ID
   * @param messageId 消息 ID
   * @param dto 更新 DTO
   */
  @Patch('conversations/:id/messages/:messageId')
  updateMessage(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.chatMessageService.updateMessage(userId, id, messageId, dto);
  }

  /**
   * 删除一条消息，不会自动级联删除后续消息。
   * @param userId 当前用户 ID
   * @param id 对话 ID
   * @param messageId 消息 ID
   */
  @Delete('conversations/:id/messages/:messageId')
  deleteMessage(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ) {
    return this.chatMessageService.deleteMessage(userId, id, messageId);
  }

  /**
   * 主动停止一条仍在生成中的 assistant 消息。
   * @param userId 当前用户 ID
   * @param id 对话 ID
   * @param messageId assistant 消息 ID
   */
  @Post('conversations/:id/messages/:messageId/stop')
  stopMessage(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ) {
    return this.chatMessageService.stopMessageGeneration(
      userId,
      id,
      messageId,
    );
  }

  /**
   * 原地重试最后一条 AI 回复，并通过 SSE 转发新一轮生成事件。
   * @param userId 当前用户 ID
   * @param id 对话 ID
   * @param messageId assistant 消息 ID
   * @param dto 可选的 provider/model 覆盖
   * @param res SSE 响应对象
   */
  @Post('conversations/:id/messages/:messageId/retry')
  async retryMessage(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: RetryMessageDto,
    @Res() res: Response,
  ) {
    prepareSseResponse(res);

    let unsubscribe: () => void = () => undefined;
    res.on('close', () => {
      unsubscribe();
    });

    try {
      const assistantMessage =
        await this.chatMessageService.retryMessageGeneration(
          userId,
          id,
          messageId,
          dto,
        );
      writeSse(res, {
        type: 'message-start',
        assistantMessage,
      });

      unsubscribe = this.chatTaskService.subscribe(
        assistantMessage.id,
        (event: ChatTaskEvent) => {
          writeSse(res, event);
        },
      );

      await this.chatTaskService.waitForTask(assistantMessage.id);
    } catch (error) {
      writeSse(res, {
        type: 'error',
        error: error instanceof Error ? error.message : '未知错误',
      });
    }

    finalizeSse(res);
  }
}

/**
 * 设置 SSE 响应头。
 * @param res 响应对象
 */
function prepareSseResponse(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
}

/**
 * 安全写入一条 SSE 事件。
 * @param res 响应对象
 * @param payload 事件负载
 */
function writeSse(res: Response, payload: object) {
  if (res.writableEnded || res.destroyed) {
    return;
  }

  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * 安全结束 SSE 响应。
 * @param res 响应对象
 */
function finalizeSse(res: Response) {
  if (res.writableEnded || res.destroyed) {
    return;
  }

  res.write('data: [DONE]\n\n');
  res.end();
}
