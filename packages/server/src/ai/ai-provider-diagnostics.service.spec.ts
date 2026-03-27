/**
 * AI provider 诊断服务测试
 *
 * 输入:
 * - 已配置的 provider
 * - 远程 `/models` 响应
 * - 测试连接请求
 *
 * 输出:
 * - 断言模型发现会按 provider 格式发起远程请求
 * - 断言测试连接会实际调用统一模型入口和文本生成
 *
 * 预期行为:
 * - provider 支持远程拉取模型列表
 * - provider 测试连接会真实执行一次最小聊天请求
 */

import { AiProviderDiagnosticsService } from './ai-provider-diagnostics.service';
import { runGenerateText } from './sdk-adapter';

jest.mock('./sdk-adapter', () => ({
  runGenerateText: jest.fn(),
}));

describe('AiProviderDiagnosticsService', () => {
  const configManager = {
    getProviderConfig: jest.fn(),
  };

  const aiProvider = {
    getModel: jest.fn(),
  };

  let service: AiProviderDiagnosticsService;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiProviderDiagnosticsService(
      configManager as never,
      aiProvider as never,
    );
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
  });

  it('discovers models from an openai-compatible provider', async () => {
    configManager.getProviderConfig.mockReturnValue({
      id: 'ds2api',
      name: 'ds2api',
      mode: 'compatible',
      driver: 'openai',
      apiKey: 'sk-test',
      baseUrl: 'https://example.com/v1',
      defaultModel: 'deepseek-reasoner',
      models: [],
    });
    fetchMock.mockResolvedValue(
      createJsonResponse({
        data: [
          { id: 'deepseek-chat' },
          { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
        ],
      }),
    );

    const discovered = await service.discoverModels('ds2api');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer sk-test',
        }),
      }),
    );
    expect(discovered).toEqual([
      { id: 'deepseek-chat', name: 'deepseek-chat' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
    ]);
  });

  it('falls back to configured models when remote discovery returns no result', async () => {
    configManager.getProviderConfig.mockReturnValue({
      id: 'openai',
      name: 'OpenAI',
      mode: 'official',
      driver: 'openai',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini',
      models: ['gpt-4o-mini', 'gpt-4.1'],
    });
    fetchMock.mockResolvedValue(createJsonResponse({ data: [] }));

    const discovered = await service.discoverModels('openai');

    expect(discovered).toEqual([
      { id: 'gpt-4o-mini', name: 'gpt-4o-mini' },
      { id: 'gpt-4.1', name: 'gpt-4.1' },
    ]);
  });

  it('tests the provider connection with a real model call', async () => {
    configManager.getProviderConfig.mockReturnValue({
      id: 'ds2api',
      name: 'ds2api',
      mode: 'compatible',
      driver: 'openai',
      apiKey: 'sk-test',
      baseUrl: 'https://example.com/v1',
      models: [],
    });
    fetchMock.mockResolvedValue(
      createJsonResponse({
        data: [{ id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' }],
      }),
    );
    aiProvider.getModel.mockReturnValue({ provider: 'ds2api', modelId: 'deepseek-reasoner' });
    (runGenerateText as jest.Mock).mockResolvedValue({
      text: 'OK',
    });

    const result = await service.testConnection('ds2api');

    expect(aiProvider.getModel).toHaveBeenCalledWith('ds2api', 'deepseek-reasoner');
    expect(runGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { provider: 'ds2api', modelId: 'deepseek-reasoner' },
        maxOutputTokens: 32,
      }),
    );
    expect(result).toEqual({
      ok: true,
      providerId: 'ds2api',
      modelId: 'deepseek-reasoner',
      text: 'OK',
    });
  });
});

/**
 * 创建一个最小 JSON 响应对象。
 * @param body JSON 响应体
 * @returns 可供 fetch mock 使用的最小 `Response`
 */
function createJsonResponse(body: object): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Partial<Response> as Response;
}
