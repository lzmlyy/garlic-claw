import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/auth.dto';
import { createSingleUserClaims, readAuthTtl, readLoginSecret } from './single-user-auth';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const expectedSecret = readLoginSecret(this.configService);
    if (dto.secret.trim() !== expectedSecret) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      accessToken: this.jwtService.sign(createSingleUserClaims(), {
        secret: this.configService.get<string>('JWT_SECRET') ?? 'fallback-secret',
        expiresIn: readAuthTtl(this.configService),
      }),
    };
  }
}
