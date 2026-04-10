import { ModuleRef } from '@nestjs/core';
import { ChatMessageMutationService } from '../../chat/chat-message-mutation.service';

export function createChatMessageMutationFixture() {
  const prisma = {
    message: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    conversation: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (run: (client: typeof prisma) => Promise<unknown>) => run(prisma),
  );

  const chatService = {
    getConversation: jest.fn(),
  };

  const pluginChatRuntime = {
    applyMessageCreated: jest.fn(),
    applyMessageUpdated: jest.fn(),
    dispatchMessageDeleted: jest.fn(),
  };

  const chatTaskService = {
    stopTask: jest.fn(),
  };

  const orchestration = {
    applyFinalResponseHooks: jest.fn(),
    runResponseAfterSendHooks: jest.fn(),
  };

  const moduleRef = {
    get: jest.fn(),
  };

  moduleRef.get.mockImplementation((token: { name?: string }) =>
    token?.name === 'PluginChatRuntimeFacade' ? pluginChatRuntime : null);
  pluginChatRuntime.applyMessageCreated.mockImplementation(
    async ({ payload }: { payload: unknown }) => payload,
  );
  pluginChatRuntime.applyMessageUpdated.mockImplementation(
    async ({ payload }: { payload: unknown }) => payload,
  );
  pluginChatRuntime.dispatchMessageDeleted.mockResolvedValue(undefined);
  orchestration.applyFinalResponseHooks.mockImplementation(
    async ({ result }: { result: unknown }) => result,
  );
  orchestration.runResponseAfterSendHooks.mockResolvedValue(undefined);
  chatTaskService.stopTask.mockResolvedValue(false);
  prisma.conversation.update.mockResolvedValue(null);

  const service = new ChatMessageMutationService(
    prisma as never,
    chatService as never,
    orchestration as never,
    chatTaskService as never,
    moduleRef as unknown as ModuleRef,
  );

  return {
    service,
    prisma,
    chatService,
    pluginChatRuntime,
    chatTaskService,
    orchestration,
    moduleRef,
  };
}
