import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  SkillAssetKind,
  SkillAssetSummary,
  SkillDetail,
  SkillGovernanceInfo,
  UpdateSkillGovernancePayload,
} from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import YAML from 'yaml';

interface SkillGovernanceFile {
  skills: Record<string, SkillGovernanceInfo>;
}

export const SKILL_DISCOVERY_OPTIONS = 'SKILL_DISCOVERY_OPTIONS';
export interface SkillDiscoveryOptions {
  projectSkillsRoot?: string;
  userSkillsRoot?: string;
}

const DEFAULT_SKILL_GOVERNANCE: SkillGovernanceInfo = {
  trustLevel: 'prompt-only',
};

@Injectable()
export class SkillRegistryService {
  private cachedSkills: SkillDetail[] | null = null;
  private readonly governancePath = path.join(process.cwd(), 'tmp', 'skill-governance.server.json');
  private governance = readSkillGovernanceFile(this.governancePath);

  async listSkills(options?: { refresh?: boolean }): Promise<SkillDetail[]> {
    if (!options?.refresh && this.cachedSkills) {
      return this.cachedSkills;
    }

    this.cachedSkills = (await Promise.all([
      readSkillSource('project', resolveProjectSkillsRoot()),
      readSkillSource('user', path.join(os.homedir(), '.garlic-claw', 'skills')),
    ]))
      .flat()
      .map((skill) => ({
        ...skill,
        governance: this.governance.skills[skill.id] ?? DEFAULT_SKILL_GOVERNANCE,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));

    return this.cachedSkills;
  }

  async updateSkillGovernance(
    skillId: string,
    patch: UpdateSkillGovernancePayload,
  ): Promise<SkillDetail> {
    const skill = (await this.listSkills()).find((entry) => entry.id === skillId);
    if (!skill) {
      throw new NotFoundException(`Unknown skill: ${skillId}`);
    }

    const nextGovernance: SkillGovernanceInfo = {
      trustLevel: patch.trustLevel ?? skill.governance.trustLevel,
    };
    this.governance.skills[skillId] = nextGovernance;
    writeSkillGovernanceFile(this.governancePath, this.governance);
    this.cachedSkills = null;

    return {
      ...skill,
      governance: nextGovernance,
    };
  }
}

function resolveProjectSkillsRoot(): string {
  for (const candidate of [
    path.resolve(__dirname, '..', '..', '..', '..'),
    process.cwd(),
  ]) {
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return path.join(candidate, 'skills');
    }
  }
  return path.join(process.cwd(), 'skills');
}

function readSkillGovernanceFile(filePath: string): SkillGovernanceFile {
  try {
    if (!fs.existsSync(filePath)) {
      return { skills: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SkillGovernanceFile;
    return parsed && typeof parsed === 'object' && parsed.skills ? parsed : { skills: {} };
  } catch {
    return { skills: {} };
  }
}

function writeSkillGovernanceFile(filePath: string, data: SkillGovernanceFile): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function readSkillSource(
  kind: SkillDetail['sourceKind'],
  root: string,
): Promise<SkillDetail[]> {
  const filePaths = await walkFiles(root);
  return Promise.all(
    filePaths
      .filter((filePath) => path.basename(filePath) === 'SKILL.md')
      .map((filePath) => buildSkillDetail(kind, root, filePath, filePaths)),
  );
}

async function buildSkillDetail(
  kind: SkillDetail['sourceKind'],
  root: string,
  filePath: string,
  sourceFiles: string[],
): Promise<SkillDetail> {
  const entryPath = path.relative(root, filePath).split(path.sep).join('/');
  const skillPath = entryPath.replace(/\/SKILL\.md$/i, '');
  const parsed = await parseSkillFile(filePath);
  const tools = readUnknownObject(parsed.frontmatter.tools);
  const name = typeof parsed.frontmatter.name === 'string'
    ? parsed.frontmatter.name.trim()
    : '';

  return {
    id: `${kind}/${skillPath || 'root'}`,
    name: name || (skillPath.split('/').at(-1) ?? 'root').replace(/[-_]+/g, ' ').trim(),
    description: typeof parsed.frontmatter.description === 'string'
      ? parsed.frontmatter.description.trim()
      : '',
    tags: normalizeStringList(parsed.frontmatter.tags),
    sourceKind: kind,
    entryPath,
    promptPreview: parsed.content.replace(/^#+\s+/gm, '').replace(/\s+/g, ' ').trim().slice(0, 160),
    toolPolicy: {
      allow: normalizeStringList(tools?.allow),
      deny: normalizeStringList(tools?.deny),
    },
    governance: DEFAULT_SKILL_GOVERNANCE,
    assets: sourceFiles
      .filter((candidate) => path.dirname(candidate) === path.dirname(filePath) && path.basename(candidate) !== 'SKILL.md')
      .map((candidate) => {
        const extension = path.extname(candidate).toLowerCase();
        return {
          path: path.relative(path.dirname(filePath), candidate).split(path.sep).join('/'),
          kind: readAssetKind(extension),
          textReadable: isTextReadable(extension),
          executable: isExecutable(extension),
        } satisfies SkillAssetSummary;
      }),
    content: parsed.content,
  };
}

async function parseSkillFile(filePath: string): Promise<{
  frontmatter: Record<string, unknown>;
  content: string;
}> {
  const normalized = (await fsPromises.readFile(filePath, 'utf8')).replace(/\r\n/g, '\n');
  const fallback = { frontmatter: {}, content: normalized.trim() };
  if (!normalized.startsWith('---\n')) {
    return fallback;
  }

  const frontmatterEnd = normalized.indexOf('\n---\n', 4);
  if (frontmatterEnd === -1) {
    return fallback;
  }

  try {
    return {
      frontmatter: readUnknownObject(YAML.parse(normalized.slice(4, frontmatterEnd))) ?? {},
      content: normalized.slice(frontmatterEnd + '\n---\n'.length).trim(),
    };
  } catch {
    return fallback;
  }
}

async function walkFiles(root: string): Promise<string[]> {
  if (!fs.existsSync(root)) {
    return [];
  }

  const entries = await fsPromises.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(absolutePath));
    } else {
      files.push(absolutePath);
    }
  }
  return files;
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function readAssetKind(extension: string): SkillAssetKind {
  if (isExecutable(extension)) {
    return 'script';
  }
  if (extension === '.md') {
    return 'reference';
  }
  if (['.json', '.yaml', '.yml', '.toml'].includes(extension)) {
    return 'template';
  }
  return isTextReadable(extension) ? 'asset' : 'other';
}

function isExecutable(extension: string): boolean {
  return ['.ps1', '.sh', '.bat', '.cmd', '.py', '.js', '.mjs', '.cjs'].includes(extension);
}

function isTextReadable(extension: string): boolean {
  return ['.txt', '.md', '.json', '.yaml', '.yml', '.toml', '.ini', '.csv', '.svg', '.xml', '.html', '.css', '.js', '.mjs', '.cjs', '.ts', '.py', '.ps1', '.sh', '.bat', '.cmd'].includes(extension);
}

function readUnknownObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
