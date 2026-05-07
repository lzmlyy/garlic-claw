import * as os from 'node:os';
import * as path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { ConversationStoreService } from '../../../src/modules/runtime/host/conversation-store.service';
import { ConversationTodoService } from '../../../src/modules/runtime/host/conversation-todo.service';
import { TodoToolService } from '../../../src/modules/execution/todo/todo-tool.service';

describe('TodoToolService', () => {
  const conversationsEnvKey = 'GARLIC_CLAW_CONVERSATIONS_PATH';
  const todosEnvKey = 'GARLIC_CLAW_CONVERSATION_TODOS_PATH';

  beforeEach(() => {
    process.env[conversationsEnvKey] = path.join(os.tmpdir(), `todo-tool.conversations-${Date.now()}-${Math.random()}.json`);
    process.env[todosEnvKey] = path.join(os.tmpdir(), `todo-tool.todos-${Date.now()}-${Math.random()}.json`);
  });

  afterEach(() => {
    delete process.env[conversationsEnvKey];
    delete process.env[todosEnvKey];
  });

  it('normalizes todos and delegates persistence to conversation todo owner', () => {
    const recordService = new ConversationStoreService();
    const todoOwner = new ConversationTodoService(recordService);
    const todoToolService = new TodoToolService(todoOwner);
    const sessionId = (recordService.createConversation({ title: 'Todo Tool' }) as { id: string }).id;

    expect(todoToolService.updateSessionTodo({
      sessionId,
      todos: [
        { content: '  实现 todo 对齐  ', priority: 'high', status: 'in_progress' },
      ],
    })).toEqual({
      pendingCount: 1,
      sessionId,
      todos: [
        { content: '实现 todo 对齐', priority: 'high', status: 'in_progress' },
      ],
    });
    expect(todoOwner.readSessionTodo(sessionId)).toEqual([
      { content: '实现 todo 对齐', priority: 'high', status: 'in_progress' },
    ]);
  });

  it('rejects missing session id', () => {
    const todoToolService = new TodoToolService({ replaceSessionTodo: jest.fn() } as never);

    expect(() => todoToolService.updateSessionTodo({
      todos: [{ content: '实现 todo 对齐', priority: 'high', status: 'pending' }],
    })).toThrow(BadRequestException);
  });
});
