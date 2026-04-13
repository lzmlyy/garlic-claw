import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { GlobalResponseInterceptor } from '../common/interceptors/global-response.interceptor';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController response envelope', () => {
  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    refreshTokens: jest.fn(),
    devLogin: jest.fn(),
  };

  let app: INestApplication;
  let baseUrl = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('development'),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new GlobalResponseInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('failed to resolve test server address');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns { code: 0, message: "", data } for register success', async () => {
    authService.register.mockResolvedValue({
      id: 'user-1',
      username: 'test123',
      email: 'test@example.com',
      accessToken: 'access-token-1',
      refreshToken: 'refresh-token-1',
    });

    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'test123',
        email: 'test@example.com',
        password: '12345678',
      }),
    });
    const payload = await response.json() as ApiEnvelope<{
      id: string;
      username: string;
      email: string;
      accessToken: string;
      refreshToken: string;
    }>;

    expect(response.status).toBe(201);
    expect(payload).toEqual({
      code: 0,
      message: '',
      data: {
        id: 'user-1',
        username: 'test123',
        email: 'test@example.com',
        accessToken: 'access-token-1',
        refreshToken: 'refresh-token-1',
      },
    });
    expect(authService.register).toHaveBeenCalledWith({
      username: 'test123',
      email: 'test@example.com',
      password: '12345678',
    });
  });

  it('keeps register dto and validation pipe effective', async () => {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'te',
        email: 'test@example.com',
        password: '1234',
      }),
    });
    const payload = await response.json() as ApiEnvelope<null>;

    expect(response.status).toBe(400);
    expect(payload.code).toBe(400);
    expect(payload.data).toBeNull();
    expect(typeof payload.message).toBe('string');
    expect(payload.message).toContain(
      'username must be longer than or equal to 3 characters',
    );
    expect(payload.message).toContain(
      'password must be longer than or equal to 8 characters',
    );
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('rejects unknown register fields via ValidationPipe', async () => {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'test123',
        email: 'test@example.com',
        password: '12345678',
        nickname: 'extra-field',
      }),
    });
    const payload = await response.json() as ApiEnvelope<null>;

    expect(response.status).toBe(400);
    expect(payload.code).toBe(400);
    expect(payload.data).toBeNull();
    expect(payload.message).toContain('property nickname should not exist');
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('returns { code: 0, message: "", data } for dev-login success', async () => {
    authService.devLogin.mockResolvedValue({
      accessToken: 'dev-access-token',
      refreshToken: 'dev-refresh-token',
    });

    const response = await fetch(`${baseUrl}/auth/dev-login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'dev-admin',
        role: 'admin',
      }),
    });
    const payload = await response.json() as ApiEnvelope<{
      accessToken: string;
      refreshToken: string;
    }>;

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      code: 0,
      message: '',
      data: {
        accessToken: 'dev-access-token',
        refreshToken: 'dev-refresh-token',
      },
    });
    expect(authService.devLogin).toHaveBeenCalledWith('dev-admin', 'admin');
  });
});

interface ApiEnvelope<T = unknown> {
  code: number;
  message: string;
  data: T;
}
