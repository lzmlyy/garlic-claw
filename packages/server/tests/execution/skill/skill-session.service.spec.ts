import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { RuntimeHostConversationRecordService } from '../../../src/runtime/host/runtime-host-conversation-record.service';
import { SkillSessionService } from '../../../src/execution/skill/skill-session.service';

describe('SkillSessionService', () => {
  let tempRoot: string;
  let runtimeHostConversationRecordService: RuntimeHostConversationRecordService;

  const skillRegistry = {
    listSkills: jest.fn(),
    listSkillsSummaries: jest.fn(),
  };

  let service: SkillSessionService;
  let conversationId: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'garlic-claw-skill-session-'));
    await fs.mkdir(path.join(tempRoot, 'skills', 'planner', 'scripts'), { recursive: true });
    await fs.mkdir(path.join(tempRoot, 'skills', 'planner', 'templates'), { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, 'skills', 'planner', 'scripts', 'echo.mjs'),
      ['const payload = {', '  cwd: process.cwd(),', '  args: process.argv.slice(2),', '};', 'process.stdout.write(JSON.stringify(payload));'].join('\n'),
      'utf8',
    );
    await fs.writeFile(path.join(tempRoot, 'skills', 'planner', 'templates', 'task.md'), '# task template\n', 'utf8');
    skillRegistry.listSkills.mockResolvedValue(buildSkillDetails());
    runtimeHostConversationRecordService = new RuntimeHostConversationRecordService();
    conversationId = (runtimeHostConversationRecordService.createConversation({ title: 'Conversation', userId: 'user-1' }) as { id: string }).id;
    service = new SkillSessionService(
      runtimeHostConversationRecordService,
      skillRegistry as never,
      {
        projectSkillsRoot: path.join(tempRoot, 'skills'),
        userSkillsRoot: path.join(tempRoot, 'user-skills'),
      },
    );
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('returns the normalized conversation skill state for the owner and drops missing ids', async () => {
    runtimeHostConversationRecordService.writeConversationSkillState(conversationId, ['project/planner', 'missing/skill'], 'user-1');

    await expect(service.getConversationSkillStateForUser('user-1', conversationId)).resolves.toEqual({
      activeSkillIds: ['project/planner'],
      activeSkills: [expect.objectContaining({ id: 'project/planner', name: '规划执行' })],
    });
    expect(runtimeHostConversationRecordService.readConversationSkillState(conversationId, 'user-1')).toEqual({
      activeSkillIds: ['project/planner'],
      activeSkills: [{ id: 'project/planner', name: 'project/planner' }],
    });
  });

  it('persists unique active skills for the owner and rejects unknown ids', async () => {
    await expect(
      service.updateConversationSkillStateForUser('user-1', conversationId, ['project/planner', 'project/planner', 'project/plugin-operator']),
    ).resolves.toEqual({
      activeSkillIds: ['project/planner', 'project/plugin-operator'],
      activeSkills: [expect.objectContaining({ id: 'project/planner' }), expect.objectContaining({ id: 'project/plugin-operator' })],
    });

    await expect(
      service.updateConversationSkillStateForUser('user-1', conversationId, ['missing/skill']),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('builds conversation skill context and appends skill package tool guidance', async () => {
    runtimeHostConversationRecordService.writeConversationSkillState(conversationId, ['project/planner', 'project/plugin-operator'], 'user-1');

    await expect(service.getConversationSkillContext(conversationId)).resolves.toEqual(expect.objectContaining({
      allowedToolNames: ['kb.search', 'skill__asset__list', 'skill__asset__read', 'skill__script__run'],
      systemPrompt: expect.stringContaining('skill__script__run'),
    }));
  });

  it('lists and executes package tools through the session owner', async () => {
    runtimeHostConversationRecordService.writeConversationSkillState(conversationId, ['project/planner'], 'user-1');

    await expect(service.listToolSources({ conversationId })).resolves.toEqual([
      expect.objectContaining({
        source: expect.objectContaining({ enabled: true, id: 'active-packages' }),
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'asset.list' }),
          expect.objectContaining({ name: 'asset.read' }),
          expect.objectContaining({ name: 'script.run' }),
        ]),
      }),
    ]);

    await expect(service.runPackageTool({
      conversationId,
      toolName: 'asset.list',
      params: {},
    })).resolves.toEqual([
      expect.objectContaining({ skillId: 'project/planner', path: 'scripts/echo.mjs' }),
      expect.objectContaining({ skillId: 'project/planner', path: 'templates/task.md' }),
    ]);

    await expect(service.runPackageTool({
      conversationId,
      toolName: 'asset.read',
      params: {
        skillId: 'project/planner',
        path: 'templates/task.md',
      },
    })).resolves.toEqual({
      skillId: 'project/planner',
      path: 'templates/task.md',
      content: '# task template',
      truncated: false,
    });
    await expect(service.runPackageTool({
      conversationId,
      toolName: 'script.run',
      params: { skillId: 'project/planner', path: 'scripts/echo.mjs', args: ['alpha', 'beta'] },
    })).resolves.toMatchObject({
      exitCode: 0,
      path: 'scripts/echo.mjs',
      skillId: 'project/planner',
      stdout: expect.stringContaining('"args":["alpha","beta"]'),
    });
  });

  it('removes skill package tool access when the unified skill source is disabled', async () => {
    service.setSkillPackageToolsEnabled(false);
    runtimeHostConversationRecordService.writeConversationSkillState(conversationId, ['project/planner'], 'user-1');

    await expect(service.listToolSources({ conversationId })).resolves.toEqual([
      expect.objectContaining({
        source: expect.objectContaining({ enabled: false, id: 'active-packages', totalTools: 0 }),
        tools: [],
      }),
    ]);
  });

  it('rejects inactive or insufficiently trusted package tool calls', async () => {
    runtimeHostConversationRecordService.writeConversationSkillState(conversationId, ['project/planner', 'project/plugin-operator'], 'user-1');

    await expect(service.runPackageTool({
      conversationId,
      toolName: 'asset.read',
      params: { skillId: 'missing/skill', path: 'templates/task.md' },
    })).rejects.toMatchObject({ message: 'Skill is not active for this conversation: missing/skill' });

    await expect(service.runPackageTool({
      conversationId,
      toolName: 'script.run',
      params: { skillId: 'project/plugin-operator', path: 'scripts/echo.mjs' },
    })).rejects.toMatchObject({ message: 'Skill trust level is insufficient: project/plugin-operator' });
  });

  it('handles /skill commands and ignores normal messages', async () => {
    await expect(service.tryHandleMessage({ userId: 'user-1', conversationId, messageText: '普通消息' })).resolves.toBeNull();

    await expect(service.tryHandleMessage({
      userId: 'user-1',
      conversationId,
      messageText: '/skill use project/planner',
    })).resolves.toEqual({
      assistantContent: expect.stringContaining('已激活 1 个 skill'),
      assistantParts: [{ type: 'text', text: expect.stringContaining('project/planner') }],
      providerId: 'system',
      modelId: 'skill-command',
    });

    await expect(service.tryHandleMessage({
      userId: 'user-1',
      conversationId,
      messageText: '/skill list',
    })).resolves.toEqual({
      assistantContent: expect.stringContaining('当前可用 skills'),
      assistantParts: [{ type: 'text', text: expect.stringContaining('已激活') }],
      providerId: 'system',
      modelId: 'skill-command',
    });
  });
});

function buildSkillDetails() {
  return [
    {
      id: 'project/planner',
      name: '规划执行',
      description: '先拆任务，再逐步执行。',
      tags: ['planning'],
      sourceKind: 'project' as const,
      entryPath: 'planner/SKILL.md',
      promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
      toolPolicy: { allow: ['kb.search'], deny: [] },
      governance: { trustLevel: 'local-script' as const },
      assets: [
        { path: 'scripts/echo.mjs', kind: 'script' as const, textReadable: true, executable: true },
        { path: 'templates/task.md', kind: 'template' as const, textReadable: true, executable: false },
      ],
      content: '先拆任务，再逐步执行。',
    },
    {
      id: 'project/plugin-operator',
      name: '插件运维',
      description: '统一查看和治理插件。',
      tags: ['plugins'],
      sourceKind: 'project' as const,
      entryPath: 'plugin-operator/SKILL.md',
      promptPreview: '优先检查插件状态和冲突。',
      toolPolicy: { allow: [], deny: ['automation.run'] },
      governance: { trustLevel: 'asset-read' as const },
      assets: [],
      content: '统一查看和治理插件。',
    },
  ];
}
