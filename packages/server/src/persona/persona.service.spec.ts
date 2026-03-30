import { PersonaService } from './persona.service';

describe('PersonaService', () => {
  const prisma = {
    persona: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  let service: PersonaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PersonaService(prisma as never);
  });

  it('falls back to the default persona when the conversation has no override', async () => {
    prisma.persona.upsert.mockResolvedValue({
      id: 'builtin.default-assistant',
      name: 'Default Assistant',
      prompt: '你是 Garlic Claw',
      description: '默认通用助手',
      isDefault: true,
      createdAt: new Date('2026-03-27T14:00:00.000Z'),
      updatedAt: new Date('2026-03-27T14:00:00.000Z'),
    });
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      activePersonaId: null,
    });

    await expect(
      service.getCurrentPersona({
        conversationId: 'conversation-1',
      }),
    ).resolves.toEqual({
      source: 'default',
      personaId: 'builtin.default-assistant',
      name: 'Default Assistant',
      prompt: '你是 Garlic Claw',
      description: '默认通用助手',
      isDefault: true,
    });
  });

  it('activates a persona for the current conversation', async () => {
    prisma.persona.findUnique.mockResolvedValue({
      id: 'persona-writer',
      name: 'Writer',
      prompt: '你是一个偏文学表达的写作助手。',
      description: '更偏文学润色',
      isDefault: false,
      createdAt: new Date('2026-03-27T14:01:00.000Z'),
      updatedAt: new Date('2026-03-27T14:01:00.000Z'),
    });
    prisma.conversation.update.mockResolvedValue({
      id: 'conversation-1',
      activePersonaId: 'persona-writer',
    });

    await expect(
      service.activateConversationPersona('conversation-1', 'persona-writer'),
    ).resolves.toEqual({
      source: 'conversation',
      personaId: 'persona-writer',
      name: 'Writer',
      prompt: '你是一个偏文学表达的写作助手。',
      description: '更偏文学润色',
      isDefault: false,
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: {
        id: 'conversation-1',
      },
      data: {
        activePersonaId: 'persona-writer',
      },
    });
  });

  it('returns the current persona for the owned conversation only', async () => {
    prisma.persona.findUnique.mockResolvedValue({
      id: 'persona-writer',
      name: 'Writer',
      prompt: '你是一个偏文学表达的写作助手。',
      description: '更偏文学润色',
      isDefault: false,
      createdAt: new Date('2026-03-27T14:01:00.000Z'),
      updatedAt: new Date('2026-03-27T14:01:00.000Z'),
    });
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      userId: 'user-1',
      activePersonaId: 'persona-writer',
    });

    await expect(
      service.getCurrentPersonaForUser('user-1', {
        conversationId: 'conversation-1',
      }),
    ).resolves.toEqual({
      source: 'conversation',
      personaId: 'persona-writer',
      name: 'Writer',
      prompt: '你是一个偏文学表达的写作助手。',
      description: '更偏文学润色',
      isDefault: false,
    });
  });

  it('rejects persona reads for a conversation that belongs to another user', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      userId: 'user-2',
      activePersonaId: 'persona-writer',
    });

    await expect(
      service.getCurrentPersonaForUser('user-1', {
        conversationId: 'conversation-1',
      }),
    ).rejects.toThrow('Not your conversation');
  });

  it('rejects persona activation for a conversation that belongs to another user', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      userId: 'user-2',
      activePersonaId: null,
    });

    await expect(
      service.activateConversationPersonaForUser(
        'user-1',
        'conversation-1',
        'persona-writer',
      ),
    ).rejects.toThrow('Not your conversation');

    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });
});
