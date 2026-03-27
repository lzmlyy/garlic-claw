import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import { PrismaService } from '../prisma/prisma.service';
import { AdminIdentityCandidate, AdminIdentityService } from './admin-identity.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private readonly adminIdentity: AdminIdentityService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: dto.username }, { email: dto.email }],
      },
    });

    if (existing) {
      throw new ConflictException('Username or email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
      },
    });

    return this.generateTokens(
      user.id,
      user.username,
      this.resolveRuntimeRole(user),
    );
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
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
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
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
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * 解析 JWT 中应写入的最终角色。
   * @param user 当前用户
   * @returns 运行时最终角色
   */
  private resolveRuntimeRole(user: AdminIdentityCandidate): string {
    return this.adminIdentity.resolveRole(user);
  }

  private generateTokens(userId: string, username: string, role: string) {
    const payload = { sub: userId, username, role };
    const accessTokenExpiresIn = this.readJwtExpiresIn('JWT_EXPIRES_IN', '15m');
    const refreshTokenExpiresIn = this.readJwtExpiresIn(
      'JWT_REFRESH_EXPIRES_IN',
      '7d',
    );

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: accessTokenExpiresIn,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshTokenExpiresIn,
    });

    return { accessToken, refreshToken };
  }

  /**
   * 读取 JWT 过期时间配置。
   * @param key 配置键名
   * @param fallback 默认过期时间
   * @returns 可直接传给 JWT 签名器的过期时间
   */
  private readJwtExpiresIn(key: string, fallback: StringValue): StringValue {
    return this.configService.get<StringValue>(key) ?? fallback;
  }
}
