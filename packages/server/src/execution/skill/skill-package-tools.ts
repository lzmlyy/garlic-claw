import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  JsonObject,
  JsonValue,
  PluginActionName,
  PluginParamSchema,
  SkillAssetReadResult,
  SkillAssetRef,
  SkillDetail,
  SkillTrustLevel,
} from '@garlic-claw/shared';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { SkillDiscoveryOptions } from './skill-registry.service';

export type SkillPackageToolName = 'asset.list' | 'asset.read' | 'script.run';

export type SkillPackageToolDefinition = {
  name: SkillPackageToolName;
  callName: string;
  description: string;
  parameters: Record<string, PluginParamSchema>;
  requires: 'read' | 'run';
};

export const SKILL_SOURCE_ID = 'active-packages';
export const SKILL_SOURCE_LABEL = 'Active Skill Packages';
export const SKILL_SUPPORTED_ACTIONS: PluginActionName[] = ['health-check', 'reload'];

const SKILL_TRUST_RANK: Record<SkillTrustLevel, number> = {
  'prompt-only': 0,
  'asset-read': 1,
  'local-script': 2,
};

const SKILL_PACKAGE_TOOLS: SkillPackageToolDefinition[] = [
  createSkillPackageTool('asset.list', 'skill__asset__list', '列出当前会话 skill package 资产', 'read', {
    skillId: createParam('string', false, '可选 skill ID；不传则列出全部 active skills 的可读资产'),
  }),
  createSkillPackageTool('asset.read', 'skill__asset__read', '读取当前会话某个 skill package 资产', 'read', {
    skillId: createParam('string', true, '已激活 skill 的 ID'),
    path: createParam('string', true, '相对 skill 根目录的资产路径'),
    maxChars: createParam('number', false, '最多返回的字符数'),
  }),
  createSkillPackageTool('script.run', 'skill__script__run', '执行当前会话 skill package 脚本', 'run', {
    skillId: createParam('string', true, '已激活 skill 的 ID'),
    path: createParam('string', true, '相对 skill 根目录的脚本路径'),
    args: createParam('array', false, '要传给脚本的参数数组'),
    timeoutMs: createParam('number', false, '脚本超时时间，单位毫秒'),
  }),
];

export function describeSkillPackageToolAccess(
  activeSkills: readonly SkillDetail[],
  enabled: boolean,
): SkillPackageToolDefinition[] {
  return SKILL_PACKAGE_TOOLS.filter((tool) =>
    tool.requires === 'read'
      ? enabled && activeSkills.some((skill) => hasSkillAssetAccess(skill, 'asset-read', 'textReadable'))
      : enabled && activeSkills.some((skill) => hasSkillAssetAccess(skill, 'local-script', 'executable')));
}

export async function runSkillPackageTool(input: {
  activeSkills: readonly SkillDetail[];
  discoveryOptions: SkillDiscoveryOptions;
  params: JsonObject;
  toolName: SkillPackageToolName;
}): Promise<JsonValue> {
  switch (input.toolName) {
    case 'asset.list':
      return listReadableSkillAssets(
        input.activeSkills.filter((skill) => hasSkillAssetAccess(skill, 'asset-read', 'textReadable')),
        readSkillPackageParam(input.params, 'skillId', 'string') ?? undefined,
      );
    case 'asset.read':
      return readSkillTextAsset({
        assetPath: requireSkillPackageString(input.params, 'path'),
        discoveryOptions: input.discoveryOptions,
        maxChars: readSkillPackageParam(input.params, 'maxChars', 'number') ?? undefined,
        skill: requireActiveSkill(input.activeSkills, requireSkillPackageString(input.params, 'skillId'), 'asset-read'),
      });
    case 'script.run':
      return runSkillScript({
        args: readSkillPackageParam(input.params, 'args', 'string[]') ?? undefined,
        assetPath: requireSkillPackageString(input.params, 'path'),
        discoveryOptions: input.discoveryOptions,
        skill: requireActiveSkill(input.activeSkills, requireSkillPackageString(input.params, 'skillId'), 'local-script'),
        timeoutMs: readSkillPackageParam(input.params, 'timeoutMs', 'number') ?? undefined,
      });
  }
}

function hasSkillAssetAccess(
  skill: SkillDetail,
  requiredTrust: SkillTrustLevel,
  capability: 'executable' | 'textReadable',
): boolean {
  return SKILL_TRUST_RANK[skill.governance.trustLevel] >= SKILL_TRUST_RANK[requiredTrust] && skill.assets.some((asset) => asset[capability]);
}

function requireActiveSkill(activeSkills: readonly SkillDetail[], skillId: string, requiredTrust: SkillTrustLevel): SkillDetail {
  const skill = activeSkills.find((entry) => entry.id === skillId);
  if (!skill) {throw new NotFoundException(`Skill is not active for this conversation: ${skillId}`);}
  if (SKILL_TRUST_RANK[skill.governance.trustLevel] < SKILL_TRUST_RANK[requiredTrust]) {throw new ForbiddenException(`Skill trust level is insufficient: ${skillId}`);}
  return skill;
}

function listReadableSkillAssets(skills: readonly SkillDetail[], skillId?: string): SkillAssetRef[] {
  const targetSkills = skillId ? skills.filter((skill) => skill.id === skillId) : skills;
  return targetSkills.flatMap((skill) =>
    skill.assets.filter((asset) => asset.textReadable).map((asset) => ({
      skillId: skill.id,
      path: asset.path,
      kind: asset.kind,
      textReadable: asset.textReadable,
      executable: asset.executable,
    })));
}

function requireSkillPackageString(params: Record<string, unknown>, key: string): string {
  const value = readSkillPackageParam(params, key, 'string');
  if (!value) {throw new BadRequestException(`${key} is required`);}
  return value;
}

type SkillPackageParamType = 'string' | 'number' | 'string[]';
type SkillPackageParamValue<T extends SkillPackageParamType> =
  T extends 'string' ? string
    : T extends 'number' ? number
      : string[];

function readSkillPackageParam<T extends SkillPackageParamType>(
  params: Record<string, unknown>,
  key: string,
  type: T,
): SkillPackageParamValue<T> | null {
  const value = params[key];
  if (value === undefined || value === null) {return null;}
  if (type === 'string' && typeof value === 'string') {return value as SkillPackageParamValue<T>;}
  if (type === 'number' && typeof value === 'number' && Number.isFinite(value)) {return value as SkillPackageParamValue<T>;}
  if (type === 'string[]' && Array.isArray(value)) {return value.filter((item): item is string => typeof item === 'string') as SkillPackageParamValue<T>;}
  throw new BadRequestException(`${key} must be ${type === 'string[]' ? 'an array' : `a ${type}`}`);
}

async function readSkillTextAsset(input: {
  assetPath: string;
  discoveryOptions: SkillDiscoveryOptions;
  maxChars?: number;
  skill: SkillDetail;
}): Promise<SkillAssetReadResult> {
  const { asset, absolutePath } = resolveKnownSkillAsset(input.skill, input.assetPath, input.discoveryOptions);
  if (!asset.textReadable) {throw new BadRequestException(`Asset is not text-readable: ${input.assetPath}`);}

  const raw = await fs.readFile(absolutePath, 'utf8');
  const normalized = raw.replace(/\r\n/g, '\n').trimEnd();
  const maxChars = clampSkillNumber(input.maxChars, 12000, 1, 200000);
  return { content: normalized.slice(0, maxChars), path: asset.path, skillId: input.skill.id, truncated: normalized.length > maxChars };
}

async function runSkillScript(input: {
  args?: string[];
  assetPath: string;
  discoveryOptions: SkillDiscoveryOptions;
  skill: SkillDetail;
  timeoutMs?: number;
}): Promise<JsonValue> {
  const { asset, absolutePath, skillRoot } = resolveKnownSkillAsset(input.skill, input.assetPath, input.discoveryOptions);
  if (!asset.executable) {throw new BadRequestException(`Asset is not executable: ${input.assetPath}`);}

  const runner = resolveSkillScriptRunner(absolutePath);
  const timeoutMs = clampSkillNumber(input.timeoutMs, 15000, 1000, 120000);
  return new Promise<JsonValue>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const child = spawn(runner.command, [...runner.prefixArgs, absolutePath, ...(input.args ?? [])], {
      cwd: skillRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      if (settled) {return;}
      settled = true;
      reject(new BadRequestException(`Failed to start script runner: ${error.message}`));
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      if (settled) {return;}
      settled = true;
      resolve({ exitCode, path: asset.path, skillId: input.skill.id, stderr: stderr.trimEnd(), stdout: stdout.trimEnd(), timedOut });
    });
  });
}

function resolveKnownSkillAsset(
  skill: SkillDetail,
  assetPath: string,
  discoveryOptions: SkillDiscoveryOptions,
): { asset: SkillDetail['assets'][number]; absolutePath: string; skillRoot: string } {
  const normalizedPath = normalizeRelativeSkillAssetPath(assetPath);
  const asset = skill.assets.find((entry) => entry.path === normalizedPath);
  if (!asset) {throw new BadRequestException(`Unknown skill asset: ${assetPath}`);}
  const skillRoot = resolveSkillRootPath(skill, discoveryOptions);
  const absolutePath = path.resolve(skillRoot, asset.path);
  const normalizedRoot = path.resolve(skillRoot);
  if (absolutePath !== normalizedRoot && !absolutePath.startsWith(`${normalizedRoot}${path.sep}`)) {throw new BadRequestException(`Illegal asset path: ${assetPath}`);}
  return { absolutePath, asset, skillRoot };
}

function resolveSkillRootPath(skill: Pick<SkillDetail, 'sourceKind' | 'entryPath'>, discoveryOptions: SkillDiscoveryOptions): string {
  const sourceRoot = skill.sourceKind === 'project' ? (discoveryOptions.projectSkillsRoot ?? path.join(process.cwd(), 'skills')) : (discoveryOptions.userSkillsRoot ?? path.join(os.homedir(), '.garlic-claw', 'skills'));
  return path.join(sourceRoot, path.dirname(skill.entryPath));
}

function normalizeRelativeSkillAssetPath(assetPath: string): string {
  const normalized = assetPath.replace(/\\/g, '/').trim();
  if (!normalized || path.posix.isAbsolute(normalized)) {throw new BadRequestException(`Illegal asset path: ${assetPath}`);}
  const collapsed = path.posix.normalize(normalized).replace(/^\.\//, '');
  if (collapsed === '..' || collapsed.startsWith('../')) {throw new BadRequestException(`Illegal asset path: ${assetPath}`);}
  return collapsed;
}

function clampSkillNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {return fallback;}
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function resolveSkillScriptRunner(absolutePath: string): { command: string; prefixArgs: string[] } {
  const extension = path.extname(absolutePath).toLowerCase();
  if (['.js', '.mjs', '.cjs'].includes(extension)) {return { command: process.execPath, prefixArgs: [] };}
  if (['.py', '.sh', '.bat', '.cmd'].includes(extension)) {return { command: absolutePath, prefixArgs: [] };}
  if (extension === '.ps1') {return { command: 'powershell', prefixArgs: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File'] };}
  throw new BadRequestException(`Unsupported script type: ${extension || absolutePath}`);
}

function createSkillPackageTool(
  name: SkillPackageToolName,
  callName: string,
  description: string,
  requires: SkillPackageToolDefinition['requires'],
  parameters: Record<string, PluginParamSchema>,
): SkillPackageToolDefinition {
  return { name, callName, description, parameters, requires };
}

function createParam(type: PluginParamSchema['type'], required: boolean, description: string): PluginParamSchema {
  return { description, required, type };
}
