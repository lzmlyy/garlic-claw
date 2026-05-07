import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConversationStoreService } from '../../../src/modules/runtime/host/conversation-store.service';
import { ConversationTodoService } from '../../../src/modules/runtime/host/conversation-todo.service';

describe('ConversationTodoService', () => {
  const conversationsEnvKey = 'GARLIC_CLAW_CONVERSATIONS_PATH';
  const todosEnvKey = 'GARLIC_CLAW_CONVERSATION_TODOS_PATH';
  let conversationStoragePath: string;
  let todoStoragePath: string;

  beforeEach(() => {
    conversationStoragePath = path.join(os.tmpdir(), `conversation-todo.conversations-${Date.now()}-${Math.random()}.json`);
    todoStoragePath = path.join(os.tmpdir(), `conversation-todo.todos-${Date.now()}-${Math.random()}.json`);
    process.env[conversationsEnvKey] = conversationStoragePath;
    process.env[todosEnvKey] = todoStoragePath;
  });

  afterEach(() => {
    delete process.env[conversationsEnvKey];
    delete process.env[todosEnvKey];
    for (const filePath of [conversationStoragePath, todoStoragePath]) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // 忽略临时文件清理失败，避免影响测试语义。
      }
    }
  });

  it('persists todos outside conversation record storage', () => {
    const recordService = new ConversationStoreService();
    const todoService = new ConversationTodoService(recordService);
    const conversationId = (recordService.createConversation({ title: 'Todo Chat' }) as { id: string }).id;

    expect(todoService.replaceSessionTodo(conversationId, [
      { content: '实现 todo owner', priority: 'high', status: 'in_progress' },
    ])).toEqual([
      { content: '实现 todo owner', priority: 'high', status: 'in_progress' },
    ]);
    expect(todoService.readSessionTodo(conversationId)).toEqual([
      { content: '实现 todo owner', priority: 'high', status: 'in_progress' },
    ]);

    expect(JSON.parse(fs.readFileSync(conversationStoragePath, 'utf-8'))).toEqual({
      conversations: {
        [conversationId]: expect.objectContaining({
          id: conversationId,
          title: 'Todo Chat',
        }),
      },
    });
    expect(JSON.parse(fs.readFileSync(todoStoragePath, 'utf-8'))).toEqual({
      todos: {
        [conversationId]: [
          { content: '实现 todo owner', priority: 'high', status: 'in_progress' },
        ],
      },
    });

    const reloadedTodos = new ConversationTodoService(new ConversationStoreService());
    expect(reloadedTodos.readSessionTodo(conversationId)).toEqual([
      { content: '实现 todo owner', priority: 'high', status: 'in_progress' },
    ]);
  });

  it('deletes persisted todos when the conversation is removed through the controller owner', () => {
    const recordService = new ConversationStoreService();
    const todoService = new ConversationTodoService(recordService);
    const conversationId = (recordService.createConversation({ title: 'Todo Chat' }) as { id: string }).id;

    todoService.replaceSessionTodo(conversationId, [
      { content: '实现 todo owner', priority: 'high', status: 'pending' },
    ]);
    todoService.deleteSessionTodo(conversationId);

    expect(todoService.readSessionTodo(conversationId)).toEqual([]);
    expect(JSON.parse(fs.readFileSync(todoStoragePath, 'utf-8'))).toEqual({});
  });

  it('emits independent todo update events on replace and delete', () => {
    const recordService = new ConversationStoreService();
    const todoService = new ConversationTodoService(recordService);
    const conversationId = (recordService.createConversation({ title: 'Todo Chat' }) as { id: string }).id;
    const events: Array<{ sessionId: string; todos: Array<{ content: string; priority: string; status: string }> }> = [];

    const unsubscribe = todoService.subscribe(conversationId, (event) => events.push(event));
    todoService.replaceSessionTodo(conversationId, [
      { content: '实现事件链', priority: 'medium', status: 'pending' },
    ]);
    todoService.deleteSessionTodo(conversationId);
    unsubscribe();

    expect(events).toEqual([
      {
        sessionId: conversationId,
        todos: [
          { content: '实现事件链', priority: 'medium', status: 'pending' },
        ],
      },
      {
        sessionId: conversationId,
        todos: [],
      },
    ]);
  });
});
