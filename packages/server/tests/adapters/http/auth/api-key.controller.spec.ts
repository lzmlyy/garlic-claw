import * as fs from 'node:fs';
import * as path from 'node:path';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ApiKeyController } from '../../../../src/adapters/http/auth/api-key.controller';

describe('ApiKeyController', () => {
  const apiKeys = {
    createKey: jest.fn(),
    listKeys: jest.fn(),
    revokeKey: jest.fn(),
  };

  let controller: ApiKeyController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ApiKeyController(apiKeys as never);
  });

  it('marks api key routes with jwt auth and uuid revoke params', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ApiKeyController) as Array<{ name?: string }> | undefined;
    const source = fs.readFileSync(
      path.join(__dirname, '../../../../src/adapters/http/auth/api-key.controller.ts'),
      'utf8',
    );

    expect(guards?.map((guard) => guard?.name)).toContain('JwtAuthGuard');
    expect(source).toContain("@Param('id', ParseUUIDPipe)");
  });

  it('lists, creates and revokes api keys for the current user', async () => {
    apiKeys.listKeys.mockResolvedValue([{ id: 'key-1', scopes: ['plugin.route.invoke'] }]);
    apiKeys.createKey.mockResolvedValue({ id: 'key-1', token: 'gca_key', scopes: ['conversation.message.write'] });
    apiKeys.revokeKey.mockResolvedValue({ id: 'key-1', revokedAt: '2026-04-14T00:00:00.000Z' });

    await expect(controller.listKeys('user-1')).resolves.toEqual([{ id: 'key-1', scopes: ['plugin.route.invoke'] }]);
    await expect(controller.createKey('user-1', { name: 'Route Bot', scopes: ['conversation.message.write'] } as never)).resolves.toEqual({
      id: 'key-1',
      token: 'gca_key',
      scopes: ['conversation.message.write'],
    });
    await expect(controller.revokeKey('user-1', '11111111-1111-4111-8111-111111111111')).resolves.toEqual({
      id: 'key-1',
      revokedAt: '2026-04-14T00:00:00.000Z',
    });
  });
});
