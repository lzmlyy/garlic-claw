import * as fs from 'node:fs';
import * as path from 'node:path';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConversationController } from '../../src/adapters/http/conversation/conversation.controller';

describe('ConversationController', () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const assistantMessageId = '22222222-2222-4222-8222-222222222222';
  const conversationMessageLifecycleService = { retryMessageGeneration: jest.fn(), startMessageGeneration: jest.fn(), stopMessageGeneration: jest.fn() };
  const conversationTaskService = { stopTask: jest.fn(), subscribe: jest.fn(), waitForTask: jest.fn() };
  const runtimeHostConversationMessageService = { deleteMessage: jest.fn(), updateMessage: jest.fn() };
  const skillSessionService = { getConversationSkillStateForUser: jest.fn(), updateConversationSkillStateForUser: jest.fn() };
  const runtimeHostConversationRecordService = {
    createConversation: jest.fn(),
    deleteConversation: jest.fn(),
    getConversation: jest.fn(),
    listConversations: jest.fn(),
    readConversationHostServices: jest.fn(),
    readConversationSkillState: jest.fn(),
    requireConversation: jest.fn(),
    writeConversationHostServices: jest.fn(),
    writeConversationSkillState: jest.fn(),
  };
  let controller: ConversationController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ConversationController(
      conversationMessageLifecycleService as never,
      conversationTaskService as never,
      runtimeHostConversationMessageService as never,
      skillSessionService as never,
      runtimeHostConversationRecordService as never,
    );
  });

  it('marks chat routes with jwt auth guard metadata', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ConversationController) as Array<{ name?: string }> | undefined;
    expect(guards?.map((guard) => guard?.name)).toContain('JwtAuthGuard');
  });

  it('keeps UUID route param validation on conversation and message routes', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/adapters/http/conversation/conversation.controller.ts'),
      'utf8',
    );

    expect(source).toContain("@Get('conversations/:id')");
    expect(source).toContain("@Param('id', ParseUUIDPipe) id: string");
    expect(source).toContain("@Patch('conversations/:id/messages/:messageId')");
    expect(source).toContain("@Param('messageId', ParseUUIDPipe) messageId: string");
  });

  it('creates, lists, reads and deletes conversations through user-owned conversation APIs', () => {
    const overview = { _count: { messages: 0 }, createdAt: '2026-04-11T00:00:00.000Z', id: conversationId, title: 'New Chat', updatedAt: '2026-04-11T00:00:00.000Z' };
    runtimeHostConversationRecordService.createConversation.mockReturnValue(overview);
    runtimeHostConversationRecordService.listConversations.mockReturnValue([overview]);
    runtimeHostConversationRecordService.getConversation.mockReturnValue({ ...overview, messages: [] });
    runtimeHostConversationRecordService.deleteConversation.mockReturnValue({ message: 'Conversation deleted' });

    expect(controller.createConversation('user-1', { title: 'New Chat' } as never)).toEqual(overview);
    expect(runtimeHostConversationRecordService.createConversation).toHaveBeenCalledWith({ title: 'New Chat', userId: 'user-1' });
    expect(controller.listConversations('user-1')).toEqual([overview]);
    expect(runtimeHostConversationRecordService.listConversations).toHaveBeenCalledWith('user-1');
    expect(controller.getConversation('user-1', conversationId)).toEqual({ ...overview, messages: [] });
    expect(runtimeHostConversationRecordService.getConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(controller.deleteConversation('user-1', conversationId)).toEqual({ message: 'Conversation deleted' });
    expect(runtimeHostConversationRecordService.deleteConversation).toHaveBeenCalledWith(conversationId, 'user-1');
  });

  it('reads and updates conversation services and skills through owned conversation APIs', () => {
    runtimeHostConversationRecordService.readConversationHostServices.mockReturnValue({ llmEnabled: false, sessionEnabled: true, ttsEnabled: true });
    runtimeHostConversationRecordService.writeConversationHostServices.mockReturnValue({ llmEnabled: true, sessionEnabled: true, ttsEnabled: false });
    skillSessionService.getConversationSkillStateForUser.mockReturnValue(skillState('project/planner'));
    skillSessionService.updateConversationSkillStateForUser.mockReturnValue(skillState('project/operator'));

    expect(controller.getConversationHostServices('user-1', conversationId)).toEqual({ llmEnabled: false, sessionEnabled: true, ttsEnabled: true });
    expect(runtimeHostConversationRecordService.readConversationHostServices).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(controller.updateConversationHostServices('user-1', conversationId, { ttsEnabled: false } as never)).toEqual({ llmEnabled: true, sessionEnabled: true, ttsEnabled: false });
    expect(runtimeHostConversationRecordService.writeConversationHostServices).toHaveBeenCalledWith(conversationId, { ttsEnabled: false }, 'user-1');
    expect(controller.getConversationSkillState('user-1', conversationId)).toEqual(skillState('project/planner'));
    expect(skillSessionService.getConversationSkillStateForUser).toHaveBeenCalledWith('user-1', conversationId);
    expect(controller.updateConversationSkills('user-1', conversationId, { activeSkillIds: ['project/operator'] } as never)).toEqual(skillState('project/operator'));
    expect(skillSessionService.updateConversationSkillStateForUser).toHaveBeenCalledWith('user-1', conversationId, ['project/operator']);
  });

  it('streams message-start and task events over SSE for sendMessage', async () => {
    const response = createResponseStub();
    let subscriber: ((event: { type: string }) => void) | null = null;
    const sendDto = { content: '你好', model: 'gpt-5.4', parts: [{ text: '你好', type: 'text' as const }], provider: 'openai' };
    const started = { assistantMessage: { id: assistantMessageId, role: 'assistant', content: '' }, userMessage: { id: '33333333-3333-4333-8333-333333333333', role: 'user', content: '你好' } };
    conversationMessageLifecycleService.startMessageGeneration.mockResolvedValue(started);
    conversationTaskService.subscribe.mockImplementation((_id: string, listener: (event: { type: string }) => void) => (subscriber = listener, jest.fn()));
    conversationTaskService.waitForTask.mockImplementation(async () => {
      subscriber?.({ messageId: assistantMessageId, status: 'streaming', type: 'status' } as never);
      subscriber?.({ messageId: assistantMessageId, text: '你好', type: 'text-delta' } as never);
      subscriber?.({ messageId: assistantMessageId, status: 'completed', type: 'finish' } as never);
    });

    await controller.sendMessage('user-1', conversationId, sendDto as never, response as never);

    expect(runtimeHostConversationRecordService.requireConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(conversationMessageLifecycleService.startMessageGeneration).toHaveBeenCalledWith(conversationId, sendDto, 'user-1');
    expect(response.write).toHaveBeenNthCalledWith(1, sse({ assistantMessage: started.assistantMessage, type: 'message-start', userMessage: started.userMessage }));
    expect(response.write).toHaveBeenCalledWith(sse({ messageId: assistantMessageId, text: '你好', type: 'text-delta' }));
    expect(response.write).toHaveBeenLastCalledWith('data: [DONE]\n\n');
  });

  it('unsubscribes the active task listener when SSE closes', async () => {
    const response = createResponseStub();
    let closeHandler: (() => void) | undefined;
    const unsubscribe = jest.fn();
    response.on.mockImplementation((event: string, handler: () => void) => {
      if (event === 'close') closeHandler = handler;
    });
    conversationMessageLifecycleService.startMessageGeneration.mockResolvedValue({
      assistantMessage: { id: assistantMessageId, role: 'assistant', content: '' },
      userMessage: { id: '33333333-3333-4333-8333-333333333333', role: 'user', content: '你好' },
    });
    conversationTaskService.subscribe.mockReturnValue(unsubscribe);
    conversationTaskService.waitForTask.mockResolvedValue(undefined);

    await controller.sendMessage('user-1', conversationId, { content: '你好' } as never, response as never);
    closeHandler?.();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('streams retry events and forwards stop requests through owned conversation guard', async () => {
    const response = createResponseStub();
    conversationMessageLifecycleService.retryMessageGeneration.mockResolvedValue({ id: assistantMessageId, role: 'assistant', content: '重试后的回复' });
    conversationTaskService.subscribe.mockReturnValue(jest.fn());
    conversationTaskService.waitForTask.mockResolvedValue(undefined);
    conversationMessageLifecycleService.stopMessageGeneration.mockReturnValue({ message: 'Generation stopped' });

    await controller.retryMessage('user-1', conversationId, assistantMessageId, {} as never, response as never);
    expect(runtimeHostConversationRecordService.requireConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(controller.stopMessage('user-1', conversationId, assistantMessageId)).toEqual({ message: 'Generation stopped' });
    expect(runtimeHostConversationRecordService.requireConversation).toHaveBeenLastCalledWith(conversationId, 'user-1');
  });

  it('updates and deletes messages through the runtime conversation owner', async () => {
    const message = { content: '更新后的内容', createdAt: '2026-04-11T00:00:00.000Z', error: null, id: assistantMessageId, metadataJson: null, model: null, partsJson: null, provider: null, role: 'assistant', status: 'completed', toolCalls: null, toolResults: null, updatedAt: '2026-04-11T00:01:00.000Z' };
    runtimeHostConversationMessageService.updateMessage.mockReturnValue(message);
    runtimeHostConversationMessageService.deleteMessage.mockReturnValue({ success: true });

    await expect(controller.updateMessage('user-1', conversationId, assistantMessageId, { content: '更新后的内容' } as never)).resolves.toEqual(message);
    expect(conversationTaskService.stopTask).toHaveBeenCalledWith(assistantMessageId);
    expect(runtimeHostConversationRecordService.requireConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    await expect(controller.deleteMessage('user-1', conversationId, assistantMessageId)).resolves.toEqual({ success: true });
    expect(conversationTaskService.stopTask).toHaveBeenLastCalledWith(assistantMessageId);
    expect(runtimeHostConversationRecordService.requireConversation).toHaveBeenLastCalledWith(conversationId, 'user-1');
  });

  it('returns conversation detail messages in shared Message contract shape', () => {
    const detail = {
      _count: { messages: 1 },
      createdAt: '2026-04-11T00:00:00.000Z',
      id: conversationId,
      messages: [{ content: '你好', createdAt: '2026-04-11T00:00:00.000Z', error: null, id: assistantMessageId, metadataJson: null, model: 'gpt-5.4', partsJson: '[{\"type\":\"text\",\"text\":\"你好\"}]', provider: 'openai', role: 'assistant', status: 'completed', toolCalls: null, toolResults: null, updatedAt: '2026-04-11T00:00:01.000Z' }],
      title: 'New Chat',
      updatedAt: '2026-04-11T00:00:01.000Z',
    };
    runtimeHostConversationRecordService.getConversation.mockReturnValue(detail);

    expect(controller.getConversation('user-1', conversationId)).toEqual(detail);
    expect(runtimeHostConversationRecordService.getConversation).toHaveBeenCalledWith(conversationId, 'user-1');
  });
});

function skillState(id: string) {
  return { activeSkillIds: [id], activeSkills: [{ id, name: id }] };
}

function sse(payload: object) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function createResponseStub() {
  return { destroyed: false, end: jest.fn(), flushHeaders: jest.fn(), on: jest.fn(), setHeader: jest.fn(), writableEnded: false, write: jest.fn() };
}
