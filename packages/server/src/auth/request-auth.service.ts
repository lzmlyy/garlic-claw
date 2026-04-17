import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { type AuthenticatedUser } from './http-auth';
import { SINGLE_USER_EMAIL, SINGLE_USER_ID, SINGLE_USER_USERNAME } from './single-user-auth';

type JwtPayload = {
  email?: string;
  sub?: string;
  username?: string;
};

@Injectable()
export class RequestAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async authenticateJwtRequest(request: Request): Promise<AuthenticatedUser> {
    const jwtToken = extractJwtToken(request);
    if (!jwtToken) {
      throw new UnauthorizedException('Missing access token');
    }

    return this.authenticateJwtToken(jwtToken);
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

    if (payload.sub !== SINGLE_USER_ID) {
      throw new UnauthorizedException('Invalid access token');
    }

    return {
      authType: 'jwt',
      id: SINGLE_USER_ID,
      username: payload.username?.trim() || SINGLE_USER_USERNAME,
      email: payload.email?.trim() || SINGLE_USER_EMAIL,
    };
  }
}

function extractJwtToken(request: Request): string | null {
  const value = request.headers.authorization;
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) {
    return null;
  }

  const token = value.slice('Bearer '.length).trim();
  return token || null;
}
