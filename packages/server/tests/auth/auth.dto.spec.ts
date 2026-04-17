import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LoginDto } from '../../src/auth/dto/auth.dto';

describe('auth dto', () => {
  it('accepts the new single-secret login payload', () => {
    expect(validateSync(plainToInstance(LoginDto, { secret: 'top-secret-value' }))).toEqual([]);
  });

  it('rejects empty single-secret login payloads', () => {
    expect(validateSync(plainToInstance(LoginDto, { secret: '' })).length).toBeGreaterThan(0);
    expect(validateSync(plainToInstance(LoginDto, {})).length).toBeGreaterThan(0);
  });
});
