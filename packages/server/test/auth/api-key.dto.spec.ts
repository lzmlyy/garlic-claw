import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateApiKeyDto } from '../../src/auth/dto/api-key.dto';

describe('api key dto', () => {
  it('accepts the old create api key contract', () => {
    expect(validateSync(plainToInstance(CreateApiKeyDto, {
      name: 'Route Bot',
      scopes: ['conversation.message.write'],
      expiresAt: '2026-05-01T00:00:00.000Z',
    }))).toEqual([]);
  });

  it('rejects empty scope lists and unsupported scopes', () => {
    expect(validateSync(plainToInstance(CreateApiKeyDto, { name: 'Route Bot', scopes: [] })).length).toBeGreaterThan(0);
    expect(validateSync(plainToInstance(CreateApiKeyDto, { name: 'Route Bot', scopes: ['skill.execute'] })).length).toBeGreaterThan(0);
  });
});
