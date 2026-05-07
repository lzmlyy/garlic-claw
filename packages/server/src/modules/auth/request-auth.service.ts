import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { type AuthenticatedUser } from './http-auth';
import { readJwtSecret, SINGLE_USER_EMAIL, SINGLE_USER_ID, SINGLE_USER_USERNAME } from './single-user-auth';

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
      throw new UnauthorizedException('缺少访问令牌');
    }

    return this.authenticateJwtToken(jwtToken);
  }

  private async authenticateJwtToken(token: string): Promise<AuthenticatedUser> {
    let payload: JwtPayload;
    const jwtSecret = readJwtSecret(this.configService);
    try {
      payload = this.jwtService.verify<JwtPayload>(token, {
        secret: jwtSecret,
      });
    } catch {
      throw new UnauthorizedException('访问令牌无效');
    }

    if (payload.sub !== SINGLE_USER_ID) {
      throw new UnauthorizedException('访问令牌无效');
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
