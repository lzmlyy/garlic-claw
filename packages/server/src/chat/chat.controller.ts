import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    Res,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { CreateConversationDto, SendMessageDto } from './dto/chat.dto';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

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
   * 发送消息并通过 SSE 流式传输 AI 响应。
   */
  @Post('conversations/:id/messages')
  async sendMessage(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ) {
    const result = await this.chatService.sendMessage(userId, id, dto);

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    let fullText = '';
    const toolCallsList: unknown[] = [];
    const toolResultsList: unknown[] = [];

    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            fullText += part.text;
            res.write(
              `data: ${JSON.stringify({ type: 'text-delta', text: part.text })}\n\n`,
            );
            break;

          case 'tool-call':
            toolCallsList.push({
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
            });
            res.write(
              `data: ${JSON.stringify({ type: 'tool-call', toolName: part.toolName, input: part.input })}\n\n`,
            );
            break;

          case 'tool-result':
            toolResultsList.push({
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              output: part.output,
            });
            res.write(
              `data: ${JSON.stringify({ type: 'tool-result', toolName: part.toolName, output: part.output })}\n\n`,
            );
            break;

          case 'finish':
            res.write(`data: ${JSON.stringify({ type: 'finish' })}\n\n`);
            break;
        }
      }
    } catch (error) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : '未知错误' })}\n\n`,
      );
    }

    // 保存助手消息到数据库
    if (fullText || toolCallsList.length) {
      await this.chatService.saveAssistantMessage(
        id,
        fullText,
        toolCallsList,
        toolResultsList,
      );
    }

    res.write('data: [DONE]\n\n');
    res.end();
  }
}
