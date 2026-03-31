import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SkillExecutionService } from './skill-execution.service';

describe('SkillExecutionService', () => {
  let tempRoot: string;
  let service: SkillExecutionService;

  const skillSession = {
    getConversationSkillContext: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'garlic-claw-skill-execution-'));
    const projectSkillRoot = path.join(tempRoot, 'skills', 'planner');
    await fs.mkdir(path.join(projectSkillRoot, 'scripts'), { recursive: true });
    await fs.mkdir(path.join(projectSkillRoot, 'templates'), { recursive: true });
    await fs.writeFile(
      path.join(projectSkillRoot, 'scripts', 'echo.mjs'),
      [
        'const payload = {',
        '  cwd: process.cwd(),',
        '  args: process.argv.slice(2),',
        '};',
        'process.stdout.write(JSON.stringify(payload));',
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      path.join(projectSkillRoot, 'templates', 'task.md'),
      '# task template\n',
      'utf8',
    );

    const plannerSkill = {
      id: 'project/planner',
      name: '规划执行',
      description: '先拆任务，再逐步执行。',
      tags: ['planning'],
      sourceKind: 'project',
      entryPath: 'planner/SKILL.md',
      promptPreview: '把复杂请求拆成步骤',
      toolPolicy: {
        allow: [],
        deny: [],
      },
      governance: {
        enabled: true,
        trustLevel: 'local-script',
      },
      assets: [
        {
          path: 'scripts/echo.mjs',
          kind: 'script',
          textReadable: true,
          executable: true,
        },
        {
          path: 'templates/task.md',
          kind: 'template',
          textReadable: true,
          executable: false,
        },
      ],
      content: 'planner',
    };

    skillSession.getConversationSkillContext.mockResolvedValue({
      activeSkills: [plannerSkill],
      systemPrompt: '',
      allowedToolNames: null,
      deniedToolNames: [],
    });

    service = new SkillExecutionService(
      skillSession as never,
      {
        projectSkillsRoot: path.join(tempRoot, 'skills'),
        userSkillsRoot: path.join(tempRoot, 'user-skills'),
      },
    );
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('lists and reads assets from active trusted skills', async () => {
    await expect(
      service.listAssetsForConversation('conversation-1'),
    ).resolves.toEqual([
      expect.objectContaining({
        skillId: 'project/planner',
        path: 'scripts/echo.mjs',
      }),
      expect.objectContaining({
        skillId: 'project/planner',
        path: 'templates/task.md',
      }),
    ]);

    await expect(
      service.readAssetForConversation({
        conversationId: 'conversation-1',
        skillId: 'project/planner',
        assetPath: 'templates/task.md',
      }),
    ).resolves.toEqual({
      skillId: 'project/planner',
      path: 'templates/task.md',
      content: '# task template',
      truncated: false,
    });
  });

  it('runs trusted local scripts inside the skill directory with args', async () => {
    const result = await service.runScriptForConversation({
      conversationId: 'conversation-1',
      skillId: 'project/planner',
      assetPath: 'scripts/echo.mjs',
      args: ['alpha', 'beta'],
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      cwd: expect.stringContaining(path.join('skills', 'planner')),
      args: ['alpha', 'beta'],
    });
  });

  it('rejects insufficient trust levels and non-executable assets', async () => {
    skillSession.getConversationSkillContext.mockResolvedValue({
      activeSkills: [
        {
          id: 'project/planner',
          name: '规划执行',
          description: '先拆任务，再逐步执行。',
          tags: ['planning'],
          sourceKind: 'project',
          entryPath: 'planner/SKILL.md',
          promptPreview: '把复杂请求拆成步骤',
          toolPolicy: {
            allow: [],
            deny: [],
          },
          governance: {
            enabled: true,
            trustLevel: 'prompt-only',
          },
          assets: [
            {
              path: 'scripts/echo.mjs',
              kind: 'script',
              textReadable: true,
              executable: true,
            },
          ],
          content: 'planner',
        },
      ],
      systemPrompt: '',
      allowedToolNames: null,
      deniedToolNames: [],
    });

    await expect(
      service.readAssetForConversation({
        conversationId: 'conversation-1',
        skillId: 'project/planner',
        assetPath: 'scripts/echo.mjs',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.runScriptForConversation({
        conversationId: 'conversation-1',
        skillId: 'project/planner',
        assetPath: 'templates/task.md',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    skillSession.getConversationSkillContext.mockResolvedValue({
      activeSkills: [
        {
          id: 'project/planner',
          name: '规划执行',
          description: '先拆任务，再逐步执行。',
          tags: ['planning'],
          sourceKind: 'project',
          entryPath: 'planner/SKILL.md',
          promptPreview: '把复杂请求拆成步骤',
          toolPolicy: {
            allow: [],
            deny: [],
          },
          governance: {
            enabled: true,
            trustLevel: 'local-script',
          },
          assets: [
            {
              path: 'templates/task.md',
              kind: 'template',
              textReadable: true,
              executable: false,
            },
          ],
          content: 'planner',
        },
      ],
      systemPrompt: '',
      allowedToolNames: null,
      deniedToolNames: [],
    });

    await expect(
      service.runScriptForConversation({
        conversationId: 'conversation-1',
        skillId: 'project/planner',
        assetPath: 'templates/task.md',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
