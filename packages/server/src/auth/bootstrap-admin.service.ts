import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { readBootstrapAdminConfig } from './bootstrap-admin-config';

/**
 * 启动期 bootstrap 管理员账号补建服务。
 *
 * 输入:
 * - 环境变量中的管理员用户名、密码、邮箱与角色
 * - 数据库当前用户表
 *
 * 输出:
 * - 缺失时自动创建一个可登录的管理员账号
 *
 * 预期行为:
 * - 仅在用户名和密码都配置时启用
 * - 仅在数据库不存在该账号时创建
 * - 持久化角色先写成 `user`，最终权限仍由环境变量决定
 */
@Injectable()
export class BootstrapAdminService {
  private readonly logger = new Logger(BootstrapAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 后端 ready 后检查并补建 bootstrap 管理员账号。
   */
  async ensureBootstrapAdminOnStartup() {
    const bootstrapAdmin = readBootstrapAdminConfig(this.configService);
    if (!bootstrapAdmin) {
      return;
    }

    const existingUser = await this.prisma.user.findFirst({
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

    await this.prisma.user.create({
      data: {
        username: bootstrapAdmin.username,
        email: bootstrapAdmin.email,
        passwordHash,
        // 真实权限统一走环境变量解析，数据库里保留最小默认角色即可。
        role: 'user',
      },
    });

    this.logger.log(
      `已根据环境变量自动创建 bootstrap 管理员账号: ${bootstrapAdmin.username}`,
    );
  }
}
