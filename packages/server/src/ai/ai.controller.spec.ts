/**
 * AI 管理控制器测试
 *
 * 输入:
 * - provider / model / vision fallback 管理请求
 *
 * 输出:
 * - 断言控制器将请求转发给管理服务
 *
 * 预期行为:
 * - 路由层保持薄，只负责转发 DTO
 * - 前端需要的管理接口名稳定
 */

import { AiController } from './ai.controller';

describe('AiController', () => {
  const managementService = {
    listOfficialProviderCatalog: jest.fn(),
    listProviders: jest.fn(),
    getProvider: jest.fn(),
    upsertProvider: jest.fn(),
    deleteProvider: jest.fn(),
    listModels: jest.fn(),
    upsertModel: jest.fn(),
    deleteModel: jest.fn(),
    setDefaultModel: jest.fn(),
    updateModelCapabilities: jest.fn(),
    getVisionFallbackConfig: jest.fn(),
    updateVisionFallbackConfig: jest.fn(),
  };
  const diagnosticsService = {
    discoverModels: jest.fn(),
    testConnection: jest.fn(),
  };

  let controller: AiController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AiController(
      managementService as never,
      diagnosticsService as never,
    );
  });

  it('returns the official provider catalog', () => {
    managementService.listOfficialProviderCatalog.mockReturnValue([{ id: 'openai' }]);

    expect(controller.listOfficialProviderCatalog()).toEqual([{ id: 'openai' }]);
    expect(managementService.listOfficialProviderCatalog).toHaveBeenCalled();
  });

  it('forwards provider upsert requests to the management service', () => {
    const dto = {
      mode: 'official' as const,
      driver: 'groq',
      name: 'Groq',
      models: ['llama-3.3-70b'],
    };

    controller.upsertProvider('groq', dto);

    expect(managementService.upsertProvider).toHaveBeenCalledWith('groq', dto);
  });

  it('forwards model capability updates to the management service', () => {
    const dto = {
      reasoning: true,
      input: { image: true },
    };

    controller.updateModelCapabilities('groq', 'llama-3.3-70b', dto);

    expect(managementService.updateModelCapabilities).toHaveBeenCalledWith(
      'groq',
      'llama-3.3-70b',
      dto,
    );
  });

  it('forwards vision fallback updates to the management service', () => {
    const dto = {
      enabled: true,
      providerId: 'openai',
      modelId: 'gpt-4o',
    };

    controller.updateVisionFallbackConfig(dto);

    expect(managementService.updateVisionFallbackConfig).toHaveBeenCalledWith(dto);
  });

  it('forwards model discovery requests to the diagnostics service', async () => {
    await controller.discoverModels('ds2api');

    expect(diagnosticsService.discoverModels).toHaveBeenCalledWith('ds2api');
  });

  it('forwards provider connection tests to the diagnostics service', async () => {
    const dto = {
      modelId: 'deepseek-reasoner',
    };

    await controller.testConnection('ds2api', dto);

    expect(diagnosticsService.testConnection).toHaveBeenCalledWith(
      'ds2api',
      'deepseek-reasoner',
    );
  });
});
