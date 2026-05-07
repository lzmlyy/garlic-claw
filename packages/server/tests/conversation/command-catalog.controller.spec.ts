import { CommandCatalogController } from '../../src/modules/conversation/command-catalog.controller';

describe('CommandCatalogController', () => {
  const contextCommandCatalogService = {
    getOverview: jest.fn(),
    getVersion: jest.fn(),
  };

  let controller: CommandCatalogController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new CommandCatalogController(contextCommandCatalogService as never);
  });

  it('returns the unified command catalog overview', () => {
    contextCommandCatalogService.getOverview.mockReturnValue({
      commands: [{ canonicalCommand: '/compact', commandId: 'internal.context-governance:/compact:command' }],
      conflicts: [],
      version: 'overview-version',
    });

    expect(controller.getOverview()).toEqual({
      commands: [{ canonicalCommand: '/compact', commandId: 'internal.context-governance:/compact:command' }],
      conflicts: [],
      version: 'overview-version',
    });
    expect(contextCommandCatalogService.getOverview).toHaveBeenCalledTimes(1);
  });

  it('returns the lightweight command catalog version', () => {
    contextCommandCatalogService.getVersion.mockReturnValue({ version: 'version-only' });

    expect(controller.getVersion()).toEqual({ version: 'version-only' });
    expect(contextCommandCatalogService.getVersion).toHaveBeenCalledTimes(1);
  });
});
