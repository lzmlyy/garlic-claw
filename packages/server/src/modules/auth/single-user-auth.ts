import type { ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';

export const SINGLE_USER_ID = '00000000-0000-4000-8000-000000000001';
export const SINGLE_USER_USERNAME = 'local-owner';
export const SINGLE_USER_EMAIL = 'local-owner@garlic-claw.local';
export const LOGIN_SECRET_ENV = 'GARLIC_CLAW_LOGIN_SECRET';
export const AUTH_TTL_ENV = 'GARLIC_CLAW_AUTH_TTL';
export const JWT_SECRET_ENV = 'JWT_SECRET';
export const DEFAULT_AUTH_TTL = '30d' as const satisfies StringValue;

const INSECURE_JWT_SECRET_VALUES = new Set([
  'fallback-secret',
  'change-me-to-a-secure-random-string',
]);

export type SingleUserClaims = {
  email: string;
  sub: string;
  username: string;
};

export function createSingleUserClaims(): SingleUserClaims {
  return {
    sub: SINGLE_USER_ID,
    username: SINGLE_USER_USERNAME,
    email: SINGLE_USER_EMAIL,
  };
}

export function createSingleUserProfile() {
  return {
    id: SINGLE_USER_ID,
    username: SINGLE_USER_USERNAME,
    email: SINGLE_USER_EMAIL,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

export function readLoginSecret(configService: ConfigService): string {
  const configured = configService.get<string>(LOGIN_SECRET_ENV)?.trim();
  if (!configured) {
    throw new Error(`${LOGIN_SECRET_ENV} 未配置`);
  }
  return configured;
}

export function readJwtSecret(configService: ConfigService): string {
  const configured = configService.get<string>(JWT_SECRET_ENV)?.trim();
  if (!configured) {
    throw new Error(`${JWT_SECRET_ENV} 未配置`);
  }
  if (INSECURE_JWT_SECRET_VALUES.has(configured)) {
    throw new Error(`${JWT_SECRET_ENV} 不能使用示例值或历史默认值`);
  }
  return configured;
}

export function readAuthTtl(configService: ConfigService): StringValue {
  const configured = configService.get<string>(AUTH_TTL_ENV)?.trim();
  return (configured as StringValue | undefined) || DEFAULT_AUTH_TTL;
}
