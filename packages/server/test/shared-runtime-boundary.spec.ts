import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Shared runtime boundary', () => {
  const sharedRoot = resolve(__dirname, '../../shared/src');

  it('keeps runtime helpers out of shared exports', () => {
    const indexSource = readFileSync(resolve(sharedRoot, 'index.ts'), 'utf8');

    expect(indexSource).not.toContain("export * from '../src/uuid'");
  });

  it('keeps json definitions type-only', () => {
    const jsonSource = readFileSync(resolve(sharedRoot, 'types/json.ts'), 'utf8');

    expect(jsonSource).not.toContain('export function readUnknownObject');
    expect(jsonSource).not.toContain('export function isJsonValue');
    expect(jsonSource).not.toContain('export function isJsonObjectValue');
    expect(jsonSource).not.toContain('export function isStringRecord');
    expect(jsonSource).not.toContain('export function toJsonValue');
  });

  it('keeps ai definitions type-only', () => {
    const aiSource = readFileSync(resolve(sharedRoot, 'types/ai.ts'), 'utf8');

    expect(aiSource).not.toContain('export const AI_PROVIDER_MODES');
    expect(aiSource).not.toContain('export function isAiProviderMode');
    expect(aiSource).not.toContain('export function isCatalogProviderMode');
    expect(aiSource).not.toContain('export function isProtocolProviderMode');
    expect(aiSource).not.toContain('export const PROVIDER_PROTOCOL_DRIVERS');
    expect(aiSource).not.toContain('export function isProviderProtocolDriver');
    expect(aiSource).not.toContain('export function findAiProviderCatalogItem');
  });
});
