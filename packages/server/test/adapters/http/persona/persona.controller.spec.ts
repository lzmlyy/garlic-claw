import { PersonaController } from '../../../../src/adapters/http/persona/persona.controller';
import { GUARDS_METADATA } from '@nestjs/common/constants';

describe('PersonaController', () => {
  const runtimeHostConversationRecordService = {
    requireConversation: jest.fn(),
  };
  const runtimeHostService = {
    activatePersona: jest.fn(),
    listPersonas: jest.fn(),
    readCurrentPersona: jest.fn(),
  };

  let controller: PersonaController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PersonaController(
      runtimeHostConversationRecordService as never,
      runtimeHostService as never,
    );
  });

  it('marks current persona routes with jwt auth guard metadata', () => {
    const getGuards = Reflect.getMetadata(GUARDS_METADATA, PersonaController.prototype.getCurrentPersona) as Array<{ name?: string }> | undefined;
    const putGuards = Reflect.getMetadata(GUARDS_METADATA, PersonaController.prototype.activateCurrentPersona) as Array<{ name?: string }> | undefined;
    expect(getGuards?.map((guard) => guard?.name)).toContain('JwtAuthGuard');
    expect(putGuards?.map((guard) => guard?.name)).toContain('JwtAuthGuard');
  });

  it('lists personas and reads the current persona from request user context', async () => {
    runtimeHostService.listPersonas.mockReturnValue([
      {
        id: 'builtin.default-assistant',
        isDefault: true,
        name: 'Default Assistant',
      },
    ]);
    runtimeHostConversationRecordService.requireConversation.mockReturnValue({
      activePersonaId: undefined,
    });
    runtimeHostService.readCurrentPersona.mockReturnValue({
      source: 'default',
      personaId: 'builtin.default-assistant',
      name: 'Default Assistant',
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
    runtimeHostConversationRecordService.requireConversation.mockReturnValue({
      activePersonaId: undefined,
      updatedAt: '2026-04-12T00:00:00.000Z',
    });
    runtimeHostService.activatePersona.mockReturnValue({
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
});
