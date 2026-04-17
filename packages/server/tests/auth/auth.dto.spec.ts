import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DevLoginDto, LoginDto, RefreshTokenDto, RegisterDto } from '../../src/auth/dto/auth.dto';

describe('auth dto', () => {
  it('accepts register, login, refresh and dev-login payloads that match the old contract', () => {
    expect(validateSync(plainToInstance(RegisterDto, { username: 'tester', email: 'tester@example.com', password: '12345678' }))).toEqual([]);
    expect(validateSync(plainToInstance(LoginDto, { username: 'tester', password: '12345678' }))).toEqual([]);
    expect(validateSync(plainToInstance(RefreshTokenDto, { refreshToken: 'refresh-token' }))).toEqual([]);
    expect(validateSync(plainToInstance(DevLoginDto, { username: 'tester', role: 'admin' }))).toEqual([]);
  });

  it('rejects invalid register and dev-login payloads', () => {
    expect(validateSync(plainToInstance(RegisterDto, { username: 'ab', email: 'bad-email', password: '1234' })).length).toBeGreaterThan(0);
    expect(validateSync(plainToInstance(DevLoginDto, { username: 'tester', role: 'owner' })).length).toBeGreaterThan(0);
  });
});
