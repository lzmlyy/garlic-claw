import { dedupeStrings } from './json-value';

export interface CommandSegmentDescriptorInput {
  segment: string;
  aliases: string[];
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
