import { dedupeStrings } from './json-value';

export interface CommandSegmentDescriptorInput {
  segment: string;
  aliases: string[];
}

export interface CommandSegmentDescriptor extends CommandSegmentDescriptorInput {}

export interface CommandTreeCommandEntry {
  path: string[];
  variants: string[];
  description?: string;
}

export interface CommandTreeGroupNode {
  segment: string;
  aliases: string[];
  canonicalCommand: string;
  description?: string;
  children: CommandTreeGroupNode[];
  commands: CommandTreeCommandEntry[];
}

export function normalizeCommandSegment(name: string): string {
  const normalized = name.trim().replace(/^\/+/, '');
  if (!normalized) {
    throw new Error('命令名不能为空');
  }
  if (/\s/.test(normalized)) {
    throw new Error(`命令名 ${name} 不能包含空白字符`);
  }

  return normalized;
}

export function normalizeCommandAliases(aliases?: Iterable<string>): string[] {
  if (!aliases) {
    return [];
  }

  return dedupeStrings(
    [...aliases]
      .map((alias) => normalizeCommandSegment(alias))
      .filter(Boolean),
  );
}

export function buildCanonicalCommandPath(path: string[]): string {
  return `/${path.join(' ')}`.trim();
}

export function buildCommandVariants(descriptors: CommandSegmentDescriptorInput[]): string[] {
  let variants = [''];
  for (const descriptor of descriptors) {
    const candidates = [descriptor.segment, ...descriptor.aliases];
    const nextVariants: string[] = [];

    for (const prefix of variants) {
      for (const candidate of candidates) {
        nextVariants.push(`${prefix} ${candidate}`.trim());
      }
    }

    variants = nextVariants;
  }

  return dedupeStrings(variants.map((variant) => `/${variant}`));
}

export function renderCommandGroupHelp(group: CommandTreeGroupNode): string {
  const lines = [group.canonicalCommand];
  const treeLines = renderCommandGroupTree(group, '');
  if (treeLines.length === 0) {
    if (group.description) {
      lines.push(group.description);
    }
    return lines.join('\n');
  }

  lines.push(...treeLines);
  return lines.join('\n');
}

function renderCommandGroupTree(group: CommandTreeGroupNode, prefix: string): string[] {
  const lines: string[] = [];
  const commands = [...group.commands].sort((left, right) =>
    left.path[left.path.length - 1].localeCompare(right.path[right.path.length - 1]));
  const children = [...group.children].sort((left, right) => left.segment.localeCompare(right.segment));
  for (const command of commands) {
    lines.push(
      formatCommandTreeLine(
        prefix,
        command.path[command.path.length - 1],
        command.variants
          .map((variant) => variant.replace(/^\//, '').split(' ').pop() ?? '')
          .filter((alias) => alias !== command.path[command.path.length - 1]),
        command.description,
      ),
    );
  }
  for (const child of children) {
    lines.push(formatCommandTreeLine(prefix, child.segment, child.aliases, child.description));
    lines.push(...renderCommandGroupTree(child, `${prefix}│   `));
  }
  return lines;
}

function formatCommandTreeLine(
  prefix: string,
  segment: string,
  aliases: string[],
  description?: string,
): string {
  const aliasText = aliases.length > 0 ? ` [${aliases.join(', ')}]` : '';
  const descriptionText = description ? `: ${description}` : '';
  return `${prefix}├── ${segment}${aliasText}${descriptionText}`;
}
