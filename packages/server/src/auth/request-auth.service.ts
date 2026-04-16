import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { type AuthenticatedUser } from './http-auth';
import { ApiKeyService } from './api-key.service';
import { AdminIdentityService } from './admin-identity.service';
import { getPrismaClient } from '../infrastructure/prisma/prisma-client';

const API_KEY_TOKEN_PATTERN =
  /^gca_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_([A-Za-z0-9_-]+)$/i;

type JwtPayload = {
  sub?: string;
};

@Injectable()
export class RequestAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly adminIdentity: AdminIdentityService,
    private readonly apiKeys: ApiKeyService,
  ) {}

  async authenticateJwtRequest(request: Request): Promise<AuthenticatedUser> {
    const jwtToken = extractJwtToken(request);
    if (!jwtToken) {
      throw new UnauthorizedException('Missing access token');
    }

    return this.authenticateJwtToken(jwtToken);
  }

  async authenticateApiKeyRequest(request: Request): Promise<AuthenticatedUser> {
    const apiKeyToken = extractApiKeyToken(request);
    if (!apiKeyToken) {
      throw new UnauthorizedException('Missing API key');
    }

    return this.apiKeys.authenticateToken(apiKeyToken);
  }

  private async authenticateJwtToken(token: string): Promise<AuthenticatedUser> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET') || 'fallback-secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }

    if (!payload.sub?.trim()) {
      throw new UnauthorizedException('Invalid access token');
    }

    const user = await getPrismaClient().user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      authType: 'jwt',
      id: user.id,
      username: user.username,
      email: user.email,
      role: this.adminIdentity.resolveRole(user),
      scopes: [],
    };
  }
}

function extractApiKeyToken(request: Request): string | null {
  const explicitKey = readHeader(request, 'x-api-key');
  if (explicitKey) {
    return explicitKey;
  }

  const authorization = readHeader(request, 'authorization');
  if (!authorization) {
    return null;
  }

  if (authorization.startsWith('ApiKey ')) {
    return authorization.slice('ApiKey '.length).trim() || null;
  }
  if (authorization.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim();
    return API_KEY_TOKEN_PATTERN.test(token) ? token : null;
  }

  return null;
}

function extractJwtToken(request: Request): string | null {
  const authorization = readHeader(request, 'authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token || API_KEY_TOKEN_PATTERN.test(token)) {
    return null;
  }

  return token;
}

function readHeader(request: Request, header: string): string | null {
  const value = request.headers[header];
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    return value[0].trim() || null;
  }

  return null;
}
