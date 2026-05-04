import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AutomationController } from '../../../src/modules/execution/automation/automation.controller';

describe('AutomationController', () => {
  const automationService = {
    create: jest.fn(),
    remove: jest.fn(),
    getById: jest.fn(),
    getLogs: jest.fn(),
    listByUser: jest.fn(),
    run: jest.fn(),
    toggle: jest.fn(),
    update: jest.fn(),
  };

  let controller: AutomationController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AutomationController(automationService as never);
  });

  it('marks automation routes with jwt auth guard metadata', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AutomationController) as Array<{ name?: string }> | undefined;
    expect(guards?.map((guard) => guard?.name)).toContain('JwtAuthGuard');
  });

  it('creates, updates, lists, reads, toggles, runs and deletes automations for current user', async () => {
    automationService.create.mockReturnValue({ id: 'automation-1' });
    automationService.update.mockReturnValue({ id: 'automation-1', name: '已更新自动化' });
    automationService.listByUser.mockReturnValue([{ id: 'automation-1' }]);
    automationService.getById.mockReturnValue({ id: 'automation-1' });
    automationService.toggle.mockReturnValue({ enabled: false, id: 'automation-1' });
    automationService.run.mockReturnValue({ status: 'success' });
    automationService.getLogs.mockReturnValue([{ id: 'log-1' }]);
    automationService.remove.mockReturnValue({ count: 1 });

    await expect(controller.create('user-1', {
      actions: [],
      name: '自动化',
      trigger: { type: 'manual' },
    } as never)).resolves.toEqual({ id: 'automation-1' });
    await expect((controller as unknown as {
      update: (id: string, userId: string, body: unknown) => Promise<unknown>;
    }).update('automation-1', 'user-1', {
      actions: [],
      name: '已更新自动化',
      trigger: { type: 'manual' },
    })).resolves.toEqual({ id: 'automation-1', name: '已更新自动化' });
    await expect(controller.list('user-1')).resolves.toEqual([{ id: 'automation-1' }]);
    await expect(controller.get('automation-1', 'user-1')).resolves.toEqual({ id: 'automation-1' });
    await expect(controller.toggle('automation-1', 'user-1')).resolves.toEqual({ enabled: false, id: 'automation-1' });
    await expect(controller.run('automation-1', 'user-1')).resolves.toEqual({ status: 'success' });
    await expect(controller.logs('automation-1', 'user-1')).resolves.toEqual([{ id: 'log-1' }]);
    await expect(controller.remove('automation-1', 'user-1')).resolves.toEqual({ count: 1 });
  });
});
