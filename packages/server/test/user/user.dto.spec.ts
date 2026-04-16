import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateUserDto, UpdateUserRoleDto } from '../../src/user/dto/user.dto';

describe('user dto', () => {
  it('accepts the old update user payloads', () => {
    expect(validateSync(plainToInstance(UpdateUserDto, { username: 'owner', email: 'owner@example.com' }))).toEqual([]);
    expect(validateSync(plainToInstance(UpdateUserRoleDto, { role: 'admin' }))).toEqual([]);
  });

  it('rejects invalid email and role values', () => {
    expect(validateSync(plainToInstance(UpdateUserDto, { email: 'bad-email' })).length).toBeGreaterThan(0);
    expect(validateSync(plainToInstance(UpdateUserRoleDto, { role: 'owner' })).length).toBeGreaterThan(0);
  });
});
