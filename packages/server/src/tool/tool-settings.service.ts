import * as fs from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import { resolveConfigFilePath } from '../ai/config/config-path.util';
import type { ToolSourceKind } from './tool.types';

interface ToolSettingsFile {
  version: number;
  sources: Record<string, { enabled: boolean }>;
  tools: Record<string, { enabled: boolean }>;
}

@Injectable()
export class ToolSettingsService {
  private static readonly CURRENT_VERSION = 1;

  private readonly logger = new Logger(ToolSettingsService.name);
  private readonly settingsPath: string;
  private settings: ToolSettingsFile;

  constructor() {
    this.settingsPath = resolveConfigFilePath(
      'GARLIC_CLAW_TOOL_GOVERNANCE_PATH',
      'tool-governance.json',
    );
    this.settings = this.loadSettings();
  }

  getSourceEnabled(kind: ToolSourceKind, id: string): boolean | undefined {
    return this.settings.sources[this.buildSourceKey(kind, id)]?.enabled;
  }

  setSourceEnabled(kind: ToolSourceKind, id: string, enabled: boolean): void {
    this.settings.sources[this.buildSourceKey(kind, id)] = {
      enabled,
    };
    this.saveSettings();
  }

  getToolEnabled(toolId: string): boolean | undefined {
    return this.settings.tools[toolId]?.enabled;
  }

  setToolEnabled(toolId: string, enabled: boolean): void {
    this.settings.tools[toolId] = {
      enabled,
    };
    this.saveSettings();
  }

  private buildSourceKey(kind: ToolSourceKind, id: string): string {
    return `${kind}:${id}`;
  }

  private loadSettings(): ToolSettingsFile {
    if (!fs.existsSync(this.settingsPath)) {
      return this.createEmptySettings();
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8')) as Partial<ToolSettingsFile>;
      return {
        version: typeof parsed.version === 'number'
          ? parsed.version
          : ToolSettingsService.CURRENT_VERSION,
        sources: isSettingsRecord(parsed.sources) ? parsed.sources : {},
        tools: isSettingsRecord(parsed.tools) ? parsed.tools : {},
      };
    } catch (error) {
      this.logger.warn(`工具治理配置文件损坏，已重置为空配置: ${String(error)}`);
      const empty = this.createEmptySettings();
      fs.writeFileSync(this.settingsPath, JSON.stringify(empty, null, 2), 'utf-8');
      return empty;
    }
  }

  private saveSettings(): void {
    fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8');
  }

  private createEmptySettings(): ToolSettingsFile {
    return {
      version: ToolSettingsService.CURRENT_VERSION,
      sources: {},
      tools: {},
    };
  }
}

function isSettingsRecord(
  value: unknown,
): value is Record<string, { enabled: boolean }> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((entry) =>
      typeof entry === 'object'
      && entry !== null
      && !Array.isArray(entry)
      && typeof (entry as { enabled?: unknown }).enabled === 'boolean');
}
