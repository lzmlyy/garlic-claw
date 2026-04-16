import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import type { Prisma } from '@prisma/client';
import type { StringValue } from 'ms';
import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getPrismaClient } from '../infrastructure/prisma/prisma-client';
import { AdminIdentityCandidate, AdminIdentityService } from './admin-identity.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly adminIdentity: AdminIdentityService,
  ) {}

  async register(dto: RegisterDto) {
    const prisma = getPrismaClient();
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ username: dto.username }, { email: dto.email }],
      },
    });
    if (existing) {
      throw new ConflictException('Username or email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const userCount = await tx.user.count();
      return tx.user.create({
        data: {
          id: randomUUID(),
          username: dto.username,
          email: dto.email,
          passwordHash,
          role: userCount === 0 ? 'super_admin' : 'user',
        },
      });
    });

    return this.generateTokens(
      user.id,
      user.username,
      this.resolveRuntimeRole(user),
    );
  }

  async login(dto: LoginDto) {
    const user = await getPrismaClient().user.findUnique({
      where: { username: dto.username },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(
      user.id,
      user.username,
      this.resolveRuntimeRole(user),
    );
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'fallback-refresh-secret'),
      }) as { sub?: unknown };
      if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await getPrismaClient().user.findUnique({
        where: { id: payload.sub },
      });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return this.generateTokens(
        user.id,
        user.username,
        this.resolveRuntimeRole(user),
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async devLogin(
    username: string,
    requestedRole: 'super_admin' | 'admin' | 'user' = 'user',
  ) {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('仅开发模式支持一键登录');
    }

    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      throw new UnauthorizedException('用户名不能为空');
    }

    const prisma = getPrismaClient();
    let user = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (!user) {
      const userCount = await prisma.user.count();
      const passwordHash = await bcrypt.hash('dev-login-password', 12);
      try {
        user = await prisma.user.create({
          data: {
            id: randomUUID(),
            username: normalizedUsername,
            email: `${normalizedUsername}@dev.local`,
            passwordHash,
            role: userCount === 0 ? 'super_admin' : requestedRole,
          },
        });
      } catch (error) {
        if (!isUsernameUniqueConflict(error)) {
          throw error;
        }

        user = await prisma.user.findUnique({
          where: { username: normalizedUsername },
        });
        if (!user) {
          throw error;
        }
      }
    }

    if (user.role !== requestedRole && requestedRole !== 'user') {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { role: requestedRole },
      });
    }

    return this.generateTokens(
      user.id,
      user.username,
      this.resolveRuntimeRole(user),
    );
  }

  private resolveRuntimeRole(user: AdminIdentityCandidate): string {
    return this.adminIdentity.resolveRole(user);
  }

  private generateTokens(userId: string, username: string, role: string) {
    const payload = { sub: userId, username, role };
    const accessTokenSecret = this.configService.get<string>('JWT_SECRET') ?? 'fallback-secret';
    const refreshTokenSecret = this.configService.get<string>('JWT_REFRESH_SECRET') ?? 'fallback-refresh-secret';
    const accessToken = this.jwtService.sign(payload, {
      secret: accessTokenSecret,
      expiresIn: this.readJwtExpiresIn('JWT_EXPIRES_IN', '15m'),
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: refreshTokenSecret,
      expiresIn: this.readJwtExpiresIn('JWT_REFRESH_EXPIRES_IN', '7d'),
    });
    return { accessToken, refreshToken };
  }

  private readJwtExpiresIn(key: string, fallback: StringValue): StringValue {
    const configured = this.configService.get<string>(key);
    return (configured as StringValue | undefined) ?? fallback;
  }
}

function isUsernameUniqueConflict(error: unknown): boolean {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    error.code !== 'P2002'
  ) {
    return false;
  }

  if (!('meta' in error)) {
    return true;
  }

  const meta = error.meta;
  if (
    typeof meta !== 'object' ||
    meta === null ||
    !('target' in meta) ||
    !Array.isArray(meta.target)
  ) {
    return true;
  }

  return meta.target.includes('username');
}
