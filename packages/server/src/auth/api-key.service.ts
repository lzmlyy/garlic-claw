import {
  API_KEY_SCOPES,
  type ApiKeyScope,
  type ApiKeySummary,
  type CreateApiKeyRequest,
  type CreateApiKeyResponse,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { API_KEY_TOKEN_PATTERN, API_KEY_TOKEN_PREFIX } from './api-key.constants';
import type { AuthenticatedUser } from './auth-user';
import { AdminIdentityService } from './admin-identity.service';
import { PrismaService } from '../prisma/prisma.service';

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

@Injectable()
export class ApiKeyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminIdentity: AdminIdentityService,
  ) {}

  async listKeys(userId: string): Promise<ApiKeySummary[]> {
    const rows = await this.prisma.apiKey.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
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
    const key = await this.prisma.apiKey.create({
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
    const existing = await this.prisma.apiKey.findUnique({
      where: {
        id: keyId,
      },
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('API key not found');
    }

    const revoked = await this.prisma.apiKey.update({
      where: {
        id: keyId,
      },
      data: {
        revokedAt: existing.revokedAt ?? new Date(),
      },
    });

    return this.serializeSummary(revoked);
  }

  async authenticateToken(token: string): Promise<AuthenticatedUser> {
    const parsed = parseApiKeyToken(token);
    if (!parsed) {
      throw new UnauthorizedException('Invalid API key');
    }

    const row = await this.prisma.apiKey.findUnique({
      where: {
        id: parsed.id,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
      },
    });
    if (!row) {
      throw new UnauthorizedException('Invalid API key');
    }
    if (row.revokedAt) {
      throw new UnauthorizedException('API key has been revoked');
    }
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('API key has expired');
    }

    if (!verifySecret(parsed.secret, row.secretHash)) {
      throw new UnauthorizedException('Invalid API key');
    }

    await this.prisma.apiKey.update({
      where: {
        id: row.id,
      },
      data: {
        lastUsedAt: new Date(),
      },
    });

    return {
      authType: 'api_key',
      id: row.user.id,
      username: row.user.username,
      email: row.user.email,
      role: this.adminIdentity.resolveRole(row.user),
      scopes: normalizeScopes(parseScopes(row.scopesJson)),
      apiKeyId: row.id,
      apiKeyName: row.name,
    };
  }

  private serializeSummary(row: {
    id: string;
    name: string;
    keyPrefix: string;
    scopesJson: string;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ApiKeySummary {
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
  if (!match) {
    return null;
  }

  return {
    id: match[1],
    secret: match[2],
  };
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
  const received = Buffer.from(hashSecret(secret), 'utf8');
  const expected = Buffer.from(storedHash, 'utf8');
  if (received.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(received, expected);
}
