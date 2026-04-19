import { PersonaController } from '../../../../src/adapters/http/persona/persona.controller';
import { GUARDS_METADATA } from '@nestjs/common/constants';

describe('PersonaController', () => {
  const personaService = {
    activatePersona: jest.fn(),
    createPersona: jest.fn(),
    deletePersona: jest.fn(),
    listPersonas: jest.fn(),
    readPersonaAvatarPath: jest.fn(),
    readPersona: jest.fn(),
    readCurrentPersona: jest.fn(),
    updatePersona: jest.fn(),
  };

  let controller: PersonaController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PersonaController(personaService as never);
  });

  it('marks current persona routes with jwt auth guard metadata', () => {
    const getGuards = Reflect.getMetadata(GUARDS_METADATA, PersonaController.prototype.getCurrentPersona) as Array<{ name?: string }> | undefined;
    const putGuards = Reflect.getMetadata(GUARDS_METADATA, PersonaController.prototype.activateCurrentPersona) as Array<{ name?: string }> | undefined;
    expect(getGuards?.map((guard) => guard?.name)).toContain('JwtAuthGuard');
    expect(putGuards?.map((guard) => guard?.name)).toContain('JwtAuthGuard');
  });

  it('lists personas and reads the current persona from request user context', async () => {
    personaService.listPersonas.mockReturnValue([
      {
        id: 'builtin.default-assistant',
        isDefault: true,
        name: 'Default Assistant',
      },
    ]);
    personaService.readCurrentPersona.mockReturnValue({
      source: 'default',
      personaId: 'builtin.default-assistant',
      name: 'Default Assistant',
      avatar: 'https://example.com/default.png',
      prompt: 'You are Garlic Claw.',
      isDefault: true,
    });

    await expect(controller.listPersonas()).resolves.toEqual([
      {
        id: 'builtin.default-assistant',
        isDefault: true,
        name: 'Default Assistant',
      },
    ]);
    await expect(controller.getCurrentPersona('user-1', 'conversation-1')).resolves.toEqual(
      expect.objectContaining({
        personaId: 'builtin.default-assistant',
      }),
    );
  });

  it('activates a conversation persona from request body', async () => {
    personaService.activatePersona.mockReturnValue({
      source: 'conversation',
      personaId: 'persona.writer',
      name: 'Writer',
      prompt: 'Write clearly.',
      isDefault: false,
    });

    await expect(controller.activateCurrentPersona('user-1', {
      conversationId: 'conversation-1',
      personaId: 'persona.writer',
    } as never)).resolves.toEqual(
      expect.objectContaining({
        personaId: 'persona.writer',
      }),
    );
  });

  it('reads, creates, updates and deletes persona resources', async () => {
    personaService.readPersona.mockReturnValue({
      avatar: 'https://example.com/writer.png',
      beginDialogs: [],
      customErrorMessage: null,
      description: '写作人格',
      id: 'persona.writer',
      isDefault: false,
      name: 'Writer',
      prompt: 'Write clearly.',
      skillIds: null,
      toolNames: ['memory.search'],
    });
    personaService.createPersona.mockReturnValue({
      avatar: 'https://example.com/writer.png',
      beginDialogs: [],
      customErrorMessage: null,
      description: '写作人格',
      id: 'persona.writer',
      isDefault: false,
      name: 'Writer',
      prompt: 'Write clearly.',
      skillIds: null,
      toolNames: ['memory.search'],
    });
    personaService.updatePersona.mockReturnValue({
      avatar: 'https://example.com/reviewer.png',
      beginDialogs: [{ content: '先列提纲。', role: 'assistant' }],
      customErrorMessage: '写作人格暂时不可用',
      description: '改成审稿人格',
      id: 'persona.writer',
      isDefault: true,
      name: 'Reviewer',
      prompt: 'Review critically.',
      skillIds: [],
      toolNames: [],
    });
    personaService.deletePersona.mockReturnValue({
      deletedPersonaId: 'persona.writer',
      fallbackPersonaId: 'builtin.default-assistant',
      reassignedConversationCount: 2,
    });

    await expect(controller.getPersona('persona.writer')).resolves.toEqual(
      expect.objectContaining({
        id: 'persona.writer',
        name: 'Writer',
      }),
    );
    await expect(controller.createPersona({
      description: '写作人格',
      id: 'persona.writer',
      name: 'Writer',
      prompt: 'Write clearly.',
    } as never)).resolves.toEqual(
      expect.objectContaining({
        id: 'persona.writer',
      }),
    );
    await expect(controller.updatePersona('persona.writer', {
      beginDialogs: [{ content: '先列提纲。', role: 'assistant' }],
      customErrorMessage: '写作人格暂时不可用',
      description: '改成审稿人格',
      isDefault: true,
      name: 'Reviewer',
      prompt: 'Review critically.',
      skillIds: [],
      toolNames: [],
    } as never)).resolves.toEqual(
      expect.objectContaining({
        avatar: 'https://example.com/reviewer.png',
        isDefault: true,
        name: 'Reviewer',
      }),
    );
    await expect(controller.deletePersona('persona.writer')).resolves.toEqual({
      deletedPersonaId: 'persona.writer',
      fallbackPersonaId: 'builtin.default-assistant',
      reassignedConversationCount: 2,
    });
  });

  it('serves persona avatar files through the dedicated avatar route', async () => {
    const response = {
      sendFile: jest.fn(),
    };
    personaService.readPersonaAvatarPath.mockReturnValue('D:/Git_Repository/garlic-claw/persona/persona.writer/avatar.webp');

    await controller.getPersonaAvatar('persona.writer', response as never);

    expect(personaService.readPersonaAvatarPath).toHaveBeenCalledWith('persona.writer');
    expect(response.sendFile).toHaveBeenCalledWith('D:/Git_Repository/garlic-claw/persona/persona.writer/avatar.webp');
  });
});
