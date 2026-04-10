import {
  AiController,
  ApiKeyController,
  AuthController,
  AutomationController,
  ChatController,
  McpController,
  MemoryController,
  OpenApiMessageController,
  PersonaController,
  PluginCommandController,
  PluginController,
  PluginRouteController,
  PluginSubagentTaskController,
  SkillController,
  ToolController,
  UserController,
  listControllerRoutes,
} from '../fixtures/api-contract.fixture';

describe('api contract freeze - routes', () => {
  it('keeps auth routes stable', () => {
    expect(listControllerRoutes(AuthController)).toEqual([
      'POST /api/auth/login',
      'POST /api/auth/refresh',
      'POST /api/auth/register',
    ]);
  });

  it('keeps api key routes stable', () => {
    expect(listControllerRoutes(ApiKeyController)).toEqual([
      'GET /api/auth/api-keys',
      'POST /api/auth/api-keys',
      'POST /api/auth/api-keys/:id/revoke',
    ]);
  });

  it('keeps user and memory routes stable', () => {
    expect(listControllerRoutes(UserController)).toEqual([
      'DELETE /api/users/:id',
      'GET /api/users',
      'GET /api/users/:id',
      'GET /api/users/me',
      'PATCH /api/users/:id',
      'PATCH /api/users/:id/role',
    ]);
    expect(listControllerRoutes(MemoryController)).toEqual([
      'DELETE /api/memories/:id',
      'GET /api/memories',
    ]);
  });

  it('keeps ai routes stable', () => {
    expect(listControllerRoutes(AiController)).toEqual([
      'DELETE /api/ai/providers/:providerId',
      'DELETE /api/ai/providers/:providerId/models/:modelId',
      'GET /api/ai/host-model-routing',
      'GET /api/ai/provider-catalog',
      'GET /api/ai/providers',
      'GET /api/ai/providers/:providerId',
      'GET /api/ai/providers/:providerId/models',
      'GET /api/ai/vision-fallback',
      'POST /api/ai/providers/:providerId/discover-models',
      'POST /api/ai/providers/:providerId/models/:modelId',
      'POST /api/ai/providers/:providerId/test-connection',
      'PUT /api/ai/host-model-routing',
      'PUT /api/ai/providers/:providerId',
      'PUT /api/ai/providers/:providerId/default-model',
      'PUT /api/ai/providers/:providerId/models/:modelId/capabilities',
      'PUT /api/ai/vision-fallback',
    ]);
  });

  it('keeps mcp, tool, skill, persona and automation routes stable', () => {
    expect(listControllerRoutes(McpController)).toEqual([
      'DELETE /api/mcp/servers/:name',
      'GET /api/mcp/servers',
      'POST /api/mcp/servers',
      'PUT /api/mcp/servers/:name',
    ]);
    expect(listControllerRoutes(ToolController)).toEqual([
      'GET /api/tools/overview',
      'POST /api/tools/sources/:kind/:sourceId/actions/:action',
      'PUT /api/tools/:toolId/enabled',
      'PUT /api/tools/sources/:kind/:sourceId/enabled',
    ]);
    expect(listControllerRoutes(SkillController)).toEqual([
      'GET /api/skills',
      'POST /api/skills/refresh',
      'PUT /api/skills/:skillId/governance',
    ]);
    expect(listControllerRoutes(PersonaController)).toEqual([
      'GET /api/personas',
      'GET /api/personas/current',
      'PUT /api/personas/current',
    ]);
    expect(listControllerRoutes(AutomationController)).toEqual([
      'DELETE /api/automations/:id',
      'GET /api/automations',
      'GET /api/automations/:id',
      'GET /api/automations/:id/logs',
      'PATCH /api/automations/:id/toggle',
      'POST /api/automations',
      'POST /api/automations/:id/run',
    ]);
  });

  it('keeps chat routes stable', () => {
    expect(listControllerRoutes(ChatController)).toEqual([
      'DELETE /api/chat/conversations/:id',
      'DELETE /api/chat/conversations/:id/messages/:messageId',
      'GET /api/chat/conversations',
      'GET /api/chat/conversations/:id',
      'GET /api/chat/conversations/:id/services',
      'GET /api/chat/conversations/:id/skills',
      'PATCH /api/chat/conversations/:id/messages/:messageId',
      'POST /api/chat/conversations',
      'POST /api/chat/conversations/:id/messages',
      'POST /api/chat/conversations/:id/messages/:messageId/retry',
      'POST /api/chat/conversations/:id/messages/:messageId/stop',
      'PUT /api/chat/conversations/:id/services',
      'PUT /api/chat/conversations/:id/skills',
    ]);
    expect(listControllerRoutes(OpenApiMessageController)).toEqual([
      'POST /api/open-api/conversations/:conversationId/messages/assistant',
    ]);
  });

  it('keeps plugin http routes stable', () => {
    expect(listControllerRoutes(PluginCommandController)).toEqual([
      'GET /api/plugin-commands/overview',
    ]);
    expect(listControllerRoutes(PluginSubagentTaskController)).toEqual([
      'GET /api/plugin-subagent-tasks/:taskId',
      'GET /api/plugin-subagent-tasks/overview',
    ]);
    expect(listControllerRoutes(PluginController)).toEqual([
      'DELETE /api/plugins/:name',
      'DELETE /api/plugins/:name/crons/:jobId',
      'DELETE /api/plugins/:name/sessions/:conversationId',
      'DELETE /api/plugins/:name/storage',
      'GET /api/plugins',
      'GET /api/plugins/:name/config',
      'GET /api/plugins/:name/crons',
      'GET /api/plugins/:name/events',
      'GET /api/plugins/:name/health',
      'GET /api/plugins/:name/scopes',
      'GET /api/plugins/:name/sessions',
      'GET /api/plugins/:name/storage',
      'GET /api/plugins/connected',
      'POST /api/plugins/:name/actions/:action',
      'POST /api/plugins/remote/bootstrap',
      'PUT /api/plugins/:name/config',
      'PUT /api/plugins/:name/scopes',
      'PUT /api/plugins/:name/storage',
    ]);
    expect(listControllerRoutes(PluginRouteController)).toEqual([
      'ALL /api/plugin-routes/:pluginId/*path',
    ]);
  });
});
