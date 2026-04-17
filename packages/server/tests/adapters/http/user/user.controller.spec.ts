import * as fs from 'node:fs';
import * as path from 'node:path';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../../../src/auth/http-auth';
import { UserController } from '../../../../src/adapters/http/user/user.controller';

describe('UserController', () => {
  const userService = {
    delete: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    updateRole: jest.fn(),
  };

  let controller: UserController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new UserController(userService as never);
  });

  it('keeps guard, role and uuid metadata aligned with the old users http surface', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UserController) as Array<{ name?: string }> | undefined;
    const source = fs.readFileSync(
      path.join(__dirname, '../../../../src/adapters/http/user/user.controller.ts'),
      'utf8',
    );

    expect(guards?.map((guard) => guard?.name)).toEqual(expect.arrayContaining(['JwtAuthGuard', 'RolesGuard']));
    expect(Reflect.getMetadata(ROLES_KEY, UserController.prototype.findAll)).toEqual(['super_admin', 'admin']);
    expect(Reflect.getMetadata(ROLES_KEY, UserController.prototype.updateRole)).toEqual(['super_admin']);
    expect(source).toContain("@Param('id', ParseUUIDPipe)");
  });

  it('delegates the old users CRUD surface to the user service', async () => {
    userService.findAll.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });
    userService.findById.mockResolvedValue({ id: 'user-1', username: 'tester' });
    userService.update.mockResolvedValue({ id: 'user-1', username: 'updated' });
    userService.updateRole.mockResolvedValue({ id: 'user-1', role: 'admin' });
    userService.delete.mockResolvedValue({ message: 'User deleted' });

    await expect(controller.findAll('1', '20')).resolves.toEqual({ data: [], page: 1, pageSize: 20, total: 0 });
    await expect(controller.getMe('user-1')).resolves.toEqual({ id: 'user-1', username: 'tester' });
    await expect(controller.findOne('11111111-1111-4111-8111-111111111111')).resolves.toEqual({ id: 'user-1', username: 'tester' });
    await expect(controller.update('11111111-1111-4111-8111-111111111111', { username: 'updated' } as never)).resolves.toEqual({ id: 'user-1', username: 'updated' });
    await expect(controller.updateRole('11111111-1111-4111-8111-111111111111', { role: 'admin' } as never)).resolves.toEqual({ id: 'user-1', role: 'admin' });
    await expect(controller.delete('11111111-1111-4111-8111-111111111111')).resolves.toEqual({ message: 'User deleted' });
  });
});
