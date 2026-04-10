import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

export type MessageRepositoryClient = Pick<PrismaService, 'conversation' | 'message'>;

export class MessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async withTransaction<T>(run: (client: MessageRepositoryClient) => Promise<T>): Promise<T> {
    if (typeof this.prisma.$transaction !== 'function') {
      return run(this.prisma);
    }

    return this.prisma.$transaction(async (tx) => run(tx));
  }

  async createMessage(
    data: Prisma.MessageCreateInput | Prisma.MessageUncheckedCreateInput,
    client?: MessageRepositoryClient,
  ) {
    return this.resolveClient(client).message.create({ data });
  }

  async updateMessage(
    messageId: string,
    data: Prisma.MessageUpdateInput,
    client?: MessageRepositoryClient,
  ) {
    return this.resolveClient(client).message.update({
      where: { id: messageId },
      data,
    });
  }

  async updateManyMessages(
    where: Prisma.MessageWhereInput,
    data: Prisma.MessageUpdateManyMutationInput,
    client?: MessageRepositoryClient,
  ) {
    return this.resolveClient(client).message.updateMany({
      where,
      data,
    });
  }

  async deleteMessage(messageId: string, client?: MessageRepositoryClient) {
    return this.resolveClient(client).message.delete({
      where: { id: messageId },
    });
  }

  async touchConversation(conversationId: string, client?: MessageRepositoryClient): Promise<void> {
    await this.resolveClient(client).conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  }

  private resolveClient(client?: MessageRepositoryClient): MessageRepositoryClient {
    return client ?? this.prisma;
  }
}
