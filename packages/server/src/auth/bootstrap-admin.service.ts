import { Injectable, Logger } from '@nestjs/common';
import { getPrismaClient } from '../infrastructure/prisma/prisma-client';
import { SINGLE_USER_EMAIL, SINGLE_USER_ID, SINGLE_USER_USERNAME } from './single-user-auth';

@Injectable()
export class BootstrapAdminService {
  private readonly logger = new Logger(BootstrapAdminService.name);
  private startupPromise: Promise<void> | null = null;

  runStartupWarmup(): Promise<void> {
    if (!this.startupPromise) {
      this.startupPromise = this.runStartupTask(
        '单用户 owner 补建',
        () => this.ensureSingleUserOnStartup(),
      ).then(() => undefined);
    }

    return this.startupPromise;
  }

  async ensureSingleUserOnStartup(): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.user.deleteMany({
      where: { id: { not: SINGLE_USER_ID } },
    });
    await prisma.user.upsert({
      create: {
        id: SINGLE_USER_ID,
        username: SINGLE_USER_USERNAME,
        email: SINGLE_USER_EMAIL,
        passwordHash: 'single-secret-auth',
        role: 'local',
      },
      update: {
        email: SINGLE_USER_EMAIL,
        passwordHash: 'single-secret-auth',
        role: 'local',
        username: SINGLE_USER_USERNAME,
      },
      where: { id: SINGLE_USER_ID },
    });

    this.logger.log(`已校准单用户 owner: ${SINGLE_USER_USERNAME}`);
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
