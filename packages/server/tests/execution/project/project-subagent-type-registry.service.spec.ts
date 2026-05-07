import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectWorktreeRootService } from '../../../src/modules/execution/project/project-worktree-root.service';
import { ProjectSubagentTypeRegistryService } from '../../../src/modules/execution/project/project-subagent-type-registry.service';

describe('ProjectSubagentTypeRegistryService', () => {
  const envKey = 'GARLIC_CLAW_SUBAGENT_PATH';
  let storageRoot: string;

  beforeEach(() => {
    storageRoot = path.join(os.tmpdir(), `gc-subagent-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env[envKey] = storageRoot;
  });

  afterEach(() => {
    delete process.env[envKey];
    fs.rmSync(storageRoot, { force: true, recursive: true });
  });

  it('loads builtin defaults from independent folders and picks up user-defined types', () => {
    const service = new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService());

    expect(service.listTypes()).toEqual([
      {
        id: 'explore',
        name: '探索',
        description: '只读探索。适合检索资料、读取代码、收集上下文与加载技能，不主动修改文件。',
      },
      {
        id: 'general',
        name: '通用',
        description: '通用执行。适合需要读写文件、串联工具并产出最终结果的普通任务。沿用当前请求显式指定的模型与系统提示词，不额外裁剪工具。',
      },
      {
        id: 'review',
        name: '审阅',
        description: '审阅挑错。适合复核方案、找风险、列缺口，优先给出证据与结论，不主动修改文件。',
      },
      {
        id: 'writer',
        name: '写作',
        description: '写作整理。适合草拟文案、总结、改写与创意写作，优先直接产出可复用文本。',
      },
    ]);
    expect(fs.existsSync(path.join(storageRoot, 'general', 'subagent.json'))).toBe(true);
    expect(fs.existsSync(path.join(storageRoot, 'explore', 'subagent.json'))).toBe(true);
    expect(fs.existsSync(path.join(storageRoot, 'review', 'subagent.json'))).toBe(true);
    expect(fs.existsSync(path.join(storageRoot, 'writer', 'subagent.json'))).toBe(true);
    expect(fs.readFileSync(path.join(storageRoot, 'explore', 'prompt.md'), 'utf-8')).toBe('你是一个专注于探索与信息收集的子代理。\n优先检索、抓取、整理上下文，不主动修改文件。\n如果信息不足，先继续检索，再给出结论。');
    expect(JSON.parse(fs.readFileSync(path.join(storageRoot, 'explore', 'subagent.json'), 'utf-8'))).toEqual({
      id: 'explore',
      name: '探索',
      description: '只读探索。适合检索资料、读取代码、收集上下文与加载技能，不主动修改文件。',
      toolNames: ['read', 'glob', 'grep', 'webfetch', 'skill'],
    });

    fs.mkdirSync(path.join(storageRoot, 'planner'), { recursive: true });
    fs.writeFileSync(path.join(storageRoot, 'planner', 'subagent.json'), JSON.stringify({
      id: 'planner',
      name: '规划',
      description: '聚焦规划与拆解。',
      providerId: 'openai',
      modelId: 'gpt-5.4',
      toolNames: ['webfetch'],
    }, null, 2), 'utf-8');
    fs.writeFileSync(path.join(storageRoot, 'planner', 'prompt.md'), '你是一个规划子代理。\n优先拆解任务与安排步骤。', 'utf-8');

    expect(service.listTypes()).toEqual([
      {
        id: 'explore',
        name: '探索',
        description: '只读探索。适合检索资料、读取代码、收集上下文与加载技能，不主动修改文件。',
      },
      {
        id: 'general',
        name: '通用',
        description: '通用执行。适合需要读写文件、串联工具并产出最终结果的普通任务。沿用当前请求显式指定的模型与系统提示词，不额外裁剪工具。',
      },
      {
        id: 'planner',
        name: '规划',
        description: '聚焦规划与拆解。',
      },
      {
        id: 'review',
        name: '审阅',
        description: '审阅挑错。适合复核方案、找风险、列缺口，优先给出证据与结论，不主动修改文件。',
      },
      {
        id: 'writer',
        name: '写作',
        description: '写作整理。适合草拟文案、总结、改写与创意写作，优先直接产出可复用文本。',
      },
    ]);
    expect(service.getType('planner')).toEqual({
      description: '聚焦规划与拆解。',
      id: 'planner',
      modelId: 'gpt-5.4',
      name: '规划',
      providerId: 'openai',
      system: '你是一个规划子代理。\n优先拆解任务与安排步骤。',
      toolNames: ['webfetch'],
    });
  });
});
