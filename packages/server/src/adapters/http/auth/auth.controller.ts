import { Body, Controller, ForbiddenException, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../../../auth/auth.service';
import { DevLoginDto, LoginDto, RefreshTokenDto, RegisterDto } from '../../../auth/dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('dev-login')
  @HttpCode(HttpStatus.OK)
  devLogin(@Body() dto: DevLoginDto) {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('仅开发模式支持一键登录');
    }

    return this.authService.devLogin(dto.username, dto.role);
  }
}
