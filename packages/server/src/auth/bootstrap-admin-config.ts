import { ConfigService } from '@nestjs/config';

/**
 * bootstrap 管理员允许的最终角色。
 */
export type BootstrapAdminRole = 'super_admin' | 'admin';

/**
 * 启动期管理员账号配置。
 */
export interface BootstrapAdminConfig {
  /** 登录用户名。 */
  username: string;
  /** 登录邮箱。 */
  email: string;
  /** 明文密码，仅用于启动期首次建号。 */
  password: string;
  /** 运行时应视为的最终角色。 */
  role: BootstrapAdminRole;
}

type ConfigReader = Pick<ConfigService, 'get'>;

/**
 * 从环境变量中读取 bootstrap 管理员配置。
 *
 * 输入:
 * - `BOOTSTRAP_ADMIN_USERNAME`
 * - `BOOTSTRAP_ADMIN_PASSWORD`
 * - `BOOTSTRAP_ADMIN_EMAIL`
 * - `BOOTSTRAP_ADMIN_ROLE`
 *
 * 输出:
 * - 完整配置；若关键字段缺失则返回 `null`
 *
 * 预期行为:
 * - 只有用户名和密码都存在时才视为启用
 * - 未填写邮箱时自动生成一个稳定邮箱
 * - 未填写或填写非法角色时默认回退到 `super_admin`
 */
export function readBootstrapAdminConfig(
  configService: ConfigReader,
): BootstrapAdminConfig | null {
  const username = readTrimmedConfig(configService, 'BOOTSTRAP_ADMIN_USERNAME');
  const password = readTrimmedConfig(configService, 'BOOTSTRAP_ADMIN_PASSWORD');

  if (!username || !password) {
    return null;
  }

  const email =
    readTrimmedConfig(configService, 'BOOTSTRAP_ADMIN_EMAIL') ??
    createBootstrapAdminEmail(username);

  return {
    username,
    email,
    password,
    role: readBootstrapAdminRole(
      readTrimmedConfig(configService, 'BOOTSTRAP_ADMIN_ROLE'),
    ),
  };
}

/**
 * 标准化用户名或邮箱，用于环境变量命中判断。
 * @param value 原始标识符
 * @returns 去空白并转小写后的结果
 */
export function normalizeAdminIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 为未显式配置邮箱的 bootstrap 管理员生成默认邮箱。
 * @param username 管理员用户名
 * @returns 稳定可重复的默认邮箱
 */
export function createBootstrapAdminEmail(username: string): string {
  const localPart = normalizeAdminIdentifier(username)
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${localPart || 'admin'}@bootstrap.local`;
}

/**
 * 读取去首尾空白后的环境变量。
 * @param configService 配置服务
 * @param key 环境变量名
 * @returns 非空字符串；为空时返回 `null`
 */
function readTrimmedConfig(
  configService: ConfigReader,
  key: string,
): string | null {
  const value = configService.get<string>(key)?.trim();
  return value ? value : null;
}

/**
 * 解析 bootstrap 管理员角色。
 * @param raw 原始角色字符串
 * @returns 可接受的最终角色
 */
function readBootstrapAdminRole(raw: string | null): BootstrapAdminRole {
  return raw === 'admin' ? 'admin' : 'super_admin';
}
