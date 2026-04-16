import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { AdminIdentityService } from './admin-identity.service';
import { getPrismaClient } from '../infrastructure/prisma/prisma-client';

@Injectable()
export class BootstrapAdminService {
  private readonly logger = new Logger(BootstrapAdminService.name);
  private startupPromise: Promise<void> | null = null;

  constructor(private readonly adminIdentityService: AdminIdentityService) {}

  runStartupWarmup(): Promise<void> {
    if (!this.startupPromise) {
      this.startupPromise = this.runStartupTask(
        'Bootstrap 管理员补建',
        () => this.ensureBootstrapAdminOnStartup(),
      ).then(() => undefined);
    }

    return this.startupPromise;
  }

  async ensureBootstrapAdminOnStartup(): Promise<void> {
    const bootstrapAdmin = this.adminIdentityService.readBootstrapAdminConfig();
    if (!bootstrapAdmin) {
      return;
    }

    const existingUser = await getPrismaClient().user.findFirst({
      where: {
        OR: [
          { username: bootstrapAdmin.username },
          { email: bootstrapAdmin.email },
        ],
      },
      select: { id: true },
    });
    if (existingUser) {
      return;
    }

    const passwordHash = await bcrypt.hash(bootstrapAdmin.password, 12);
    await getPrismaClient().user.create({
      data: {
        id: randomUUID(),
        username: bootstrapAdmin.username,
        email: bootstrapAdmin.email,
        passwordHash,
        role: 'user',
      },
    });

    this.logger.log(
      `已根据环境变量自动创建 bootstrap 管理员账号: ${bootstrapAdmin.username}`,
    );
  }

  private async runStartupTask(label: string, task: () => Promise<void>): Promise<void> {
    const startedAt = Date.now();
    try {
      await task();
      this.logger.log(`${label}完成 (${Date.now() - startedAt}ms)`);
    } catch (error) {
      this.logger.error(
        `${label}失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
