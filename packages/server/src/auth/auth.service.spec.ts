import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AdminIdentityService } from './admin-identity.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock } };
  let jwt: { sign: jest.Mock; verify: jest.Mock };
  let adminIdentity: { resolveRole: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    jwt = { sign: jest.fn().mockReturnValue('mock-token'), verify: jest.fn() };
    adminIdentity = {
      resolveRole: jest.fn((user: { role: string }) => user.role),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: AdminIdentityService, useValue: adminIdentity },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should create user and return tokens', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'uid-1',
        username: 'alice',
        email: 'alice@test.com',
        role: 'user',
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');

      const result = await service.register({
        username: 'alice',
        email: 'alice@test.com',
        password: 'pass1234',
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ username: 'alice' }),
        }),
      );
      expect(result).toHaveProperty('accessToken', 'mock-token');
      expect(result).toHaveProperty('refreshToken', 'mock-token');
    });

    it('should throw ConflictException if user exists', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          username: 'alice',
          email: 'alice@test.com',
          password: 'pass1234',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'uid-1',
        username: 'alice',
        email: 'alice@test.com',
        passwordHash: 'hashed',
        role: 'user',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        username: 'alice',
        password: 'pass1234',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should sign tokens with the env-overridden role', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'uid-1',
        username: 'admin',
        email: 'admin@bootstrap.local',
        passwordHash: 'hashed',
        role: 'user',
      });
      adminIdentity.resolveRole.mockReturnValue('super_admin');
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login({
        username: 'admin',
        password: 'admin123',
      });

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'super_admin',
        }),
        expect.any(Object),
      );
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'uid-1',
        username: 'alice',
        email: 'alice@test.com',
        passwordHash: 'hashed',
        role: 'user',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ username: 'alice', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

  it('should throw UnauthorizedException for missing user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ username: 'ghost', password: 'pw' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    it('should return new tokens for valid refresh token', async () => {
      jwt.verify.mockReturnValue({ sub: 'uid-1' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'uid-1',
        username: 'alice',
        email: 'alice@test.com',
        role: 'user',
      });

      const result = await service.refreshTokens('valid-refresh');
      expect(result).toHaveProperty('accessToken');
    });

    it('should throw for invalid refresh token', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      await expect(service.refreshTokens('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
