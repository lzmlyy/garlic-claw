import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { API_KEY_TOKEN_PATTERN } from './api-key.constants';
import type { AuthenticatedUser } from './auth-user';
import { ApiKeyService } from './api-key.service';
import type { JwtPayload } from './strategies/jwt.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Injectable()
export class RequestAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly jwtStrategy: JwtStrategy,
    private readonly apiKeys: ApiKeyService,
  ) {}

  async authenticateAnyRequest(request: Request): Promise<AuthenticatedUser> {
    const apiKeyToken = extractApiKeyToken(request);
    if (apiKeyToken) {
      return this.apiKeys.authenticateToken(apiKeyToken);
    }

    const jwtToken = extractJwtToken(request);
    if (!jwtToken) {
      throw new UnauthorizedException('Missing authentication credentials');
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
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET') || 'fallback-secret',
      });
      return this.jwtStrategy.validate(payload);
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
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
