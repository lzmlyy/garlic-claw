import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  SkillAssetKind,
  SkillAssetSummary,
  SkillDetail,
  SkillToolPolicy,
} from '@garlic-claw/shared';
import {
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import YAML from 'yaml';
import { resolveProjectSkillsRoot, resolveUserSkillsRoot } from './skill-path.util';

export const SKILL_DISCOVERY_OPTIONS = 'SKILL_DISCOVERY_OPTIONS';

export interface SkillDiscoveryOptions {
  projectSkillsRoot?: string;
  userSkillsRoot?: string;
}

interface ParsedSkillFrontmatter {
  name?: string;
  description?: string;
  tags?: unknown;
  tools?: {
    allow?: unknown;
    deny?: unknown;
  };
}

@Injectable()
export class SkillDiscoveryService {
  constructor(
    @Optional()
    @Inject(SKILL_DISCOVERY_OPTIONS)
    private readonly options: SkillDiscoveryOptions = {},
  ) {}

  async discoverSkills(): Promise<SkillDetail[]> {
    const sources = [
      {
        kind: 'project' as const,
        root: this.options.projectSkillsRoot ?? resolveProjectSkillsRoot(),
      },
      {
        kind: 'user' as const,
        root: this.options.userSkillsRoot ?? resolveUserSkillsRoot(),
      },
    ];
    const discovered: SkillDetail[] = [];

    for (const source of sources) {
      const skillFiles = await listSkillFiles(source.root);
      for (const filePath of skillFiles) {
        const relativePath = normalizeRelativePath(path.relative(source.root, filePath));
        const relativeSkillPath = stripSkillFileName(relativePath);
        const parsed = await parseSkillFile(filePath);
        const assets = await listSkillAssets(path.dirname(filePath));
        const name = parsed.frontmatter.name?.trim() || fallbackSkillName(relativeSkillPath);
        const description = parsed.frontmatter.description?.trim() || '';
        const tags = normalizeStringList(parsed.frontmatter.tags);
        const toolPolicy = normalizeToolPolicy(parsed.frontmatter.tools);

        discovered.push({
          id: `${source.kind}/${relativeSkillPath || 'root'}`,
          name,
          description,
          tags,
          sourceKind: source.kind,
          entryPath: relativePath,
          promptPreview: buildPromptPreview(parsed.content),
          toolPolicy,
          governance: {
            enabled: true,
            trustLevel: 'prompt-only',
          },
          assets,
          content: parsed.content,
        });
      }
    }

    return discovered.sort(compareSkills);
  }
}

async function listSkillAssets(skillRoot: string): Promise<SkillAssetSummary[]> {
  const entries = await fs.readdir(skillRoot, { withFileTypes: true });
  const assets: SkillAssetSummary[] = [];

  for (const entry of entries) {
    const entryPath = path.join(skillRoot, entry.name);
    if (entry.isDirectory()) {
      assets.push(...await collectAssetFiles(skillRoot, entryPath));
      continue;
    }

    if (entry.isFile() && entry.name !== 'SKILL.md') {
      assets.push(toSkillAssetSummary(skillRoot, entryPath));
    }
  }

  return assets.sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'));
}

async function collectAssetFiles(skillRoot: string, directoryPath: string): Promise<SkillAssetSummary[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const assets: SkillAssetSummary[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      assets.push(...await collectAssetFiles(skillRoot, entryPath));
      continue;
    }

    if (entry.isFile() && entry.name !== 'SKILL.md') {
      assets.push(toSkillAssetSummary(skillRoot, entryPath));
    }
  }

  return assets;
}

async function listSkillFiles(rootPath: string): Promise<string[]> {
  try {
    const stats = await fs.stat(rootPath);
    if (!stats.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSkillFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name === 'SKILL.md') {
      files.push(entryPath);
    }
  }

  return files;
}

async function parseSkillFile(filePath: string): Promise<{
  frontmatter: ParsedSkillFrontmatter;
  content: string;
}> {
  const raw = await fs.readFile(filePath, 'utf8');
  const normalized = raw.replace(/\r\n/g, '\n');

  if (!normalized.startsWith('---\n')) {
    return {
      frontmatter: {},
      content: normalized.trim(),
    };
  }

  const endIndex = normalized.indexOf('\n---\n', 4);
  if (endIndex === -1) {
    return {
      frontmatter: {},
      content: normalized.trim(),
    };
  }

  const frontmatterText = normalized.slice(4, endIndex);
  const content = normalized.slice(endIndex + '\n---\n'.length).trim();

  return {
    frontmatter: normalizeFrontmatter(YAML.parse(frontmatterText)),
    content,
  };
}

function normalizeFrontmatter(parsed: unknown): ParsedSkillFrontmatter {
  const object = readUnknownObject(parsed);
  if (!object) {
    return {};
  }

  const tools = readUnknownObject(object.tools);

  return {
    ...(typeof object.name === 'string' ? { name: object.name } : {}),
    ...(typeof object.description === 'string' ? { description: object.description } : {}),
    ...('tags' in object ? { tags: object.tags } : {}),
    ...(tools
      ? {
          tools: {
            ...('allow' in tools ? { allow: tools.allow } : {}),
            ...('deny' in tools ? { deny: tools.deny } : {}),
          },
        }
      : {}),
  };
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupeStrings(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function normalizeToolPolicy(value: ParsedSkillFrontmatter['tools']): SkillToolPolicy {
  return {
    allow: normalizeStringList(value?.allow),
    deny: normalizeStringList(value?.deny),
  };
}

function buildPromptPreview(content: string): string {
  return content
    .replace(/^#+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function stripSkillFileName(entryPath: string): string {
  return entryPath.replace(/\/SKILL\.md$/i, '');
}

function fallbackSkillName(relativeSkillPath: string): string {
  const basename = relativeSkillPath.split('/').filter(Boolean).pop() ?? 'root';
  return basename
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

function toSkillAssetSummary(skillRoot: string, assetPath: string): SkillAssetSummary {
  const relativePath = normalizeRelativePath(path.relative(skillRoot, assetPath));
  const kind = detectSkillAssetKind(relativePath);

  return {
    path: relativePath,
    kind,
    textReadable: isTextReadableAsset(relativePath, kind),
    executable: isExecutableScript(relativePath, kind),
  };
}

function detectSkillAssetKind(relativePath: string): SkillAssetKind {
  const firstSegment = relativePath.split('/')[0]?.toLowerCase() ?? '';

  if (firstSegment === 'scripts') {
    return 'script';
  }
  if (firstSegment === 'templates') {
    return 'template';
  }
  if (firstSegment === 'references') {
    return 'reference';
  }
  if (firstSegment === 'assets') {
    return 'asset';
  }

  return 'other';
}

function isTextReadableAsset(relativePath: string, kind: SkillAssetKind): boolean {
  if (kind === 'script' || kind === 'template' || kind === 'reference') {
    return true;
  }

  const extension = path.extname(relativePath).toLowerCase();
  return [
    '.txt',
    '.md',
    '.json',
    '.yaml',
    '.yml',
    '.toml',
    '.ini',
    '.csv',
    '.svg',
    '.xml',
    '.html',
    '.css',
    '.js',
    '.mjs',
    '.cjs',
    '.ts',
    '.py',
    '.ps1',
    '.sh',
    '.bat',
    '.cmd',
  ].includes(extension);
}

function isExecutableScript(relativePath: string, kind: SkillAssetKind): boolean {
  if (kind !== 'script') {
    return false;
  }

  return [
    '.js',
    '.mjs',
    '.cjs',
    '.py',
    '.ps1',
    '.sh',
    '.bat',
    '.cmd',
  ].includes(path.extname(relativePath).toLowerCase());
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function compareSkills(left: SkillDetail, right: SkillDetail): number {
  if (left.sourceKind !== right.sourceKind) {
    return left.sourceKind.localeCompare(right.sourceKind, 'en');
  }

  return left.id.localeCompare(right.id, 'zh-CN');
}

function readUnknownObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}
