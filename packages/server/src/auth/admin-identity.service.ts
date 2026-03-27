import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  normalizeAdminIdentifier,
  readBootstrapAdminConfig,
} from './bootstrap-admin-config';

/**
 * 可参与环境变量管理员判定的用户最小形状。
 */
export interface AdminIdentityCandidate {
  /** 用户名。 */
  username: string;
  /** 邮箱。 */
  email?: string | null;
  /** 数据库中的原始角色。 */
  role: string;
}

/**
 * 基于环境变量的管理员身份覆盖服务。
 *
 * 输入:
 * - 用户名、邮箱和数据库角色
 * - `.env` 中的管理员用户名/邮箱列表
 *
 * 输出:
 * - 运行时最终角色
 *
 * 预期行为:
 * - 命中超级管理员配置时返回 `super_admin`
 * - 命中管理员配置时返回 `admin`
 * - 未命中时回退数据库角色
 */
@Injectable()
export class AdminIdentityService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * 解析用户的最终运行时角色。
   * @param candidate 当前用户的最小身份信息
   * @returns 最终角色
   */
  resolveRole(candidate: AdminIdentityCandidate): string {
    if (
      this.matchesAny(
        candidate,
        'SUPER_ADMIN_USERNAMES',
        'SUPER_ADMIN_EMAILS',
      )
    ) {
      return 'super_admin';
    }

    if (this.matchesAny(candidate, 'ADMIN_USERNAMES', 'ADMIN_EMAILS')) {
      return 'admin';
    }

    const bootstrapAdmin = readBootstrapAdminConfig(this.configService);
    if (bootstrapAdmin && this.matchesBootstrapAdmin(candidate, bootstrapAdmin)) {
      return bootstrapAdmin.role;
    }

    return candidate.role;
  }

  /**
   * 判断用户是否命中某一组用户名或邮箱配置。
   * @param candidate 当前用户
   * @param usernamesEnv 用户名环境变量名
   * @param emailsEnv 邮箱环境变量名
   * @returns 是否命中
   */
  private matchesAny(
    candidate: AdminIdentityCandidate,
    usernamesEnv: string,
    emailsEnv: string,
  ): boolean {
    const usernames = this.readIdentifiers(usernamesEnv);
    if (usernames.has(normalizeAdminIdentifier(candidate.username))) {
      return true;
    }

    const email = candidate.email
      ? normalizeAdminIdentifier(candidate.email)
      : null;
    if (!email) {
      return false;
    }

    const emails = this.readIdentifiers(emailsEnv);
    return emails.has(email);
  }

  /**
   * 读取并标准化逗号分隔的环境变量列表。
   * @param key 环境变量名
   * @returns 标准化后的标识符集合
   */
  private readIdentifiers(key: string): Set<string> {
    const raw = this.configService.get<string>(key) ?? '';
    return new Set(
      raw
        .split(/[,\r\n]+/)
        .map(normalizeAdminIdentifier)
        .filter((item) => item.length > 0),
    );
  }

  /**
   * 判断当前用户是否命中 dedicated bootstrap 管理员账号。
   * @param candidate 当前用户
   * @param bootstrapAdmin bootstrap 管理员配置
   * @returns 是否命中
   */
  private matchesBootstrapAdmin(
    candidate: AdminIdentityCandidate,
    bootstrapAdmin: { username: string; email: string },
  ): boolean {
    if (
      normalizeAdminIdentifier(candidate.username) ===
      normalizeAdminIdentifier(bootstrapAdmin.username)
    ) {
      return true;
    }

    const email = candidate.email
      ? normalizeAdminIdentifier(candidate.email)
      : null;
    return email === normalizeAdminIdentifier(bootstrapAdmin.email);
  }
}
