import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  type ApiKeyScope,
  type ApiKeySummary,
  type CreateApiKeyRequest,
  type CreateApiKeyResponse,
} from '@garlic-claw/shared';
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../infrastructure/prisma/prisma-client';
import { API_KEY_SCOPES } from './api-key.constants';
import { AdminIdentityService } from './admin-identity.service';

const API_KEY_TOKEN_PREFIX = 'gca';
const API_KEY_TOKEN_PATTERN =
  /^gca_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_([A-Za-z0-9_-]+)$/i;

type ApiKeySummaryRecord = {
  id: string;
  name: string;
  keyPrefix: string;
  scopesJson: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ApiKeyAuthRecord = ApiKeySummaryRecord & {
  secretHash: string;
  user: {
    email: string;
    id: string;
    role: string;
    username: string;
  };
};

@Injectable()
export class ApiKeyService {
  constructor(private readonly adminIdentity: AdminIdentityService) {}

  async listKeys(userId: string): Promise<ApiKeySummary[]> {
    const rows = await getPrismaClient().apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row: ApiKeySummaryRecord) => this.serializeSummary(row));
  }

  async createKey(
    userId: string,
    input: CreateApiKeyRequest,
  ): Promise<CreateApiKeyResponse> {
    const scopes = normalizeScopes(input.scopes);
    const expiresAt = normalizeExpiry(input.expiresAt);
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const token = `${API_KEY_TOKEN_PREFIX}_${id}_${secret}`;
    const key = await getPrismaClient().apiKey.create({
      data: {
        id,
        userId,
        name: input.name.trim(),
        keyPrefix: `${API_KEY_TOKEN_PREFIX}_${id.slice(0, 8)}`,
        secretHash: hashSecret(secret),
        scopesJson: JSON.stringify(scopes),
        ...(expiresAt ? { expiresAt } : {}),
      },
    });

    return {
      ...this.serializeSummary(key),
      token,
    };
  }

  async revokeKey(userId: string, keyId: string): Promise<ApiKeySummary> {
    const existing = await getPrismaClient().apiKey.findUnique({
      where: { id: keyId },
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('API key not found');
    }

    const revoked = await getPrismaClient().apiKey.update({
      where: { id: keyId },
      data: {
        revokedAt: existing.revokedAt ?? new Date(),
      },
    });

    return this.serializeSummary(revoked);
  }

  async authenticateToken(token: string) {
    const parsed = parseApiKeyToken(token);
    if (!parsed) {
      throw new UnauthorizedException('Invalid API key');
    }

    const row: ApiKeyAuthRecord | null = await getPrismaClient().apiKey.findUnique({
      where: { id: parsed.id },
      include: {
        user: {
          select: {
            email: true,
            id: true,
            role: true,
            username: true,
          },
        },
      },
    });
    if (!row || row.revokedAt || (row.expiresAt && row.expiresAt.getTime() <= Date.now()) || !verifySecret(parsed.secret, row.secretHash)) {
      throw new UnauthorizedException('Invalid API key');
    }

    await getPrismaClient().apiKey.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      authType: 'api_key' as const,
      id: row.user.id,
      username: row.user.username,
      email: row.user.email,
      role: this.adminIdentity.resolveRole(row.user),
      scopes: normalizeScopes(parseScopes(row.scopesJson)),
      apiKeyId: row.id,
      apiKeyName: row.name,
    };
  }

  private serializeSummary(row: ApiKeySummaryRecord): ApiKeySummary {
    return {
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      scopes: normalizeScopes(parseScopes(row.scopesJson)),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function normalizeScopes(scopes: ApiKeyScope[]): ApiKeyScope[] {
  const normalized = [...new Set(scopes)].sort();
  for (const scope of normalized) {
    if (!API_KEY_SCOPES.includes(scope)) {
      throw new BadRequestException(`Unsupported API key scope: ${scope}`);
    }
  }

  return normalized;
}

function normalizeExpiry(expiresAt?: string): Date | undefined {
  if (!expiresAt) {
    return undefined;
  }

  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('Invalid expiresAt');
  }
  if (parsed.getTime() <= Date.now()) {
    throw new BadRequestException('expiresAt must be in the future');
  }

  return parsed;
}

function parseApiKeyToken(token: string): { id: string; secret: string } | null {
  const match = API_KEY_TOKEN_PATTERN.exec(token.trim());
  return match
    ? {
        id: match[1],
        secret: match[2],
      }
    : null;
}

function parseScopes(scopesJson: string): ApiKeyScope[] {
  const parsed = JSON.parse(scopesJson) as unknown;
  if (!Array.isArray(parsed)) {
    throw new UnauthorizedException('Invalid API key scopes');
  }
  return parsed as ApiKeyScope[];
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function verifySecret(secret: string, storedHash: string): boolean {
  const actual = Buffer.from(hashSecret(secret), 'utf8');
  const expected = Buffer.from(storedHash, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
